import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  DraftConflictError,
  DraftIdentityError,
  DraftNotFoundError,
} from '@/lib/admin-drafts'
import {
  NovelChapterConflictError,
  NovelNotFoundError,
} from '@/lib/admin-novels'
import { isAdminRequest, isValidAdminMutation } from '@/lib/admin-request'
import { DraftRevisionError } from '@/lib/github-app'
import { checkRateLimit } from '@/lib/rate-limit'

export function requireAdmin(request: NextRequest) {
  if (isAdminRequest(request)) return null
  return apiError(401, 'UNAUTHORIZED', '请先登录。')
}

export function requireMutation(request: NextRequest, action: string) {
  if (!isValidAdminMutation(request)) {
    return apiError(403, 'INVALID_CSRF', '管理会话或安全令牌无效。')
  }
  if (process.env.ENABLE_CONTENT_WRITES !== 'true') {
    return apiError(403, 'READ_ONLY', '当前环境为只读模式，无法执行写入操作。')
  }
  const session = request.cookies.get('shixing_admin_session')?.value ?? 'unknown'
  const result = checkRateLimit({
    key: `admin:${action}:${session.slice(-20)}`,
    limit: action === 'asset' ? 20 : 60,
    windowMs: 60 * 60 * 1000,
  })
  if (!result.allowed) {
    return apiError(429, 'RATE_LIMITED', '操作过于频繁，请稍后再试。')
  }
  return null
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return NextResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status },
  )
}

export function handleApiError(error: unknown, operation: string) {
  if (error instanceof z.ZodError) {
    return apiError(
      400,
      'VALIDATION_ERROR',
      '提交的数据不符合要求。',
      error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }
  if (error instanceof DraftNotFoundError) {
    return apiError(404, 'DRAFT_NOT_FOUND', '草稿不存在。')
  }
  if (error instanceof DraftConflictError) {
    return apiError(409, 'REVISION_CONFLICT', '草稿已被其他页面更新。', {
      current: error.current,
    })
  }
  if (error instanceof DraftIdentityError) {
    return apiError(
      409,
      'SOURCE_IDENTITY_LOCKED',
      '已发布文章的语言和 Slug 不能直接修改，以免生成重复文章。',
    )
  }
  if (error instanceof NovelNotFoundError) {
    return apiError(404, 'NOVEL_NOT_FOUND', error.message)
  }
  if (error instanceof NovelChapterConflictError) {
    return apiError(409, 'NOVEL_CONFLICT', error.message, {
      ...(error.current ? { current: error.current } : {}),
    })
  }
  if (error instanceof DraftRevisionError) {
    return apiError(
      409,
      'REVISION_CONFLICT',
      '内容已被其他页面更新，请刷新后重试。',
    )
  }
  console.error(`Admin ${operation} failed`, {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : 'Unknown error',
  })
  return apiError(502, 'UPSTREAM_ERROR', '操作失败，请稍后重试。')
}

export async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new z.ZodError([
      {
        code: 'custom',
        path: [],
        message: '请求必须包含有效 JSON。',
        input: undefined,
      },
    ])
  }
}
