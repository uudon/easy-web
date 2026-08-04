import fs from 'node:fs'
import path from 'node:path'

const supportedLocales = new Set(['zh-cn', 'en'])
const routeSafePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function normalizeContentSlug(value) {
  const slug = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (!slug || !routeSafePattern.test(slug)) {
    throw new Error(`Unable to create a route-safe slug from "${value}".`)
  }

  return slug
}

export function buildContentRecord({ relativePath, content, modifiedAt = new Date() }) {
  const normalizedPath = relativePath.split(path.sep).join('/')
  const match = normalizedPath.match(/^docs\/(zh-cn|en)\/(.+)\.md$/)
  if (!match) {
    throw new Error(`Unsupported documentation path: ${normalizedPath}`)
  }

  const [, locale, routePath] = match
  if (!supportedLocales.has(locale)) {
    throw new Error(`Unsupported locale: ${locale}`)
  }

  const routeParts = routePath.split('/')
  const filename = routeParts.at(-1) ?? ''
  const isTopicArticle =
    routeParts[0] === 'topics' &&
    routeParts.length === 3 &&
    filename !== 'index'

  const { data, body } = parseFrontmatter(content)
  const title = readTitle(data, body, filename)
  const summary = readSummary(data, body)
  const date = normalizeDate(data.date, modifiedAt)
  const originalPath = buildOriginalPath(locale, routePath, filename)

  if (isTopicArticle) {
    const category = routeParts[1]
    const slug = normalizeContentSlug(data.slug || filename)
    return {
      kind: 'post',
      locale,
      category,
      slug,
      title,
      summary,
      date,
      originalPath,
      body: removeLeadingTitle(body),
    }
  }

  const pagePath = filename === 'index' ? routeParts.slice(0, -1).join('/') : routePath
  const profile = readPageProfile(data)
  return {
    kind: 'page',
    locale,
    pagePath,
    title,
    summary,
    date,
    originalPath,
    ...profile,
    body: removeLeadingTitle(body),
  }
}

export function migrateContent({ rootDir }) {
  const sourceFiles = ['zh-cn', 'en'].flatMap((locale) =>
    walkMarkdownFiles(path.join(rootDir, 'docs', locale)),
  )
  const records = sourceFiles.map((absolutePath) => {
    const stats = fs.statSync(absolutePath)
    return buildContentRecord({
      relativePath: path.relative(rootDir, absolutePath),
      content: fs.readFileSync(absolutePath, 'utf8'),
      modifiedAt: stats.mtime,
    })
  })

  const posts = records
    .filter((record) => record.kind === 'post')
    .sort((left, right) => right.date.localeCompare(left.date) || left.title.localeCompare(right.title))
  const pages = records
    .filter((record) => record.kind === 'page')
    .sort((left, right) => left.originalPath.localeCompare(right.originalPath))

  assertUniquePostRoutes(posts)

  const contentDir = path.join(rootDir, 'content')
  fs.mkdirSync(contentDir, { recursive: true })

  for (const post of posts) {
    const destination = path.join(contentDir, 'posts', post.locale, `${post.slug}.md`)
    writeFile(destination, serializePost(post))
  }

  for (const page of pages) {
    const relativePagePath = page.pagePath ? `${page.pagePath}.md` : 'index.md'
    const destination = path.join(contentDir, 'pages', page.locale, relativePagePath)
    writeFile(destination, serializePage(page))
  }

  const publicPosts = posts.map((post) => ({
    locale: post.locale,
    category: post.category,
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    date: post.date,
    originalPath: post.originalPath,
  }))
  const publicPages = pages.map((page) => ({
    locale: page.locale,
    pagePath: page.pagePath,
    title: page.title,
    summary: page.summary,
    date: page.date,
    originalPath: page.originalPath,
    ...(page.avatar ? { avatar: page.avatar, avatarAlt: page.avatarAlt } : {}),
  }))
  const redirects = posts.flatMap((post) => [
    {
      source: post.originalPath,
      destination: `/${post.locale}/blog/${post.slug}`,
      permanent: true,
    },
    {
      source: `${post.originalPath}.html`,
      destination: `/${post.locale}/blog/${post.slug}`,
      permanent: true,
    },
  ])

  writeFile(path.join(contentDir, 'index.json'), `${JSON.stringify(publicPosts, null, 2)}\n`)
  writeFile(path.join(contentDir, 'pages.json'), `${JSON.stringify(publicPages, null, 2)}\n`)
  writeFile(path.join(contentDir, 'redirects.json'), `${JSON.stringify(redirects, null, 2)}\n`)

  return { posts: publicPosts, pages: publicPages, redirects }
}

