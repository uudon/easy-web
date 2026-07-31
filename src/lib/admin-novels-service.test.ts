import { beforeEach, describe, expect, it, vi } from 'vitest'

const github = vi.hoisted(() => {
  class DraftRevisionError extends Error {}
  return {
    DraftRevisionError,
    deleteNovelChapterDraftFile: vi.fn(),
    deletePublishedNovel: vi.fn(),
    deletePublishedNovelChapter: vi.fn(),
    listNovelChapterDraftFiles: vi.fn(),
    publishNovelChapterFiles: vi.fn(),
    readNovelChapterDraftFile: vi.fn(),
    readPublishedNovelIndex: vi.fn(),
    writeNovelChapterDraftFile: vi.fn(),
    writePublishedNovel: vi.fn(),
  }
})

vi.mock('./github-app', () => github)

import {
  createChapterDraft,
  createNovel,
  deleteChapter,
  getChapterDraft,
  listChapterDrafts,
  listNovels,
  NovelChapterConflictError,
  NovelNotFoundError,
  publishChapterDraft,
  removeChapterDraft,
  removeNovel,
  saveNovelChapterDraftAsset,
  updateChapterDraft,
  updateNovel,
  type NovelChapterDraft,
  type NovelIndexEntry,
} from './admin-novels'

const novelInput = {
  title: '纸月亮',
  slug: 'paper-moon',
  summary: '一个关于海边旧书店的故事。',
  cover: '',
  genre: '现实幻想',
  status: '连载中' as const,
  startDate: '2026-01-01',
}

const novel: NovelIndexEntry = {
  ...novelInput,
  updatedAt: '2026-01-10',
  chapterCount: 0,
  latestChapter: null,
}

const draft: NovelChapterDraft = {
  id: 'novel_draft_1234567890',
  source: null,
  novelSlug: novel.slug,
  slug: 'chapter-1',
  title: '第一章 来客',
  order: 1,
  publishDate: '2026-01-01',
  volume: '第一卷',
  body: '海风从门缝里吹进来。',
  assets: [],
  status: 'draft',
  revision: 'revision-1',
  updatedAt: '2026-01-01T08:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  github.readPublishedNovelIndex.mockResolvedValue([novel])
  github.writePublishedNovel.mockResolvedValue({ sha: 'novel-sha' })
  github.writeNovelChapterDraftFile.mockResolvedValue({ revision: 'revision-2' })
  github.deleteNovelChapterDraftFile.mockResolvedValue(undefined)
  github.publishNovelChapterFiles.mockResolvedValue({ sha: 'publish-sha' })
  github.deletePublishedNovel.mockResolvedValue({ sha: 'delete-sha' })
  github.deletePublishedNovelChapter.mockResolvedValue({ sha: 'delete-chapter-sha' })
})

