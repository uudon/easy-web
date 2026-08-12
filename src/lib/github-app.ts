import { createPrivateKey } from 'node:crypto'
import matter from 'gray-matter'
import { importPKCS8, SignJWT } from 'jose'

import type {
  ChapterDraftCreateInput,
  ChapterFields,
  NovelChapterDraft,
  NovelIndexEntry,
} from './admin-novels'
import type { Draft, DraftCreateInput } from './admin-drafts'
import type { ContentWriteInput } from './content-write'
import { toContentFile } from './content-write'
import type { PostSummary } from './content'

const githubApi = 'https://api.github.com'
const apiVersion = '2022-11-28'
const draftDirectory = 'content/drafts'
const novelDraftDirectory = 'content/novel-drafts'
const novelIndexPath = 'content/novels/index.json'

type GitHubConfig = {
  appId: string
  installationId?: string
  privateKey: string
  owner: string
  repo: string
  branch: string
  draftBranch: string
}

type GitHubFile = {
  content: string
  encoding: string
  sha: string
  path?: string
  type?: string
}

type CommitFile = {
  path: string
  content: string | null
  encoding?: 'utf-8' | 'base64'
}

export class DraftRevisionError extends Error {
  constructor() {
    super('The draft revision is no longer current.')
    this.name = 'DraftRevisionError'
  }
}

class GitHubRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`GitHub request failed with status ${status}.`)
    this.name = 'GitHubRequestError'
    this.status = status
  }
}

export async function publishContent(input: ContentWriteInput) {
  assertWritesEnabled()
  const context = await createGitHubContext()
  const indexState = await readRepositoryJsonState<PostSummary[]>(
    context.token,
    context.config,
    'content/index.json',
    [],
    context.config.branch,
  )
  const existingIndex = indexState.value
  const nextIndex = upsertPostIndex(existingIndex, input)
  const result = await commitFiles({
    ...context,
    branch: context.config.branch,
    message: `feat: publish ${input.locale}/${input.slug}`,
    files: [
      toContentFile(input),
      { path: 'content/index.json', content: `${JSON.stringify(nextIndex, null, 2)}\n` },
    ],
    expectedFiles: { 'content/index.json': indexState.revision },
  })
  return { sha: result.sha }
}

export async function deleteContent({
  locale,
  slug,
}: Pick<ContentWriteInput, 'locale' | 'slug'>) {
  assertWritesEnabled()
  const context = await createGitHubContext()
  const indexState = await readRepositoryJsonState<PostSummary[]>(
    context.token,
    context.config,
    'content/index.json',
    [],
    context.config.branch,
  )
  const existingIndex = indexState.value
  const nextIndex = existingIndex.filter(
    (post) => !(post.locale === locale && post.slug === slug),
  )
  const result = await commitFiles({
    ...context,
    branch: context.config.branch,
    message: `chore: remove ${locale}/${slug}`,
    files: [
      { path: `content/posts/${locale}/${slug}.md`, content: null },
      { path: 'content/index.json', content: `${JSON.stringify(nextIndex, null, 2)}\n` },
    ],
    expectedFiles: { 'content/index.json': indexState.revision },
  })
  return { sha: result.sha }
}

export async function listDraftFiles() {
  const context = await createGitHubContext()
  const response = await readRepositoryContents(
    context.token,
    context.config,
    draftDirectory,
    context.config.draftBranch,
  )
  if (!response) return []
  const entries = Array.isArray(response) ? response : []
  const jsonFiles = entries.filter(
    (entry) => entry.type === 'file' && entry.path?.endsWith('.json'),
  )
  const files = await Promise.all(
    jsonFiles.map(async (entry) => {
      const file = await readRepositoryFile(
        context.token,
        context.config,
        entry.path as string,
        context.config.draftBranch,
      )
      return file ? { content: decodeFile(file), revision: file.sha } : null
    }),
  )
  return files.filter(
    (file): file is { content: string; revision: string } => file !== null,
  )
}

