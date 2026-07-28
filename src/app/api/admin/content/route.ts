import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { isAdminRequest, isValidAdminMutation } from '@/lib/admin-request'
import { contentRepository, isLocale } from '@/lib/content'
import { contentWriteSchema } from '@/lib/content-write'
import { deleteContent, publishContent } from '@/lib/github-app'
import { checkRateLimit } from '@/lib/rate-limit'

const deleteSchema = contentWriteSchema.pick({ locale: true, slug: true })

export function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: '请先登录。' }, { status: 401 })
  }
  const locale = request.nextUrl.searchParams.get('locale') ?? ''
  const slug = request.nextUrl.searchParams.get('slug') ?? ''
  if (!isLocale(locale) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json({ error: '文章路径无效。' }, { status: 400 })
  }
  const post = contentRepository.getPost(locale, slug)
  if (!post) return NextResponse.json({ error: '文章不存在。' }, { status: 404 })
  return NextResponse.json({ post })
}

export async function POST(request: NextRequest) {
  return mutate(request, async (body) => {
    const input = contentWriteSchema.parse(body)
    const result = await publishContent(input)
    return { ok: true, ...result }
  })
}

export async function DELETE(request: NextRequest) {
  return mutate(request, async (body) => {
    const input = deleteSchema.parse(body)
    const result = await deleteContent(input)
    return { ok: true, ...result }
  })
}

async function mutate(
  request: NextRequest,
  operation: (body: unknown) => Promise<Record<string, unknown>>,
) {
  if (!isValidAdminMutation(request)) {
    return NextResponse.json({ error: '管理会话或安全令牌无效。' }, { status: 403 })
  }
  const rateLimit = checkRateLimit({
    key: `admin-content:${request.cookies.get('shixing_admin_session')?.value.slice(-20) ?? 'unknown'}`,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: '操作过于频繁，请稍后再试。' }, { status: 429 })
  }

  try {
    return NextResponse.json(await operation(await request.json()))
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '文章内容或路径不符合要求。' }, { status: 400 })
    }
    console.error('Admin content operation failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : 'Unknown failure',
    })
    return NextResponse.json(
      { error: '发布失败，请检查 GitHub App 和部署环境配置。' },
      { status: 502 },
    )
  }
}
