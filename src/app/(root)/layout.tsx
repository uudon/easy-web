import type { Metadata } from 'next'

import { siteMetadata } from '@/lib/site-metadata'

import '../globals.css'

export const metadata: Metadata = siteMetadata

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
