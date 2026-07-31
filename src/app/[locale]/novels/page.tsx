import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { NovelCard } from '@/components/novel-card'
import { SiteShell } from '@/components/site-shell'
import { novelRepository } from '@/lib/novels'

type NovelShelfPageProps = {
  params: Promise<{ locale: string }>
}

export const metadata: Metadata = {
  title: '连载小说',
  description: '施行创作的中文连载小说，按章节持续更新。',
  alternates: { canonical: '/zh-cn/novels' },
  openGraph: {
    title: '连载小说',
    description: '施行创作的中文连载小说，按章节持续更新。',
    locale: 'zh_CN',
  },
}

export default async function NovelShelfPage({ params }: NovelShelfPageProps) {
  const { locale } = await params
  if (locale !== 'zh-cn') notFound()
  const novels = novelRepository.getNovels()

  return (
    <SiteShell locale="zh-cn">
      <main className="novel-shelf-page">
        <header className="novel-shelf-header">
          <p className="eyebrow">FICTION / {String(novels.length).padStart(2, '0')}</p>
          <h1>连载小说</h1>
          <p>故事在章节之间慢慢展开。这里与文章彼此独立，适合从第一页开始，也适合回来接着读。</p>
        </header>

        {novels.length > 0 ? (
          <section aria-label="小说书架" className="novel-shelf">
            {novels.map((novel) => <NovelCard key={novel.slug} novel={novel} />)}
          </section>
        ) : (
          <section className="novel-empty-state">
            <span aria-hidden="true">未</span>
            <div>
              <h2>小说会在这里陆续出现</h2>
              <p>第一部故事正在准备中。等它写好开头，就会从这里开始连载。</p>
            </div>
          </section>
        )}
      </main>
    </SiteShell>
  )
}
