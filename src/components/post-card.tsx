import Link from 'next/link'

import type { PostSummary } from '@/lib/content'
import { categoryLabel, formatDate } from '@/lib/format'

export function PostCard({ post, index }: { post: PostSummary; index?: number }) {
  return (
    <article className="post-card">
      {typeof index === 'number' ? (
        <span className="post-number" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
      ) : null}
      <div className="post-card-body">
        <div className="post-meta">
          <span>{categoryLabel(post.category, post.locale)}</span>
          <time dateTime={post.date}>{formatDate(post.date, post.locale)}</time>
        </div>
        <h2>
          <Link href={`/${post.locale}/blog/${post.slug}`}>{post.title}</Link>
        </h2>
        {post.summary ? <p>{post.summary}</p> : null}
      </div>
      <span className="post-arrow" aria-hidden="true">↗</span>
    </article>
  )
}
