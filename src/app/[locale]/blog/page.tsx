import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PostCard } from '@/components/post-card'
import { SiteShell } from '@/components/site-shell'
import { contentRepository, isLocale, type Locale } from '@/lib/content'
import { categoryLabel } from '@/lib/format'

type BlogPageProps = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ category?: string }>
}

export async function generateMetadata({ params }: BlogPageProps): Promise<Metadata> {
  const { locale } = await params
  return {
    title: locale === 'en' ? 'Writing' : '全部文章',
    alternates: { canonical: `/${locale}/blog` },
  }
}

export default async function BlogPage({ params, searchParams }: BlogPageProps) {
  const [{ locale: localeValue }, { category }] = await Promise.all([params, searchParams])
  if (!isLocale(localeValue)) notFound()
  const locale: Locale = localeValue
  const allPosts = contentRepository.getPosts(locale)
  const categories = contentRepository.getCategories(locale)
  const posts = category ? allPosts.filter((post) => post.category === category) : allPosts

  return (
    <SiteShell locale={locale}>
      <main className="archive-page">
        <header className="archive-header">
          <p className="eyebrow">ARCHIVE / {String(allPosts.length).padStart(2, '0')}</p>
          <h1>{locale === 'zh-cn' ? '全部文章' : 'All writing'}</h1>
          <p>
            {locale === 'zh-cn'
              ? '从具体问题出发，把能复用的方法和仍未想明白的部分都留下来。'
              : 'Reusable methods, open questions, and notes grounded in real work.'}
          </p>
        </header>

        <nav className="filter-bar" aria-label={locale === 'zh-cn' ? '文章分类' : 'Post categories'}>
          <Link aria-current={!category ? 'page' : undefined} href={`/${locale}/blog`}>
            {locale === 'zh-cn' ? '全部' : 'All'} <span>{allPosts.length}</span>
          </Link>
          {categories.map((item) => (
            <Link
              aria-current={category === item.slug ? 'page' : undefined}
              href={`/${locale}/blog?category=${item.slug}`}
              key={item.slug}
            >
              {categoryLabel(item.slug, locale)} <span>{item.count}</span>
            </Link>
          ))}
        </nav>

        <section className="archive-list" aria-live="polite">
          {posts.length > 0 ? (
            posts.map((post, index) => (
              <PostCard index={index} key={`${post.locale}-${post.slug}`} post={post} />
            ))
          ) : (
            <p className="empty-state">
              {locale === 'zh-cn' ? '这个分类里还没有文章。' : 'No posts in this category yet.'}
            </p>
          )}
        </section>
      </main>
    </SiteShell>
  )
}
