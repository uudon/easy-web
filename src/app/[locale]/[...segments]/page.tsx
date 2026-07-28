import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Markdown } from '@/components/markdown'
import { SiteShell } from '@/components/site-shell'
import { contentRepository, isLocale, locales, type Locale } from '@/lib/content'

type ContentPageProps = {
  params: Promise<{ locale: string; segments: string[] }>
}

export function generateStaticParams() {
  return locales.flatMap((locale) =>
    contentRepository
      .getPages(locale)
      .filter((page) => page.pagePath)
      .map((page) => ({
        locale,
        segments: page.pagePath.split('/'),
      })),
  )
}

export async function generateMetadata({ params }: ContentPageProps): Promise<Metadata> {
  const { locale, segments } = await params
  if (!isLocale(locale)) return {}
  const page = contentRepository.getPage(locale, segments)
  if (!page) return {}
  return {
    title: page.title,
    description: page.summary,
    alternates: { canonical: page.originalPath },
  }
}

export default async function ContentPageRoute({ params }: ContentPageProps) {
  const { locale: localeValue, segments } = await params
  if (!isLocale(localeValue)) notFound()
  const locale: Locale = localeValue
  const page = contentRepository.getPage(locale, segments)
  if (!page) notFound()

  return (
    <SiteShell locale={locale}>
      <main className="article-page page-document">
        <article>
          <header className="article-header">
            <p className="eyebrow">PAGE / {locale.toUpperCase()}</p>
            <h1>{page.title}</h1>
            {page.summary ? <p>{page.summary}</p> : null}
          </header>
          <Markdown>{page.body}</Markdown>
        </article>
      </main>
    </SiteShell>
  )
}
