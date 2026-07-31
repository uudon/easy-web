import crypto from 'node:crypto'
import { z } from 'zod'

import {
  deleteNovelChapterDraftFile,
  deletePublishedNovel,
  deletePublishedNovelChapter,
  listNovelChapterDraftFiles,
  publishNovelChapterFiles,
  readNovelChapterDraftFile,
  readPublishedNovelIndex,
  writeNovelChapterDraftFile,
  writePublishedNovel,
  DraftRevisionError,
} from './github-app'
import type { DraftAsset } from './admin-drafts'

const routeSegment = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const safeText = /^[^<>]*$/
const draftIdPattern = /^novel_draft_[A-Za-z0-9_-]{10,80}$/
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  })

const optionalCoverSchema = z.union([
  z.literal(''),
  z.string().max(500).refine(
    (value) => value.startsWith('/') || /^https:\/\/[^<>\s]+$/i.test(value),
    '封面必须是站内绝对路径或 HTTPS 地址。',
  ),
])

export type NovelIndexEntry = {
  title: string
  slug: string
  summary: string
  cover?: string
  genre: string
  status: '连载中' | '已完结' | '暂停更新'
  startDate: string
  updatedAt: string
  chapterCount: number
  latestChapter: string | null
}

export type ChapterFields = {
  novelSlug: string
  slug: string
  title: string
  order: number
  publishDate: string
  updatedAt?: string
  volume?: string
  publishedAssets?: string[]
  body: string
}

export type NovelChapterDraft = ChapterFields & {
  id: string
  source: { novelSlug: string; slug: string } | null
  assets: DraftAsset[]
  status: 'draft' | 'publishing' | 'published'
  revision: string
  updatedAt: string
}

export const novelInputSchema = z.object({
  title: z.string().trim().min(1).max(160).regex(safeText),
  slug: z.string().min(1).max(100).regex(routeSegment),
  summary: z.string().trim().min(1).max(1000).regex(safeText),
  cover: optionalCoverSchema,
  genre: z.string().trim().min(1).max(80).regex(safeText),
  status: z.enum(['连载中', '已完结', '暂停更新']),
  startDate: dateSchema,
}).strict()

const sourceSchema = z.object({
  novelSlug: z.string().min(1).max(100).regex(routeSegment),
  slug: z.string().min(1).max(100).regex(routeSegment),
})

const chapterFieldsSchema = z.object({
  novelSlug: z.string().min(1).max(100).regex(routeSegment),
  slug: z.string().min(1).max(100).regex(routeSegment),
  title: z.string().trim().min(1).max(160).regex(safeText),
  order: z.number().int().positive().max(100_000),
  publishDate: dateSchema,
  volume: z.string().trim().max(120).regex(safeText).optional(),
  body: z.string().min(1).max(1_000_000),
})

export const chapterDraftCreateSchema = chapterFieldsSchema.extend({
  source: sourceSchema.nullable(),
}).strict()

export const chapterDraftUpdateSchema = z.object({
  baseRevision: z.string().min(1).max(100),
  novelSlug: z.string().min(1).max(100).regex(routeSegment).optional(),
  slug: z.union([z.literal(''), z.string().max(100).regex(routeSegment)]).optional(),
  title: z.string().trim().max(160).regex(safeText).optional(),
  order: z.number().int().positive().max(100_000).optional(),
  publishDate: z.union([z.literal(''), dateSchema]).optional(),
  volume: z.string().trim().max(120).regex(safeText).optional(),
  body: z.string().max(1_000_000).optional(),
}).strict()

export const novelSlugSchema = z.string().min(1).max(100).regex(routeSegment)
export const novelDraftIdSchema = z.string().regex(draftIdPattern)
export type NovelInput = z.infer<typeof novelInputSchema>
export type ChapterDraftCreateInput = z.infer<typeof chapterDraftCreateSchema>
export type ChapterDraftUpdateInput = z.infer<typeof chapterDraftUpdateSchema>

export class NovelNotFoundError extends Error {
  constructor() {
    super('作品不存在。')
    this.name = 'NovelNotFoundError'
  }
}

export class NovelChapterConflictError extends Error {
  readonly current?: NovelChapterDraft

  constructor(message: string, current?: NovelChapterDraft) {
    super(message)
    this.name = 'NovelChapterConflictError'
    this.current = current
  }
}