async function listJsonFilesInDirectory(directory: string) {
  const context = await createGitHubContext()
  const response = await readRepositoryContents(
    context.token,
    context.config,
    directory,
    context.config.draftBranch,
  )
  if (!response) return []
  const entries = Array.isArray(response) ? response : []
  const files = await Promise.all(
    entries
      .filter((entry) => entry.type === 'file' && entry.path?.endsWith('.json'))
      .map(async (entry) => {
        const file = await readRepositoryFile(
          context.token,
          context.config,
          entry.path as string,
          context.config.draftBranch,
        )
        return file ? { content: decodeFile(file), revision: file.sha } : null
      }),
  )
  return files.filter(
    (file): file is { content: string; revision: string } => file !== null,
  )
}

export async function readPublishedNovelIndex(): Promise<NovelIndexEntry[]> {
  const context = await createGitHubContext()
  return (await readNovelIndexState(context)).index
}

export async function writePublishedNovel(
  index: NovelIndexEntry[],
  message: string,
  expectedIndex: NovelIndexEntry[],
) {
  assertWritesEnabled()
  const context = await createGitHubContext()
  const current = await readNovelIndexState(context)
  if (!areJsonValuesEqual(current.index, expectedIndex)) throw new DraftRevisionError()
  try {
    const result = await commitFiles({
      ...context,
      branch: context.config.branch,
      message,
      files: [{ path: novelIndexPath, content: `${JSON.stringify(index, null, 2)}\n` }],
      expectedFiles: { [novelIndexPath]: current.revision },
    })
    return { sha: result.sha }
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 422) {
      throw new DraftRevisionError()
    }
    throw error
  }
}

export async function deletePublishedNovel(
  slug: string,
  index: NovelIndexEntry[],
  expectedIndex: NovelIndexEntry[],
) {
  assertWritesEnabled()
  const context = await createGitHubContext()
  const current = await readNovelIndexState(context)
  if (!areJsonValuesEqual(current.index, expectedIndex)) throw new DraftRevisionError()
  const descriptionPath = `content/novels/${slug}/description.md`
  const description = await readRepositoryFile(
    context.token,
    context.config,
    descriptionPath,
    context.config.branch,
  )
  try {
    const result = await commitFiles({
      ...context,
      branch: context.config.branch,
      message: `chore: remove novel ${slug}`,
      files: [
        { path: novelIndexPath, content: `${JSON.stringify(index, null, 2)}\n` },
        ...(description ? [{ path: descriptionPath, content: null }] : []),
      ],
      expectedFiles: {
        [novelIndexPath]: current.revision,
        ...(description ? { [descriptionPath]: description.sha } : {}),
      },
    })
    return { sha: result.sha }
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 422) {
      throw new DraftRevisionError()
    }
    throw error
  }
}

export async function listNovelChapterDraftFiles() {
  return listJsonFilesInDirectory(novelDraftDirectory)
}

export async function readNovelChapterDraftFile(id: string) {
  const context = await createGitHubContext()
  const file = await readRepositoryFile(
    context.token,
    context.config,
    `${novelDraftDirectory}/${id}.json`,
    context.config.draftBranch,
  )
  return file ? { content: decodeFile(file), revision: file.sha } : null
}

export async function writeNovelChapterDraftFile(
  id: string,
  content: string,
  expectedRevision?: string,
  additionalFiles: CommitFile[] = [],
) {
  assertWritesEnabled()
  const context = await createGitHubContext()
  await ensureBranch(context.token, context.config, context.config.draftBranch)
  const existing = await readRepositoryFile(
    context.token,
    context.config,
    `${novelDraftDirectory}/${id}.json`,
    context.config.draftBranch,
  )
  if (
    (expectedRevision && existing?.sha !== expectedRevision) ||
    (!expectedRevision && existing)
  ) {
    throw new DraftRevisionError()
  }
  const draftPath = `${novelDraftDirectory}/${id}.json`
  try {
    const result = await commitFiles({
      ...context,
      branch: context.config.draftBranch,
      message: `chore: save novel draft ${id}`,
      files: [{ path: draftPath, content }, ...additionalFiles],
      expectedFiles: { [draftPath]: existing?.sha ?? null },
    })
    const revision = result.blobs[draftPath]
    if (!revision) throw new Error('Unable to resolve the saved draft revision.')
    return { revision }
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 422) {
      throw new DraftRevisionError()
    }
    throw error
  }
}

