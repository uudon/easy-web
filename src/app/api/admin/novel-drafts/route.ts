import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  createChapterDraft,
  listChapterDrafts,
  novelSlugSchema,
} from '@/lib/admin-novels'
import { novelRepository } from '@/lib/novels'

import {
  apiError,
  handleApiError,
  readJson,
  requireAdmin,
  requireMutation,
} from '../drafts/_shared'

const createSchema = z.object({
  novelSlug: novelSlugSchema,
  chapterSlug: novelSlugSchema.optional(),
}).strict()

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    return NextResponse.json({ data: await listChapterDrafts() })
  } catch (error) {
    return handleApiError(error, 'novel draft list')
  }
}

export async function POST(request: NextRequest) {
  const denied = requireMutation(request, 'novel-draft-create')
  if (denied) return denied
  try {
    const input = createSchema.parse(await readJson(request))
    const sourceChapter = input.chapterSlug
      ? novelRepository.getChapter(input.novelSlug, input.chapterSlug)
      : undefined
    if (input.chapterSlug && !sourceChapter) {
      return apiError(404, 'NOVEL_CHAPTER_NOT_FOUND', '章节不存在。')
    }
    return NextResponse.json(
      { data: await createChapterDraft(input.novelSlug, sourceChapter ?? undefined) },
      { status: 201 },
    )
  } catch (error) {
    return handleApiError(error, 'novel draft creation')
  }
}
