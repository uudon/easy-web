import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { listDrafts } from '@/lib/admin-drafts'
import {
  filterAndSortPosts,
  mergeAdminPosts,
} from '@/lib/admin-posts'
import { contentRepository } from '@/lib/content'

import {
  handleApiError,
  requireAdmin,
} from '../drafts/_shared'

const querySchema = z.object({
  search: z.string().trim().max(160).optional(),
  locale: z.enum(['all', 'zh-cn', 'en']).optional(),
  category: z
    .string()
    .regex(/^(?:all|[a-z0-9]+(?:-[a-z0-9]+)*)$/)
    .optional(),
  status: z.enum(['all', 'published', 'draft']).optional(),
  sort: z.enum(['updatedAt', 'publishDate', 'title']).optional(),
})

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const input = querySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    )
    const posts = mergeAdminPosts(contentRepository.getPosts(), await listDrafts())
    return NextResponse.json({ data: filterAndSortPosts(posts, input) })
  } catch (error) {
    return handleApiError(error, 'post list')
  }
}