export async function deleteNovelChapterDraftFile(
  id: string,
  expectedRevision: string,
  assets: readonly { path: string }[] = [],
) {
  assertWritesEnabled()
  const context = await createGitHubContext()
  await ensureBranch(context.token, context.config, context.config.draftBranch)
  const path = `${novelDraftDirectory}/${id}.json`
  const existing = await readRepositoryFile(
    context.token,
    context.config,
    path,
    context.config.draftBranch,
  )
  if (existing?.sha !== expectedRevision) throw new DraftRevisionError()
  try {
    await commitFiles({
      ...context,
      branch: context.config.draftBranch,
      message: `chore: remove novel draft ${id}`,
      files: [
        { path, content: null },
        ...assets.map((asset) => ({ path: asset.path, content: null })),
      ],
      expectedFiles: { [path]: existing.sha },
    })
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 422) {
      throw new DraftRevisionError()
    }
    throw error
  }
}

export async function publishNovelChapterFiles(
  draft: NovelChapterDraft,
  input: ChapterDraftCreateInput,
) {
  assertWritesEnabled()
  const context = await createGitHubContext()
  const existingDraft = await readRepositoryFile(
    context.token,
    context.config,
    `${novelDraftDirectory}/${draft.id}.json`,
    context.config.draftBranch,
  )
  if (existingDraft?.sha !== draft.revision) throw new DraftRevisionError()
  const indexState = await readNovelIndexState(context)
  const index = indexState.index
  if (!index.some((novel) => novel.slug === input.novelSlug)) {
    throw new Error('作品不存在。')
  }
  const chapters = await readPublishedNovelChapters(context, input.novelSlug)
  const source = input.source
  if (
    chapters.some(
      (chapter) =>
        chapter.order === input.order &&
        !(source && chapter.novelSlug === source.novelSlug && chapter.slug === source.slug),
    )
  ) {
    throw new Error('章节序号已存在。')
  }
  const sourceChapter = source
    ? chapters.find(
        (chapter) =>
          chapter.novelSlug === source.novelSlug && chapter.slug === source.slug,
      )
    : null
  if (source && !sourceChapter) {
    throw new DraftRevisionError()
  }
  const retainedAssetPaths = [
    ...(sourceChapter?.publishedAssets ?? []),
    ...draft.assets.map((asset) => asset.publicPath),
  ].filter((assetPath, index, values) =>
    input.body.includes(assetPath) && values.indexOf(assetPath) === index,
  )
  const modifiedDate = new Date().toISOString().slice(0, 10)
  const publishedChapter: ChapterFields = {
    ...input,
    updatedAt: modifiedDate,
    ...(retainedAssetPaths.length > 0
      ? { publishedAssets: retainedAssetPaths }
      : {}),
  }
  const nextChapters = [
    ...chapters.filter(
      (chapter) =>
        !(source && chapter.novelSlug === source.novelSlug && chapter.slug === source.slug),
    ),
    publishedChapter,
  ].sort((left, right) => left.order - right.order)
  const latest = nextChapters.at(-1) ?? null
  const nextIndex = index.map((novel) =>
    novel.slug === input.novelSlug
      ? {
          ...novel,
          chapterCount: nextChapters.length,
          latestChapter: latest?.slug ?? null,
          updatedAt: modifiedDate,
        }
      : novel,
  )
  const chapterPath = `content/novels/${input.novelSlug}/${input.slug}.md`
  const retainedDraftAssets = draft.assets.filter((asset) =>
    retainedAssetPaths.includes(asset.publicPath),
  )
  const assetFiles = await Promise.all(
    retainedDraftAssets.map(async (asset) => {
      const bytes = await readRepositoryBinary(
        context.token,
        context.config,
        asset.path,
        context.config.draftBranch,
      )
      if (!bytes) throw new Error('A novel draft image is no longer available.')
      return {
        path: `public${asset.publicPath}`,
        content: Buffer.from(bytes).toString('base64'),
        encoding: 'base64' as const,
      }
    }),
  )
  const removedPublishedAssets = (sourceChapter?.publishedAssets ?? []).filter(
    (assetPath) => !retainedAssetPaths.includes(assetPath),
  )
  const files: CommitFile[] = [
    { path: chapterPath, content: serializeNovelChapter(publishedChapter) },
    { path: novelIndexPath, content: `${JSON.stringify(nextIndex, null, 2)}\n` },
    ...assetFiles,
    ...removedPublishedAssets.map((assetPath) => ({
      path: `public${assetPath}`,
      content: null,
    })),
  ]
  if (
    source &&
    (source.novelSlug !== input.novelSlug || source.slug !== input.slug)
  ) {
    files.push({
      path: `content/novels/${source.novelSlug}/${source.slug}.md`,
      content: null,
    })
  }
  try {
    const result = await commitFiles({
      ...context,
      branch: context.config.branch,
      message: `feat: publish novel chapter ${input.novelSlug}/${input.slug}`,
      files,
      expectedFiles: { [novelIndexPath]: indexState.revision },
    })
    return { sha: result.sha }
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 422) {
      throw new DraftRevisionError()
    }
    throw error
  }
}

