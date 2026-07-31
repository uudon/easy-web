import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  createEmptyDraft,
  draftSourceSchema,
  listDrafts,
} from '@/lib/admin-drafts'
import { contentRepository } from '@/lib/content'

import {
  apiError,
  handleApiError,
  readJson,
  requireAdmin,
  requireMutation,
} from './_shared'

const createRequestSchema = z.union([z.object({}).strict(), draftSourceSchema])

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    return NextResponse.json({ data: await listDrafts() })
  } catch (error) {
    return handleApiError(error, 'draft list')
  }
}

export async function POST(request: NextRequest) {
  const denied = requireMutation(request, 'draft-create')
  if (denied) return denied
  try {
    const input = createRequestSchema.parse(await readJson(request))
    const existingDrafts = await listDrafts()
    if ('source' in input) {
      const sourcePost = contentRepository.getPost(input.source.locale, input.source.slug)
      if (!sourcePost) {
        return apiError(404, 'SOURCE_NOT_FOUND', '源文章不存在。')
      }
      const draft = await createEmptyDraft({ sourcePost, existingDrafts })
      return NextResponse.json({ data: draft }, { status: 201 })
    }
    const draft = await createEmptyDraft({ existingDrafts })
    return NextResponse.json({ data: draft }, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'draft creation')
  }
}
