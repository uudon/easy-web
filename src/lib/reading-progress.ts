export type ReadingProgress = {
  chapterSlug: string | null
  scrollY: number
}

export function readingProgressKey(novelSlug: string) {
  return `novel-reading-progress:${novelSlug}`
}

export function resolveReadingProgress(
  savedValue: string | null,
  availableChapters: readonly string[],
): ReadingProgress {
  const fallback: ReadingProgress = {
    chapterSlug: availableChapters[0] ?? null,
    scrollY: 0,
  }
  if (!savedValue || availableChapters.length === 0) return fallback

  try {
    const parsed = JSON.parse(savedValue) as Partial<ReadingProgress>
    if (
      typeof parsed.chapterSlug !== 'string' ||
      !availableChapters.includes(parsed.chapterSlug) ||
      typeof parsed.scrollY !== 'number' ||
      !Number.isFinite(parsed.scrollY) ||
      parsed.scrollY < 0
    ) {
      return fallback
    }
    return { chapterSlug: parsed.chapterSlug, scrollY: parsed.scrollY }
  } catch {
    return fallback
  }
}

type ReadingProgressStorage = Pick<Storage, 'getItem' | 'setItem'>

export function getReadingProgressStorage(
  resolveStorage: () => ReadingProgressStorage,
): ReadingProgressStorage | null {
  try {
    return resolveStorage()
  } catch {
    return null
  }
}

export function readReadingProgress(
  storage: ReadingProgressStorage | null,
  novelSlug: string,
  availableChapters: readonly string[],
) {
  if (!storage) return resolveReadingProgress(null, availableChapters)
  try {
    return resolveReadingProgress(
      storage.getItem(readingProgressKey(novelSlug)),
      availableChapters,
    )
  } catch {
    return resolveReadingProgress(null, availableChapters)
  }
}

export function writeReadingProgress(
  storage: ReadingProgressStorage | null,
  novelSlug: string,
  progress: ReadingProgress,
) {
  if (!storage) return false
  try {
    storage.setItem(readingProgressKey(novelSlug), JSON.stringify(progress))
    return true
  } catch {
    return false
  }
}