describe('novel service operations', () => {
  it('lists, creates and updates novels through immutable index writes', async () => {
    await expect(listNovels()).resolves.toEqual([novel])

    github.readPublishedNovelIndex.mockResolvedValueOnce([])
    const created = await createNovel(novelInput)
    expect(created).toMatchObject({ slug: novel.slug, chapterCount: 0, latestChapter: null })
    expect(created.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(github.writePublishedNovel).toHaveBeenCalledWith(
      [expect.objectContaining({ slug: novel.slug })],
      'feat: create novel paper-moon',
      [],
    )

    const updated = await updateNovel(novel.slug, {
      ...novelInput,
      title: '纸月亮（修订版）',
    })
    expect(updated.title).toBe('纸月亮（修订版）')
    expect(github.writePublishedNovel).toHaveBeenLastCalledWith(
      [expect.objectContaining({ title: '纸月亮（修订版）' })],
      'feat: update novel paper-moon',
      [novel],
    )
  })

  it('rejects duplicate or identity-changing novel writes and missing novels', async () => {
    await expect(createNovel(novelInput)).rejects.toBeInstanceOf(NovelChapterConflictError)
    await expect(
      updateNovel(novel.slug, { ...novelInput, slug: 'renamed-story' }),
    ).rejects.toThrow('Slug 创建后不能修改')

    github.readPublishedNovelIndex.mockResolvedValue([])
    await expect(updateNovel(novel.slug, novelInput)).rejects.toBeInstanceOf(
      NovelNotFoundError,
    )
    await expect(removeNovel(novel.slug)).rejects.toBeInstanceOf(NovelNotFoundError)
  })

  it('only removes an empty novel', async () => {
    github.readPublishedNovelIndex.mockResolvedValue([
      { ...novel, chapterCount: 1, latestChapter: 'chapter-1' },
    ])
    await expect(removeNovel(novel.slug)).rejects.toThrow('请先删除')

    github.readPublishedNovelIndex.mockResolvedValue([novel])
    await removeNovel(novel.slug)
    expect(github.deletePublishedNovel).toHaveBeenCalledWith(novel.slug, [], [novel])
  })

  it('turns a competing index commit into a recoverable domain conflict', async () => {
    github.writePublishedNovel.mockRejectedValueOnce(new github.DraftRevisionError())
    await expect(updateNovel(novel.slug, novelInput)).rejects.toThrow(
      '作品列表已被更新，请刷新后重试',
    )
  })
})

describe('chapter draft lifecycle', () => {
  it('creates new and source-backed drafts and parses stored drafts', async () => {
    const created = await createChapterDraft(novel.slug)
    expect(created).toMatchObject({
      novelSlug: novel.slug,
      source: null,
      status: 'draft',
      revision: 'revision-2',
    })

    const source = {
      novelSlug: novel.slug,
      slug: 'chapter-2',
      title: '第二章 潮声',
      order: 2,
      publishDate: '2026-01-08',
      body: '潮声。',
    }
    const fromSource = await createChapterDraft(novel.slug, source)
    expect(fromSource).toMatchObject({
      source: { novelSlug: novel.slug, slug: 'chapter-2' },
      title: source.title,
    })

    github.readNovelChapterDraftFile.mockResolvedValue({
      content: JSON.stringify({ ...draft, revision: undefined }),
      revision: draft.revision,
    })
    await expect(getChapterDraft(draft.id)).resolves.toMatchObject({
      slug: draft.slug,
      revision: draft.revision,
    })
  })

  it('filters invalid and published stored drafts and sorts the remainder', async () => {
    const older = { ...draft, id: 'novel_draft_abcdefghij', updatedAt: '2026-01-01T00:00:00.000Z' }
    const newer = { ...draft, id: 'novel_draft_klmnopqrst', updatedAt: '2026-01-02T00:00:00.000Z' }
    github.listNovelChapterDraftFiles.mockResolvedValue([
      { content: '{bad-json', revision: 'bad' },
      { content: JSON.stringify({ ...draft, status: 'published' }), revision: 'published' },
      { content: JSON.stringify(older), revision: 'old' },
      { content: JSON.stringify(newer), revision: 'new' },
    ])

    await expect(listChapterDrafts()).resolves.toMatchObject([
      { id: newer.id },
      { id: older.id },
    ])
  })

  it('updates and deletes a current draft while protecting its identity and revision', async () => {
    github.readNovelChapterDraftFile.mockResolvedValue({
      content: JSON.stringify({ ...draft, revision: undefined }),
      revision: draft.revision,
    })
    const updated = await updateChapterDraft(draft.id, {
      baseRevision: draft.revision,
      title: '新标题',
    })
    expect(updated).toMatchObject({ title: '新标题', revision: 'revision-2' })

    await expect(
      updateChapterDraft(draft.id, { baseRevision: 'stale', title: '冲突' }),
    ).rejects.toBeInstanceOf(NovelChapterConflictError)

    github.readNovelChapterDraftFile.mockResolvedValue({
      content: JSON.stringify({
        ...draft,
        source: { novelSlug: novel.slug, slug: draft.slug },
        revision: undefined,
      }),
      revision: draft.revision,
    })
    await expect(
      updateChapterDraft(draft.id, {
        baseRevision: draft.revision,
        slug: 'renamed-chapter',
      }),
    ).rejects.toThrow('作品和 Slug 不能修改')

    await removeChapterDraft(draft.id, draft.revision)
    expect(github.deleteNovelChapterDraftFile).toHaveBeenCalledWith(
      draft.id,
      draft.revision,
      [],
    )
  })

  it('stores validated image metadata immutably with the draft revision', async () => {
    github.readNovelChapterDraftFile.mockResolvedValue({
      content: JSON.stringify({ ...draft, revision: undefined }),
      revision: draft.revision,
    })
    const asset = {
      id: 'asset-1',
      name: 'scene.png',
      path: `content/draft-assets/${draft.id}/asset-1.png`,
      publicPath: '/uploads/2026/01/asset-1.png',
      mimeType: 'image/png' as const,
      size: 8,
      alt: '海边旧书店',
    }
    const result = await saveNovelChapterDraftAsset(
      draft.id,
      draft.revision,
      asset,
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    )

    expect(result.assets).toEqual([asset])
    expect(draft.assets).toEqual([])
    expect(github.writeNovelChapterDraftFile).toHaveBeenCalledWith(
      draft.id,
      expect.stringContaining('"asset-1"'),
      draft.revision,
      [expect.objectContaining({ path: asset.path, encoding: 'base64' })],
    )
  })

  it('publishes with the locked revision and keeps a recoverable draft on failure', async () => {
    github.readNovelChapterDraftFile.mockResolvedValue({
      content: JSON.stringify({ ...draft, revision: undefined }),
      revision: draft.revision,
    })
    await expect(publishChapterDraft(draft.id, draft.revision)).resolves.toMatchObject({
      sha: 'publish-sha',
      url: '/zh-cn/novels/paper-moon/chapter-1',
      status: 'deploying',
    })
    expect(github.publishNovelChapterFiles).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 'revision-2', status: 'publishing' }),
      expect.objectContaining({ slug: draft.slug }),
    )

    github.publishNovelChapterFiles.mockRejectedValueOnce(new Error('章节序号已存在。'))
    await expect(publishChapterDraft(draft.id, draft.revision)).rejects.toBeInstanceOf(
      NovelChapterConflictError,
    )
    expect(github.writeNovelChapterDraftFile).toHaveBeenLastCalledWith(
      draft.id,
      expect.stringContaining('"status": "draft"'),
      'revision-2',
    )

    github.publishNovelChapterFiles.mockRejectedValueOnce(new github.DraftRevisionError())
    await expect(publishChapterDraft(draft.id, draft.revision)).rejects.toThrow(
      '发布期间作品内容已更新，请刷新后重试',
    )
  })
})

describe('published chapter deletion', () => {
  it('maps repository absence and conflict errors to domain errors', async () => {
    await expect(deleteChapter(novel.slug, draft.slug)).resolves.toEqual({
      sha: 'delete-chapter-sha',
    })

    github.deletePublishedNovelChapter.mockRejectedValueOnce(new Error('作品不存在。'))
    await expect(deleteChapter(novel.slug, draft.slug)).rejects.toBeInstanceOf(
      NovelNotFoundError,
    )

    github.deletePublishedNovelChapter.mockRejectedValueOnce(new Error('章节不存在。'))
    await expect(deleteChapter(novel.slug, draft.slug)).rejects.toBeInstanceOf(
      NovelChapterConflictError,
    )
  })
})
