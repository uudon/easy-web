import { createPrivateKey } from 'node:crypto'
import { importPKCS8, SignJWT } from 'jose'

import type { Draft, DraftCreateInput } from './admin-drafts'
import type { ContentWriteInput } from './content-write'
import { toContentFile } from './content-write'
import type { PostSummary } from './content'

const githubApi = 'https://api.github.com'
const apiVersion = '2022-11-28'
const draftDirectory = 'content/drafts'

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
  const existingIndex = await readRepositoryJson<PostSummary[]>(
    context.token,
    context.config,
    'content/index.json',
    [],
    context.config.branch,
  )
  const nextIndex = upsertPostIndex(existingIndex, input)
  const result = await commitFiles({
    ...context,
    branch: context.config.branch,
    message: `feat: publish ${input.locale}/${input.slug}`,
    files: [
      toContentFile(input),
      { path: 'content/index.json', content: `${JSON.stringify(nextIndex, null, 2)}\n` },
    ],
  })
  return { sha: result.sha }
}

export async function deleteContent({
  locale,
  slug,
}: Pick<ContentWriteInput, 'locale' | 'slug'>) {
  assertWritesEnabled()
  const context = await createGitHubContext()
  const existingIndex = await readRepositoryJson<PostSummary[]>(
    context.token,
    context.config,
    'content/index.json',
    [],
    context.config.branch,
  )
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
  const existingIndex = await readRepositoryJson<PostSummary[]>(
    context.token,
    context.config,
    'content/index.json',
    [],
    context.config.branch,
  )
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

async function readRepositoryJson<T>(
  token: string,
  config: GitHubConfig,
  filePath: string,
  fallback: T,
  branch: string,
) {
  const file = await readRepositoryFile(token, config, filePath, branch)
  if (!file) return fallback
  try {
    return JSON.parse(decodeFile(file)) as T
  } catch {
    return fallback
  }
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
}: {
  token: string
  config: GitHubConfig
  branch: string
  message: string
  files: CommitFile[]
}) {
  const repoPath = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`
  const refResponse = await githubFetch(
    `${repoPath}/git/ref/heads/${encodeRepositoryPath(branch)}`,
    { token },
  )
  const ref = (await refResponse.json()) as { object?: { sha?: string } }
  const parentSha = ref.object?.sha
  if (!parentSha) throw new Error('Unable to resolve the repository branch.')
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
  await githubFetch(`${repoPath}/git/refs/heads/${encodeRepositoryPath(branch)}`, {
    method: 'PATCH',
    token,
    body: { sha: newCommit.sha, force: false },
  })
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
