'use client'

import { ArrowUpRight, Copy, Edit3, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ConfirmationDialog } from './confirmation-dialog'
import { readError } from './admin-studio'
import { adminDraftRecoveryKey } from '@/lib/admin-draft-recovery'
import { filterAndSortPosts, type AdminPost } from '@/lib/admin-posts'
import { categoryLabel, formatDate } from '@/lib/format'
import type { Draft } from '@/lib/admin-drafts'
import type { PostSummary } from '@/lib/content'

export function AdminPostsView({
  csrfToken,
  drafts,
  onDraftDeleted,
  posts,
  writesEnabled,
}: {
  csrfToken: string
  drafts: Draft[]
  onDraftDeleted?: (id: string) => void
  posts: PostSummary[]
  writesEnabled: boolean
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [locale, setLocale] = useState<'all' | 'zh-cn' | 'en'>('all')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState<'all' | 'draft' | 'published'>('all')
  const [sort, setSort] = useState<'updatedAt' | 'publishDate' | 'title'>('updatedAt')
  const [busyKey, setBusyKey] = useState('')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success')
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<{
    post: AdminPost
    revision?: string
    confirmationText: string
  } | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const categories = useMemo(
    () => [...new Set([...posts.map((post) => post.category), ...drafts.map((draft) => draft.category)])].sort(),
    [drafts, posts],
  )

  const rows = useMemo<AdminPost[]>(() => {
    const publishedRows: AdminPost[] = posts.map((post) => ({
      title: post.title,
      slug: post.slug,
      locale: post.locale,
      category: post.category,
      status: 'published',
      publishDate: post.date,
      updatedAt: `${post.date}T00:00:00.000Z`,
    }))
    const draftRows: AdminPost[] = drafts.map((draft) => ({
      id: draft.id,
      title: draft.title || '无标题草稿',
      slug: draft.slug,
      locale: draft.locale,
      category: draft.category,
      status: 'draft',
      publishDate: draft.publishDate,
      updatedAt: draft.updatedAt,
    }))
    return filterAndSortPosts([...publishedRows, ...draftRows], {
      search,
      locale,
      category,
      status,
      sort,
    }).filter((post) => !hiddenKeys.includes(post.id ?? `${post.locale}:${post.slug}`))
  }, [category, drafts, hiddenKeys, locale, posts, search, sort, status])

  async function copyPublicLink(post: AdminPost) {
    if (!post.slug) {
      setMessageTone('error')
      setMessage('当前文章还没有可复制的公开地址。')
      return
    }
    const url = new URL(`/${post.locale}/blog/${post.slug}`, window.location.origin).toString()
    try {
      await navigator.clipboard.writeText(url)
      setMessageTone('success')
      setMessage('公开链接已复制。')
    } catch {
      setMessageTone('success')
      setMessage(`公开链接：${url}`)
    }
  }

  async function prepareDelete(post: AdminPost) {
    const key = post.id ?? `${post.locale}:${post.slug}`
    setBusyKey(key)
    setMessage('')
    setDeleteError('')
    try {
      if (post.status === 'draft' && post.id) {
        const response = await fetch(`/api/admin/drafts/${encodeURIComponent(post.id)}`, {
          cache: 'no-store',
        })
        const result = (await response.json().catch(() => ({}))) as {
          data?: Draft
          error?: string | { message?: string }
        }
        if (!response.ok || !result.data) {
          throw new Error(readError(result.error, '无法读取最新草稿，请重试。'))
        }
        const latestPost = {
          ...post,
          title: result.data.title || '无标题草稿',
          slug: result.data.slug,
          locale: result.data.locale,
          category: result.data.category,
          publishDate: result.data.publishDate,
          updatedAt: result.data.updatedAt,
        }
        setDeleteTarget({
          post: latestPost,
          revision: result.data.revision,
          confirmationText: result.data.title.trim() || 'DELETE',
        })
      } else {
        setDeleteTarget({ post, confirmationText: post.title })
      }
    } catch (error) {
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : '无法准备删除操作。')
    } finally {
      setBusyKey('')
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const { post, revision } = deleteTarget
    const key = post.id ?? `${post.locale}:${post.slug}`
    setBusyKey(key)
    setMessage('')
    setDeleteError('')
    try {
      let response: Response
      if (post.status === 'draft') {
        if (!post.id || !revision) throw new Error('草稿版本信息缺失，请关闭窗口后重试。')
        response = await fetch(`/api/admin/drafts/${encodeURIComponent(post.id)}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({ baseRevision: revision }),
        })
      } else {
        response = await fetch(`/api/admin/posts/${encodeURIComponent(post.locale)}/${encodeURIComponent(post.slug)}`, {
              method: 'DELETE',
              headers: { 'x-csrf-token': csrfToken },
            })
      }
      const result = (await response.json().catch(() => ({}))) as {
        data?: { sha?: string }
        error?: string | { message?: string }
      }
      if (response.status === 409) {
        setDeleteTarget(null)
        setMessageTone('error')
        setMessage('草稿已在其他页面更新。请重新点击删除，确认最新版本后再操作。')
        return
      }
      if (!response.ok) {
        throw new Error(readError(result.error, '删除文章失败。'))
      }
      setHiddenKeys((current) => [...current, key])
      if (post.status === 'draft' && post.id) {
        localStorage.removeItem(adminDraftRecoveryKey(post.id))
        onDraftDeleted?.(post.id)
      }
      setDeleteTarget(null)
      setMessageTone('success')
      setMessage(
        post.status === 'draft'
          ? '草稿已删除。'
          : `文章已删除${result.data?.sha ? ` · ${result.data.sha.slice(0, 8)}` : ''}。`,
      )
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '删除文章失败。')
    } finally {
      setBusyKey('')
    }
  }

  async function editPost(post: AdminPost) {
    if (post.status === 'draft' && post.id) {
      router.push(`/admin/editor/${post.id}`)
      return
    }
    if (!writesEnabled) {
      setMessageTone('error')
      setMessage('只读环境无法创建编辑草稿。')
      return
    }
    const key = `${post.locale}:${post.slug}`
    setBusyKey(key)
    setMessage('')
    try {
      const response = await fetch('/api/admin/drafts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ source: { locale: post.locale, slug: post.slug } }),
      })
      const result = (await response.json()) as {
        data?: Draft
        error?: string | { message?: string }
      }
      if (!response.ok || !result.data) {
        throw new Error(readError(result.error, '无法创建文章草稿。'))
      }
      router.push(`/admin/editor/${result.data.id}`)
    } catch (error) {
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : '无法创建文章草稿。')
    } finally {
      setBusyKey('')
    }
  }

  return (
    <div className="studio-page posts-page">
      <header className="studio-page-header compact">
        <div>
          <p className="eyebrow">CONTENT LIBRARY</p>
          <h1>全部文章</h1>
          <p>{posts.length} 篇已发布文章，{drafts.length} 篇草稿。</p>
        </div>
        <button className="studio-primary-action" onClick={() => router.push('/admin/editor/new')} type="button">
          新建文章
        </button>
      </header>

      <section aria-label="文章筛选" className="content-filters">
        <label className="content-search">
          <Search />
          <span className="sr-only">搜索文章</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索标题或 slug…"
            type="search"
            value={search}
          />
        </label>
        <select aria-label="语言" onChange={(event) => setLocale(event.target.value as typeof locale)} value={locale}>
          <option value="all">所有语言</option>
          <option value="zh-cn">中文</option>
          <option value="en">English</option>
        </select>
        <select aria-label="状态" onChange={(event) => setStatus(event.target.value as typeof status)} value={status}>
          <option value="all">所有状态</option>
          <option value="published">已发布</option>
          <option value="draft">草稿</option>
        </select>
        <select aria-label="分类" onChange={(event) => setCategory(event.target.value)} value={category}>
          <option value="all">所有分类</option>
          {categories.map((value) => <option key={value} value={value}>{categoryLabel(value, 'zh-cn')}</option>)}
        </select>
        <select aria-label="排序" onChange={(event) => setSort(event.target.value as typeof sort)} value={sort}>
          <option value="updatedAt">最近更新</option>
          <option value="publishDate">发布日期</option>
          <option value="title">标题</option>
        </select>
      </section>

      {message ? (
        <p className={`admin-message ${messageTone}`} role={messageTone === 'error' ? 'alert' : 'status'}>
          {message}
        </p>
      ) : null}

      <div className="content-table" role="table" aria-label="文章列表">
        <div className="content-table-head" role="row">
          <span role="columnheader">文章</span>
          <span role="columnheader">状态</span>
          <span role="columnheader">分类</span>
          <span role="columnheader">日期</span>
          <span aria-label="操作" role="columnheader" />
        </div>
        {rows.map((post) => {
          const key = post.id ?? `${post.locale}:${post.slug}`
          return (
            <article className="content-table-row" key={key} role="row">
              <div className="content-title-cell" role="cell">
                <span>{post.locale === 'zh-cn' ? '中' : 'EN'}</span>
                <div>
                  <strong>{post.title}</strong>
                  <small>/{post.locale}/blog/{post.slug || 'untitled'}</small>
                </div>
              </div>
              <div role="cell">
                <span className={`status-pill ${post.status}`}>
                  {post.status === 'draft' ? '草稿' : '已发布'}
                </span>
              </div>
              <span role="cell">{categoryLabel(post.category, 'zh-cn')}</span>
              <time dateTime={post.publishDate} role="cell">{formatDate(post.publishDate, post.locale)}</time>
              <div className="content-row-actions" role="cell">
                <button
                  aria-label={`编辑 ${post.title}`}
                  disabled={busyKey === key}
                  onClick={() => void editPost(post)}
                  type="button"
                >
                  <Edit3 />
                </button>
                {post.slug ? (
                  <button
                    aria-label={`复制 ${post.title} 的公开链接`}
                    disabled={busyKey === key}
                    onClick={() => void copyPublicLink(post)}
                    type="button"
                  >
                    <Copy />
                  </button>
                ) : null}
                {post.status === 'published' ? (
                  <a
                    aria-label={`查看 ${post.title}`}
                    href={`/${post.locale}/blog/${post.slug}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ArrowUpRight />
                  </a>
                ) : null}
                <button
                  aria-label={`删除 ${post.title}`}
                  disabled={busyKey === key}
                  onClick={() => void prepareDelete(post)}
                  type="button"
                >
                  <Trash2 />
                </button>
              </div>
            </article>
          )
        })}
        {!rows.length ? <div className="content-table-empty">没有符合筛选条件的文章。</div> : null}
      </div>
      {deleteTarget ? (
        <ConfirmationDialog
          busy={busyKey !== ''}
          confirmationText={deleteTarget.confirmationText}
          description={
            deleteTarget.post.status === 'draft'
              ? '草稿和暂存图片会从草稿分支移除。此操作不会影响已经发布的文章。'
              : '文章会从公开站点移除，但仍可通过 Git 历史恢复。'
          }
          error={deleteError}
          itemLabel={deleteTarget.post.title}
          onCancel={() => {
            setDeleteError('')
            setDeleteTarget(null)
          }}
          onConfirm={() => void confirmDelete()}
          title={deleteTarget.post.status === 'draft' ? '确认删除草稿' : '确认删除文章'}
        />
      ) : null}
    </div>
  )
}
