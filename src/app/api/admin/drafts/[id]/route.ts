import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  draftIdSchema,
  draftUpdateSchema,
  getDraft,
  removeDraft,
  updateDraft,
} from '@/lib/admin-drafts'

import {
  apiError,
  handleApiError,
  readJson,
  requireAdmin,
  requireMutation,
} from '../_shared'

type RouteContext = { params: Promise<{ id: string }> }
const deleteSchema = z.object({ baseRevision: z.string().min(1).max(100) }).strict()

export async function GET(request: NextRequest, context: RouteContext) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const id = draftIdSchema.parse((await context.params).id)
    const draft = await getDraft(id)
    if (!draft) return apiError(404, 'DRAFT_NOT_FOUND', '草稿不存在。')
    return NextResponse.json({ data: draft })
  } catch (error) {
    return handleApiError(error, 'draft read')
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const denied = requireMutation(request, 'draft-update')
  if (denied) return denied
  try {
    const id = draftIdSchema.parse((await context.params).id)
    const input = draftUpdateSchema.parse(await readJson(request))
    return NextResponse.json({ data: await updateDraft(id, input) })
  } catch (error) {
    return handleApiError(error, 'draft update')
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const denied = requireMutation(request, 'draft-delete')
  if (denied) return denied
  try {
    const id = draftIdSchema.parse((await context.params).id)
    const input = deleteSchema.parse(await readJson(request))
    await removeDraft(id, input.baseRevision)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error, 'draft deletion')
  }
}
