import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="status-page">
      <p className="eyebrow">404 / LOST NOTE</p>
      <h1>这一页还没有写下。</h1>
      <p>链接可能已经调整，也可能这篇记录仍在路上。</p>
      <Link className="button-link" href="/zh-cn">
        回到首页
      </Link>
    </main>
  )
}
