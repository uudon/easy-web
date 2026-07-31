import { ArrowRight, FileText, Languages, PenLine } from 'lucide-react'
import Link from 'next/link'

import { useAdminPosts } from './admin-studio'
import { formatDate } from '@/lib/format'
import type { Draft } from '@/lib/admin-drafts'
import type { PostSummary } from '@/lib/content'

export function AdminOverview({ drafts, posts }: { drafts: Draft[]; posts: PostSummary[] }) {
  const stats = useAdminPosts(posts, drafts)
  const recentPosts = posts.slice(0, 5)
  const recentDrafts = [...drafts]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 4)
  const pairedSlugs = new Set(
    posts
      .filter((post) => posts.some((candidate) => candidate.slug === post.slug && candidate.locale !== post.locale))
      .map((post) => post.slug),
  )
  const untranslatedCount = posts.filter((post) => !pairedSlugs.has(post.slug)).length

  return (
    <div className="studio-page">
      <header className="studio-page-header">
        <div>
          <p className="eyebrow">EDITORIAL OVERVIEW</p>
          <h1>今天，写点什么？</h1>
          <p>管理文章、继续草稿，或者从一个空白页面开始。</p>
        </div>
        <Link className="studio-primary-action" href="/admin/editor/new">
          <PenLine />开始写作
        </Link>
      </header>

      <section aria-label="内容概览" className="studio-stat-strip">
        <Stat icon={<FileText />} label="已发布" value={stats.published.length} />
        <Stat icon={<PenLine />} label="进行中的草稿" value={stats.draftCount} />
        <Stat icon={<Languages />} label="中文 / English" value={`${stats.chineseCount} / ${stats.englishCount}`} />
        <Stat label="待补充翻译" value={untranslatedCount} />
      </section>

      <div className="studio-overview-grid">
        <section className="studio-section">
          <div className="studio-section-heading">
            <div>
              <p className="eyebrow">RECENTLY PUBLISHED</p>
              <h2>最近文章</h2>
            </div>
            <Link href="/admin/posts">查看全部 <ArrowRight /></Link>
          </div>
          <div className="editorial-list">
            {recentPosts.map((post, index) => (
              <article key={`${post.locale}:${post.slug}`}>
                <span className="editorial-index">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <p>{post.locale === 'zh-cn' ? '中文' : 'EN'} · {post.category}</p>
                  <h3>{post.title}</h3>
                </div>
                <time dateTime={post.date}>{formatDate(post.date, post.locale)}</time>
              </article>
            ))}
          </div>
        </section>

        <section className="studio-section studio-draft-panel">
          <div className="studio-section-heading">
            <div>
              <p className="eyebrow">IN PROGRESS</p>
              <h2>继续写作</h2>
            </div>
          </div>
          {recentDrafts.length ? (
            <div className="draft-stack">
              {recentDrafts.map((draft) => (
                <Link href={`/admin/editor/${draft.id}`} key={draft.id}>
                  <span>{draft.locale === 'zh-cn' ? '中文草稿' : 'English draft'}</span>
                  <strong>{draft.title || '无标题草稿'}</strong>
                  <small>{new Date(draft.updatedAt).toLocaleString('zh-CN')}</small>
                  <ArrowRight />
                </Link>
              ))}
            </div>
          ) : (
            <div className="studio-empty-state">
              <PenLine />
              <p>还没有云草稿。</p>
              <Link href="/admin/editor/new">创建第一篇草稿</Link>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="studio-stat">
      <div>{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}
