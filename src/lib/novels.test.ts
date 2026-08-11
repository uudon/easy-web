import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createNovelRepository } from './novels'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('novel repository', () => {
  it('loads novels in most recently updated order', () => {
    const repository = createNovelRepository(createFixture())

    expect(repository.getNovels().map((novel) => novel.slug)).toEqual([
      'second-story',
      'paper-moon',
    ])
    expect(repository.getNovel('paper-moon')).toMatchObject({
      title: '纸月亮',
      status: '连载中',
      chapterCount: 3,
      latestChapter: 'chapter-3',
    })
  })

  it('loads chapter markdown and orders chapters by their positive integer order', () => {
    const repository = createNovelRepository(createFixture())

    const chapters = repository.getChapters('paper-moon')

    expect(chapters.map((chapter) => chapter.slug)).toEqual([
      'chapter-1',
      'chapter-2',
      'chapter-3',
    ])
    expect(chapters[1]).toMatchObject({
      novelSlug: 'paper-moon',
      title: '第二章 潮声',
      order: 2,
      publishDate: '2026-01-08',
      volume: '第一卷',
    })
    expect(chapters[1]?.body).toContain('第二章正文')
    expect(repository.getChapter('paper-moon', 'chapter-2')?.body).toContain('第二章正文')
  })

  it('rejects invalid and traversal-like novel or chapter slugs', () => {
    const repository = createNovelRepository(createFixture())

    expect(repository.getNovel('../secret')).toBeNull()
    expect(repository.getChapters('../secret')).toEqual([])
    expect(repository.getChapter('paper-moon', '../secret')).toBeNull()
    expect(repository.getChapter('../secret', 'chapter-1')).toBeNull()
  })

  it('fails closed when a novel contains duplicate chapter orders', () => {
    const rootDir = createFixture()
    writeChapter(rootDir, 'paper-moon', 'alternate-opening', {
      title: '另一种开场',
      order: 1,
      publishDate: '2026-01-02',
      body: '不应进入可阅读章节列表。',
    })
    const repository = createNovelRepository(rootDir)

    expect(repository.getChapters('paper-moon')).toEqual([])
    expect(repository.getAdjacentChapters('paper-moon', 'chapter-1')).toEqual({
      previous: null,
      next: null,
    })
  })

  it('does not load chapters for a novel absent from the novel index', () => {
    const rootDir = createFixture()
    writeChapter(rootDir, 'orphaned-story', 'chapter-1', {
      title: '孤立章节',
      order: 1,
      publishDate: '2026-01-01',
      body: '这篇章节没有对应作品。',
    })
    const repository = createNovelRepository(rootDir)

    expect(repository.getNovel('orphaned-story')).toBeNull()
    expect(repository.getChapters('orphaned-story')).toEqual([])
    expect(repository.getChapter('orphaned-story', 'chapter-1')).toBeNull()
  })

  it('returns the previous and next chapters according to chapter order', () => {
    const repository = createNovelRepository(createFixture())

    expect(repository.getAdjacentChapters('paper-moon', 'chapter-1')).toMatchObject({
      previous: null,
      next: { slug: 'chapter-2' },
    })
    expect(repository.getAdjacentChapters('paper-moon', 'chapter-2')).toMatchObject({
      previous: { slug: 'chapter-1' },
      next: { slug: 'chapter-3' },
    })
    expect(repository.getAdjacentChapters('paper-moon', 'chapter-3')).toMatchObject({
      previous: { slug: 'chapter-2' },
      next: null,
    })
    expect(repository.getAdjacentChapters('paper-moon', 'missing')).toEqual({
      previous: null,
      next: null,
    })
  })
})

describe('published novel content', () => {
  it('keeps index chapter metadata aligned with the published chapter files', () => {
    const repository = createNovelRepository(process.cwd())

    for (const novel of repository.getNovels()) {
      const chapters = repository.getChapters(novel.slug)
      expect(chapters).toHaveLength(novel.chapterCount)
      expect(chapters.at(-1)?.slug ?? null).toBe(novel.latestChapter)
    }
  })
})

function createFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-web-novels-'))
  temporaryDirectories.push(rootDir)
  const novelsDir = path.join(rootDir, 'content', 'novels')
  fs.mkdirSync(novelsDir, { recursive: true })
  fs.writeFileSync(
    path.join(novelsDir, 'index.json'),
    JSON.stringify([
      {
        title: '纸月亮',
        slug: 'paper-moon',
        summary: '一个关于海边旧书店的故事。',
        cover: '/images/novels/paper-moon.jpg',
        genre: '现实幻想',
        status: '连载中',
        startDate: '2026-01-01',
        updatedAt: '2026-01-15',
        chapterCount: 3,
        latestChapter: 'chapter-3',
      },
      {
        title: '第二个故事',
        slug: 'second-story',
        summary: '尚未开始的故事。',
        genre: '短篇',
        status: '暂停更新',
        startDate: '2026-02-01',
        updatedAt: '2026-02-02',
        chapterCount: 0,
        latestChapter: null,
      },
    ]),
    'utf8',
  )

  writeChapter(rootDir, 'paper-moon', 'chapter-3', {
    title: '第三章 灯塔',
    order: 3,
    publishDate: '2026-01-15',
    body: '第三章正文。',
  })
  writeChapter(rootDir, 'paper-moon', 'chapter-1', {
    title: '第一章 来客',
    order: 1,
    publishDate: '2026-01-01',
    body: '第一章正文。',
  })
  writeChapter(rootDir, 'paper-moon', 'chapter-2', {
    title: '第二章 潮声',
    order: 2,
    publishDate: '2026-01-08',
    volume: '第一卷',
    body: '第二章正文。',
  })
  return rootDir
}

function writeChapter(
  rootDir: string,
  novelSlug: string,
  chapterSlug: string,
  chapter: {
    title: string
    order: number
    publishDate: string
    volume?: string
    body: string
  },
) {
  const chapterDir = path.join(rootDir, 'content', 'novels', novelSlug)
  fs.mkdirSync(chapterDir, { recursive: true })
  const volume = chapter.volume ? `volume: "${chapter.volume}"\n` : ''
  fs.writeFileSync(
    path.join(chapterDir, `${chapterSlug}.md`),
    [
      '---',
      `novelSlug: "${novelSlug}"`,
      `title: "${chapter.title}"`,
      `slug: "${chapterSlug}"`,
      `order: ${chapter.order}`,
      `publishDate: "${chapter.publishDate}"`,
      `${volume}---`,
      '',
      chapter.body,
    ].join('\n'),
    'utf8',
  )
}