export async function deletePublishedNovelChapter(novelSlug: string, chapterSlug: string) {
  assertWritesEnabled()
  const context = await createGitHubContext()
  const indexState = await readNovelIndexState(context)
  const index = indexState.index
  const novel = index.find((entry) => entry.slug === novelSlug)
  if (!novel) throw new Error('作品不存在。')
  const chapters = await readPublishedNovelChapters(context, novelSlug)
  const chapter = chapters.find((entry) => entry.slug === chapterSlug)
  if (!chapter) {
    throw new Error('章节不存在。')
  }
  const remaining = chapters
    .filter((chapter) => chapter.slug !== chapterSlug)
    .sort((left, right) => left.order - right.order)
  const latest = remaining.at(-1) ?? null
  const modifiedDate = new Date().toISOString().slice(0, 10)
  const nextIndex = index.map((entry) =>
    entry.slug === novelSlug
      ? {
          ...entry,
          chapterCount: remaining.length,
          latestChapter: latest?.slug ?? null,
          updatedAt: modifiedDate,
        }
      : entry,
  )
  try {
    const result = await commitFiles({
      ...context,
      branch: context.config.branch,
      message: `chore: remove novel chapter ${novelSlug}/${chapterSlug}`,
      files: [
        { path: `content/novels/${novelSlug}/${chapterSlug}.md`, content: null },
        { path: novelIndexPath, content: `${JSON.stringify(nextIndex, null, 2)}\n` },
        ...(chapter.publishedAssets ?? []).map((assetPath) => ({
          path: `public${assetPath}`,
          content: null,
        })),
      ],
      expectedFiles: { [novelIndexPath]: indexState.revision },
    })
    return { sha: result.sha }
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 422) {
      throw new DraftRevisionError()
    }
    throw error
  }
}

export async function readDraftFile(id: string) {
  const context = await createGitHubContext()
  return readDraftFileWithContext(context, id)
}

async function readDraftFileWithContext(
  context: Awaited<ReturnType<typeof createGitHubContext>>,
  id: string,
) {
  const file = await readRepositoryFile(
    context.token,
    context.config,
    `${draftDirectory}/${id}.json`,
    context.config.draftBranch,
  )
  return file ? { content: decodeFile(file), revision: file.sha } : null
}

export async function writeDraftFile(
  id: string,
  content: string,
  expectedRevision?: string,
  additionalFiles: CommitFile[] = [],
) {
  assertWritesEnabled()
  const context = await createGitHubContext()
  await ensureBranch(context.token, context.config, context.config.draftBranch)
  const existing = await readDraftFileWithContext(context, id)
  if (
    (expectedRevision && existing?.revision !== expectedRevision) ||
    (!expectedRevision && existing)
  ) {
    throw new DraftRevisionError()
  }
  const draftPath = `${draftDirectory}/${id}.json`
  let result: Awaited<ReturnType<typeof commitFiles>>
  try {
    result = await commitFiles({
      ...context,
      branch: context.config.draftBranch,
      message: `chore: save draft ${id}`,
      files: [{ path: draftPath, content }, ...additionalFiles],
      expectedFiles: { [draftPath]: existing?.revision ?? null },
    })
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 422) {
      throw new DraftRevisionError()
    }
    throw error
  }
  const revision = result.blobs[draftPath]
  if (!revision) throw new Error('Unable to resolve the saved draft revision.')
  return { revision }
}

