import { describe, expect, it } from 'vitest'

import { contentWriteSchema, toContentFile } from './content-write'

describe('content write validation', () => {
  it('accepts a complete route-safe article and serializes it', () => {
    const input = contentWriteSchema.parse({
      locale: 'zh-cn',
      slug: 'safe-article',
      title: '一篇安全的文章',
      summary: '摘要',
      category: 'ai',
      date: '2026-07-23',
      body: '# 正文\n\n内容',
    })

    const file = toContentFile(input)

    expect(file.path).toBe('content/posts/zh-cn/safe-article.md')
    expect(file.content).toContain('title: "一篇安全的文章"')
    expect(file.content).toContain('# 正文')
  })

  it('rejects path traversal, scripts and oversized fields', () => {
    expect(() =>
      contentWriteSchema.parse({
        locale: 'zh-cn',
        slug: '../secret',
        title: '<script>alert(1)</script>',
        summary: '',
        category: 'ai',
        date: '2026-07-23',
        body: 'text',
      }),
    ).toThrow()
  })

  it('rejects calendar dates that JavaScript would otherwise normalize', () => {
    expect(() =>
      contentWriteSchema.parse({
        locale: 'zh-cn',
        slug: 'invalid-date',
        title: '日期错误',
        summary: '',
        category: 'ai',
        date: '2026-02-30',
        body: 'text',
      }),
    ).toThrow()
  })
})
