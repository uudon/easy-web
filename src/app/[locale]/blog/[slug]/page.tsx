import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Markdown } from '@/components/markdown'
import { SiteShell } from '@/components/site-shell'
import { contentRepository, isLocale, locales, type Locale } from '@/lib/content'
import { categoryLabel, formatDate } from '@/lib/format'

type PostPageProps = {
  params: Promise<{ locale: string; slug: string }>
}

export function generateStaticParams() {
  return locales.flatMap((locale) =>
    contentRepository.getPosts(locale).map((post) => ({ locale, slug: post.slug })),
  )
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const post = contentRepository.getPost(locale, slug)
  if (!post) return {}
  return {
    title: post.title,
    description: post.summary,
    alternates: { canonical: `/${locale}/blog/${slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.summary,
      publishedTime: post.date,
      locale: locale === 'zh-cn' ? 'zh_CN' : 'en_US',
    },
  }
}

export default async function PostPage({ params }: PostPageProps) {
  const { locale: localeValue, slug } = await params
  if (!isLocale(localeValue)) notFound()
  const locale: Locale = localeValue
  const post = contentRepository.getPost(locale, slug)
  if (!post) notFound()

  return (
    <SiteShell locale={locale}>
      <main className="article-page">
        <Link className="back-link" href={`/${locale}/blog`}>
          ← {locale === 'zh-cn' ? '返回全部文章' : 'Back to writing'}
        </Link>
        <article>
          <header className="article-header">
            <div className="post-meta">
              <span>{categoryLabel(post.category, locale)}</span>
              <time dateTime={post.date}>{formatDate(post.date, locale)}</time>
            </div>
            <h1>{post.title}</h1>
            {post.summary ? <p>{post.summary}</p> : null}
          </header>
          <Markdown>{post.body}</Markdown>
        </article>
      </main>
    </SiteShell>
  )
}