export async function deleteDraftFile(id: string, draft: Draft) {
  assertWritesEnabled()
  const context = await createGitHubContext()
  await ensureBranch(context.token, context.config, context.config.draftBranch)
  const existing = await readDraftFileWithContext(context, id)
  if (existing?.revision !== draft.revision) throw new DraftRevisionError()
  try {
    await commitFiles({
      ...context,
      branch: context.config.draftBranch,
      message: `chore: remove draft ${id}`,
      files: [
        { path: `${draftDirectory}/${id}.json`, content: null },
        ...draft.assets.map((asset) => ({ path: asset.path, content: null })),
      ],
      expectedFiles: {
        [`${draftDirectory}/${id}.json`]: existing.revision,
      },
    })
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 422) {
      throw new DraftRevisionError()
    }
    throw error
  }
}

export async function publishDraftFiles(draft: Draft, input: DraftCreateInput) {
  assertWritesEnabled()
  const context = await createGitHubContext()
  const existingDraft = await readDraftFileWithContext(context, draft.id)
  if (existingDraft?.revision !== draft.revision) throw new DraftRevisionError()
  const indexState = await readRepositoryJsonState<PostSummary[]>(
    context.token,
    context.config,
    'content/index.json',
    [],
    context.config.branch,
  )
  const existingIndex = indexState.value
  const publishInput: ContentWriteInput = {
    locale: input.locale,
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    category: input.category,
    date: input.publishDate,
    body: input.body,
    ...(input.translationKey ? { translationKey: input.translationKey } : {}),
  }
  const assetFiles = await Promise.all(
    draft.assets.map(async (asset) => {
      const bytes = await readRepositoryBinary(
        context.token,
        context.config,
        asset.path,
        context.config.draftBranch,
      )
      if (!bytes) throw new Error('A draft image is no longer available.')
      return {
        path: `public${asset.publicPath}`,
        content: Buffer.from(bytes).toString('base64'),
        encoding: 'base64' as const,
      }
    }),
  )
  const nextIndex = upsertPostIndex(existingIndex, publishInput)
  const result = await commitFiles({
    ...context,
    branch: context.config.branch,
    message: `feat: publish ${draft.locale}/${draft.slug}`,
    files: [
      toContentFile(publishInput),
      { path: 'content/index.json', content: `${JSON.stringify(nextIndex, null, 2)}\n` },
      ...assetFiles,
    ],
    expectedFiles: { 'content/index.json': indexState.revision },
  })
  return { sha: result.sha }
}

function upsertPostIndex(existingIndex: PostSummary[], input: ContentWriteInput) {
  const nextPost: PostSummary = {
    title: input.title,
    summary: input.summary,
    date: input.date,
    locale: input.locale,
    category: input.category,
    slug: input.slug,
    originalPath: `/${input.locale}/blog/${input.slug}`,
    ...(input.translationKey ? { translationKey: input.translationKey } : {}),
    updatedAt: new Date().toISOString(),
  }
  const withoutCurrent = existingIndex.filter(
    (post) => !(post.locale === input.locale && post.slug === input.slug),
  )
  return [...withoutCurrent, nextPost].sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.title.localeCompare(right.title),
  )
}

async function createGitHubContext() {
  const config = readGitHubConfig()
  const token = await createInstallationToken(config)
  return { config, token }
}

