import type { Metadata } from 'next'

import { AdminStudio } from '@/components/admin/admin-studio'
import { contentRepository } from '@/lib/content'

export const metadata: Metadata = {
  title: '小说管理 · 写作工作台',
  robots: { index: false, follow: false },
}

export default function AdminNovelsPage() {
  return <AdminStudio posts={contentRepository.getPosts()} view="novels" />
}
