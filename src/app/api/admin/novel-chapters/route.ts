import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { novelRepository } from '@/lib/novels'

import {
  handleApiError,
  requireAdmin,
} from '../drafts/_shared'

const querySchema = z.object({
  novelSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const input = querySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    )
    return NextResponse.json({ data: novelRepository.getChapters(input.novelSlug) })
  } catch (error) {
    return handleApiError(error, 'novel chapter list')
  }
}
