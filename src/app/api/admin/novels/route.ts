import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { createNovel, listNovels, novelInputSchema } from '@/lib/admin-novels'

import {
  handleApiError,
  readJson,
  requireAdmin,
  requireMutation,
} from '../drafts/_shared'

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    return NextResponse.json({ data: await listNovels() })
  } catch (error) {
    return handleApiError(error, 'novel list')
  }
}

export async function POST(request: NextRequest) {
  const denied = requireMutation(request, 'novel-create')
  if (denied) return denied
  try {
    const input = novelInputSchema.parse(await readJson(request))
    return NextResponse.json({ data: await createNovel(input) }, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'novel creation')
  }
}
