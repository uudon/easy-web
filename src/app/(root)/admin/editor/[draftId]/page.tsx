import type { Metadata } from 'next'

import { AdminStudio } from '@/components/admin/admin-studio'
import { contentRepository } from '@/lib/content'

export const metadata: Metadata = {
  title: '编辑文章 · 写作工作台',
  robots: { index: false, follow: false },
}

export default async function AdminDraftPage({
  params,
}: {
  params: Promise<{ draftId: string }>
}) {
  const { draftId } = await params
  return <AdminStudio draftId={draftId} posts={contentRepository.getPosts()} view="editor" />
}
