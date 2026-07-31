'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import {
  getReadingProgressStorage,
  readReadingProgress,
  writeReadingProgress,
} from '@/lib/reading-progress'

type ContinueReadingProps = {
  novelSlug: string
  chapterSlugs: string[]
}

export function ContinueReading({ novelSlug, chapterSlugs }: ContinueReadingProps) {
  const firstChapter = chapterSlugs[0] ?? null
  const [chapterSlug, setChapterSlug] = useState<string | null>(firstChapter)

  useEffect(() => {
    const storage = getReadingProgressStorage(() => window.localStorage)
    const progress = readReadingProgress(
      storage,
      novelSlug,
      chapterSlugs,
    )
    setChapterSlug(progress.chapterSlug)
  }, [chapterSlugs, novelSlug])

  if (!chapterSlug) {
    return <span className="continue-reading is-disabled">尚未发布章节</span>
  }

  return (
    <Link className="continue-reading" href={`/zh-cn/novels/${novelSlug}/${chapterSlug}`}>
      继续阅读
      <span aria-hidden="true"> →</span>
    </Link>
  )
}

type ReadingProgressTrackerProps = {
  novelSlug: string
  chapterSlug: string
  chapterSlugs: string[]
}

export function ReadingProgressTracker({
  novelSlug,
  chapterSlug,
  chapterSlugs,
}: ReadingProgressTrackerProps) {
  useEffect(() => {
    const storage = getReadingProgressStorage(() => window.localStorage)
    const savedProgress = readReadingProgress(
      storage,
      novelSlug,
      chapterSlugs,
    )

    if (savedProgress.chapterSlug === chapterSlug && savedProgress.scrollY > 0) {
      window.requestAnimationFrame(() => window.scrollTo({ top: savedProgress.scrollY }))
    }

    let frameId: number | null = null
    const saveProgress = () => {
      writeReadingProgress(
        storage,
        novelSlug,
        { chapterSlug, scrollY: Math.max(0, window.scrollY) },
      )
    }
    const handleScroll = () => {
      if (frameId !== null) return
      frameId = window.requestAnimationFrame(() => {
        saveProgress()
        frameId = null
      })
    }

    saveProgress()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('pagehide', saveProgress)
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      saveProgress()
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('pagehide', saveProgress)
    }
  }, [chapterSlug, chapterSlugs, novelSlug])

  return null
}
