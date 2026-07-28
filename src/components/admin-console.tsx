'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import type { PostSummary } from '@/lib/content'
import type { FormEvent } from 'react'

type SessionState = {
  authenticated: boolean
  csrfToken: string
  writesEnabled: boolean
}

type EditorState = {
  locale: 'zh-cn' | 'en'
  slug: string
  title: string
  summary: string
  category: string
  date: string
  body: string
}

const emptyEditor = (): EditorState => ({
  locale: 'zh-cn',
  slug: '',
  title: '',
  summary: '',
  category: 'thinking',
  date: new Date().toISOString().slice(0, 10),
  body: '# 标题\n\n从这里开始写。',
})

export function AdminConsole({ posts }: { posts: PostSummary[] }) {
  const [session, setSession] = useState<SessionState>({
    authenticated: false,
    csrfToken: '',
    writesEnabled: false,
  })
  const [password, setPassword] = useState('')
  const [editor, setEditor] = useState<EditorState>(emptyEditor)
  const [selectedPost, setSelectedPost] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void fetch('/api/admin/session', { cache: 'no-store' })
      .then(async (response) => {
        if (!active) return
        if (!response.ok) {
          setSession({ authenticated: false, csrfToken: '', writesEnabled: false })
          return
        }
        setSession((await response.json()) as SessionState)
      })
      .catch(() => {
        if (active) {
          setSession({ authenticated: false, csrfToken: '', writesEnabled: false })
        }
      })
    return () => {
      active = false
    }
  }, [])

  async function login(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const result = (await response.json()) as SessionState & { error?: string }
      if (!response.ok) throw new Error(result.error ?? '登录失败。')
      setSession(result)
      setPassword('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '登录失败。')
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    if (!session?.csrfToken) return
    await fetch('/api/admin/session', {
      method: 'DELETE',
      headers: { 'x-csrf-token': session.csrfToken },
    })
    setSession({ authenticated: false, csrfToken: '', writesEnabled: false })
    setEditor(emptyEditor())
  }

  async function loadPost(value: string) {
    setSelectedPost(value)
    setMessage('')
    if (!value) {
      setEditor(emptyEditor())
      return
    }
    const [locale, slug] = value.split(':')
    setBusy(true)
    try {
      const response = await fetch(
        `/api/admin/content?locale=${encodeURIComponent(locale)}&slug=${encodeURIComponent(slug)}`,
        { cache: 'no-store' },
      )
      const result = (await response.json()) as { post?: EditorState; error?: string }
      if (!response.ok || !result.post) throw new Error(result.error ?? '读取文章失败。')
      setEditor(result.post)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '读取文章失败。')
    } finally {
      setBusy(false)
    }
  }

  async function publish(event: FormEvent) {
    event.preventDefault()
    if (!session?.csrfToken) return
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/admin/content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': session.csrfToken,
        },
        body: JSON.stringify(editor),
      })
      const result = (await response.json()) as { sha?: string; error?: string }
      if (!response.ok) throw new Error(result.error ?? '发布失败。')
      setMessage(`提交成功：${result.sha?.slice(0, 8)}。Vercel 将自动重新部署。`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '发布失败。')
    } finally {
      setBusy(false)
    }
  }

  async function removePost() {
    if (!session?.csrfToken || !editor.slug) return
    if (!window.confirm(`确定删除「${editor.title || editor.slug}」吗？此操作会生成可回滚的 Git 提交。`)) {
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/admin/content', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': session.csrfToken,
        },
        body: JSON.stringify({ locale: editor.locale, slug: editor.slug }),
      })
      const result = (await response.json()) as { sha?: string; error?: string }
      if (!response.ok) throw new Error(result.error ?? '删除失败。')
      setMessage(`删除提交成功：${result.sha?.slice(0, 8)}。`)
      setSelectedPost('')
      setEditor(emptyEditor())
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败。')
    } finally {
      setBusy(false)
    }
  }

  if (!session.authenticated) {
    return (
      <main className="admin-login">
        <section>
          <p className="eyebrow">PRIVATE / ADMIN</p>
          <h1>内容管理</h1>
          <p>Private Key 不会进入这个页面。登录后，所有发布操作都由服务器签发短期 GitHub Token。</p>
          <form onSubmit={login}>
            <label htmlFor="admin-password">管理密码</label>
            <input
              autoComplete="current-password"
              id="admin-password"
              maxLength={256}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <button disabled={busy} type="submit">{busy ? '验证中…' : '进入管理台'}</button>
          </form>
          {message ? <p className="admin-message error">{message}</p> : null}
          <Link href="/zh-cn">← 返回网站</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">GITHUB APP / CONTENT STUDIO</p>
          <h1>写作工作台</h1>
        </div>
        <div className="admin-header-actions">
          <Link href="/zh-cn" target="_blank">查看网站 ↗</Link>
          <button onClick={logout} type="button">退出</button>
        </div>
      </header>

      {!session.writesEnabled ? (
        <div className="admin-notice">
          当前环境为只读模式。部署到生产环境后，将 <code>ENABLE_CONTENT_WRITES</code> 设置为 <code>true</code> 才能发布。
        </div>
      ) : null}

      <div className="admin-workspace">
        <aside className="admin-sidebar">
          <label htmlFor="existing-post">打开已有文章</label>
          <select
            id="existing-post"
            onChange={(event) => void loadPost(event.target.value)}
            value={selectedPost}
          >
            <option value="">＋ 新建文章</option>
            {posts.map((post) => (
              <option key={`${post.locale}:${post.slug}`} value={`${post.locale}:${post.slug}`}>
                [{post.locale}] {post.title}
              </option>
            ))}
          </select>
          <p>{posts.length} 篇已发布文章</p>
        </aside>

        <form className="editor-form" onSubmit={publish}>
          <div className="editor-meta-grid">
            <label>
              语言
              <select
                onChange={(event) =>
                  setEditor((value) => ({ ...value, locale: event.target.value as 'zh-cn' | 'en' }))
                }
                value={editor.locale}
              >
                <option value="zh-cn">简体中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              分类
              <input
                onChange={(event) => setEditor((value) => ({ ...value, category: event.target.value }))}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
                value={editor.category}
              />
            </label>
            <label>
              Slug
              <input
                disabled={Boolean(selectedPost)}
                onChange={(event) => setEditor((value) => ({ ...value, slug: event.target.value }))}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
                value={editor.slug}
              />
            </label>
            <label>
              日期
              <input
                onChange={(event) => setEditor((value) => ({ ...value, date: event.target.value }))}
                required
                type="date"
                value={editor.date}
              />
            </label>
          </div>
          <label>
            标题
            <input
              maxLength={160}
              onChange={(event) => setEditor((value) => ({ ...value, title: event.target.value }))}
              required
              value={editor.title}
            />
          </label>
          <label>
            摘要
            <textarea
              className="summary-editor"
              maxLength={360}
              onChange={(event) => setEditor((value) => ({ ...value, summary: event.target.value }))}
              value={editor.summary}
            />
          </label>
          <label>
            Markdown 正文
            <textarea
              className="markdown-editor"
              maxLength={500_000}
              onChange={(event) => setEditor((value) => ({ ...value, body: event.target.value }))}
              required
              value={editor.body}
            />
          </label>
          <div className="editor-actions">
            <button disabled={busy || !session.writesEnabled} type="submit">
              {busy ? '提交中…' : '提交并发布'}
            </button>
            {selectedPost ? (
              <button
                className="danger-button"
                disabled={busy || !session.writesEnabled}
                onClick={() => void removePost()}
                type="button"
              >
                删除文章
              </button>
            ) : null}
          </div>
          {message ? <p className="admin-message">{message}</p> : null}
        </form>
      </div>
    </main>
  )
}
