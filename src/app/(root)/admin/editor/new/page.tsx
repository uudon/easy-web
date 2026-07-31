import type { Metadata } from 'next'

import { AdminStudio } from '@/components/admin/admin-studio'
import { contentRepository } from '@/lib/content'

export const metadata: Metadata = {
  title: '新建文章 · 写作工作台',
  robots: { index: false, follow: false },
}

export default function NewAdminDraftPage() {
  return <AdminStudio draftId="new" posts={contentRepository.getPosts()} view="editor" />
}