function parseFrontmatter(content) {
  if (!content.startsWith('---\n')) {
    return { data: {}, body: content.trim() }
  }

  const closingIndex = content.indexOf('\n---\n', 4)
  if (closingIndex === -1) {
    return { data: {}, body: content.trim() }
  }

  const raw = content.slice(4, closingIndex)
  const data = Object.fromEntries(
    raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf(':')
        if (separator === -1) return ['', '']
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, ''),
        ]
      })
      .filter(([key]) => key),
  )

  return { data, body: content.slice(closingIndex + 5).trim() }
}

function readTitle(data, body, fallback) {
  if (typeof data.title === 'string' && data.title.trim()) {
    return data.title.trim()
  }

  const heading = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#\s+/.test(line))

  return heading ? heading.replace(/^#\s+/, '').trim() : fallback
}

function readPageProfile(data) {
  if (!data.avatar && !data.avatarAlt) return {}

  const isValidAvatar =
    /^\/[a-z0-9][a-z0-9/_-]*\.(?:avif|jpe?g|png|webp)$/i.test(data.avatar ?? '')
  if (!isValidAvatar || !data.avatarAlt?.trim()) {
    throw new Error('Page avatar requires a local image path and non-empty avatarAlt text.')
  }

  return { avatar: data.avatar, avatarAlt: data.avatarAlt.trim() }
}

function readSummary(data, body) {
  if (typeof data.description === 'string' && data.description.trim()) {
    return data.description.trim()
  }

  const paragraph = body
    .split(/\n\s*\n/)
    .map((value) => value.trim())
    .find((value) => value && !value.startsWith('#') && !value.startsWith(':::'))

  return stripMarkdown(paragraph ?? '').slice(0, 180)
}

function stripMarkdown(value) {
  return value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function removeLeadingTitle(body) {
  return body.replace(/^\s*#\s+[^\n]+\n?/, '').trim()
}

function normalizeDate(value, fallbackDate) {
  const parsed = value ? new Date(value) : fallbackDate
  const safeDate = Number.isNaN(parsed.getTime()) ? fallbackDate : parsed
  return safeDate.toISOString().slice(0, 10)
}

function buildOriginalPath(locale, routePath, filename) {
  if (filename === 'index') {
    const directory = routePath.slice(0, -'/index'.length)
    return directory ? `/${locale}/${directory}/` : `/${locale}/`
  }
  return `/${locale}/${routePath}`
}

function serializePost(post) {
  return [
    '---',
    `title: ${JSON.stringify(post.title)}`,
    `summary: ${JSON.stringify(post.summary)}`,
    `date: ${JSON.stringify(post.date)}`,
    `locale: ${JSON.stringify(post.locale)}`,
    `category: ${JSON.stringify(post.category)}`,
    `slug: ${JSON.stringify(post.slug)}`,
    `originalPath: ${JSON.stringify(post.originalPath)}`,
    '---',
    '',
    post.body,
    '',
  ].join('\n')
}

function serializePage(page) {
  return [
    '---',
    `title: ${JSON.stringify(page.title)}`,
    `summary: ${JSON.stringify(page.summary)}`,
    `date: ${JSON.stringify(page.date)}`,
    `locale: ${JSON.stringify(page.locale)}`,
    `pagePath: ${JSON.stringify(page.pagePath)}`,
    `originalPath: ${JSON.stringify(page.originalPath)}`,
    ...(page.avatar
      ? [
          `avatar: ${JSON.stringify(page.avatar)}`,
          `avatarAlt: ${JSON.stringify(page.avatarAlt)}`,
        ]
      : []),
    '---',
    '',
    page.body,
    '',
  ].join('\n')
}

function assertUniquePostRoutes(posts) {
  const routes = new Set()
  for (const post of posts) {
    const route = `${post.locale}/${post.slug}`
    if (routes.has(route)) {
      throw new Error(`Duplicate post route: ${route}`)
    }
    routes.add(route)
  }
}

function walkMarkdownFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return walkMarkdownFiles(absolutePath)
    return entry.isFile() && entry.name.endsWith('.md') ? [absolutePath] : []
  })
}

function writeFile(destination, content) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, content, 'utf8')
}
