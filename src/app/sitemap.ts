import type { MetadataRoute } from 'next'

import { contentRepository, locales } from '@/lib/content'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tangyingbao.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const localeRoutes = locales.flatMap((locale) => [
    { url: `${siteUrl}/${locale}`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 1 },
    { url: `${siteUrl}/${locale}/blog`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.9 },
  ])
  const postRoutes = contentRepository.getPosts().map((post) => ({
    url: `${siteUrl}/${post.locale}/blog/${post.slug}`,
    lastModified: new Date(`${post.date}T00:00:00.000Z`),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))
  const pageRoutes = contentRepository.getPages().map((page) => ({
    url: `${siteUrl}${page.originalPath}`,
    lastModified: new Date(`${page.date}T00:00:00.000Z`),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  return [...localeRoutes, ...postRoutes, ...pageRoutes]
}
