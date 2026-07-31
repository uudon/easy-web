import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { draftIdSchema, publishDraft } from '@/lib/admin-drafts'

import {
  handleApiError,
  readJson,
  requireMutation,
} from '../../_shared'

type RouteContext = { params: Promise<{ id: string }> }
const publishSchema = z.object({ baseRevision: z.string().min(1).max(100) }).strict()

export async function POST(request: NextRequest, context: RouteContext) {
  const denied = requireMutation(request, 'draft-publish')
  if (denied) return denied
  try {
    const id = draftIdSchema.parse((await context.params).id)
    const input = publishSchema.parse(await readJson(request))
    return NextResponse.json({ data: await publishDraft(id, input.baseRevision) })
  } catch (error) {
    return handleApiError(error, 'draft publication')
  }
}
