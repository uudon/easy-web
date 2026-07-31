import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import {
  novelInputSchema,
  novelSlugSchema,
  removeNovel,
  updateNovel,
} from '@/lib/admin-novels'

import {
  handleApiError,
  readJson,
  requireMutation,
} from '../../drafts/_shared'

type RouteContext = { params: Promise<{ slug: string }> }

export async function PUT(request: NextRequest, context: RouteContext) {
  const denied = requireMutation(request, 'novel-update')
  if (denied) return denied
  try {
    const slug = novelSlugSchema.parse((await context.params).slug)
    const input = novelInputSchema.parse(await readJson(request))
    return NextResponse.json({ data: await updateNovel(slug, input) })
  } catch (error) {
    return handleApiError(error, 'novel update')
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const denied = requireMutation(request, 'novel-delete')
  if (denied) return denied
  try {
    const slug = novelSlugSchema.parse((await context.params).slug)
    await removeNovel(slug)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error, 'novel deletion')
  }
}
