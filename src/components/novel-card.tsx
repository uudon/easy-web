import Link from 'next/link'

import type { NovelSummary } from '@/lib/novels'

export function NovelCard({ novel }: { novel: NovelSummary }) {
  return (
    <article className="novel-card">
      <Link
        aria-label={`阅读《${novel.title}》`}
        className="novel-cover"
        href={`/zh-cn/novels/${novel.slug}`}
      >
        {novel.cover ? (
          // Covers can be served locally or from an author-configured image host.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={`《${novel.title}》封面`} loading="lazy" src={novel.cover} />
        ) : (
          <span aria-hidden="true">{novel.title}</span>
        )}
      </Link>
      <div className="novel-card-copy">
        <p className="novel-meta">
          <span>{novel.genre}</span>
          <span>{novel.status}</span>
        </p>
        <h2>
          <Link href={`/zh-cn/novels/${novel.slug}`}>{novel.title}</Link>
        </h2>
        <p>{novel.summary}</p>
        <footer>
          <span>{novel.chapterCount} 章</span>
          <time dateTime={novel.updatedAt}>更新于 {novel.updatedAt}</time>
        </footer>
      </div>
    </article>
  )
}
