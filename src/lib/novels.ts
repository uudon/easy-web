import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

export const novelStatuses = ['连载中', '已完结', '暂停更新'] as const

export type NovelStatus = (typeof novelStatuses)[number]

export type Novel = {
  title: string
  slug: string
  summary: string
  cover?: string
  genre: string
  status: NovelStatus
  startDate: string
  updatedAt: string
}

export type NovelSummary = Novel & {
  chapterCount: number
  latestChapter: string | null
}

export type NovelChapter = {
  novelSlug: string
  title: string
  slug: string
  order: number
  publishDate: string
  updatedAt?: string
  volume?: string
  assets?: string[]
  body: string
}

const safeSegmentPattern = /^[a-z0-9][a-z0-9-]*$/i
const datePattern = /^\d{4}-\d{2}-\d{2}$/

export function isSafeNovelSegment(value: string) {
  return safeSegmentPattern.test(value)
}

export function createNovelRepository(rootDir: string) {
  const novelsDir = path.join(rootDir, 'content', 'novels')

  function getNovels(): NovelSummary[] {
    const index = readJson<unknown>(path.join(novelsDir, 'index.json'), [])
    if (!Array.isArray(index)) return []
    return index
      .filter(isNovelSummary)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  function getNovel(slug: string): NovelSummary | null {
    if (!isSafeNovelSegment(slug)) return null
    return getNovels().find((novel) => novel.slug === slug) ?? null
  }

  function getChapters(novelSlug: string): NovelChapter[] {
    if (!getNovel(novelSlug)) return []

    const chapterDir = path.join(novelsDir, novelSlug)
    let filenames: string[]
    try {
      filenames = fs.readdirSync(chapterDir)
    } catch {
      return []
    }

    const chapters = filenames
      .filter((filename) => filename.endsWith('.md'))
      .map((filename) => readChapter(chapterDir, filename, novelSlug))
      .filter((chapter): chapter is NovelChapter => chapter !== null)
      .sort((left, right) => left.order - right.order)

    const orders = new Set(chapters.map((chapter) => chapter.order))
    if (orders.size !== chapters.length) return []
    return chapters
  }

  function getChapter(novelSlug: string, chapterSlug: string): NovelChapter | null {
    if (!isSafeNovelSegment(chapterSlug)) return null
    return getChapters(novelSlug).find((chapter) => chapter.slug === chapterSlug) ?? null
  }

  function getAdjacentChapters(novelSlug: string, chapterSlug: string) {
    const chapters = getChapters(novelSlug)
    const index = chapters.findIndex((chapter) => chapter.slug === chapterSlug)
    if (index < 0) return { previous: null, next: null }
    return {
      previous: chapters[index - 1] ?? null,
      next: chapters[index + 1] ?? null,
    }
  }

  return { getNovels, getNovel, getChapters, getChapter, getAdjacentChapters }
}

export const novelRepository = createNovelRepository(process.cwd())

function readChapter(
  chapterDir: string,
  filename: string,
  expectedNovelSlug: string,
): NovelChapter | null {
  const fileSlug = filename.slice(0, -3)
  if (!isSafeNovelSegment(fileSlug)) return null

  try {
    const parsed = matter(fs.readFileSync(path.join(chapterDir, filename), 'utf8'))
    const data = parsed.data as Partial<NovelChapter>
    if (
      !isNovelChapterMetadata(data) ||
      data.novelSlug !== expectedNovelSlug ||
      data.slug !== fileSlug
    ) {
      return null
    }
    return { ...data, body: parsed.content } as NovelChapter
  } catch {
    return null
  }
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return fallback
  }
}

function isNovelSummary(value: unknown): value is NovelSummary {
  if (!value || typeof value !== 'object') return false
  const novel = value as Partial<NovelSummary>
  return Boolean(
    typeof novel.title === 'string' &&
      novel.title.trim() &&
      typeof novel.slug === 'string' &&
      isSafeNovelSegment(novel.slug) &&
      typeof novel.summary === 'string' &&
      typeof novel.genre === 'string' &&
      novelStatuses.includes(novel.status as NovelStatus) &&
      typeof novel.startDate === 'string' &&
      isValidDate(novel.startDate) &&
      typeof novel.updatedAt === 'string' &&
      isValidDate(novel.updatedAt) &&
      Number.isSafeInteger(novel.chapterCount) &&
      (novel.chapterCount ?? -1) >= 0 &&
      (novel.latestChapter === null ||
        (typeof novel.latestChapter === 'string' &&
          isSafeNovelSegment(novel.latestChapter))) &&
      (novel.cover === undefined || typeof novel.cover === 'string'),
  )
}

function isNovelChapterMetadata(value: Partial<NovelChapter>): value is Omit<NovelChapter, 'body'> {
  return Boolean(
    typeof value.novelSlug === 'string' &&
      isSafeNovelSegment(value.novelSlug) &&
      typeof value.title === 'string' &&
      value.title.trim() &&
      typeof value.slug === 'string' &&
      isSafeNovelSegment(value.slug) &&
      Number.isSafeInteger(value.order) &&
      (value.order ?? 0) > 0 &&
      typeof value.publishDate === 'string' &&
      isValidDate(value.publishDate) &&
      (value.updatedAt === undefined ||
        (typeof value.updatedAt === 'string' && isValidDate(value.updatedAt))) &&
      (value.volume === undefined || typeof value.volume === 'string') &&
      (value.assets === undefined ||
        (Array.isArray(value.assets) &&
          value.assets.every(
            (asset) => typeof asset === 'string' && asset.startsWith('/uploads/'),
          ))),
  )
}

function isValidDate(value: string) {
  if (!datePattern.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value)
}