export async function listNovels() {
  return readPublishedNovelIndex()
}

export async function createNovel(input: NovelInput) {
  const validated = novelInputSchema.parse(input)
  const index = await readPublishedNovelIndex()
  if (index.some((novel) => novel.slug === validated.slug)) {
    throw new NovelChapterConflictError('作品 Slug 已存在。')
  }
  const now = new Date().toISOString()
  const novel: NovelIndexEntry = {
    ...validated,
    ...(validated.cover ? { cover: validated.cover } : {}),
    updatedAt: now.slice(0, 10),
    chapterCount: 0,
    latestChapter: null,
  }
  try {
    await writePublishedNovel(
      [...index, novel],
      `feat: create novel ${novel.slug}`,
      index,
    )
  } catch (error) {
    if (error instanceof DraftRevisionError) {
      throw new NovelChapterConflictError('作品列表已被更新，请刷新后重试。')
    }
    throw error
  }
  return novel
}

export async function updateNovel(slug: string, input: NovelInput) {
  novelSlugSchema.parse(slug)
  const validated = novelInputSchema.parse(input)
  if (slug !== validated.slug) {
    throw new NovelChapterConflictError('作品 Slug 创建后不能修改。')
  }
  const index = await readPublishedNovelIndex()
  const current = index.find((novel) => novel.slug === slug)
  if (!current) throw new NovelNotFoundError()
  const novel: NovelIndexEntry = {
    ...current,
    ...validated,
    ...(validated.cover ? { cover: validated.cover } : { cover: undefined }),
    updatedAt: new Date().toISOString().slice(0, 10),
  }
  try {
    await writePublishedNovel(
      index.map((entry) => (entry.slug === slug ? novel : entry)),
      `feat: update novel ${slug}`,
      index,
    )
  } catch (error) {
    if (error instanceof DraftRevisionError) {
      throw new NovelChapterConflictError('作品列表已被更新，请刷新后重试。')
    }
    throw error
  }
  return novel
}

export async function removeNovel(slug: string) {
  novelSlugSchema.parse(slug)
  const index = await readPublishedNovelIndex()
  const current = index.find((novel) => novel.slug === slug)
  if (!current) throw new NovelNotFoundError()
  if (current.chapterCount > 0) {
    throw new NovelChapterConflictError('请先删除作品中的全部章节。')
  }
  try {
    await deletePublishedNovel(
      slug,
      index.filter((novel) => novel.slug !== slug),
      index,
    )
  } catch (error) {
    if (error instanceof DraftRevisionError) {
      throw new NovelChapterConflictError('作品列表已被更新，请刷新后重试。')
    }
    throw error
  }
}

