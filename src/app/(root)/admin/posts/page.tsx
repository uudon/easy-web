import type { Metadata } from 'next'

import { AdminStudio } from '@/components/admin/admin-studio'
import { contentRepository } from '@/lib/content'

export const metadata: Metadata = {
  title: '全部文章 · 写作工作台',
  robots: { index: false, follow: false },
}

export default function AdminPostsPage() {
  return <AdminStudio posts={contentRepository.getPosts()} view="posts" />
}
