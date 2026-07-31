'use client'

import { BookPlus, ImagePlus, Pencil, Plus, Save, Send, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { readError } from './admin-studio'
import { Markdown } from '@/components/markdown'
import type { DraftAsset } from '@/lib/admin-drafts'
import type { NovelChapterDraft, NovelIndexEntry } from '@/lib/admin-novels'
import type { NovelChapter } from '@/lib/novels'
import type { ChangeEvent, CSSProperties, FormEvent, ReactNode } from 'react'

type ApiError = { message?: string } | string

const emptyNovel = (): NovelIndexEntry => ({
  title: '',
  slug: '',
  summary: '',
  cover: '',
  genre: '',
  status: '连载中',
  startDate: new Date().toISOString().slice(0, 10),
  updatedAt: '',
  chapterCount: 0,
  latestChapter: null,
})

export function AdminNovelsView({
  csrfToken,
  writesEnabled,
}: {
  csrfToken: string
  writesEnabled: boolean
}) {
  const [novels, setNovels] = useState<NovelIndexEntry[]>([])
  const [drafts, setDrafts] = useState<NovelChapterDraft[]>([])
  const [chapters, setChapters] = useState<NovelChapter[]>([])
  const [selectedNovel, setSelectedNovel] = useState('')
  const [novelForm, setNovelForm] = useState<NovelIndexEntry>(emptyNovel)
  const [editingNovel, setEditingNovel] = useState('')
  const [draft, setDraft] = useState<NovelChapterDraft | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [saveState, setSaveState] = useState('已保存')
  const draftRef = useRef<NovelChapterDraft | null>(null)
  const saveQueueRef = useRef<Promise<NovelChapterDraft | null>>(Promise.resolve(null))
  const imageInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const [novelResponse, draftResponse] = await Promise.all([
      fetch('/api/admin/novels', { cache: 'no-store' }),
      fetch('/api/admin/novel-drafts', { cache: 'no-store' }),
    ])
    const novelResult = await readPayload<NovelIndexEntry[]>(novelResponse)
    const draftResult = await readPayload<NovelChapterDraft[]>(draftResponse)
    if (!novelResponse.ok) throw new Error(readError(novelResult.error, '无法读取作品。'))
    if (!draftResponse.ok) throw new Error(readError(draftResult.error, '无法读取章节草稿。'))
    const nextNovels = novelResult.data ?? []
    setNovels(nextNovels)
    setDrafts(draftResult.data ?? [])
    setSelectedNovel((current) => current || nextNovels[0]?.slug || '')
  }, [])

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : '加载失败。'))
  }, [load])

  useEffect(() => {
    if (!selectedNovel) {
      setChapters([])
      return
    }
    void fetch(`/api/admin/novel-chapters?novelSlug=${encodeURIComponent(selectedNovel)}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        const result = await readPayload<NovelChapter[]>(response)
        if (response.ok) setChapters(result.data ?? [])
      })
      .catch(() => undefined)
  }, [selectedNovel])

  const saveDraft = useCallback((target?: NovelChapterDraft) => {
    const queued = saveQueueRef.current.then(async () => {
      const activeDraft = draftRef.current
      const current =
        activeDraft && (!target || activeDraft.id === target.id)
          ? activeDraft
          : target
      if (!current || !writesEnabled) return null

      setSaveState('保存中…')
      const response = await fetch(`/api/admin/novel-drafts/${encodeURIComponent(current.id)}`, {
        method: 'PUT',
        headers: jsonHeaders(csrfToken),
        body: JSON.stringify({
          baseRevision: current.revision,
          novelSlug: current.novelSlug,
          slug: current.slug,
          title: current.title,
          order: current.order,
          publishDate: current.publishDate,
          volume: current.volume ?? '',
          body: current.body,
        }),
      })
      const result = await readPayload<NovelChapterDraft>(response)
      if (!response.ok || !result.data) {
        if (draftRef.current?.id === current.id) {
          setSaveState(response.status === 409 ? '版本冲突' : '保存失败')
        }
        throw new Error(readError(result.error, '保存章节草稿失败。'))
      }

      const latest = draftRef.current
      const hasNewerLocalChanges =
        latest?.id === current.id && hasEditableChanges(latest, current)
      const nextActive =
        hasNewerLocalChanges && latest
          ? {
              ...latest,
              revision: result.data.revision,
              updatedAt: result.data.updatedAt,
            }
          : result.data
      if (latest?.id === current.id) {
        setDraft(nextActive)
        draftRef.current = nextActive
        setSaveState(hasNewerLocalChanges ? '等待保存' : '已保存')
      }
      setDrafts((items) => [
        nextActive,
        ...items.filter((item) => item.id !== nextActive.id),
      ])
      return nextActive
    })
    saveQueueRef.current = queued.catch(() => null)
    return queued
  }, [csrfToken, writesEnabled])

  useEffect(() => {
    draftRef.current = draft
    if (!draft || !writesEnabled) return
    setSaveState('等待保存')
    const timeout = window.setTimeout(() => {
      void saveDraft(draft).catch((error) => {
        setMessage(error instanceof Error ? error.message : '自动保存失败。')
      })
    }, 2500)
    return () => window.clearTimeout(timeout)
  }, [
    draft?.body,
    draft?.novelSlug,
    draft?.order,
    draft?.publishDate,
    draft?.slug,
    draft?.title,
    draft?.volume,
    saveDraft,
    writesEnabled,
  ])

  async function submitNovel(event: FormEvent) {
    event.preventDefault()
    setBusy('novel')
    setMessage('')
    try {
      const response = await fetch(
        editingNovel
          ? `/api/admin/novels/${encodeURIComponent(editingNovel)}`
          : '/api/admin/novels',
        {
          method: editingNovel ? 'PUT' : 'POST',
          headers: jsonHeaders(csrfToken),
          body: JSON.stringify({
            title: novelForm.title,
            slug: novelForm.slug,
            summary: novelForm.summary,
            cover: novelForm.cover ?? '',
            genre: novelForm.genre,
            status: novelForm.status,
            startDate: novelForm.startDate,
          }),
        },
      )
      const result = await readPayload<NovelIndexEntry>(response)
      if (!response.ok) throw new Error(readError(result.error, '保存作品失败。'))
      setNovelForm(emptyNovel())
      setEditingNovel('')
      await load()
      setMessage(editingNovel ? '作品资料已更新。' : '作品已创建。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存作品失败。')
    } finally {
      setBusy('')
    }
  }

  async function createDraft(novelSlug: string, chapterSlug?: string) {
    setBusy('draft')
    try {
      const response = await fetch('/api/admin/novel-drafts', {
        method: 'POST',
        headers: jsonHeaders(csrfToken),
        body: JSON.stringify({ novelSlug, ...(chapterSlug ? { chapterSlug } : {}) }),
      })
      const result = await readPayload<NovelChapterDraft>(response)
      if (!response.ok || !result.data) {
        throw new Error(readError(result.error, '无法创建章节草稿。'))
      }
      setDraft(result.data)
      draftRef.current = result.data
      setDrafts((items) => [result.data!, ...items])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法创建章节草稿。')
    } finally {
      setBusy('')
    }
  }

  async function publishDraft() {
    if (!draft) return
    setBusy('publish')
    setMessage('')
    try {
      const saved = await saveDraft(draft)
      if (!saved) return
      const response = await fetch(
        `/api/admin/novel-drafts/${encodeURIComponent(saved.id)}/publish`,
        {
          method: 'POST',
          headers: jsonHeaders(csrfToken),
          body: JSON.stringify({ baseRevision: saved.revision }),
        },
      )
      const result = await readPayload<{ url: string }>(response)
      if (!response.ok) throw new Error(readError(result.error, '发布章节失败。'))
      setDraft(null)
      draftRef.current = null
      await load()
      setMessage('章节已发布，网站部署完成后即可阅读。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '发布章节失败，草稿仍然保留。')
    } finally {
      setBusy('')
    }
  }

  async function uploadAsset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    const current = draftRef.current
    if (!file || !current) return
    const alt = window.prompt('请输入图片替代文字：')?.trim()
    if (!alt) {
      setMessage('图片需要替代文字后才能插入。')
      return
    }

    setBusy('asset')
    setMessage('')
    try {
      const saved = await saveDraft(current)
      if (!saved) return
      const form = new FormData()
      form.set('file', file)
      form.set('alt', alt)
      form.set('baseRevision', saved.revision)
      const response = await fetch(
        `/api/admin/novel-drafts/${encodeURIComponent(saved.id)}/assets`,
        {
          method: 'POST',
          headers: { 'x-csrf-token': csrfToken },
          body: form,
        },
      )
      const result = await readPayload<{ draft: NovelChapterDraft; asset: DraftAsset }>(response)
      if (!response.ok || !result.data?.draft || !result.data.asset) {
        throw new Error(readError(result.error, '图片上传失败。'))
      }
      const uploaded = result.data.draft
      const nextDraft = {
        ...uploaded,
        body: `${uploaded.body.trimEnd()}\n\n![${alt}](${result.data.asset.publicPath})\n`,
      }
      setDraft(nextDraft)
      draftRef.current = nextDraft
      setDrafts((items) => [
        nextDraft,
        ...items.filter((item) => item.id !== nextDraft.id),
      ])
      setSaveState('等待保存')
      setMessage('图片已暂存，并插入到章节末尾。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '图片上传失败。')
    } finally {
      setBusy('')
    }
  }

  async function deleteNovel(slug: string) {
    if (!window.confirm('确定删除这部作品吗？作品包含章节时会拒绝删除。')) return
    const response = await fetch(`/api/admin/novels/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken },
    })
    const result = await readPayload<never>(response)
    if (!response.ok) {
      setMessage(readError(result.error, '删除作品失败。'))
      return
    }
    await load()
  }

  async function deleteChapter(chapter: NovelChapter) {
    if (!window.confirm(`确定删除「${chapter.title}」吗？`)) return
    const response = await fetch(
      `/api/admin/novel-chapters/${encodeURIComponent(chapter.novelSlug)}/${encodeURIComponent(chapter.slug)}`,
      { method: 'DELETE', headers: { 'x-csrf-token': csrfToken } },
    )
    const result = await readPayload<never>(response)
    if (!response.ok) {
      setMessage(readError(result.error, '删除章节失败。'))
      return
    }
    setChapters((items) => items.filter((item) => item.slug !== chapter.slug))
    await load()
  }

  return (
    <section className="studio-page">
      <header className="studio-page-header compact">
        <div>
          <p className="eyebrow">SERIAL FICTION</p>
          <h1>小说管理</h1>
          <p>作品资料、章节草稿和手动发布都存放在仓库中。</p>
        </div>
        <button
          className="studio-primary-action"
          disabled={!writesEnabled || !selectedNovel || busy === 'draft'}
          onClick={() => void createDraft(selectedNovel)}
          type="button"
        >
          <BookPlus />新建章节
        </button>
      </header>

      {message ? <p role="status" style={noticeStyle}>{message}</p> : null}

      <div className="novel-admin-grid" style={twoColumnStyle}>
        <div>
          <div className="studio-section-heading">
            <div><p className="eyebrow">WORKS</p><h2>作品</h2></div>
            <button onClick={() => { setEditingNovel(''); setNovelForm(emptyNovel()) }} type="button">
              <Plus /> 新建作品
            </button>
          </div>
          <div className="editorial-list">
            {novels.map((novel, index) => (
              <article key={novel.slug}>
                <span className="editorial-index">{String(index + 1).padStart(2, '0')}</span>
                <button
                  onClick={() => setSelectedNovel(novel.slug)}
                  style={titleButtonStyle}
                  type="button"
                >
                  <p>{novel.status} · {novel.chapterCount} 章</p>
                  <h3>{novel.title}</h3>
                </button>
                <span>
                  <button onClick={() => { setEditingNovel(novel.slug); setNovelForm({ ...novel, cover: novel.cover ?? '' }) }} title="编辑作品" type="button"><Pencil /></button>
                  <button onClick={() => void deleteNovel(novel.slug)} title="删除作品" type="button"><Trash2 /></button>
                </span>
              </article>
            ))}
          </div>
        </div>

        <form onSubmit={submitNovel} style={formStyle}>
          <p className="eyebrow">{editingNovel ? 'EDIT WORK' : 'NEW WORK'}</p>
          <h2>{editingNovel ? '编辑作品' : '新建作品'}</h2>
          <Field label="标题"><input required value={novelForm.title} onChange={(event) => setNovelForm({ ...novelForm, title: event.target.value })} /></Field>
          <Field label="Slug"><input disabled={Boolean(editingNovel)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required value={novelForm.slug} onChange={(event) => setNovelForm({ ...novelForm, slug: event.target.value })} /></Field>
          <Field label="简介"><textarea required rows={4} value={novelForm.summary} onChange={(event) => setNovelForm({ ...novelForm, summary: event.target.value })} /></Field>
          <Field label="封面地址（可选）"><input value={novelForm.cover ?? ''} onChange={(event) => setNovelForm({ ...novelForm, cover: event.target.value })} /></Field>
          <Field label="题材"><input required value={novelForm.genre} onChange={(event) => setNovelForm({ ...novelForm, genre: event.target.value })} /></Field>
          <Field label="状态"><select value={novelForm.status} onChange={(event) => setNovelForm({ ...novelForm, status: event.target.value as NovelIndexEntry['status'] })}><option>连载中</option><option>已完结</option><option>暂停更新</option></select></Field>
          <Field label="开始日期"><input required type="date" value={novelForm.startDate} onChange={(event) => setNovelForm({ ...novelForm, startDate: event.target.value })} /></Field>
          <button disabled={!writesEnabled || busy === 'novel'} type="submit"><Save /> {busy === 'novel' ? '保存中…' : '保存作品'}</button>
        </form>
      </div>

      <div style={{ marginTop: 64 }}>
        <div className="studio-section-heading">
          <div><p className="eyebrow">CHAPTERS</p><h2>章节与草稿</h2></div>
          <select value={selectedNovel} onChange={(event) => setSelectedNovel(event.target.value)}>
            {novels.map((novel) => <option key={novel.slug} value={novel.slug}>{novel.title}</option>)}
          </select>
        </div>
        <div className="content-table">
          {[...drafts.filter((item) => item.novelSlug === selectedNovel)].map((item) => (
            <div className="content-table-row" key={item.id}>
              <div className="content-title-cell"><span>草稿</span><div><strong>{item.title || '未命名章节'}</strong><small>{item.slug || item.id}</small></div></div>
              <span>{item.order}</span><span>{item.volume || '—'}</span><span>{item.publishDate}</span>
              <button onClick={() => setDraft(item)} type="button">编辑</button>
            </div>
          ))}
          {chapters.map((chapter) => (
            <div className="content-table-row" key={chapter.slug}>
              <div className="content-title-cell"><span>{chapter.order}</span><div><strong>{chapter.title}</strong><small>{chapter.slug}</small></div></div>
              <span>已发布</span><span>{chapter.volume || '—'}</span><span>{chapter.publishDate}</span>
              <span><button onClick={() => void createDraft(chapter.novelSlug, chapter.slug)} type="button">编辑</button><button onClick={() => void deleteChapter(chapter)} type="button"><Trash2 /></button></span>
            </div>
          ))}
        </div>
      </div>

      {draft ? (
        <section className="novel-admin-editor" style={editorStyle}>
          <div style={editorToolbarStyle}>
            <strong>{draft.source ? '修改已发布章节' : '编辑章节草稿'}</strong>
            <span>{saveState}</span>
            <button disabled={!writesEnabled} onClick={() => void saveDraft(draft)} type="button"><Save />保存</button>
            <button
              disabled={!writesEnabled || busy === 'asset'}
              onClick={() => imageInputRef.current?.click()}
              type="button"
            >
              <ImagePlus />{busy === 'asset' ? '上传中…' : '插入图片'}
            </button>
            <input
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => void uploadAsset(event)}
              ref={imageInputRef}
              type="file"
            />
            <button disabled={!writesEnabled || busy === 'publish'} onClick={() => void publishDraft()} type="button"><Send />发布</button>
            <button onClick={() => setDraft(null)} type="button">关闭</button>
          </div>
          <div className="novel-admin-chapter-fields" style={chapterFieldsStyle}>
            <Field label="所属作品"><select disabled={Boolean(draft.source)} value={draft.novelSlug} onChange={(event) => setDraft({ ...draft, novelSlug: event.target.value })}>{novels.map((novel) => <option key={novel.slug} value={novel.slug}>{novel.title}</option>)}</select></Field>
            <Field label="章节序号"><input min={1} required type="number" value={draft.order} onChange={(event) => setDraft({ ...draft, order: Number(event.target.value) })} /></Field>
            <Field label="标题"><input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
            <Field label="Slug"><input disabled={Boolean(draft.source)} required value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} /></Field>
            <Field label="卷名（可选）"><input value={draft.volume ?? ''} onChange={(event) => setDraft({ ...draft, volume: event.target.value })} /></Field>
            <Field label="发布日期"><input required type="date" value={draft.publishDate} onChange={(event) => setDraft({ ...draft, publishDate: event.target.value })} /></Field>
          </div>
          <div className="novel-admin-editor-split" style={splitStyle}>
            <textarea aria-label="章节正文 Markdown" onChange={(event) => setDraft({ ...draft, body: event.target.value })} style={bodyStyle} value={draft.body} />
            <div style={previewStyle}><Markdown>{draft.body}</Markdown></div>
          </div>
        </section>
      ) : null}
    </section>
  )
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label style={fieldStyle}><span>{label}</span>{children}</label>
}

