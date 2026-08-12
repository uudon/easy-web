import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Markdown } from '@/components/markdown'
import { SiteShell } from '@/components/site-shell'
import { novelRepository } from '@/lib/novels'

type DescriptionPageProps = {
  params: Promise<{ locale: string; novelSlug: string }>
}

export function generateStaticParams() {
  return novelRepository
    .getNovels()
    .filter((novel) => novelRepository.getDescription(novel.slug))
    .map((novel) => ({ locale: 'zh-cn', novelSlug: novel.slug }))
}

export async function generateMetadata({ params }: DescriptionPageProps): Promise<Metadata> {
  const { locale, novelSlug } = await params
  if (locale !== 'zh-cn') return {}
  const novel = novelRepository.getNovel(novelSlug)
  const description = novelRepository.getDescription(novelSlug)
  if (!novel || !description) return {}
  return {
    title: `简介 · ${novel.title}`,
    description: novel.summary,
    alternates: { canonical: `/zh-cn/novels/${novel.slug}/description` },
    openGraph: {
      type: 'article',
      title: `简介 · ${novel.title}`,
      description: novel.summary,
      locale: 'zh_CN',
      images: novel.cover ? [{ url: novel.cover, alt: `《${novel.title}》封面` }] : undefined,
    },
  }
}

export default async function DescriptionPage({ params }: DescriptionPageProps) {
  const { locale, novelSlug } = await params
  if (locale !== 'zh-cn') notFound()
  const novel = novelRepository.getNovel(novelSlug)
  const description = novelRepository.getDescription(novelSlug)
  if (!novel || !description) notFound()
  const firstChapter = novelRepository.getChapters(novelSlug)[0] ?? null

  return (
    <SiteShell locale="zh-cn">
      <main className="novel-reader-page">
        <nav aria-label="章节位置" className="reader-breadcrumb">
          <Link href="/zh-cn/novels">小说</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/zh-cn/novels/${novel.slug}`}>{novel.title}</Link>
        </nav>
        <article>
          <header className="novel-chapter-header">
            <p>作品简介</p>
            <span>00</span>
            <h1>简介</h1>
          </header>
          <div className="novel-prose">
            <Markdown>{description}</Markdown>
          </div>
        </article>
        <nav aria-label="章节导航" className="chapter-navigation">
          <span />
          <Link className="chapter-directory-link" href={`/zh-cn/novels/${novel.slug}`}>
            章节目录
          </Link>
          {firstChapter ? (
            <Link href={`/zh-cn/novels/${novel.slug}/${firstChapter.slug}`}>
              <span>下一章 →</span>
              <strong>{firstChapter.title}</strong>
            </Link>
          ) : <span />}
        </nav>
      </main>
    </SiteShell>
  )
}
