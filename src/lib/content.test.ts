import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createContentRepository } from './content'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('content repository', () => {
  it('returns posts for the requested locale in descending date order', () => {
    const rootDir = createFixture()
    const repository = createContentRepository(rootDir)

    expect(repository.getPosts('zh-cn').map((post) => post.slug)).toEqual(['newer', 'older'])
    expect(repository.getPosts('en')).toEqual([])
  })

  it('loads markdown and frontmatter for a valid post', () => {
    const rootDir = createFixture()
    const repository = createContentRepository(rootDir)

    const post = repository.getPost('zh-cn', 'newer')

    expect(post?.title).toBe('较新的文章')
    expect(post?.body).toContain('正文')
  })

  it('rejects path traversal attempts', () => {
    const rootDir = createFixture()
    const repository = createContentRepository(rootDir)

    expect(repository.getPost('zh-cn', '../secret')).toBeNull()
    expect(repository.getPage('zh-cn', ['..', '.env'])).toBeNull()
  })

  it('loads pages and calculates immutable category counts', () => {
    const rootDir = createFixture()
    const pagesDir = path.join(rootDir, 'content', 'pages', 'zh-cn')
    fs.mkdirSync(pagesDir, { recursive: true })
    fs.writeFileSync(
      path.join(pagesDir, 'about.md'),
      '---\ntitle: "关于我"\nsummary: "介绍"\ndate: "2026-01-01"\nlocale: "zh-cn"\npagePath: "about"\noriginalPath: "/zh-cn/about"\navatar: "/images/about/shixing.jpg"\navatarAlt: "施行的个人头像"\n---\n\n页面正文',
      'utf8',
    )
    fs.writeFileSync(
      path.join(rootDir, 'content', 'pages.json'),
      JSON.stringify([
        {
          title: '关于我',
          summary: '介绍',
          date: '2026-01-01',
          locale: 'zh-cn',
          pagePath: 'about',
          originalPath: '/zh-cn/about',
        },
      ]),
      'utf8',
    )
    const repository = createContentRepository(rootDir)

    const aboutPage = repository.getPage('zh-cn', ['about'])

    expect(aboutPage?.body).toContain('页面正文')
    expect(aboutPage?.avatar).toBe('/images/about/shixing.jpg')
    expect(aboutPage?.avatarAlt).toBe('施行的个人头像')
    expect(repository.getPages('zh-cn')).toHaveLength(1)
    expect(repository.getCategories('zh-cn')).toEqual([
      { slug: 'ai', count: 1 },
      { slug: 'thinking', count: 1 },
    ])
  })

  it('falls back to empty collections when indexes are malformed', () => {
    const rootDir = createFixture()
    fs.writeFileSync(path.join(rootDir, 'content', 'index.json'), '{bad-json', 'utf8')
    fs.writeFileSync(path.join(rootDir, 'content', 'pages.json'), '{bad-json', 'utf8')
    const repository = createContentRepository(rootDir)

    expect(repository.getPosts()).toEqual([])
    expect(repository.getPages()).toEqual([])
    expect(repository.getPost('en', 'missing')).toBeNull()
  })
})

function createFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-web-repository-'))
  temporaryDirectories.push(rootDir)
  const postsDir = path.join(rootDir, 'content', 'posts', 'zh-cn')
  fs.mkdirSync(postsDir, { recursive: true })
  fs.writeFileSync(
    path.join(postsDir, 'newer.md'),
    '---\ntitle: "较新的文章"\nsummary: "摘要"\ndate: "2026-02-01"\nlocale: "zh-cn"\ncategory: "ai"\nslug: "newer"\noriginalPath: "/old/newer"\n---\n\n正文',
    'utf8',
  )
  fs.writeFileSync(
    path.join(postsDir, 'older.md'),
    '---\ntitle: "较早的文章"\nsummary: "摘要"\ndate: "2026-01-01"\nlocale: "zh-cn"\ncategory: "thinking"\nslug: "older"\noriginalPath: "/old/older"\n---\n\n正文',
    'utf8',
  )
  fs.writeFileSync(
    path.join(rootDir, 'content', 'index.json'),
    JSON.stringify([
      {
        title: '较早的文章',
        summary: '摘要',
        date: '2026-01-01',
        locale: 'zh-cn',
        category: 'thinking',
        slug: 'older',
        originalPath: '/old/older',
      },
      {
        title: '较新的文章',
        summary: '摘要',
        date: '2026-02-01',
        locale: 'zh-cn',
        category: 'ai',
        slug: 'newer',
        originalPath: '/old/newer',
      },
    ]),
    'utf8',
  )
  fs.writeFileSync(path.join(rootDir, 'content', 'pages.json'), '[]', 'utf8')
  return rootDir
}
