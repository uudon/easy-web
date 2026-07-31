import { describe, expect, it } from 'vitest'

import {
  getReadingProgressStorage,
  readReadingProgress,
  resolveReadingProgress,
  writeReadingProgress,
} from './reading-progress'

const availableChapters = ['chapter-1', 'chapter-2', 'chapter-3']

describe('resolveReadingProgress', () => {
  it('restores a valid saved chapter and scroll position', () => {
    expect(
      resolveReadingProgress(
        JSON.stringify({ chapterSlug: 'chapter-2', scrollY: 640 }),
        availableChapters,
      ),
    ).toEqual({
      chapterSlug: 'chapter-2',
      scrollY: 640,
    })
  })

  it('falls back to the first chapter when saved progress is missing', () => {
    expect(resolveReadingProgress(null, availableChapters)).toEqual({
      chapterSlug: 'chapter-1',
      scrollY: 0,
    })
  })

  it('falls back to the first chapter when saved JSON is damaged', () => {
    expect(resolveReadingProgress('{not-json', availableChapters)).toEqual({
      chapterSlug: 'chapter-1',
      scrollY: 0,
    })
  })

  it('falls back when the saved chapter has been removed', () => {
    expect(
      resolveReadingProgress(
        JSON.stringify({ chapterSlug: 'deleted-chapter', scrollY: 900 }),
        availableChapters,
      ),
    ).toEqual({
      chapterSlug: 'chapter-1',
      scrollY: 0,
    })
  })

  it('ignores malformed progress fields instead of exposing an unsafe position', () => {
    expect(
      resolveReadingProgress(
        JSON.stringify({ chapterSlug: 'chapter-2', scrollY: -100 }),
        availableChapters,
      ),
    ).toEqual({
      chapterSlug: 'chapter-1',
      scrollY: 0,
    })
  })

  it('returns an empty state when the novel has no chapters', () => {
    expect(resolveReadingProgress(null, [])).toEqual({
      chapterSlug: null,
      scrollY: 0,
    })
  })

  it('falls back safely when browser storage is unavailable', () => {
    const unavailableStorage = {
      getItem() {
        throw new Error('Storage disabled')
      },
      setItem() {
        throw new Error('Storage disabled')
      },
    }

    expect(
      readReadingProgress(unavailableStorage, 'paper-moon', availableChapters),
    ).toEqual({ chapterSlug: 'chapter-1', scrollY: 0 })
    expect(
      writeReadingProgress(unavailableStorage, 'paper-moon', {
        chapterSlug: 'chapter-1',
        scrollY: 100,
      }),
    ).toBe(false)
  })

  it('falls back when the browser blocks access to localStorage itself', () => {
    expect(
      getReadingProgressStorage(() => {
        throw new DOMException('Access denied', 'SecurityError')
      }),
    ).toBeNull()
    expect(readReadingProgress(null, 'paper-moon', availableChapters)).toEqual({
      chapterSlug: 'chapter-1',
      scrollY: 0,
    })
  })
})