async function createInstallationToken(config: GitHubConfig) {
  const appJwt = await createAppJwt(config)
  const installationId =
    config.installationId ?? (await discoverInstallationId(appJwt, config))
  const response = await githubFetch(`/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    token: appJwt,
  })
  const data = (await response.json()) as { token?: string }
  if (!data.token) throw new Error('GitHub did not return an installation token.')
  return data.token
}

async function createAppJwt(config: GitHubConfig) {
  const now = Math.floor(Date.now() / 1000)
  const key = await importPKCS8(normalizeGitHubPrivateKey(config.privateKey), 'RS256')
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(config.appId)
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 8 * 60)
    .sign(key)
}

async function discoverInstallationId(appJwt: string, config: GitHubConfig) {
  const response = await githubFetch(
    `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/installation`,
    { token: appJwt },
  )
  const data = (await response.json()) as { id?: number }
  if (!data.id) throw new Error('GitHub App is not installed on the configured repository.')
  return String(data.id)
}

async function readRepositoryJsonState<T>(
  token: string,
  config: GitHubConfig,
  filePath: string,
  fallback: T,
  branch: string,
) {
  const file = await readRepositoryFile(token, config, filePath, branch)
  if (!file) return { value: fallback, revision: null }
  try {
    return {
      value: JSON.parse(decodeFile(file)) as T,
      revision: file.sha,
    }
  } catch {
    throw new Error(`Repository JSON is invalid: ${filePath}`)
  }
}

export function parseRepositoryJson<T>(content: string, filePath: string): T {
  try {
    return JSON.parse(content) as T
  } catch {
    throw new Error(`Repository JSON is invalid: ${filePath}`)
  }
}

async function readNovelIndexState(
  context: Awaited<ReturnType<typeof createGitHubContext>>,
) {
  const file = await readRepositoryFile(
    context.token,
    context.config,
    novelIndexPath,
    context.config.branch,
  )
  if (!file) return { index: [] as NovelIndexEntry[], revision: null }
  const value = parseRepositoryJson<unknown>(decodeFile(file), novelIndexPath)
  if (!isValidNovelIndex(value)) {
    throw new Error(`Repository JSON is invalid: ${novelIndexPath}`)
  }
  return { index: value, revision: file.sha }
}

function isValidNovelIndex(value: unknown): value is NovelIndexEntry[] {
  if (!Array.isArray(value)) return false
  const slugs = new Set<string>()
  return value.every((novel) => {
    if (!novel || typeof novel !== 'object') return false
    const entry = novel as Partial<NovelIndexEntry>
    if (
      typeof entry.slug !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug) ||
      slugs.has(entry.slug)
    ) {
      return false
    }
    slugs.add(entry.slug)
    return (
      typeof entry.title === 'string' &&
      typeof entry.summary === 'string' &&
      typeof entry.genre === 'string' &&
      ['连载中', '已完结', '暂停更新'].includes(entry.status ?? '') &&
      isCalendarDate(entry.startDate) &&
      isCalendarDate(entry.updatedAt) &&
      Number.isSafeInteger(entry.chapterCount) &&
      (entry.chapterCount ?? -1) >= 0 &&
      (entry.latestChapter === null ||
        (typeof entry.latestChapter === 'string' &&
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.latestChapter))) &&
      (entry.cover === undefined || typeof entry.cover === 'string')
    )
  })
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function areJsonValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function isPublishedNovelChapterPath(filePath: string) {
  return filePath.endsWith('.md') && !filePath.endsWith('/description.md')
}

async function readPublishedNovelChapters(
  context: Awaited<ReturnType<typeof createGitHubContext>>,
  novelSlug: string,
) {
  const response = await readRepositoryContents(
    context.token,
    context.config,
    `content/novels/${novelSlug}`,
    context.config.branch,
  )
  if (!response || !Array.isArray(response)) return []
  const chapterEntries = response.filter(
    (entry) =>
      entry.type === 'file' &&
      typeof entry.path === 'string' &&
      isPublishedNovelChapterPath(entry.path),
  )
  const chapters = await Promise.all(
    chapterEntries
      .map(async (entry) => {
        const file = await readRepositoryFile(
          context.token,
          context.config,
          entry.path as string,
          context.config.branch,
        )
        if (!file) return null
        try {
          const parsed = matter(decodeFile(file))
          const data = parsed.data as Record<string, unknown>
          const fileSlug = entry.path?.split('/').at(-1)?.replace(/\.md$/, '')
          if (
            data.novelSlug !== novelSlug ||
            typeof data.slug !== 'string' ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug) ||
            data.slug !== fileSlug ||
            typeof data.title !== 'string' ||
            data.title.trim().length === 0 ||
            !Number.isSafeInteger(data.order) ||
            (data.order as number) < 1 ||
            !isCalendarDate(data.publishDate) ||
            (data.updatedAt !== undefined && !isCalendarDate(data.updatedAt)) ||
            (data.volume !== undefined && typeof data.volume !== 'string') ||
            (data.assets !== undefined &&
              (!Array.isArray(data.assets) ||
                !data.assets.every(
                  (asset) =>
                    typeof asset === 'string' &&
                    /^\/uploads\/[a-zA-Z0-9/_-]+\.(?:jpe?g|png|webp)$/.test(asset) &&
                    !asset.includes('..'),
                )))
          ) {
            return null
          }
          return {
            novelSlug: data.novelSlug,
            slug: data.slug,
            title: data.title,
            order: data.order as number,
            publishDate: data.publishDate,
            ...(typeof data.updatedAt === 'string' ? { updatedAt: data.updatedAt } : {}),
            ...(typeof data.volume === 'string' ? { volume: data.volume } : {}),
            ...(Array.isArray(data.assets)
              ? { publishedAssets: data.assets as string[] }
              : {}),
            body: parsed.content,
          } satisfies ChapterFields
        } catch {
          return null
        }
      }),
  )
  if (chapters.some((chapter) => chapter === null)) {
    throw new Error(`Published novel chapters are invalid: ${novelSlug}`)
  }
  const validChapters = chapters.filter(
    (chapter): chapter is ChapterFields => chapter !== null,
  )
  if (
    new Set(validChapters.map((chapter) => chapter.slug)).size !== validChapters.length ||
    new Set(validChapters.map((chapter) => chapter.order)).size !== validChapters.length
  ) {
    throw new Error(`Published novel chapters are invalid: ${novelSlug}`)
  }
  return validChapters
}

function serializeNovelChapter(input: ChapterFields) {
  const quote = (value: string) => JSON.stringify(value)
  return [
    '---',
    `novelSlug: ${quote(input.novelSlug)}`,
    `title: ${quote(input.title)}`,
    `slug: ${quote(input.slug)}`,
    `order: ${input.order}`,
    `publishDate: ${quote(input.publishDate)}`,
    ...(input.updatedAt ? [`updatedAt: ${quote(input.updatedAt)}`] : []),
    ...(input.volume ? [`volume: ${quote(input.volume)}`] : []),
    ...(input.publishedAssets?.length
      ? [`assets: ${JSON.stringify(input.publishedAssets)}`]
      : []),
    '---',
    '',
    input.body.trim(),
    '',
  ].join('\n')
}

async function readRepositoryFile(
  token: string,
  config: GitHubConfig,
  filePath: string,
  branch: string,
) {
  const result = await readRepositoryContents(token, config, filePath, branch)
  return result && !Array.isArray(result) && result.encoding === 'base64' ? result : null
}

async function readRepositoryBinary(
  token: string,
  config: GitHubConfig,
  filePath: string,
  branch: string,
) {
  const encodedPath = encodeRepositoryPath(filePath)
  const response = await githubFetch(
    `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    {
      token,
      allowNotFound: true,
      accept: 'application/vnd.github.raw+json',
    },
  )
  if (response.status === 404) return null
  return new Uint8Array(await response.arrayBuffer())
}

