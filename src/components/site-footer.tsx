import Link from 'next/link'

import type { Locale } from '@/lib/content'

export function SiteFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="site-footer">
      <div>
        <p className="footer-statement">
          {locale === 'zh-cn'
            ? '相信我，我的内容值得你停留。'
            : 'Believe me, the content is worth staying for.'}
        </p>
        <p className="footer-meta">© {new Date().getFullYear()} SHIXING</p>
      </div>
      <div className="footer-links">
        <Link href={`/${locale}/blog`}>{locale === 'zh-cn' ? '全部文章' : 'All writing'}</Link>
        <Link href="/rss.xml">RSS</Link>
        <Link href="/admin">Admin</Link>
      </div>
    </footer>
  )
}
