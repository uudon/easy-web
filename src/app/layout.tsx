import type { Metadata } from 'next'

import './globals.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tangyingbao.com'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: '施行的个人日记',
    template: '%s · 施行的个人日记',
  },
  description: '围绕 AI、编程、算法、架构、项目管理和思考持续记录。',
  applicationName: '施行的个人日记',
  authors: [{ name: '施行' }],
  creator: '施行',
  alternates: {
    canonical: '/',
    languages: {
      'zh-CN': '/zh-cn',
      'en-US': '/en',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    siteName: '施行的个人日记',
    title: '施行的个人日记',
    description: '相信我，我的内容值得你停留。',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
