import crypto from 'node:crypto'
import { z } from 'zod'

import type { Locale, Post } from './content'
import {
  deleteDraftFile,
  listDraftFiles,
  publishDraftFiles,
  readDraftFile,
  DraftRevisionError,
  writeDraftFile,
} from './github-app'

const routeSegment = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const draftIdPattern = /^draft_[A-Za-z0-9_-]{10,80}$/
const safeText = /^[^<>]*$/
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  })

export type DraftAsset = {
  id: string
  name: string
  path: string
  publicPath: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  size: number
  alt: string
}

export type Draft = {
  id: string
  source: { locale: Locale; slug: string } | null
  translationKey?: string
  locale: Locale
  slug: string
  title: string
  summary: string
  category: string
  publishDate: string
  body: string
  assets: DraftAsset[]
  status: 'draft' | 'publishing' | 'published'
  revision: string
  updatedAt: string
}

const sourceSchema = z.object({
  locale: z.enum(['zh-cn', 'en']),
  slug: z.string().min(1).max(100).regex(routeSegment),
})

const draftFieldsSchema = z.object({
  source: sourceSchema.nullable(),
  translationKey: z.string().min(1).max(100).regex(routeSegment).optional(),
  locale: z.enum(['zh-cn', 'en']),
  slug: z.string().min(1).max(100).regex(routeSegment),
  title: z.string().trim().min(1).max(160).regex(safeText),
  summary: z.string().trim().max(360).regex(safeText),
  category: z.string().min(1).max(60).regex(routeSegment),
  publishDate: dateSchema,
  body: z.string().min(1).max(500_000),
})

export const draftCreateSchema = draftFieldsSchema.strict()
const editableDraftFieldsSchema = z.object({
  translationKey: z.union([z.literal(''), z.string().max(100).regex(routeSegment)]).optional(),
  locale: z.enum(['zh-cn', 'en']),
  slug: z.union([z.literal(''), z.string().max(100).regex(routeSegment)]),
  title: z.string().trim().max(160).regex(safeText),
  summary: z.string().trim().max(360).regex(safeText),
  category: z.string().min(1).max(60).regex(routeSegment),
  publishDate: z.union([z.literal(''), dateSchema]),
  body: z.string().max(500_000),
})
export const draftUpdateSchema = editableDraftFieldsSchema
  .partial()
  .extend({ baseRevision: z.string().min(1).max(100) })
export const draftIdSchema = z.string().regex(draftIdPattern)
export const draftSourceSchema = z.object({ source: sourceSchema }).strict()

export type DraftCreateInput = z.infer<typeof draftCreateSchema>
export type DraftUpdateInput = z.infer<typeof draftUpdateSchema>

export class DraftNotFoundError extends Error {
  constructor() {
    super('Draft not found.')
    this.name = 'DraftNotFoundError'
  }
}

export class DraftConflictError extends Error {
  readonly current: Draft

  constructor(current: Draft) {
    super('The draft has been changed by another editor.')
    this.name = 'DraftConflictError'
    this.current = current
  }
}

export class DraftIdentityError extends Error {
  constructor() {
    super('Published article locale and slug cannot be changed.')
    this.name = 'DraftIdentityError'
  }
}

export function createDraft(
  input: DraftCreateInput,
  metadata: { id: string; now: string; revision: string },
): Draft {
  return {
    ...input,
    id: metadata.id,
    assets: [],
    status: 'draft',
    revision: metadata.revision,
    updatedAt: metadata.now,
  }
}

export function hasRevisionConflict(baseRevision?: string, currentRevision?: string) {
  return baseRevision !== currentRevision
}

export function hasSourceIdentityChange(
  source: Draft['source'],
  changes: Pick<Partial<Draft>, 'locale' | 'slug'>,
) {
  if (!source) return false
  return (
    (changes.locale !== undefined && changes.locale !== source.locale) ||
    (changes.slug !== undefined && changes.slug !== source.slug)
  )
}

