import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ContinueReading } from '@/components/novel-reading-progress'
import { SiteShell } from '@/components/site-shell'
import { formatDate } from '@/lib/format'
import { novelRepository } from '@/lib/novels'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tangyingbao.com'

type NovelPageProps = {
  params: Promise<{ locale: string; novelSlug: string }>
}

export function generateStaticParams() {
  return novelRepository.getNovels().map((novel) => ({
    locale: 'zh-cn',
    novelSlug: novel.slug,
  }))
}

export async function generateMetadata({ params }: NovelPageProps): Promise<Metadata> {
  const { locale, novelSlug } = await params
  if (locale !== 'zh-cn') return {}
  const novel = novelRepository.getNovel(novelSlug)
  if (!novel) return {}
  return {
    title: novel.title,
    description: novel.summary,
    alternates: { canonical: `/zh-cn/novels/${novel.slug}` },
    openGraph: {
      type: 'website',
      title: novel.title,
      description: novel.summary,
      locale: 'zh_CN',
      images: novel.cover ? [{ url: novel.cover, alt: `《${novel.title}》封面` }] : undefined,
    },
  }
}

export default async function NovelPage({ params }: NovelPageProps) {
  const { locale, novelSlug } = await params
  if (locale !== 'zh-cn') notFound()
  const novel = novelRepository.getNovel(novelSlug)
  if (!novel) notFound()
  const chapters = novelRepository.getChapters(novelSlug)
  const description = novelRepository.getDescription(novelSlug)
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: novel.title,
    description: novel.summary,
    genre: novel.genre,
    datePublished: novel.startDate,
    dateModified: novel.updatedAt,
    inLanguage: 'zh-CN',
    url: `${siteUrl}/zh-cn/novels/${novel.slug}`,
    image: novel.cover || undefined,
  }

  return (
    <SiteShell locale="zh-cn">
      <main className="novel-detail-page">
        <Link className="back-link" href="/zh-cn/novels">← 返回小说书架</Link>
        <article>
          <header className="novel-detail-header">
            <div className="novel-detail-cover">
              {novel.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={`《${novel.title}》封面`} src={novel.cover} />
              ) : (
                <span>{novel.title}</span>
              )}
            </div>
            <div className="novel-detail-copy">
              <p className="novel-meta">
                <span>{novel.genre}</span>
                <span>{novel.status}</span>
              </p>
              <h1>{novel.title}</h1>
              <p>{novel.summary}</p>
              <div className="novel-detail-actions">
                <ContinueReading
                  chapterSlugs={chapters.map((chapter) => chapter.slug)}
                  novelSlug={novel.slug}
                />
                <span>更新于 {formatDate(novel.updatedAt, 'zh-cn')}</span>
              </div>
            </div>
          </header>

          <section aria-labelledby="chapter-directory-title" className="chapter-directory">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  CONTENTS / {String(chapters.length + (description ? 1 : 0)).padStart(2, '0')}
                </p>
                <h2 id="chapter-directory-title">章节目录</h2>
              </div>
            </div>
            {description || chapters.length > 0 ? (
              <ol>
                {description ? (
                  <li>
                    <Link href={`/zh-cn/novels/${novel.slug}/description`}>
                      <span>00</span>
                      <strong>简介</strong>
                      <small>作品简介</small>
                      <time aria-hidden="true">—</time>
                    </Link>
                  </li>
                ) : null}
                {chapters.map((chapter) => (
                  <li key={chapter.slug}>
                    <Link href={`/zh-cn/novels/${novel.slug}/${chapter.slug}`}>
                      <span>{String(chapter.order).padStart(2, '0')}</span>
                      <strong>{chapter.title}</strong>
                      <small>{chapter.volume ?? ''}</small>
                      <time dateTime={chapter.publishDate}>
                        {formatDate(chapter.publishDate, 'zh-cn')}
                      </time>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-state">这部小说还没有发布章节。</p>
            )}
          </section>
        </article>
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll('<', '\\u003c') }}
          type="application/ld+json"
        />
      </main>
    </SiteShell>
  )
}
