import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PostCard } from '@/components/post-card'
import { SiteShell } from '@/components/site-shell'
import { contentRepository, isLocale, locales, type Locale } from '@/lib/content'
import { categoryLabel, formatDate } from '@/lib/format'
import { novelRepository } from '@/lib/novels'

type LocalePageProps = {
  params: Promise<{ locale: string }>
}

const copy = {
  'zh-cn': {
    eyebrow: 'SHIXING / PERSONAL NOTES',
    issue: 'Vol. 01',
    titleLines: ['“所谓无底深渊，', '下去，也是前程万里。”'],
    description: '我在这里记录 AI、编程、算法和项目推进里的真实取舍。写怎么做，也写为什么这样做。',
    primaryAction: '进入文章',
    secondaryAction: '浏览主题',
    latest: '最近写下',
    all: '查看全部文章',
    featuredLabel: '本期文章',
    featuredDeck: '从最近一次写作里，挑出最值得先读的一篇。',
    featuredCta: '继续阅读',
    catalog: '主题索引',
    note: '这里不追热点总结，更重视做事过程、技术判断和长期能复用的方法。',
    noteLabel: 'Editor’s note',
    recentTitle: '最近更新',
    topicsTitle: '重点主题',
  },
  en: {
    eyebrow: 'SHIXING / PERSONAL NOTES',
    issue: 'Vol. 01',
    titleLines: ['Write technology, problems,', 'and judgment with clarity.'],
    description: 'I write about real tradeoffs in AI, software, algorithms, and project delivery: how to do the work, and why the choice matters.',
    primaryAction: 'Enter the journal',
    secondaryAction: 'Browse topics',
    latest: 'Latest notes',
    all: 'Read all writing',
    featuredLabel: 'Feature story',
    featuredDeck: 'A highlighted piece from the latest round of writing.',
    featuredCta: 'Continue reading',
    catalog: 'Topic index',
    note: 'Less interested in trend summaries, more interested in process, judgment, and reusable methods.',
    noteLabel: 'Editor’s note',
    recentTitle: 'Recent updates',
    topicsTitle: 'Core topics',
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
  const heroPosts = posts.slice(0, 3)
  const heroTopics = categories.slice(0, 3)
  const recent = posts.slice(1, 7)
  const text = copy[locale]
  const latestNovel = locale === 'zh-cn' ? novelRepository.getNovels()[0] : null

  return (
    <SiteShell locale={locale}>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-headline-meta">
              <p className="eyebrow">{text.eyebrow}</p>
              <span className="hero-issue">{text.issue}</span>
            </div>
            <h1>
              {text.titleLines.map((line) => (
                <span className="hero-title-line" key={line}>
                  {line}
                </span>
              ))}
            </h1>
            <p className="hero-description">{text.description}</p>
            <div className="hero-actions">
              <Link className="hero-action hero-action--primary" href={`/${locale}/blog`}>
                {text.primaryAction} <span aria-hidden="true">↗</span>
              </Link>
              <Link className="hero-action" href="#topic-index">
                {text.secondaryAction} <span aria-hidden="true">↓</span>
              </Link>
            </div>
          </div>
          <div className="hero-aside">
            <div className="hero-note">
              <span className="hero-note-label">{text.noteLabel}</span>
              <span className="hero-index">01—{String(posts.length).padStart(2, '0')}</span>
              <p>{text.note}</p>
            </div>
            <div className="hero-panel">
              <div className="hero-panel-section">
                <p className="hero-panel-title">{text.recentTitle}</p>
                <div className="hero-recent-list">
                  {heroPosts.map((post) => (
                    <Link
                      className="hero-recent-item"
                      href={`/${locale}/blog/${post.slug}`}
                      key={`${post.locale}-${post.slug}`}
                    >
                      <span>{categoryLabel(post.category, locale)}</span>
                      <strong>{post.title}</strong>
                      <time dateTime={post.date}>{formatDate(post.date, locale)}</time>
                    </Link>
                  ))}
                </div>
              </div>
              <div className="hero-panel-section">
                <p className="hero-panel-title">{text.topicsTitle}</p>
                <div className="hero-topic-list">
                  {heroTopics.map((category) => (
                    <Link
                      className="hero-topic-pill"
                      href={`/${locale}/blog?category=${category.slug}`}
                      key={category.slug}
                    >
                      <span>{categoryLabel(category.slug, locale)}</span>
                      <em>{category.count}</em>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {featured ? (
          <section className="featured-section" aria-labelledby="featured-title">
            <div className="section-heading">
              <p className="eyebrow">{text.latest}</p>
              <Link href={`/${locale}/blog`}>{text.all} →</Link>
            </div>
            <article className="featured-post">
              <div className="featured-rail">
                <div className="featured-symbol" aria-hidden="true">
                  <span>{locale === 'zh-cn' ? '新' : 'F'}</span>
                </div>
                <div className="featured-rail-copy">
                  <p className="featured-rail-label">{text.featuredLabel}</p>
                  <p>{text.featuredDeck}</p>
                </div>
              </div>
              <div className="featured-content">
                <p className="post-meta">
                  <span>{categoryLabel(featured.category, locale)}</span>
                  <time dateTime={featured.date}>{formatDate(featured.date, locale)}</time>
                </p>
                <h2 id="featured-title">
                  <Link href={`/${locale}/blog/${featured.slug}`}>{featured.title}</Link>
                </h2>
                <p>{featured.summary}</p>
                <div className="featured-footer">
                  <Link className="featured-link" href={`/${locale}/blog/${featured.slug}`}>
                    {text.featuredCta} →
                  </Link>
                </div>
              </div>
            </article>
          </section>
        ) : null}

        <section className="journal-grid" aria-label={text.latest}>
          {recent.map((post, index) => (
            <PostCard index={index} key={`${post.locale}-${post.slug}`} post={post} />
          ))}
        </section>

        {locale === 'zh-cn' ? (
          <section className="home-novel-section" aria-labelledby="home-novel-title">
            <div>
              <p className="eyebrow">SERIAL FICTION</p>
              <h2 id="home-novel-title">
                {latestNovel ? latestNovel.title : '故事，留一处慢慢写。'}
              </h2>
            </div>
            <div>
              <p>
                {latestNovel
                  ? latestNovel.summary
                  : '连载小说拥有独立的书架与章节目录，不与文章混在一起。'}
              </p>
              <Link href={latestNovel ? `/zh-cn/novels/${latestNovel.slug}` : '/zh-cn/novels'}>
                {latestNovel ? '继续读这部小说' : '前往小说书架'} →
              </Link>
            </div>
          </section>
        ) : null}

        <section className="topic-section" id="topic-index">
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
