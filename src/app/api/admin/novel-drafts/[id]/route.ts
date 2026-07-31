import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  chapterDraftUpdateSchema,
  getChapterDraft,
  novelDraftIdSchema,
  removeChapterDraft,
  updateChapterDraft,
} from '@/lib/admin-novels'

import {
  apiError,
  handleApiError,
  readJson,
  requireAdmin,
  requireMutation,
} from '../../drafts/_shared'

type RouteContext = { params: Promise<{ id: string }> }
const deleteSchema = z.object({ baseRevision: z.string().min(1).max(100) }).strict()

export async function GET(request: NextRequest, context: RouteContext) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const id = novelDraftIdSchema.parse((await context.params).id)
    const draft = await getChapterDraft(id)
    if (!draft) return apiError(404, 'NOVEL_DRAFT_NOT_FOUND', '章节草稿不存在。')
    return NextResponse.json({ data: draft })
  } catch (error) {
    return handleApiError(error, 'novel draft read')
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const denied = requireMutation(request, 'novel-draft-update')
  if (denied) return denied
  try {
    const id = novelDraftIdSchema.parse((await context.params).id)
    const input = chapterDraftUpdateSchema.parse(await readJson(request))
    return NextResponse.json({ data: await updateChapterDraft(id, input) })
  } catch (error) {
    return handleApiError(error, 'novel draft update')
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const denied = requireMutation(request, 'novel-draft-delete')
  if (denied) return denied
  try {
    const id = novelDraftIdSchema.parse((await context.params).id)
    const input = deleteSchema.parse(await readJson(request))
    await removeChapterDraft(id, input.baseRevision)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error, 'novel draft deletion')
  }
}