async function readPayload<T>(response: Response) {
  if (response.status === 204) return {} as { data?: T; error?: ApiError }
  return response.json() as Promise<{ data?: T; error?: ApiError }>
}

function jsonHeaders(csrfToken: string) {
  return { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }
}

function hasEditableChanges(left: NovelChapterDraft, right: NovelChapterDraft) {
  return (
    left.novelSlug !== right.novelSlug ||
    left.slug !== right.slug ||
    left.title !== right.title ||
    left.order !== right.order ||
    left.publishDate !== right.publishDate ||
    (left.volume ?? '') !== (right.volume ?? '') ||
    left.body !== right.body
  )
}

const twoColumnStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(300px, .75fr)', gap: 48 }
const formStyle: CSSProperties = { display: 'grid', alignContent: 'start', gap: 14, padding: 24, border: '1px solid var(--line)' }
const fieldStyle: CSSProperties = { display: 'grid', gap: 7, color: 'var(--muted)', fontSize: '.72rem' }
const noticeStyle: CSSProperties = { padding: 14, border: '1px solid var(--line)', marginBottom: 24 }
const titleButtonStyle: CSSProperties = { padding: 0, border: 0, background: 'transparent', textAlign: 'left', color: 'inherit' }
const editorStyle: CSSProperties = { position: 'fixed', inset: '24px 24px 24px min(280px, 20vw)', zIndex: 20, overflow: 'auto', padding: 24, border: '1px solid var(--line-strong)', background: 'var(--paper)' }
const editorToolbarStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }
const chapterFieldsStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }
const splitStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '60vh', border: '1px solid var(--line)' }
const bodyStyle: CSSProperties = { minHeight: '60vh', padding: 24, resize: 'vertical', border: 0, borderRight: '1px solid var(--line)', fontFamily: 'var(--mono)', lineHeight: 1.7 }
const previewStyle: CSSProperties = { padding: 30, overflow: 'auto' }
