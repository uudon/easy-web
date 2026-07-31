import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { contentRepository } from '@/lib/content'
import { deleteContent } from '@/lib/github-app'

import {
  apiError,
  handleApiError,
  requireMutation,
} from '../../../drafts/_shared'

type RouteContext = { params: Promise<{ locale: string; slug: string }> }
const paramsSchema = z.object({
  locale: z.enum(['zh-cn', 'en']),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})

export async function DELETE(request: NextRequest, context: RouteContext) {
  const denied = requireMutation(request, 'post-delete')
  if (denied) return denied
  try {
    const input = paramsSchema.parse(await context.params)
    if (!contentRepository.getPost(input.locale, input.slug)) {
      return apiError(404, 'POST_NOT_FOUND', '文章不存在。')
    }
    const result = await deleteContent(input)
    return NextResponse.json({ data: result })
  } catch (error) {
    return handleApiError(error, 'post deletion')
  }
}
