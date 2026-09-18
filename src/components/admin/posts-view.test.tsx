import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AdminPostsView } from './posts-view'
import type { Draft } from '@/lib/admin-drafts'
import type { PostSummary } from '@/lib/content'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

const posts: PostSummary[] = [
  {
    title: 'Building an AI workflow',
    summary: 'A published article.',
    date: '2026-05-10',
    locale: 'en',
    category: 'ai',
    slug: 'build-ai-workflow',
    originalPath: '/en/blog/build-ai-workflow',
    updatedAt: '2026-07-28T10:00:00.000Z',
  },
]

const drafts: Draft[] = [
  {
    id: 'draft_01K1ED2M5PCQ5SW8FQH6C01Z1K',
    source: null,
    locale: 'zh-cn',
    slug: 'draft-post',
    title: 'Draft post',
    summary: 'A draft.',
    category: 'thinking',
    publishDate: '2026-07-30',
    body: '# Draft',
    assets: [],
    status: 'draft',
    revision: 'revision-1',
    updatedAt: '2026-07-30T08:00:00.000Z',
  },
]

describe('AdminPostsView row actions', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    push.mockReset()
    vi.restoreAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: { sha: 'abcdef1234567890' } }), { status: 200 })),
    )
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('copies a published post link to the clipboard', async () => {
    render(
      <AdminPostsView csrfToken="csrf-token" drafts={drafts} posts={posts} writesEnabled />,
    )

    fireEvent.click(screen.getByRole('button', { name: '复制 Building an AI workflow 的公开链接' }))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'http://localhost:3000/en/blog/build-ai-workflow',
      )
    })
    expect(screen.getByText('公开链接已复制。')).toBeInTheDocument()
  })

  it('deletes a published post and removes it from the table', async () => {
    render(
      <AdminPostsView csrfToken="csrf-token" drafts={drafts} posts={posts} writesEnabled />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: '删除 Building an AI workflow' })[0])

    const dialog = screen.getByRole('dialog', { name: '确认删除文章' })
    fireEvent.change(screen.getByLabelText('输入文章标题以确认'), {
      target: { value: posts[0].title },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '永久删除' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/admin/posts/en/build-ai-workflow', {
        method: 'DELETE',
        headers: { 'x-csrf-token': 'csrf-token' },
      })
    })
    await waitFor(() => {
      expect(screen.queryByText('Building an AI workflow')).not.toBeInTheDocument()
    })
    expect(screen.getByText('文章已删除 · abcdef12。')).toBeInTheDocument()
  })

  it('loads the latest draft revision before deleting a stale list item', async () => {
    const latest = { ...drafts[0], revision: 'revision-2' }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify({ data: latest }), { status: 200 })
      }
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AdminPostsView csrfToken="csrf-token" drafts={drafts} posts={posts} writesEnabled />,
    )

    fireEvent.click(screen.getByRole('button', { name: '删除 Draft post' }))

    const dialog = await screen.findByRole('dialog', { name: '确认删除草稿' })
    fireEvent.change(screen.getByLabelText('输入文章标题以确认'), {
      target: { value: latest.title },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '永久删除' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/drafts/${latest.id}`,
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ baseRevision: latest.revision }),
        }),
      )
    })
    expect(screen.queryByText(latest.title)).not.toBeInTheDocument()
  })

  it('uses an explicit DELETE safeguard for an untitled cloud draft', async () => {
    const untitledDraft = { ...drafts[0], title: '', slug: '' }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify({ data: untitledDraft }), { status: 200 })
      }
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AdminPostsView csrfToken="csrf-token" drafts={[untitledDraft]} posts={[]} writesEnabled />,
    )

    fireEvent.click(screen.getByRole('button', { name: '删除 无标题草稿' }))
    const dialog = await screen.findByRole('dialog', { name: '确认删除草稿' })
    expect(within(dialog).getByText('DELETE')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('输入文章标题以确认'), {
      target: { value: 'DELETE' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '永久删除' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/drafts/${untitledDraft.id}`,
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })
})
