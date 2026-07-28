import type { Locale } from '@/lib/content'

import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

export function SiteShell({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  return (
    <div className="site-frame">
      <SiteHeader locale={locale} />
      {children}
      <SiteFooter locale={locale} />
    </div>
  )
}
