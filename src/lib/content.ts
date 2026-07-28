import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

export const locales = ['zh-cn', 'en'] as const
export type Locale = (typeof locales)[number]

export type PostSummary = {
  title: string
  summary: string
  date: string
  locale: Locale
  category: string
  slug: string
  originalPath: string
}

export type PageSummary = {
  title: string
  summary: string
  date: string
  locale: Locale
  pagePath: string
  originalPath: string
}

export type Post = PostSummary & { body: string }
export type ContentPage = PageSummary & { body: string }

const safeSegmentPattern = /^[a-z0-9][a-z0-9-]*$/i

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale)
}

export function createContentRepository(rootDir: string) {
  const contentDir = path.join(rootDir, 'content')

  function getPosts(locale?: Locale) {
    const posts = readJson<PostSummary[]>(path.join(contentDir, 'index.json'), [])
      .filter((post) => isValidPostSummary(post))
      .sort((left, right) => right.date.localeCompare(left.date))
    return locale ? posts.filter((post) => post.locale === locale) : posts
  }

  function getPost(locale: Locale, slug: string): Post | null {
    if (!isLocale(locale) || !safeSegmentPattern.test(slug)) return null
    const filePath = path.join(contentDir, 'posts', locale, `${slug}.md`)
    const parsed = readMarkdown(filePath)
    if (!parsed) return null

    const summary = parsed.data as Partial<PostSummary>
    if (!isValidPostSummary(summary) || summary.locale !== locale || summary.slug !== slug) {
      return null
    }

    return { ...summary, body: parsed.content } as Post
  }

  function getPages(locale?: Locale) {
    const pages = readJson<PageSummary[]>(path.join(contentDir, 'pages.json'), [])
      .filter((page) => isValidPageSummary(page))
      .sort((left, right) => left.originalPath.localeCompare(right.originalPath))
    return locale ? pages.filter((page) => page.locale === locale) : pages
  }

  function getPage(locale: Locale, segments: string[]): ContentPage | null {
    if (!isLocale(locale) || segments.some((segment) => !safeSegmentPattern.test(segment))) {
      return null
    }

    const relativePath = segments.length > 0 ? `${segments.join('/')}.md` : 'index.md'
    const filePath = path.join(contentDir, 'pages', locale, relativePath)
    const parsed = readMarkdown(filePath)
    if (!parsed) return null

    const summary = parsed.data as Partial<PageSummary>
    if (!isValidPageSummary(summary) || summary.locale !== locale) return null
    return { ...summary, body: parsed.content } as ContentPage
  }

  function getCategories(locale: Locale) {
    const counts = getPosts(locale).reduce<Record<string, number>>(
      (result, post) => ({ ...result, [post.category]: (result[post.category] ?? 0) + 1 }),
      {},
    )
    return Object.entries(counts)
      .map(([slug, count]) => ({ slug, count }))
      .sort((left, right) => right.count - left.count || left.slug.localeCompare(right.slug))
  }

  return { getPosts, getPost, getPages, getPage, getCategories }
}

export const contentRepository = createContentRepository(process.cwd())

function readMarkdown(filePath: string) {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null
    return matter(fs.readFileSync(filePath, 'utf8'))
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

function isValidPostSummary(value: Partial<PostSummary>): value is PostSummary {
  return Boolean(
    value &&
      typeof value.title === 'string' &&
      typeof value.summary === 'string' &&
      typeof value.date === 'string' &&
      typeof value.locale === 'string' &&
      isLocale(value.locale) &&
      typeof value.category === 'string' &&
      safeSegmentPattern.test(value.category) &&
      typeof value.slug === 'string' &&
      safeSegmentPattern.test(value.slug) &&
      typeof value.originalPath === 'string',
  )
}

function isValidPageSummary(value: Partial<PageSummary>): value is PageSummary {
  return Boolean(
    value &&
      typeof value.title === 'string' &&
      typeof value.summary === 'string' &&
      typeof value.date === 'string' &&
      typeof value.locale === 'string' &&
      isLocale(value.locale) &&
      typeof value.pagePath === 'string' &&
      typeof value.originalPath === 'string',
  )
}
