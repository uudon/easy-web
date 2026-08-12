import type { MetadataRoute } from 'next'

import { contentRepository, locales } from '@/lib/content'
import { novelRepository } from '@/lib/novels'

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
  const novels = novelRepository.getNovels()
  const novelRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/zh-cn/novels`,
      lastModified: novels[0]
        ? new Date(`${novels[0].updatedAt}T00:00:00.000Z`)
        : new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...novels.flatMap((novel) => [
      {
        url: `${siteUrl}/zh-cn/novels/${novel.slug}`,
        lastModified: new Date(`${novel.updatedAt}T00:00:00.000Z`),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      },
      ...(novelRepository.getDescription(novel.slug)
        ? [{
            url: `${siteUrl}/zh-cn/novels/${novel.slug}/description`,
            lastModified: new Date(`${novel.updatedAt}T00:00:00.000Z`),
            changeFrequency: 'monthly' as const,
            priority: 0.7,
          }]
        : []),
      ...novelRepository.getChapters(novel.slug).map((chapter) => ({
        url: `${siteUrl}/zh-cn/novels/${novel.slug}/${chapter.slug}`,
        lastModified: new Date(`${chapter.updatedAt ?? chapter.publishDate}T00:00:00.000Z`),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      })),
    ]),
  ]

  return [...localeRoutes, ...postRoutes, ...pageRoutes, ...novelRoutes]
}
