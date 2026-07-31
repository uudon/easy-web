import { describe, expect, it } from 'vitest'

import { getMarkdownStats } from './markdown-stats'

describe('Markdown text statistics', () => {
  it('counts English words and Chinese characters as readable words', () => {
    expect(getMarkdownStats('# 标题\n\nHello world，内容。')).toEqual({
      wordCount: 6,
      characterCount: 16,
      readingTimeMinutes: 1,
    })
  })

  it('does not count Markdown syntax, link destinations or fenced code as prose', () => {
    expect(
      getMarkdownStats(
        '**Write** [clear docs](https://example.com/path) `const value = 1`\n\n```ts\nignored()\n```',
      ),
    ).toEqual({
      wordCount: 6,
      characterCount: 26,
      readingTimeMinutes: 1,
    })
  })

  it('returns zero reading time for empty or formatting-only content', () => {
    expect(getMarkdownStats(' \n\t')).toEqual({
      wordCount: 0,
      characterCount: 0,
      readingTimeMinutes: 0,
    })
  })

  it('rounds reading time up using 250 readable words per minute', () => {
    const markdown = Array.from({ length: 251 }, (_, index) => `word${index}`).join(' ')

    expect(getMarkdownStats(markdown).readingTimeMinutes).toBe(2)
    expect(getMarkdownStats(markdown).wordCount).toBe(251)
  })
})