async function readRepositoryContents(
  token: string,
  config: GitHubConfig,
  filePath: string,
  branch: string,
): Promise<GitHubFile | GitHubFile[] | null> {
  const encodedPath = encodeRepositoryPath(filePath)
  const response = await githubFetch(
    `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    { token, allowNotFound: true },
  )
  if (response.status === 404) return null
  return (await response.json()) as GitHubFile | GitHubFile[]
}

function decodeFile(file: GitHubFile) {
  return Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8')
}

async function ensureBranch(token: string, config: GitHubConfig, branch: string) {
  const repoPath = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`
  const existing = await githubFetch(
    `${repoPath}/git/ref/heads/${encodeRepositoryPath(branch)}`,
    { token, allowNotFound: true },
  )
  if (existing.status !== 404) return
  const source = await githubFetch(
    `${repoPath}/git/ref/heads/${encodeRepositoryPath(config.branch)}`,
    { token },
  )
  const ref = (await source.json()) as { object?: { sha?: string } }
  if (!ref.object?.sha) throw new Error('Unable to resolve the repository branch.')
  await githubFetch(`${repoPath}/git/refs`, {
    method: 'POST',
    token,
    body: { ref: `refs/heads/${branch}`, sha: ref.object.sha },
  })
}

async function commitFiles({
  token,
  config,
  branch,
  message,
  files,
  expectedFiles = {},
}: {
  token: string
  config: GitHubConfig
  branch: string
  message: string
  files: CommitFile[]
  expectedFiles?: Record<string, string | null>
}) {
  const repoPath = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`
  const refResponse = await githubFetch(
    `${repoPath}/git/ref/heads/${encodeRepositoryPath(branch)}`,
    { token },
  )
  const ref = (await refResponse.json()) as { object?: { sha?: string } }
  const parentSha = ref.object?.sha
  if (!parentSha) throw new Error('Unable to resolve the repository branch.')
  await Promise.all(
    Object.entries(expectedFiles).map(async ([filePath, expectedSha]) => {
      const current = await readRepositoryFile(token, config, filePath, parentSha)
      if ((current?.sha ?? null) !== expectedSha) {
        throw new DraftRevisionError()
      }
    }),
  )
  const commitResponse = await githubFetch(`${repoPath}/git/commits/${parentSha}`, { token })
  const parentCommit = (await commitResponse.json()) as { tree?: { sha?: string } }
  const baseTree = parentCommit.tree?.sha
  if (!baseTree) throw new Error('Unable to resolve the repository tree.')

  const builtEntries = await Promise.all(
    files.map(async (file) => {
      if (file.content === null) {
        return {
          treeEntry: { path: file.path, mode: '100644', type: 'blob', sha: null },
          blobEntry: null,
        }
      }
      const blobResponse = await githubFetch(`${repoPath}/git/blobs`, {
        method: 'POST',
        token,
        body: { content: file.content, encoding: file.encoding ?? 'utf-8' },
      })
      const blob = (await blobResponse.json()) as { sha?: string }
      if (!blob.sha) throw new Error('Unable to create a repository blob.')
      return {
        treeEntry: { path: file.path, mode: '100644', type: 'blob', sha: blob.sha },
        blobEntry: [file.path, blob.sha] as const,
      }
    }),
  )
  const treeEntries = builtEntries.map((entry) => entry.treeEntry)
  const blobs = Object.fromEntries(
    builtEntries.flatMap((entry) => (entry.blobEntry ? [entry.blobEntry] : [])),
  )
  const treeResponse = await githubFetch(`${repoPath}/git/trees`, {
    method: 'POST',
    token,
    body: { base_tree: baseTree, tree: treeEntries },
  })
  const tree = (await treeResponse.json()) as { sha?: string }
  if (!tree.sha) throw new Error('Unable to create the content tree.')
  const newCommitResponse = await githubFetch(`${repoPath}/git/commits`, {
    method: 'POST',
    token,
    body: { message, tree: tree.sha, parents: [parentSha] },
  })
  const newCommit = (await newCommitResponse.json()) as { sha?: string }
  if (!newCommit.sha) throw new Error('Unable to create the content commit.')
  try {
    await githubFetch(`${repoPath}/git/refs/heads/${encodeRepositoryPath(branch)}`, {
      method: 'PATCH',
      token,
      body: { sha: newCommit.sha, force: false },
    })
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 422) {
      throw new DraftRevisionError()
    }
    throw error
  }
  return { sha: newCommit.sha, blobs }
}

async function githubFetch(
  pathname: string,
  options: {
    token: string
    method?: 'GET' | 'POST' | 'PATCH'
    body?: unknown
    allowNotFound?: boolean
    accept?: string
  },
) {
  const response = await fetch(`${githubApi}${pathname}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: options.accept ?? 'application/vnd.github+json',
      Authorization: `Bearer ${options.token}`,
      'X-GitHub-Api-Version': apiVersion,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  })
  if (!response.ok && !(options.allowNotFound && response.status === 404)) {
    throw new GitHubRequestError(response.status)
  }
  return response
}

function readGitHubConfig(): GitHubConfig {
  return {
    appId: requireEnvironment('GITHUB_APP_ID'),
    installationId: process.env.GITHUB_APP_INSTALLATION_ID,
    privateKey: requireEnvironment('GITHUB_APP_PRIVATE_KEY'),
    owner: requireEnvironment('GITHUB_OWNER'),
    repo: requireEnvironment('GITHUB_REPO'),
    branch: process.env.GITHUB_BRANCH || 'main',
    draftBranch: process.env.GITHUB_DRAFT_BRANCH || 'content-drafts',
  }
}

function requireEnvironment(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

export function normalizeGitHubPrivateKey(value: string) {
  const normalized = value.replace(/\\n/g, '\n').trim()
  return createPrivateKey(normalized).export({ format: 'pem', type: 'pkcs8' }).toString()
}

function encodeRepositoryPath(value: string) {
  return value.split('/').map(encodeURIComponent).join('/')
}

function assertWritesEnabled() {
  if (process.env.ENABLE_CONTENT_WRITES !== 'true') {
    throw new Error('Content writes are disabled in this environment.')
  }
}
