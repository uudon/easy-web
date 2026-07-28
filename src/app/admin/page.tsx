import type { Metadata } from 'next'

import { AdminConsole } from '@/components/admin-console'
import { contentRepository } from '@/lib/content'

export const metadata: Metadata = {
  title: '内容管理',
  robots: { index: false, follow: false },
}

export default function AdminPage() {
  return <AdminConsole posts={contentRepository.getPosts()} />
}