export async function listChapterDrafts(): Promise<NovelChapterDraft[]> {
  const files = await listNovelChapterDraftFiles()
  return files
    .map((file) => parseStoredDraft(file.content, file.revision))
    .filter((draft): draft is NovelChapterDraft => draft !== null)
    .filter((draft) => draft.status !== 'published')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function getChapterDraft(id: string) {
  novelDraftIdSchema.parse(id)
  const file = await readNovelChapterDraftFile(id)
  return file ? parseStoredDraft(file.content, file.revision) : null
}

export async function createChapterDraft(
  novelSlug: string,
  sourceChapter?: ChapterFields,
): Promise<NovelChapterDraft> {
  novelSlugSchema.parse(novelSlug)
  const novels = await readPublishedNovelIndex()
  if (!novels.some((novel) => novel.slug === novelSlug)) throw new NovelNotFoundError()
  const now = new Date().toISOString()
  const draft: Omit<NovelChapterDraft, 'revision'> = {
    id: `novel_draft_${crypto.randomUUID().replaceAll('-', '')}`,
    source: sourceChapter
      ? { novelSlug: sourceChapter.novelSlug, slug: sourceChapter.slug }
      : null,
    novelSlug,
    slug: sourceChapter?.slug ?? '',
    title: sourceChapter?.title ?? '',
    order: sourceChapter?.order ?? 1,
    publishDate: sourceChapter?.publishDate ?? now.slice(0, 10),
    volume: sourceChapter?.volume ?? '',
    body: sourceChapter?.body ?? '# 新章节\n\n',
    assets: [],
    status: 'draft',
    updatedAt: now,
  }
  const saved = await writeNovelChapterDraftFile(draft.id, serializeDraft(draft))
  return { ...draft, revision: saved.revision }
}

export async function updateChapterDraft(id: string, input: ChapterDraftUpdateInput) {
  novelDraftIdSchema.parse(id)
  const current = await getChapterDraft(id)
  if (!current) throw new NovelNotFoundError()
  if (input.baseRevision !== current.revision) {
    throw new NovelChapterConflictError('草稿已被其他页面更新。', current)
  }
  const { baseRevision: _baseRevision, ...changes } = input
  void _baseRevision
  if (
    current.source &&
    ((changes.novelSlug && changes.novelSlug !== current.source.novelSlug) ||
      (changes.slug && changes.slug !== current.source.slug))
  ) {
    throw new NovelChapterConflictError('已发布章节的作品和 Slug 不能修改。', current)
  }
  const next = {
    ...current,
    ...changes,
    source: current.source,
    status: 'draft' as const,
    updatedAt: new Date().toISOString(),
  }
  try {
    const saved = await writeNovelChapterDraftFile(id, serializeDraft(next), current.revision)
    return { ...next, revision: saved.revision }
  } catch (error) {
    if (error instanceof DraftRevisionError) {
      throw new NovelChapterConflictError('草稿已被其他页面更新。', await getChapterDraft(id) ?? undefined)
    }
    throw error
  }
}

export async function removeChapterDraft(id: string, baseRevision: string) {
  const current = await getChapterDraft(id)
  if (!current) throw new NovelNotFoundError()
  if (baseRevision !== current.revision) {
    throw new NovelChapterConflictError('草稿已被其他页面更新。', current)
  }
  try {
    await deleteNovelChapterDraftFile(id, current.revision, current.assets)
  } catch (error) {
    if (error instanceof DraftRevisionError) {
      throw new NovelChapterConflictError(
        '草稿已被其他页面更新。',
        await getChapterDraft(id) ?? undefined,
      )
    }
    throw error
  }
}

export async function saveNovelChapterDraftAsset(
  id: string,
  baseRevision: string,
  asset: DraftAsset,
  bytes: Uint8Array,
) {
  const current = await getChapterDraft(id)
  if (!current) throw new NovelNotFoundError()
  if (baseRevision !== current.revision) {
    throw new NovelChapterConflictError('草稿已被其他页面更新。', current)
  }
  const next = {
    ...current,
    assets: [...current.assets, { ...asset }],
    updatedAt: new Date().toISOString(),
  }
  try {
    const saved = await writeNovelChapterDraftFile(
      id,
      serializeDraft(next),
      current.revision,
      [{
        path: asset.path,
        content: Buffer.from(bytes).toString('base64'),
        encoding: 'base64',
      }],
    )
    return { ...next, revision: saved.revision }
  } catch (error) {
    if (error instanceof DraftRevisionError) {
      throw new NovelChapterConflictError(
        '草稿已被其他页面更新。',
        await getChapterDraft(id) ?? undefined,
      )
    }
    throw error
  }
}

export async function publishChapterDraft(id: string, baseRevision: string) {
  const current = await getChapterDraft(id)
  if (!current) throw new NovelNotFoundError()
  if (baseRevision !== current.revision) {
    throw new NovelChapterConflictError('草稿已被其他页面更新。', current)
  }
  const validated = chapterDraftCreateSchema.parse({
    source: current.source,
    novelSlug: current.novelSlug,
    slug: current.slug,
    title: current.title,
    order: current.order,
    publishDate: current.publishDate,
    ...(current.volume ? { volume: current.volume } : {}),
    body: current.body,
  })
  const locked = { ...current, status: 'publishing' as const, updatedAt: new Date().toISOString() }
  let saved: { revision: string }
  try {
    saved = await writeNovelChapterDraftFile(id, serializeDraft(locked), current.revision)
  } catch (error) {
    if (error instanceof DraftRevisionError) {
      throw new NovelChapterConflictError(
        '草稿已被其他页面更新。',
        await getChapterDraft(id) ?? undefined,
      )
    }
    throw error
  }
  const publishing = { ...locked, revision: saved.revision }
  try {
    const result = await publishNovelChapterFiles(publishing, validated)
    try {
      await deleteNovelChapterDraftFile(id, publishing.revision, publishing.assets)
    } catch {
      // The published marker remains recoverable if cleanup cannot complete.
      await writeNovelChapterDraftFile(
        id,
        serializeDraft({ ...publishing, status: 'published' }),
        publishing.revision,
      )
    }
    return {
      sha: result.sha,
      url: `/zh-cn/novels/${validated.novelSlug}/${validated.slug}`,
      status: 'deploying' as const,
    }
  } catch (error) {
    try {
      await writeNovelChapterDraftFile(
        id,
        serializeDraft({ ...publishing, status: 'draft' }),
        publishing.revision,
      )
    } catch {
      // Keep the publishing record for manual recovery if another writer won the race.
    }
    if (error instanceof Error && error.message === '作品不存在。') {
      throw new NovelNotFoundError()
    }
    if (error instanceof Error && error.message === '章节序号已存在。') {
      throw new NovelChapterConflictError(error.message)
    }
    if (error instanceof DraftRevisionError) {
      throw new NovelChapterConflictError('发布期间作品内容已更新，请刷新后重试。')
    }
    throw error
  }
}

export async function deleteChapter(novelSlug: string, chapterSlug: string) {
  novelSlugSchema.parse(novelSlug)
  novelSlugSchema.parse(chapterSlug)
  try {
    return await deletePublishedNovelChapter(novelSlug, chapterSlug)
  } catch (error) {
    if (error instanceof Error && error.message === '作品不存在。') {
      throw new NovelNotFoundError()
    }
    if (error instanceof Error && error.message === '章节不存在。') {
      throw new NovelChapterConflictError(error.message)
    }
    if (error instanceof DraftRevisionError) {
      throw new NovelChapterConflictError('删除期间作品内容已更新，请刷新后重试。')
    }
    throw error
  }
}

export function createChapterMarkdown(input: ChapterFields) {
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

export function updateNovelIndexForChapter(
  index: NovelIndexEntry[],
  input: ChapterFields,
  chapters: ChapterFields[],
  source?: { novelSlug: string; slug: string } | null,
) {
  const novel = index.find((entry) => entry.slug === input.novelSlug)
  if (!novel) throw new NovelNotFoundError()
  const colliding = chapters.find(
    (chapter) =>
      chapter.order === input.order &&
      !(source && chapter.novelSlug === source.novelSlug && chapter.slug === source.slug),
  )
  if (colliding) throw new NovelChapterConflictError('章节序号已存在。')
  const withoutSource = chapters.filter(
    (chapter) =>
      !(source && chapter.novelSlug === source.novelSlug && chapter.slug === source.slug),
  )
  const nextChapters = [...withoutSource, input].sort((left, right) => left.order - right.order)
  const latest = nextChapters.at(-1) ?? null
  return index.map((entry) =>
    entry.slug === input.novelSlug
      ? {
          ...entry,
          chapterCount: nextChapters.length,
          latestChapter: latest?.slug ?? null,
          updatedAt: input.updatedAt ?? input.publishDate,
        }
      : entry,
  )
}

function serializeDraft(draft: Omit<NovelChapterDraft, 'revision'> & { revision?: string }) {
  const { revision: _revision, ...stored } = draft
  void _revision
  return `${JSON.stringify(stored, null, 2)}\n`
}

function parseStoredDraft(content: string, revision: string): NovelChapterDraft | null {
  try {
    const schema = z.object({
      id: novelDraftIdSchema,
      source: sourceSchema.nullable(),
      novelSlug: z.string().min(1).max(100).regex(routeSegment),
      slug: z.union([z.literal(''), z.string().max(100).regex(routeSegment)]),
      title: z.string().trim().max(160).regex(safeText),
      order: z.number().int().positive().max(100_000),
      publishDate: z.union([z.literal(''), dateSchema]),
      volume: z.string().trim().max(120).regex(safeText).optional(),
      body: z.string().max(1_000_000),
      assets: z.array(
        z.object({
          id: z.string().min(1).max(100),
          name: z.string().min(1).max(255),
          path: z.string().min(1).max(500),
          publicPath: z.string().min(1).max(500),
          mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
          size: z.number().int().positive().max(5 * 1024 * 1024),
          alt: z.string().min(1).max(300),
        }),
      ).default([]),
      status: z.enum(['draft', 'publishing', 'published']),
      updatedAt: z.string().datetime(),
    })
    return { ...schema.parse(JSON.parse(content)), revision }
  } catch {
    return null
  }
}
