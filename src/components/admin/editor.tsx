'use client'

import {
  Bold,
  Check,
  ChevronLeft,
  Code2,
  Columns2,
  Eye,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  LoaderCircle,
  PanelRight,
  Quote,
  Save,
  Send,
  Table2,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { readError } from './admin-studio'
import { Markdown } from '@/components/markdown'
import type { Draft, DraftAsset } from '@/lib/admin-drafts'
import { getMarkdownStats } from '@/lib/markdown-stats'
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'

type EditorMode = 'edit' | 'split' | 'preview' | 'settings'
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error'

const categoryOptions = [
  ['ai', '人工智能'],
  ['programming', '编程'],
  ['algorithms', '算法'],
  ['architecture', '架构'],
  ['project-management', '项目管理'],
  ['thinking', '思考'],
] as const

const cloudSaveDelayMs = 5000
const localSaveDelayMs = 250

export function AdminEditor({
  csrfToken,
  draftId,
  writesEnabled,
}: {
  csrfToken: string
  draftId: string
  writesEnabled: boolean
}) {
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const createdNewDraftRef = useRef(false)
  const saveErrorRef = useRef('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [mode, setMode] = useState<EditorMode>('split')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [message, setMessage] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [recoveryLoaded, setRecoveryLoaded] = useState(false)

  const loadDraft = useCallback(async () => {
    if (draftId === 'new') {
      if (createdNewDraftRef.current) return
      createdNewDraftRef.current = true
      if (!writesEnabled) {
        setDraft(createLocalDraft())
        setRecoveryLoaded(true)
        return
      }
      try {
        const response = await fetch('/api/admin/drafts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({}),
        })
        const result = await readJson<{ data?: Draft; error?: ApiError }>(response)
        if (!response.ok || !result.data) {
          throw new Error(readError(result.error, '无法创建草稿。'))
        }
        setDraft(result.data)
        setSaveState('saved')
        router.replace(`/admin/editor/${result.data.id}`)
      } catch (error) {
        setDraft(createLocalDraft())
        setMessage(error instanceof Error ? error.message : '无法创建草稿。')
        setSaveState('error')
      } finally {
        setRecoveryLoaded(true)
      }
      return
    }

    try {
      const response = await fetch(`/api/admin/drafts/${encodeURIComponent(draftId)}`, {
        cache: 'no-store',
      })
      const result = await readJson<{ data?: Draft; error?: ApiError }>(response)
      if (!response.ok || !result.data) {
        throw new Error(readError(result.error, '无法读取草稿。'))
      }
      const recovered = readLocalRecovery(result.data.id)
      const nextDraft =
        recovered && recovered.savedAt > result.data.updatedAt
          ? { ...result.data, ...recovered.draft, revision: result.data.revision }
          : result.data
      setDraft(nextDraft)
      setSaveState(recovered && recovered.savedAt > result.data.updatedAt ? 'dirty' : 'saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法读取草稿。')
      setSaveState('error')
    } finally {
      setRecoveryLoaded(true)
    }
  }, [csrfToken, draftId, router, writesEnabled])

  useEffect(() => {
    void loadDraft()
  }, [loadDraft])

  useEffect(() => {
    if (!draft || !recoveryLoaded || saveState === 'saved') return
    const timeout = window.setTimeout(() => {
      localStorage.setItem(
        localStorageKey(draft.id),
        JSON.stringify({ draft, savedAt: new Date().toISOString() }),
      )
    }, localSaveDelayMs)
    return () => window.clearTimeout(timeout)
  }, [draft, recoveryLoaded, saveState])

  const saveDraft = useCallback(async (): Promise<Draft | null> => {
    if (!draft || !writesEnabled) return null
    setSaveState('saving')
    setMessage('')
    saveErrorRef.current = ''
    let targetDraft = draft
    try {
      if (draft.id === 'local-new') {
        const createResponse = await fetch('/api/admin/drafts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({}),
        })
        const createResult = await readJson<{ data?: Draft; error?: ApiError }>(createResponse)
        if (!createResponse.ok || !createResult.data) {
          throw new Error(readError(createResult.error, '无法创建云草稿。'))
        }
        targetDraft = {
          ...draft,
          id: createResult.data.id,
          revision: createResult.data.revision,
          updatedAt: createResult.data.updatedAt,
          assets: createResult.data.assets,
          status: 'draft',
        }
        localStorage.setItem(
          localStorageKey(targetDraft.id),
          JSON.stringify({ draft: targetDraft, savedAt: new Date().toISOString() }),
        )
        localStorage.removeItem(localStorageKey(draft.id))
      }

      const response = await fetch(`/api/admin/drafts/${encodeURIComponent(targetDraft.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          translationKey: targetDraft.translationKey ?? '',
          locale: targetDraft.locale,
          slug: targetDraft.slug,
          title: targetDraft.title,
          summary: targetDraft.summary,
          category: targetDraft.category,
          publishDate: targetDraft.publishDate,
          body: targetDraft.body,
          baseRevision: targetDraft.revision,
        }),
      })
      const result = await readJson<{ data?: Draft; error?: ApiError }>(response)
      if (response.status === 409) {
        setSaveState('conflict')
        throw new Error('另一处编辑已经保存了更新版本。请复制当前内容后重新载入。')
      }
      if (!response.ok || !result.data) {
        throw new Error(readError(result.error, '保存草稿失败。'))
      }
      setDraft(result.data)
      setSaveState('saved')
      localStorage.removeItem(localStorageKey(result.data.id))
      if (draft.id === 'local-new') {
        router.replace(`/admin/editor/${result.data.id}`)
      }
      return result.data
    } catch (error) {
      if (targetDraft.id !== draft.id) {
        setDraft(targetDraft)
        router.replace(`/admin/editor/${targetDraft.id}`)
      }
      if (error instanceof Error && error.message.includes('另一处编辑')) {
        setSaveState('conflict')
      } else {
        setSaveState('error')
      }
      const errorMessage = error instanceof Error ? error.message : '保存草稿失败。'
      saveErrorRef.current = errorMessage
      setMessage(errorMessage)
      return null
    }
  }, [csrfToken, draft, router, writesEnabled])

  useEffect(() => {
    if (saveState !== 'dirty' || !writesEnabled) return
    const timeout = window.setTimeout(() => void saveDraft(), cloudSaveDelayMs)
    return () => window.clearTimeout(timeout)
  }, [saveDraft, saveState, writesEnabled])

  useEffect(() => {
    const handleKeyboardSave = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveDraft()
      }
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveState !== 'dirty' && saveState !== 'saving') return
      event.preventDefault()
    }
    window.addEventListener('keydown', handleKeyboardSave)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('keydown', handleKeyboardSave)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [saveDraft, saveState])

  const updateDraft = useCallback(<Key extends keyof Draft>(key: Key, value: Draft[Key]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
    setSaveState('dirty')
    setMessage('')
  }, [])

  const stats = useMemo(() => getMarkdownStats(draft?.body ?? ''), [draft?.body])
  const issues = useMemo(() => getDraftIssues(draft), [draft])

  function insertMarkdown(before: string, after = '', placeholder = '文字') {
    const textarea = textareaRef.current
    if (!textarea || !draft) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = draft.body.slice(start, end) || placeholder
    const nextBody = `${draft.body.slice(0, start)}${before}${selected}${after}${draft.body.slice(end)}`
    updateDraft('body', nextBody)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Tab') return
    event.preventDefault()
    insertMarkdown('  ', '', '')
  }

  async function uploadAsset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !draft) return
    if (saveState === 'saving') {
      setMessage('草稿正在保存，请稍后再上传图片。')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('图片不能超过 5 MB。')
      return
    }
    const alt = window.prompt('请为图片填写替代文字：')
    if (alt === null || !alt.trim()) {
      setMessage('图片需要替代文字后才能插入。')
      return
    }
    setBusyAction('upload')
    setMessage('')
    try {
      const uploadDraft = saveState === 'dirty' || draft.id === 'local-new'
        ? await saveDraft()
        : draft
      if (!uploadDraft) return
      const formData = new FormData()
      formData.set('file', file)
      formData.set('alt', alt.trim())
      formData.set('baseRevision', uploadDraft.revision)
      const response = await fetch(
        `/api/admin/drafts/${encodeURIComponent(uploadDraft.id)}/assets`,
        {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: formData,
        },
      )
      const result = await readJson<{
        data?: { draft?: Draft; asset?: DraftAsset }
        error?: ApiError
      }>(response)
      if (!response.ok || !result.data?.asset) {
        throw new Error(readError(result.error, '图片上传失败。'))
      }
      if (result.data.draft) setDraft(result.data.draft)
      insertMarkdown(`![${alt.trim()}](`, ')', result.data.asset.publicPath)
      setMessage('图片已暂存，将在发布时与文章一起提交。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '图片上传失败。')
    } finally {
      setBusyAction('')
    }
  }

  async function publishDraft() {
    if (!draft || issues.length || !writesEnabled) return
    if (saveState === 'saving') {
      const savingMessage = '草稿正在保存，请稍后再发布。'
      setMessage(savingMessage)
      setPublishError(savingMessage)
      return
    }
    setBusyAction('publish')
    setMessage('')
    setPublishError('')
    try {
      const savedDraft = saveState === 'dirty' || draft.id === 'local-new'
        ? await saveDraft()
        : draft
      if (!savedDraft) {
        setPublishError(saveErrorRef.current || '草稿尚未保存到云端，请重试。')
        return
      }
      const response = await fetch(
        `/api/admin/drafts/${encodeURIComponent(savedDraft.id)}/publish`,
        {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ baseRevision: savedDraft.revision }),
        },
      )
      const result = await readJson<{
        data?: { sha?: string; url?: string; cleanupPending?: boolean }
        error?: ApiError
      }>(response)
      if (!response.ok || !result.data) {
        throw new Error(readError(result.error, '发布失败。'))
      }
      localStorage.removeItem(localStorageKey(savedDraft.id))
      localStorage.removeItem(localStorageKey('local-new'))
      setPublishOpen(false)
      setSaveState('saved')
      const publishSummary = `发布提交成功${
        result.data.sha ? ` · ${result.data.sha.slice(0, 8)}` : ''
      }${result.data.url ? ` · ${result.data.url}` : ''}`
      setMessage(
        result.data.cleanupPending
          ? `${publishSummary}，正在等待部署；云草稿清理将稍后重试。`
          : `${publishSummary}，正在等待部署。`,
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '发布失败。'
      setMessage(errorMessage)
      setPublishError(errorMessage)
    } finally {
      setBusyAction('')
    }
  }

  async function deleteDraft() {
    if (!draft || draft.id === 'local-new') {
      router.push('/admin/posts')
      return
    }
    const confirmation = window.prompt(`输入“${draft.title || '无标题草稿'}”确认删除草稿：`)
    if (confirmation !== (draft.title || '无标题草稿')) return
    setBusyAction('delete')
    try {
      const response = await fetch(`/api/admin/drafts/${encodeURIComponent(draft.id)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ baseRevision: draft.revision }),
      })
      const result = await readJson<{ error?: ApiError }>(response)
      if (!response.ok) throw new Error(readError(result.error, '删除草稿失败。'))
      localStorage.removeItem(localStorageKey(draft.id))
      router.push('/admin/posts')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除草稿失败。')
    } finally {
      setBusyAction('')
    }
  }

  if (!draft) {
    return (
      <div className="editor-loading">
        <LoaderCircle className="spin" />
        <p>{message || '正在打开草稿…'}</p>
      </div>
    )
  }

  return (
    <div className="editor-workspace">
      <header className="editor-topbar">
        <button aria-label="返回文章列表" onClick={() => router.push('/admin/posts')} type="button">
          <ChevronLeft />
        </button>
        <div className="editor-document-name">
          <span>{draft.locale === 'zh-cn' ? '中文' : 'EN'} · {draft.category}</span>
          <strong>{draft.title || '无标题草稿'}</strong>
        </div>
        <SaveIndicator state={saveState} />
        <div className="editor-view-switcher" role="group" aria-label="编辑器视图">
          <ModeButton active={mode === 'edit'} icon={<Type />} label="编辑" onClick={() => setMode('edit')} />
          <ModeButton active={mode === 'split'} icon={<Columns2 />} label="分栏" onClick={() => setMode('split')} />
          <ModeButton active={mode === 'preview'} icon={<Eye />} label="预览" onClick={() => setMode('preview')} />
          <ModeButton active={mode === 'settings'} icon={<PanelRight />} label="设置" onClick={() => setMode('settings')} />
        </div>
        <button
          className="editor-save-button"
          disabled={!writesEnabled || saveState === 'saving'}
          onClick={() => void saveDraft()}
          type="button"
        >
          <Save />保存
        </button>
        <button
          className="editor-publish-button"
          onClick={() => {
            setPublishError('')
            setPublishOpen(true)
          }}
          type="button"
        >
          发布 <Send />
        </button>
      </header>

      {!writesEnabled ? <div className="editor-inline-notice">只读模式：本机恢复可用，云保存和发布已暂停。</div> : null}
      {message ? <div className={`editor-inline-notice ${saveState === 'error' || saveState === 'conflict' ? 'error' : ''}`} role="status">{message}</div> : null}

      <div className={`editor-layout mode-${mode}`}>
        <section className="editor-canvas" aria-label="文章编辑器">
          <input
            aria-label="文章标题"
            className="editor-title-input"
            maxLength={160}
            onChange={(event) => updateDraft('title', event.target.value)}
            placeholder="在这里写下标题"
            value={draft.title}
          />
          <textarea
            aria-label="文章摘要"
            className="editor-summary-input"
            maxLength={360}
            onChange={(event) => updateDraft('summary', event.target.value)}
            placeholder="用一两句话概括这篇文章…"
            value={draft.summary}
          />
          <MarkdownToolbar
            busy={busyAction === 'upload'}
            fileInputRef={fileInputRef}
            insertMarkdown={insertMarkdown}
            onUpload={uploadAsset}
          />
          <textarea
            aria-label="Markdown 正文"
            className="editor-markdown-input"
            maxLength={500_000}
            onChange={(event) => updateDraft('body', event.target.value)}
            onKeyDown={handleEditorKeyDown}
            placeholder="从这里开始写作…"
            ref={textareaRef}
            spellCheck
            value={draft.body}
          />
          <footer className="editor-statusbar">
            <span>{stats.wordCount} 字词</span>
            <span>{stats.characterCount} 字符</span>
            <span>约 {stats.readingTimeMinutes} 分钟阅读</span>
            <span>Markdown</span>
          </footer>
        </section>

        <section className="editor-preview" aria-label="文章预览">
          <div className="editor-preview-header">
            <span>LIVE PREVIEW</span>
            <a href={`/${draft.locale}/blog/${draft.slug}`} rel="noreferrer" target="_blank">公开页面</a>
          </div>
          <article>
            <p className="eyebrow">{draft.category} · {draft.publishDate}</p>
            <h1>{draft.title || '无标题文章'}</h1>
            {draft.summary ? <p className="preview-summary">{draft.summary}</p> : null}
            <Markdown>{draft.body}</Markdown>
          </article>
        </section>

        <aside className="editor-inspector" aria-label="文章设置">
          <div className="inspector-heading">
            <div>
              <p className="eyebrow">DOCUMENT SETTINGS</p>
              <h2>文章设置</h2>
            </div>
            <button aria-label="关闭设置" onClick={() => setMode('edit')} type="button"><X /></button>
          </div>
          <InspectorField label="语言">
            <select
              disabled={draft.source !== null}
              onChange={(event) => updateDraft('locale', event.target.value as Draft['locale'])}
              value={draft.locale}
            >
              <option value="zh-cn">简体中文</option>
              <option value="en">English</option>
            </select>
          </InspectorField>
          <InspectorField hint="中英文文章使用相同标识建立关联。" label="翻译关联">
            <input
              maxLength={100}
              onChange={(event) => updateDraft('translationKey', event.target.value)}
              placeholder="例如 modern-workbench"
              value={draft.translationKey ?? ''}
            />
          </InspectorField>
          <InspectorField label="分类">
            <select onChange={(event) => updateDraft('category', event.target.value)} value={draft.category}>
              {categoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </InspectorField>
          <InspectorField
            hint={draft.source ? '已发布文章的地址已锁定，避免生成重复文章。' : '发布后地址不会自动重命名。'}
            label="Slug"
          >
            <input
              disabled={draft.source !== null}
              maxLength={100}
              onChange={(event) => updateDraft('slug', event.target.value.toLowerCase())}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="article-route"
              value={draft.slug}
            />
          </InspectorField>
          <InspectorField label="发布日期">
            <input onChange={(event) => updateDraft('publishDate', event.target.value)} type="date" value={draft.publishDate} />
          </InspectorField>

          <section className="seo-preview">
            <p className="eyebrow">SEARCH PREVIEW</p>
            <span>tangyingbao.com › {draft.locale} › blog</span>
            <strong>{draft.title || '文章标题'}</strong>
            <p>{draft.summary || '文章摘要会显示在这里。'}</p>
            <small>{draft.summary.length} / 360</small>
          </section>

          <section className="document-checks">
            <p className="eyebrow">PUBLISH CHECKS</p>
            {issues.length ? issues.map((issue) => <p className="issue" key={issue}><X />{issue}</p>) : <p className="passed"><Check />可以发布</p>}
          </section>

          <button className="delete-draft-button" disabled={busyAction === 'delete'} onClick={() => void deleteDraft()} type="button">
            <Trash2 />删除草稿
          </button>
        </aside>
      </div>

      {publishOpen ? (
        <PublishDrawer
          busy={busyAction === 'publish'}
          draft={draft}
          error={publishError}
          issues={issues}
          onClose={() => setPublishOpen(false)}
          onPublish={() => void publishDraft()}
          stats={stats}
          writesEnabled={writesEnabled}
        />
      ) : null}
    </div>
  )
}

function MarkdownToolbar({
  busy,
  fileInputRef,
  insertMarkdown,
  onUpload,
}: {
  busy: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  insertMarkdown: (before: string, after?: string, placeholder?: string) => void
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  const tools = [
    { label: '二级标题', icon: <Heading2 />, action: () => insertMarkdown('## ', '', '标题') },
    { label: '加粗', icon: <Bold />, action: () => insertMarkdown('**', '**') },
    { label: '斜体', icon: <Italic />, action: () => insertMarkdown('_', '_') },
    { label: '引用', icon: <Quote />, action: () => insertMarkdown('> ', '', '引用内容') },
    { label: '链接', icon: <Link2 />, action: () => insertMarkdown('[', '](https://)', '链接文字') },
    { label: '无序列表', icon: <List />, action: () => insertMarkdown('- ', '', '列表项') },
    { label: '有序列表', icon: <ListOrdered />, action: () => insertMarkdown('1. ', '', '列表项') },
    { label: '代码块', icon: <Code2 />, action: () => insertMarkdown('```\n', '\n```', 'code') },
    { label: '表格', icon: <Table2 />, action: () => insertMarkdown('| 列一 | 列二 |\n| --- | --- |\n| ', ' | 内容 |', '内容') },
  ]
  return (
    <div className="markdown-toolbar" role="toolbar" aria-label="Markdown 格式工具">
      {tools.map((tool) => (
        <button aria-label={tool.label} key={tool.label} onClick={tool.action} title={tool.label} type="button">
          {tool.icon}
        </button>
      ))}
      <span />
      <button
        aria-label="上传图片"
        disabled={busy}
        onClick={() => fileInputRef.current?.click()}
        title="上传图片"
        type="button"
      >
        {busy ? <LoaderCircle className="spin" /> : <ImagePlus />}
      </button>
      <input
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="visually-hidden"
        onChange={onUpload}
        ref={fileInputRef}
        type="file"
      />
    </div>
  )
}

function PublishDrawer({
  busy,
  draft,
  error,
  issues,
  onClose,
  onPublish,
  stats,
  writesEnabled,
}: {
  busy: boolean
  draft: Draft
  error: string
  issues: string[]
  onClose: () => void
  onPublish: () => void
  stats: ReturnType<typeof getMarkdownStats>
  writesEnabled: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    dialogRef.current?.focus()
    return () => previousFocus?.focus()
  }, [])

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    )
    if (!focusable.length) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="publish-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        aria-labelledby="publish-title"
        aria-modal="true"
        className="publish-drawer"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <div>
            <p className="eyebrow">READY TO PUBLISH?</p>
            <h2 id="publish-title">发布前检查</h2>
          </div>
          <button aria-label="关闭发布窗口" onClick={onClose} type="button"><X /></button>
        </header>
        <div className="publish-document">
          <span>{draft.locale === 'zh-cn' ? '中文' : 'English'} · {draft.category}</span>
          <h3>{draft.title || '无标题文章'}</h3>
          <p>/{draft.locale}/blog/{draft.slug || 'missing-slug'}</p>
        </div>
        <dl className="publish-facts">
          <div><dt>发布日期</dt><dd>{draft.publishDate}</dd></div>
          <div><dt>阅读时间</dt><dd>{stats.readingTimeMinutes} 分钟</dd></div>
          <div><dt>图片</dt><dd>{draft.assets.length} 张</dd></div>
          <div><dt>翻译关联</dt><dd>{draft.translationKey || '未设置'}</dd></div>
        </dl>
        <section className="publish-check-list">
          {issues.length ? issues.map((issue) => <p key={issue}><X />{issue}</p>) : (
            <>
              <p className="passed"><Check />必要字段已填写</p>
              <p className="passed"><Check />公开地址格式有效</p>
              <p className="passed"><Check />文章将在一次 Git 提交中发布</p>
            </>
          )}
        </section>
        {error ? <p className="publish-error" role="alert">{error}</p> : null}
        <footer>
          <p>发布后 Vercel 会自动开始部署，期间公开站点可能短暂显示旧版本。</p>
          <button onClick={onClose} type="button">继续编辑</button>
          <button disabled={busy || issues.length > 0 || !writesEnabled} onClick={onPublish} type="button">
            {busy ? <><LoaderCircle className="spin" />正在发布</> : <><Upload />确认发布</>}
          </button>
        </footer>
      </div>
    </div>
  )
}