export async function listDrafts(): Promise<Draft[]> {
  const files = await listDraftFiles()
  return files
    .map((file) => parseStoredDraft(file.content, file.revision))
    .filter((draft): draft is Draft => draft !== null)
    .filter((draft) => draft.status !== 'published')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function getDraft(id: string): Promise<Draft | null> {
  draftIdSchema.parse(id)
  const file = await readDraftFile(id)
  return file ? parseStoredDraft(file.content, file.revision) : null
}

export async function createEmptyDraft(options?: {
  sourcePost?: Post
  existingDrafts?: readonly Draft[]
}): Promise<Draft> {
  const sourcePost = options?.sourcePost
  if (sourcePost && options?.existingDrafts) {
    const existing = options.existingDrafts.find(
      (draft) =>
        draft.source?.locale === sourcePost.locale && draft.source.slug === sourcePost.slug,
    )
    if (existing) return existing
  }

  const id = `draft_${crypto.randomUUID().replaceAll('-', '')}`
  const now = new Date().toISOString()
  const date = now.slice(0, 10)
  const initial = {
    id,
    source: sourcePost
      ? { locale: sourcePost.locale, slug: sourcePost.slug }
      : null,
    ...(sourcePost?.translationKey ? { translationKey: sourcePost.translationKey } : {}),
    locale: sourcePost?.locale ?? ('zh-cn' as const),
    slug: sourcePost?.slug ?? '',
    title: sourcePost?.title ?? '',
    summary: sourcePost?.summary ?? '',
    category: sourcePost?.category ?? 'thinking',
    publishDate: sourcePost?.date ?? date,
    body: sourcePost?.body.trim() || '# 开始写作\n\n',
    assets: [],
    status: 'draft' as const,
    revision: '',
    updatedAt: now,
  }
  const saved = await writeDraftFile(id, serializeDraft(initial), undefined)
  return { ...initial, revision: saved.revision }
}

export async function updateDraft(id: string, input: DraftUpdateInput): Promise<Draft> {
  draftIdSchema.parse(id)
  const current = await getDraft(id)
  if (!current) throw new DraftNotFoundError()
  if (hasRevisionConflict(input.baseRevision, current.revision)) {
    throw new DraftConflictError(current)
  }
  const { baseRevision: _baseRevision, ...changes } = input
  void _baseRevision
  if (hasSourceIdentityChange(current.source, changes)) {
    throw new DraftIdentityError()
  }
  const next = {
    ...current,
    ...changes,
    id: current.id,
    source: current.source,
    assets: current.assets.map((asset) => ({ ...asset })),
    status: 'draft' as const,
    updatedAt: new Date().toISOString(),
  }
  try {
    const saved = await writeDraftFile(id, serializeDraft(next), current.revision)
    return { ...next, revision: saved.revision }
  } catch (error) {
    if (error instanceof DraftRevisionError) {
      const latest = await getDraft(id)
      if (latest) throw new DraftConflictError(latest)
    }
    throw error
  }
}

export async function removeDraft(id: string, baseRevision?: string): Promise<void> {
  draftIdSchema.parse(id)
  const current = await getDraft(id)
  if (!current) throw new DraftNotFoundError()
  if (hasRevisionConflict(baseRevision, current.revision)) {
    throw new DraftConflictError(current)
  }
  try {
    await deleteDraftFile(id, current)
  } catch (error) {
    if (error instanceof DraftRevisionError) {
      const latest = await getDraft(id)
      if (latest) throw new DraftConflictError(latest)
    }
    throw error
  }
}

export async function saveDraftAsset(
  id: string,
  baseRevision: string,
  asset: DraftAsset,
  bytes: Uint8Array,
): Promise<Draft> {
  const current = await getDraft(id)
  if (!current) throw new DraftNotFoundError()
  if (hasRevisionConflict(baseRevision, current.revision)) {
    throw new DraftConflictError(current)
  }
  const next = {
    ...current,
    assets: [...current.assets, { ...asset }],
    updatedAt: new Date().toISOString(),
  }
  try {
    const saved = await writeDraftFile(id, serializeDraft(next), current.revision, [
      { path: asset.path, content: Buffer.from(bytes).toString('base64'), encoding: 'base64' },
    ])
    return { ...next, revision: saved.revision }
  } catch (error) {
    if (error instanceof DraftRevisionError) {
      const latest = await getDraft(id)
      if (latest) throw new DraftConflictError(latest)
    }
    throw error
  }
}

export async function publishDraft(id: string, baseRevision: string) {
  const current = await getDraft(id)
  if (!current) throw new DraftNotFoundError()
  if (hasRevisionConflict(baseRevision, current.revision)) {
    throw new DraftConflictError(current)
  }
  const validated = draftCreateSchema.parse({
    source: current.source,
    ...(current.translationKey ? { translationKey: current.translationKey } : {}),
    locale: current.locale,
    slug: current.slug,
    title: current.title,
    summary: current.summary,
    category: current.category,
    publishDate: current.publishDate,
    body: current.body,
  })
  let locked = { ...current, status: 'publishing' as const, updatedAt: new Date().toISOString() }
  try {
    const saved = await writeDraftFile(id, serializeDraft(locked), current.revision)
    locked = { ...locked, revision: saved.revision }
  } catch (error) {
    if (error instanceof DraftRevisionError) {
      const latest = await getDraft(id)
      if (latest) throw new DraftConflictError(latest)
    }
    throw error
  }
  let result: Awaited<ReturnType<typeof publishDraftFiles>>
  try {
    result = await publishDraftFiles(locked, validated)
  } catch (error) {
    try {
      const restored = { ...locked, status: 'draft' as const, updatedAt: new Date().toISOString() }
      await writeDraftFile(id, serializeDraft(restored), locked.revision)
    } catch {
      // A failed recovery remains visible as "publishing" for manual inspection.
    }
    throw error
  }
  const published = {
    ...locked,
    status: 'published' as const,
    revision: result.sha,
    updatedAt: new Date().toISOString(),
  }
  let cleanupPending = false
  try {
    await deleteDraftFile(id, locked)
  } catch (error) {
    cleanupPending = true
    console.error('Published draft cleanup failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    })
    try {
      await writeDraftFile(id, serializeDraft(published), locked.revision)
    } catch (markerError) {
      console.error('Published draft marker failed', {
        name: markerError instanceof Error ? markerError.name : 'UnknownError',
      })
    }
  }
  return {
    draft: published,
    sha: result.sha,
    url: `/${current.locale}/blog/${current.slug}`,
    status: 'deploying' as const,
    cleanupPending,
  }
}

function serializeDraft(draft: Omit<Draft, 'revision'> & { revision?: string }) {
  const { revision: _revision, ...stored } = draft
  void _revision
  return `${JSON.stringify(stored, null, 2)}\n`
}

function parseStoredDraft(content: string, revision: string): Draft | null {
  try {
    const value = JSON.parse(content) as Omit<Draft, 'revision'>
    const storedSchema = editableDraftFieldsSchema.extend({
      source: sourceSchema.nullable(),
      id: draftIdSchema,
      assets: z.array(
        z.object({
          id: z.string().min(1).max(100),
          name: z.string().min(1).max(255),
          path: z.string().min(1).max(500),
          publicPath: z.string().min(1).max(500),
          mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
          size: z.number().int().positive().max(5 * 1024 * 1024),
          alt: z.string().max(300),
        }),
      ),
      status: z.enum(['draft', 'publishing', 'published']),
      updatedAt: z.string().datetime(),
    })
    return { ...storedSchema.parse(value), revision }
  } catch {
    return null
  }
}
