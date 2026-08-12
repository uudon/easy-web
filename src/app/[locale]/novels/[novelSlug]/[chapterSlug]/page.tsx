import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Markdown } from '@/components/markdown'
import { ReadingProgressTracker } from '@/components/novel-reading-progress'
import { SiteShell } from '@/components/site-shell'
import { formatDate } from '@/lib/format'
import { novelRepository } from '@/lib/novels'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tangyingbao.com'

type ChapterPageProps = {
  params: Promise<{ locale: string; novelSlug: string; chapterSlug: string }>
}

export function generateStaticParams() {
  return novelRepository.getNovels().flatMap((novel) =>
    novelRepository.getChapters(novel.slug).map((chapter) => ({
      locale: 'zh-cn',
      novelSlug: novel.slug,
      chapterSlug: chapter.slug,
    })),
  )
}

export async function generateMetadata({ params }: ChapterPageProps): Promise<Metadata> {
  const { locale, novelSlug, chapterSlug } = await params
  if (locale !== 'zh-cn') return {}
  const novel = novelRepository.getNovel(novelSlug)
  const chapter = novelRepository.getChapter(novelSlug, chapterSlug)
  if (!novel || !chapter) return {}
  const description = `阅读《${novel.title}》${chapter.title}。`
  return {
    title: `${chapter.title} · ${novel.title}`,
    description,
    alternates: { canonical: `/zh-cn/novels/${novel.slug}/${chapter.slug}` },
    openGraph: {
      type: 'article',
      title: `${chapter.title} · ${novel.title}`,
      description,
      publishedTime: chapter.publishDate,
      modifiedTime: chapter.updatedAt ?? chapter.publishDate,
      locale: 'zh_CN',
      images: novel.cover ? [{ url: novel.cover, alt: `《${novel.title}》封面` }] : undefined,
    },
  }
}

export default async function ChapterPage({ params }: ChapterPageProps) {
  const { locale, novelSlug, chapterSlug } = await params
  if (locale !== 'zh-cn') notFound()
  const novel = novelRepository.getNovel(novelSlug)
  const chapter = novelRepository.getChapter(novelSlug, chapterSlug)
  if (!novel || !chapter) notFound()
  const chapters = novelRepository.getChapters(novelSlug)
  const adjacent = novelRepository.getAdjacentChapters(novelSlug, chapterSlug)
  const hasDescription = Boolean(novelRepository.getDescription(novelSlug))
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Chapter',
    name: chapter.title,
    position: chapter.order,
    datePublished: chapter.publishDate,
    dateModified: chapter.updatedAt ?? chapter.publishDate,
    inLanguage: 'zh-CN',
    isPartOf: {
      '@type': 'Book',
      name: novel.title,
      url: `${siteUrl}/zh-cn/novels/${novel.slug}`,
    },
    url: `${siteUrl}/zh-cn/novels/${novel.slug}/${chapter.slug}`,
  }

  return (
    <SiteShell locale="zh-cn">
      <main className="novel-reader-page">
        <ReadingProgressTracker
          chapterSlug={chapter.slug}
          chapterSlugs={chapters.map((item) => item.slug)}
          novelSlug={novel.slug}
        />
        <nav aria-label="章节位置" className="reader-breadcrumb">
          <Link href="/zh-cn/novels">小说</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/zh-cn/novels/${novel.slug}`}>{novel.title}</Link>
        </nav>
        <article>
          <header className="novel-chapter-header">
            {chapter.volume ? <p>{chapter.volume}</p> : null}
            <span>第 {chapter.order} 章</span>
            <h1>{chapter.title}</h1>
            <time dateTime={chapter.publishDate}>{formatDate(chapter.publishDate, 'zh-cn')}</time>
          </header>
          <div className="novel-prose">
            <Markdown>{chapter.body}</Markdown>
          </div>
        </article>
        <nav aria-label="章节导航" className="chapter-navigation">
          {adjacent.previous ? (
            <Link href={`/zh-cn/novels/${novel.slug}/${adjacent.previous.slug}`}>
              <span>← 上一章</span>
              <strong>{adjacent.previous.title}</strong>
            </Link>
          ) : chapter.order === 1 && hasDescription ? (
            <Link href={`/zh-cn/novels/${novel.slug}/description`}>
              <span>← 上一章</span>
              <strong>简介</strong>
            </Link>
          ) : <span />}
          <Link className="chapter-directory-link" href={`/zh-cn/novels/${novel.slug}`}>
            章节目录
          </Link>
          {adjacent.next ? (
            <Link href={`/zh-cn/novels/${novel.slug}/${adjacent.next.slug}`}>
              <span>下一章 →</span>
              <strong>{adjacent.next.title}</strong>
            </Link>
          ) : <span />}
        </nav>
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll('<', '\\u003c') }}
          type="application/ld+json"
        />
      </main>
    </SiteShell>
  )
}
