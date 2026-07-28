import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  adminSessionCookie,
  createAdminSession,
  createCsrfToken,
  csrfCookie,
  verifyAdminPasswordHash,
} from '@/lib/admin-auth'
import { isAdminRequest, isValidAdminMutation } from '@/lib/admin-request'
import { checkRateLimit } from '@/lib/rate-limit'

const loginSchema = z.object({
  password: z.string().min(1).max(256),
})

export function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  const existingCsrfToken = request.cookies.get(csrfCookie)?.value
  const csrfToken = existingCsrfToken ?? createCsrfToken()
  const response = NextResponse.json({
    authenticated: true,
    csrfToken,
    writesEnabled: process.env.ENABLE_CONTENT_WRITES === 'true',
  })
  if (!existingCsrfToken) {
    response.cookies.set(csrfCookie, csrfToken, cookieOptions(false))
  }
  return response
}

export async function POST(request: NextRequest) {
  const clientAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rateLimit = checkRateLimit({
    key: `admin-login:${clientAddress}`,
    limit: 8,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: '登录尝试过多，请稍后再试。' }, { status: 429 })
  }

  const sessionSecret = process.env.ADMIN_SESSION_SECRET
  const passwordHash = process.env.ADMIN_PASSWORD_HASH
  if (!sessionSecret || !passwordHash) {
    return NextResponse.json({ error: '管理后台尚未配置。' }, { status: 503 })
  }

  let input: z.infer<typeof loginSchema>
  try {
    input = loginSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: '请输入有效密码。' }, { status: 400 })
  }

  if (!verifyAdminPasswordHash({ password: input.password, encodedHash: passwordHash })) {
    return NextResponse.json({ error: '密码不正确。' }, { status: 401 })
  }

  const csrfToken = createCsrfToken()
  const response = NextResponse.json({
    authenticated: true,
    csrfToken,
    writesEnabled: process.env.ENABLE_CONTENT_WRITES === 'true',
  })
  response.cookies.set(
    adminSessionCookie,
    createAdminSession({ secret: sessionSecret }),
    cookieOptions(true),
  )
  response.cookies.set(csrfCookie, csrfToken, cookieOptions(true))
  return response
}

export function DELETE(request: NextRequest) {
  if (!isValidAdminMutation(request)) {
    return NextResponse.json({ error: '无效的管理会话。' }, { status: 403 })
  }
  const response = NextResponse.json({ authenticated: false })
  response.cookies.set(adminSessionCookie, '', { ...cookieOptions(true), maxAge: 0 })
  response.cookies.set(csrfCookie, '', { ...cookieOptions(true), maxAge: 0 })
  return response
}

function cookieOptions(httpOnly: boolean) {
  return {
    httpOnly,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 60 * 60 * 12,
  }
}