function InspectorField({
  children,
  hint,
  label,
}: {
  children: React.ReactNode
  hint?: string
  label: string
}) {
  return (
    <label className="inspector-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button aria-label={label} aria-pressed={active} className={active ? 'active' : ''} onClick={onClick} title={label} type="button">
      {icon}
    </button>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  const labels: Record<SaveState, string> = {
    idle: '等待编辑',
    dirty: '有未保存更改',
    saving: '正在保存…',
    saved: '已保存',
    conflict: '版本冲突',
    error: '保存失败',
  }
  return (
    <span className={`save-indicator ${state}`}>
      {state === 'saving' ? <LoaderCircle className="spin" /> : state === 'saved' ? <Check /> : null}
      {labels[state]}
    </span>
  )
}

function getDraftIssues(draft: Draft | null) {
  if (!draft) return ['草稿尚未载入']
  return [
    !draft.title.trim() ? '请填写文章标题' : '',
    !draft.summary.trim() ? '请填写文章摘要' : '',
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug) ? 'Slug 只能包含小写字母、数字和连字符' : '',
    !draft.category ? '请选择文章分类' : '',
    !draft.publishDate ? '请选择发布日期' : '',
    !draft.body.trim() ? '正文不能为空' : '',
  ].filter(Boolean)
}

function createLocalDraft(): Draft {
  const now = new Date().toISOString()
  return {
    id: 'local-new',
    source: null,
    locale: 'zh-cn',
    slug: '',
    title: '',
    summary: '',
    category: 'thinking',
    publishDate: now.slice(0, 10),
    body: '# 开始写作\n\n',
    assets: [],
    status: 'draft',
    revision: '',
    updatedAt: now,
  }
}

function localStorageKey(id: string) {
  return `easy-web:admin-draft:${id}`
}

function readLocalRecovery(id: string): { draft: Partial<Draft>; savedAt: string } | null {
  try {
    const value = localStorage.getItem(localStorageKey(id))
    if (!value) return null
    const parsed = JSON.parse(value) as { draft?: Partial<Draft>; savedAt?: string }
    return parsed.draft && parsed.savedAt ? { draft: parsed.draft, savedAt: parsed.savedAt } : null
  } catch {
    return null
  }
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    return {} as T
  }
}

type ApiError = string | { message?: string }
