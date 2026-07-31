import { describe, expect, it } from 'vitest'

import { filterAndSortPosts, type AdminPost } from './admin-posts'

const posts: AdminPost[] = [
  {
    title: 'Building an AI workflow',
    slug: 'build-ai-workflow',
    locale: 'en',
    category: 'ai',
    status: 'published',
    publishDate: '2026-05-10',
    updatedAt: '2026-07-28T10:00:00.000Z',
  },
  {
    title: '项目范围管理',
    slug: 'project-scope-management',
    locale: 'zh-cn',
    category: 'project-management',
    status: 'published',
    publishDate: '2026-07-20',
    updatedAt: '2026-07-20T12:00:00.000Z',
  },
  {
    title: 'AI 写作草稿',
    slug: 'ai-writing-draft',
    locale: 'zh-cn',
    category: 'ai',
    status: 'draft',
    publishDate: '2026-08-01',
    updatedAt: '2026-07-30T02:00:00.000Z',
  },
  {
    title: 'Architecture Notes',
    slug: 'architecture-notes',
    locale: 'en',
    category: 'architecture',
    status: 'draft',
    publishDate: '2026-06-15',
    updatedAt: '2026-07-25T08:00:00.000Z',
  },
]

describe('admin post search, filters and sorting', () => {
  it('searches title and slug case-insensitively', () => {
    expect(
      filterAndSortPosts(posts, { search: 'AI', sort: 'updatedAt' }).map((post) => post.slug),
    ).toEqual(['ai-writing-draft', 'build-ai-workflow'])

    expect(
      filterAndSortPosts(posts, { search: 'SCOPE', sort: 'updatedAt' }).map(
        (post) => post.slug,
      ),
    ).toEqual(['project-scope-management'])
  })

  it('combines locale, category and publication status filters', () => {
    expect(
      filterAndSortPosts(posts, {
        locale: 'zh-cn',
        category: 'ai',
        status: 'draft',
        sort: 'updatedAt',
      }).map((post) => post.slug),
    ).toEqual(['ai-writing-draft'])
  })

  it('treats omitted and all filters as unfiltered', () => {
    expect(
      filterAndSortPosts(posts, {
        locale: 'all',
        category: 'all',
        status: 'all',
        sort: 'updatedAt',
      }),
    ).toHaveLength(posts.length)
  })

  it('sorts by update time descending by default', () => {
    expect(filterAndSortPosts(posts, {}).map((post) => post.slug)).toEqual([
      'ai-writing-draft',
      'build-ai-workflow',
      'architecture-notes',
      'project-scope-management',
    ])
  })

  it('sorts by publish date descending and title ascending', () => {
    expect(
      filterAndSortPosts(posts, { sort: 'publishDate' }).map((post) => post.slug),
    ).toEqual([
      'ai-writing-draft',
      'project-scope-management',
      'architecture-notes',
      'build-ai-workflow',
    ])

    expect(filterAndSortPosts(posts, { sort: 'title' }).map((post) => post.title)).toEqual([
      'AI 写作草稿',
      'Architecture Notes',
      'Building an AI workflow',
      '项目范围管理',
    ])
  })

  it('does not mutate the caller-owned post collection', () => {
    const originalOrder = posts.map((post) => post.slug)
    const frozenPosts = Object.freeze(posts.map((post) => Object.freeze({ ...post })))

    filterAndSortPosts(frozenPosts, { sort: 'title' })

    expect(posts.map((post) => post.slug)).toEqual(originalOrder)
  })
})
