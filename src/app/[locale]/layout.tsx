import type { Metadata } from 'next'

import { siteMetadata } from '@/lib/site-metadata'

import '../globals.css'

export const metadata: Metadata = siteMetadata

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params

  return (
    <html data-scroll-behavior="smooth" lang={locale === 'en' ? 'en' : 'zh-CN'}>
      <body>{children}</body>
    </html>
  )
}
