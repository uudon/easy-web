'use client'

import {
  BookOpen,
  ExternalLink,
  FilePlus2,
  Files,
  LayoutDashboard,
  LogOut,
  PenLine,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { AdminEditor } from './editor'
import { AdminOverview } from './overview'
import { AdminPostsView } from './posts-view'
import type { Draft } from '@/lib/admin-drafts'
import type { PostSummary } from '@/lib/content'
import type { FormEvent, ReactNode } from 'react'

type SessionState = {
  authenticated: boolean
  csrfToken: string
  writesEnabled: boolean
}

type AdminView = 'overview' | 'posts' | 'editor'

const signedOutSession: SessionState = {
  authenticated: false,
  csrfToken: '',
  writesEnabled: false,
}

export function AdminStudio({
  posts,
  view,
  draftId,
}: {
  posts: PostSummary[]
  view: AdminView
  draftId?: string
}) {
  const [session, setSession] = useState<SessionState | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void fetch('/api/admin/session', { cache: 'no-store' })
      .then(async (response) => {
        if (!active) return
        setSession(response.ok ? ((await response.json()) as SessionState) : signedOutSession)
      })
      .catch(() => {
        if (active) setSession(signedOutSession)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!session?.authenticated) return
    void fetch('/api/admin/drafts', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return
        const result = (await response.json()) as { data?: Draft[] }
        setDrafts(result.data ?? [])
      })
      .catch(() => undefined)
  }, [session?.authenticated])

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
      const result = (await response.json()) as SessionState & {
        error?: string | { message?: string }
      }
      if (!response.ok) throw new Error(readError(result.error, '登录失败。'))
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
    setSession(signedOutSession)
    setDrafts([])
  }

  if (!session) {
    return <main className="admin-loading">正在准备写作工作台…</main>
  }

  if (!session.authenticated) {
    return (
      <main className="admin-login">
        <section className="admin-login-card">
          <div className="admin-login-mark" aria-hidden="true">施</div>
          <p className="eyebrow">PRIVATE EDITORIAL DESK</p>
          <h1>回到你的<br />写作现场。</h1>
          <p>文章、草稿与发布记录都留在你的仓库中。管理密钥只在服务器端使用。</p>
          <form onSubmit={login}>
            <label htmlFor="admin-password">管理密码</label>
            <input
              autoComplete="current-password"
              id="admin-password"
              maxLength={256}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入管理密码"
              required
              type="password"
              value={password}
            />
            <button disabled={busy} type="submit">
              {busy ? '验证中…' : '进入写作工作台'}
            </button>
          </form>
          {message ? <p className="admin-message error" role="alert">{message}</p> : null}
          <Link href="/zh-cn">返回博客首页</Link>
        </section>
      </main>
    )
  }

  return (
    <div className="studio-shell">
      <aside className="studio-navigation">
        <Link className="studio-brand" href="/admin">
          <span>施</span>
          <span>Editorial<br />Studio</span>
        </Link>
        <nav aria-label="工作台导航">
          <NavigationLink active={view === 'overview'} href="/admin" icon={<LayoutDashboard />}>
            概览
          </NavigationLink>
          <NavigationLink active={view === 'posts'} href="/admin/posts" icon={<Files />}>
            全部文章
          </NavigationLink>
          <NavigationLink
            active={view === 'editor' && draftId !== 'new'}
            href={drafts[0] ? `/admin/editor/${drafts[0].id}` : '/admin/editor/new'}
            icon={<PenLine />}
          >
            草稿
            {drafts.length ? <span className="nav-count">{drafts.length}</span> : null}
          </NavigationLink>
          <NavigationLink
            active={view === 'editor' && draftId === 'new'}
            href="/admin/editor/new"
            icon={<FilePlus2 />}
          >
            新建文章
          </NavigationLink>
        </nav>
        <button
          aria-label="退出登录"
          className="studio-mobile-logout"
          onClick={() => void logout()}
          type="button"
        >
          <LogOut />
          <span>退出</span>
        </button>
        <div className="studio-navigation-footer">
          <a href="/zh-cn" rel="noreferrer" target="_blank">
            <BookOpen />查看网站<ExternalLink />
          </a>
          <button onClick={() => void logout()} type="button">
            <LogOut />退出登录
          </button>
        </div>
      </aside>

      <main className={`studio-main studio-main-${view}`}>
        {!session.writesEnabled ? (
          <div className="studio-readonly" role="status">
            当前环境为只读模式。你仍可浏览和预览内容，发布与云保存已暂停。
          </div>
        ) : null}
        {view === 'overview' ? (
          <AdminOverview drafts={drafts} posts={posts} />
        ) : null}
        {view === 'posts' ? (
          <AdminPostsView
            csrfToken={session.csrfToken}
            drafts={drafts}
            posts={posts}
            writesEnabled={session.writesEnabled}
          />
        ) : null}
        {view === 'editor' ? (
          <AdminEditor
            csrfToken={session.csrfToken}
            draftId={draftId ?? 'new'}
            writesEnabled={session.writesEnabled}
          />
        ) : null}
      </main>
    </div>
  )
}

function NavigationLink({
  active,
  children,
  href,
  icon,
}: {
  active: boolean
  children: ReactNode
  href: string
  icon: ReactNode
}) {
  return (
    <Link aria-current={active ? 'page' : undefined} className={active ? 'active' : ''} href={href}>
      {icon}
      <span>{children}</span>
    </Link>
  )
}

export function useAdminPosts(posts: PostSummary[], drafts: Draft[]) {
  return useMemo(
    () => ({
      published: posts,
      chineseCount: posts.filter((post) => post.locale === 'zh-cn').length,
      englishCount: posts.filter((post) => post.locale === 'en').length,
      draftCount: drafts.length,
    }),
    [drafts, posts],
  )
}

export function readError(
  error: string | { message?: string } | undefined,
  fallback: string,
) {
  if (typeof error === 'string') return error
  return error?.message ?? fallback
}
