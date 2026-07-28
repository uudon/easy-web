import Link from 'next/link'

import type { Locale } from '@/lib/content'

const labels = {
  'zh-cn': {
    journal: '施行 / 日记',
    home: '首页',
    writing: '文章',
    about: '关于',
    language: 'EN',
  },
  en: {
    journal: 'SHIXING / JOURNAL',
    home: 'Home',
    writing: 'Writing',
    about: 'About',
    language: '中文',
  },
} as const

export function SiteHeader({ locale }: { locale: Locale }) {
  const copy = labels[locale]
  const alternateLocale = locale === 'zh-cn' ? 'en' : 'zh-cn'

  return (
    <header className="site-header">
      <Link className="wordmark" href={`/${locale}`}>
        <span className="wordmark-mark" aria-hidden="true">行</span>
        <span>{copy.journal}</span>
      </Link>
      <nav aria-label="Primary navigation">
        <Link href={`/${locale}`}>{copy.home}</Link>
        <Link href={`/${locale}/blog`}>{copy.writing}</Link>
        <Link href={`/${locale}/about`}>{copy.about}</Link>
        <Link className="language-link" href={`/${alternateLocale}`}>
          {copy.language}
        </Link>
      </nav>
    </header>
  )
}
