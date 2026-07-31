import { beforeEach, describe, expect, it, vi } from 'vitest'

const github = vi.hoisted(() => ({
  index: [] as unknown[],
  drafts: new Map<string, { content: string; revision: string }>(),
  revision: 0,
  publishError: null as Error | null,
  writePublishedNovel: vi.fn(),
  publishNovelChapterFiles: vi.fn(),
}))

vi.mock('./github-app', () => {
  class DraftRevisionError extends Error {}
  return {
    DraftRevisionError,
    readPublishedNovelIndex: vi.fn(async () => github.index),
    writePublishedNovel: github.writePublishedNovel.mockImplementation(async (index) => {
      github.index = index
      return { sha: 'main-1' }
    }),
    deletePublishedNovel: vi.fn(),
    deletePublishedNovelChapter: vi.fn(),
    listNovelChapterDraftFiles: vi.fn(async () =>
      [...github.drafts.values()].map((draft) => ({ ...draft })),
    ),
    readNovelChapterDraftFile: vi.fn(async (id: string) => github.drafts.get(id) ?? null),
    writeNovelChapterDraftFile: vi.fn(
      async (id: string, content: string, expectedRevision?: string) => {
        const existing = github.drafts.get(id)
        if (
          (expectedRevision && existing?.revision !== expectedRevision) ||
          (!expectedRevision && existing)
        ) {
          throw new DraftRevisionError()
        }
        const revision = `revision-${++github.revision}`
        github.drafts.set(id, { content, revision })
        return { revision }
      },
    ),
    deleteNovelChapterDraftFile: vi.fn(async (id: string) => {
      github.drafts.delete(id)
    }),
    publishNovelChapterFiles: github.publishNovelChapterFiles.mockImplementation(async () => {
      if (github.publishError) throw github.publishError
      return { sha: 'published-1' }
    }),
  }
})

import {
  createChapterDraft,
  createNovel,
  publishChapterDraft,
  updateChapterDraft,
} from './admin-novels'

beforeEach(() => {
  github.index = []
  github.drafts.clear()
  github.revision = 0
  github.publishError = null
  github.writePublishedNovel.mockClear()
  github.publishNovelChapterFiles.mockClear()
})

describe('novel admin GitHub workflows', () => {
  it('creates a public-index-compatible novel in one index write', async () => {
    const novel = await createNovel({
      title: '纸月亮',
      slug: 'paper-moon',
      summary: '海边旧书店的故事。',
      cover: '',
      genre: '现实幻想',
      status: '连载中',
      startDate: '2026-01-01',
    })

    expect(novel.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(github.writePublishedNovel).toHaveBeenCalledTimes(1)
    expect(github.index).toEqual([novel])
  })

  it('restores a publishable chapter to draft status when atomic publication fails', async () => {
    github.index = [{
      title: '纸月亮',
      slug: 'paper-moon',
      summary: '海边旧书店的故事。',
      genre: '现实幻想',
      status: '连载中',
      startDate: '2026-01-01',
      updatedAt: '2026-01-01',
      chapterCount: 0,
      latestChapter: null,
    }]
    const initial = await createChapterDraft('paper-moon')
    const ready = await updateChapterDraft(initial.id, {
      baseRevision: initial.revision,
      slug: 'chapter-1',
      title: '第一章 来客',
      order: 1,
      publishDate: '2026-01-01',
      body: '正文',
    })
    github.publishError = new Error('ref conflict')

    await expect(publishChapterDraft(ready.id, ready.revision)).rejects.toThrow(
      'ref conflict',
    )
    const stored = github.drafts.get(ready.id)
    expect(stored).toBeDefined()
    expect(JSON.parse(stored!.content)).toMatchObject({
      status: 'draft',
      slug: 'chapter-1',
      body: '正文',
    })
  })
})
