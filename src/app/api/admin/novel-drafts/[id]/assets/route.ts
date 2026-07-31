import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  createDraftAsset,
  maxDraftAssetBytes,
  validateDraftAsset,
} from '@/lib/admin-assets'
import {
  novelDraftIdSchema,
  saveNovelChapterDraftAsset,
} from '@/lib/admin-novels'

import {
  apiError,
  handleApiError,
  requireMutation,
} from '../../../drafts/_shared'

type RouteContext = { params: Promise<{ id: string }> }
const multipartOverheadAllowance = 128 * 1024
const metadataSchema = z.object({
  alt: z.string().trim().min(1).max(300),
  baseRevision: z.string().min(1).max(100),
})

export async function POST(request: NextRequest, context: RouteContext) {
  const denied = requireMutation(request, 'asset')
  if (denied) return denied
  const contentLength = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(contentLength) &&
    contentLength > maxDraftAssetBytes + multipartOverheadAllowance
  ) {
    return apiError(413, 'FILE_TOO_LARGE', '图片不能超过 5 MiB。')
  }

  try {
    const id = novelDraftIdSchema.parse((await context.params).id)
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return apiError(400, 'FILE_REQUIRED', '请选择图片文件。')
    }
    const metadata = metadataSchema.parse({
      alt: form.get('alt'),
      baseRevision: form.get('baseRevision'),
    })
    if (file.size > maxDraftAssetBytes) {
      return apiError(413, 'FILE_TOO_LARGE', '图片不能超过 5 MiB。')
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const validated = validateDraftAsset({
      name: file.name,
      type: file.type,
      size: file.size,
      bytes,
    })
    const asset = createDraftAsset({
      draftId: id,
      originalName: file.name,
      alt: metadata.alt,
      extension: validated.extension,
      mimeType: validated.mimeType,
      size: file.size,
    })
    const draft = await saveNovelChapterDraftAsset(
      id,
      metadata.baseRevision,
      asset,
      bytes,
    )
    return NextResponse.json({ data: { draft, asset } }, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'novel asset upload')
  }
}
