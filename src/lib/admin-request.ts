import type { NextRequest } from 'next/server'

import {
  adminSessionCookie,
  csrfCookie,
  readAdminSession,
  verifyCsrf,
} from './admin-auth'

export function isAdminRequest(request: NextRequest) {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) return false
  const token = request.cookies.get(adminSessionCookie)?.value
  return Boolean(readAdminSession({ token, secret }))
}

export function isValidAdminMutation(request: NextRequest) {
  if (!isAdminRequest(request)) return false
  return verifyCsrf(
    request.cookies.get(csrfCookie)?.value,
    request.headers.get('x-csrf-token') ?? undefined,
  )
}
