import type { Draft } from './admin-drafts'
import type { Locale, PostSummary } from './content'

export type AdminPost = {
  id?: string
  title: string
  slug: string
  locale: Locale
  category: string
  status: 'published' | 'draft'
  publishDate: string
  updatedAt: string
  translationKey?: string
  draftId?: string
}

export type AdminPostFilters = {
  search?: string
  locale?: Locale | 'all'
  category?: string | 'all'
  status?: AdminPost['status'] | 'all'
  sort?: 'updatedAt' | 'publishDate' | 'title'
}

export function filterAndSortPosts(
  posts: readonly AdminPost[],
  filters: AdminPostFilters,
): AdminPost[] {
  const search = filters.search?.trim().toLocaleLowerCase()
  const filtered = posts.filter(
    (post) =>
      (!search ||
        post.title.toLocaleLowerCase().includes(search) ||
        post.slug.toLocaleLowerCase().includes(search)) &&
      (!filters.locale || filters.locale === 'all' || post.locale === filters.locale) &&
      (!filters.category ||
        filters.category === 'all' ||
        post.category === filters.category) &&
      (!filters.status || filters.status === 'all' || post.status === filters.status),
  )
  const sort = filters.sort ?? 'updatedAt'
  return [...filtered].sort((left, right) => {
    if (sort === 'title') {
      return left.title.localeCompare(right.title, 'en')
    }
    return (
      right[sort].localeCompare(left[sort]) ||
      left.title.localeCompare(right.title, 'en')
    )
  })
}

export function mergeAdminPosts(
  published: readonly PostSummary[],
  drafts: readonly Draft[],
): AdminPost[] {
  const publishedPosts = published.map((post) => ({
    title: post.title,
    slug: post.slug,
    locale: post.locale,
    category: post.category,
    status: 'published' as const,
    publishDate: post.date,
    updatedAt: post.updatedAt ?? `${post.date}T00:00:00.000Z`,
    ...(post.translationKey ? { translationKey: post.translationKey } : {}),
  }))
  const draftPosts = drafts.map((draft) => ({
    title: draft.title,
    slug: draft.slug,
    locale: draft.locale,
    category: draft.category,
    status: 'draft' as const,
    publishDate: draft.publishDate,
    updatedAt: draft.updatedAt,
    ...(draft.translationKey ? { translationKey: draft.translationKey } : {}),
    draftId: draft.id,
    id: draft.id,
  }))
  return [...publishedPosts, ...draftPosts]
}
