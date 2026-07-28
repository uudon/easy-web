import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PostCard } from '@/components/post-card'
import { SiteShell } from '@/components/site-shell'
import { contentRepository, isLocale, locales, type Locale } from '@/lib/content'
import { categoryLabel } from '@/lib/format'

type LocalePageProps = {
  params: Promise<{ locale: string }>
}

const copy = {
  'zh-cn': {
    eyebrow: 'SHIXING / PERSONAL NOTES',
    title: '把复杂的事，想清楚。',
    description: '记录 AI、编程、算法与项目实践，也记录技术之外缓慢形成的判断。',
    latest: '最近写下',
    all: '查看全部文章',
    catalog: '主题索引',
    note: '这里不是知识库的终点，而是我持续思考的现场。',
  },
  en: {
    eyebrow: 'SHIXING / PERSONAL NOTES',
    title: 'Think clearly about complicated things.',
    description: 'Notes on AI, software, algorithms, projects, and the judgment that forms between them.',
    latest: 'Latest notes',
    all: 'Read all writing',
    catalog: 'Topic index',
    note: 'Not a finished knowledge base, but a living record of thought.',
  },
} as const

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: LocalePageProps): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return {
    title: locale === 'zh-cn' ? '施行的个人日记' : "Shixing's Journal",
    alternates: {
      canonical: `/${locale}`,
      languages: { 'zh-CN': '/zh-cn', 'en-US': '/en' },
    },
  }
}

export default async function LocaleHome({ params }: LocalePageProps) {
  const { locale: localeValue } = await params
  if (!isLocale(localeValue)) notFound()
  const locale: Locale = localeValue
  const posts = contentRepository.getPosts(locale)
  const categories = contentRepository.getCategories(locale)
  const featured = posts[0]
  const recent = posts.slice(1, 7)
  const text = copy[locale]

  return (
    <SiteShell locale={locale}>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">{text.eyebrow}</p>
            <h1>{text.title}</h1>
            <p className="hero-description">{text.description}</p>
          </div>
          <div className="hero-aside">
            <span className="hero-index">01—{String(posts.length).padStart(2, '0')}</span>
            <p>{text.note}</p>
          </div>
        </section>

        {featured ? (
          <section className="featured-section" aria-labelledby="featured-title">
            <div className="section-heading">
              <p className="eyebrow">{text.latest}</p>
              <Link href={`/${locale}/blog`}>{text.all} →</Link>
            </div>
            <article className="featured-post">
              <div className="featured-symbol" aria-hidden="true">
                <span>新</span>
              </div>
              <div className="featured-content">
                <p className="post-meta">
                  <span>{categoryLabel(featured.category, locale)}</span>
                  <time dateTime={featured.date}>{featured.date}</time>
                </p>
                <h2 id="featured-title">
                  <Link href={`/${locale}/blog/${featured.slug}`}>{featured.title}</Link>
                </h2>
                <p>{featured.summary}</p>
              </div>
            </article>
          </section>
        ) : null}

        <section className="journal-grid" aria-label={text.latest}>
          {recent.map((post, index) => (
            <PostCard index={index} key={`${post.locale}-${post.slug}`} post={post} />
          ))}
        </section>

        <section className="topic-section">
          <div>
            <p className="eyebrow">{text.catalog}</p>
            <h2>{locale === 'zh-cn' ? '沿着问题，建立自己的坐标。' : 'Build a map by following questions.'}</h2>
          </div>
          <div className="topic-list">
            {categories.map((category, index) => (
              <Link
                href={`/${locale}/blog?category=${category.slug}`}
                key={category.slug}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{categoryLabel(category.slug, locale)}</strong>
                <em>{category.count}</em>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </SiteShell>
  )
}
