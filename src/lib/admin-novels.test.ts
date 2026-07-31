import { describe, expect, it } from 'vitest'

import {
  chapterDraftCreateSchema,
  createChapterMarkdown,
  novelInputSchema,
  updateNovelIndexForChapter,
} from './admin-novels'

const validNovel = {
  title: '纸月亮',
  slug: 'paper-moon',
  summary: '一个关于海边旧书店的故事。',
  cover: '',
  genre: '现实幻想',
  status: '连载中' as const,
  startDate: '2026-01-01',
}

const validChapter = {
  source: null,
  novelSlug: 'paper-moon',
  slug: 'chapter-1',
  title: '第一章 来客',
  order: 1,
  publishDate: '2026-01-01',
  volume: '第一卷',
  body: '海风从门缝里吹进来。',
}

describe('novel admin validation', () => {
  it('accepts safe novel and chapter inputs', () => {
    expect(novelInputSchema.parse(validNovel)).toEqual(validNovel)
    expect(chapterDraftCreateSchema.parse(validChapter)).toEqual(validChapter)
  })

  it('keeps the public index updatedAt contract as a calendar date', () => {
    const result = updateNovelIndexForChapter(
      [{ ...validNovel, updatedAt: '2026-01-01', chapterCount: 0, latestChapter: null }],
      validChapter,
      [],
    )

    expect(result[0]?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it.each([
    [{ ...validNovel, slug: '../secret' }, 'novel traversal'],
    [{ ...validNovel, cover: 'javascript:alert(1)' }, 'unsafe cover'],
    [{ ...validNovel, status: '未知' }, 'unknown status'],
    [{ ...validNovel, startDate: '2026-02-30' }, 'invalid date'],
  ])('rejects unsafe novel input: %s (%s)', (input, label) => {
    expect(label).toBeTruthy()
    expect(() => novelInputSchema.parse(input)).toThrow()
  })

  it.each([
    [{ ...validChapter, novelSlug: '../secret' }, 'novel traversal'],
    [{ ...validChapter, slug: 'chapter/1' }, 'chapter traversal'],
    [{ ...validChapter, order: 0 }, 'non-positive order'],
    [{ ...validChapter, title: '<script>alert(1)</script>' }, 'unsafe title'],
    [{ ...validChapter, body: '' }, 'empty body'],
  ])('rejects unsafe chapter input: %s (%s)', (input, label) => {
    expect(label).toBeTruthy()
    expect(() => chapterDraftCreateSchema.parse(input)).toThrow()
  })
})

describe('chapter publication helpers', () => {
  it('creates complete frontmatter without emitting an empty volume', () => {
    const markdown = createChapterMarkdown({ ...validChapter, volume: '' })

    expect(markdown).toContain('novelSlug: "paper-moon"')
    expect(markdown).toContain('order: 1')
    expect(markdown).not.toContain('volume:')
    expect(markdown).toContain('海风从门缝里吹进来。')
  })

  it('records modification time and published assets for later cleanup', () => {
    const markdown = createChapterMarkdown({
      ...validChapter,
      updatedAt: '2026-02-01',
      publishedAssets: ['/uploads/2026/02/scene.png'],
    })

    expect(markdown).toContain('updatedAt: "2026-02-01"')
    expect(markdown).toContain('assets: ["/uploads/2026/02/scene.png"]')
  })

  it('updates chapter count, latest chapter and date immutably', () => {
    const index = [{ ...validNovel, updatedAt: '2026-01-01', chapterCount: 0, latestChapter: null }]
    const result = updateNovelIndexForChapter(index, validChapter, [])

    expect(result[0]).toMatchObject({
      chapterCount: 1,
      latestChapter: 'chapter-1',
      updatedAt: '2026-01-01',
    })
    expect(index[0]?.chapterCount).toBe(0)
  })

  it('rejects missing novels and duplicate chapter orders', () => {
    expect(() => updateNovelIndexForChapter([], validChapter, [])).toThrow(
      '作品不存在',
    )
    expect(() =>
      updateNovelIndexForChapter(
        [{ ...validNovel, updatedAt: '2026-01-01', chapterCount: 1, latestChapter: 'opening' }],
        validChapter,
        [{ ...validChapter, slug: 'opening' }],
      ),
    ).toThrow('章节序号已存在')
  })

  it('allows an existing chapter to keep its own order when edited', () => {
    const result = updateNovelIndexForChapter(
      [{ ...validNovel, updatedAt: '2026-01-01', chapterCount: 1, latestChapter: 'chapter-1' }],
      { ...validChapter, title: '第一章 新标题' },
      [validChapter],
      { novelSlug: 'paper-moon', slug: 'chapter-1' },
    )

    expect(result[0]?.chapterCount).toBe(1)
  })
})
