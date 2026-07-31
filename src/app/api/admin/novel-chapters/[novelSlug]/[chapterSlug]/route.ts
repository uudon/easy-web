import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { deleteChapter } from '@/lib/admin-novels'

import {
  handleApiError,
  requireMutation,
} from '../../../drafts/_shared'

type RouteContext = {
  params: Promise<{ novelSlug: string; chapterSlug: string }>
}
const paramsSchema = z.object({
  novelSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  chapterSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})

export async function DELETE(request: NextRequest, context: RouteContext) {
  const denied = requireMutation(request, 'novel-chapter-delete')
  if (denied) return denied
  try {
    const input = paramsSchema.parse(await context.params)
    await deleteChapter(input.novelSlug, input.chapterSlug)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error, 'novel chapter deletion')
  }
}
