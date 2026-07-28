import crypto from 'node:crypto'

export const adminSessionCookie = 'shixing_admin_session'
export const csrfCookie = 'shixing_csrf'

type AdminSession = {
  role: 'admin'
  issuedAt: number
  expiresAt: number
  nonce: string
}

export function createAdminSession({
  secret,
  now = unixTime(),
  ttlSeconds = 60 * 60 * 12,
}: {
  secret: string
  now?: number
  ttlSeconds?: number
}) {
  assertSecret(secret)
  const payload: AdminSession = {
    role: 'admin',
    issuedAt: now,
    expiresAt: now + ttlSeconds,
    nonce: crypto.randomBytes(16).toString('base64url'),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${sign(encoded, secret)}`
}

export function readAdminSession({
  token,
  secret,
  now = unixTime(),
}: {
  token?: string
  secret: string
  now?: number
}): AdminSession | null {
  try {
    assertSecret(secret)
    const [encoded, suppliedSignature, ...remainder] = String(token ?? '').split('.')
    if (!encoded || !suppliedSignature || remainder.length > 0) return null
    if (!safeEqual(suppliedSignature, sign(encoded, secret))) return null

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<AdminSession>
    if (
      payload.role !== 'admin' ||
      !Number.isInteger(payload.issuedAt) ||
      !Number.isInteger(payload.expiresAt) ||
      !payload.nonce ||
      (payload.issuedAt as number) > now + 60 ||
      (payload.expiresAt as number) <= now
    ) {
      return null
    }

    return { ...payload } as AdminSession
  } catch {
    return null
  }
}

export function verifyAdminPasswordHash({
  password,
  encodedHash,
}: {
  password: string
  encodedHash?: string
}) {
  try {
    const [algorithm, salt, expected, ...remainder] = String(encodedHash ?? '').split('$')
    if (algorithm !== 'scrypt' || !salt || !expected || remainder.length > 0) return false
    const actual = crypto.scryptSync(password, salt, 64).toString('base64url')
    return safeEqual(actual, expected)
  } catch {
    return false
  }
}

export function createCsrfToken() {
  return crypto.randomBytes(24).toString('base64url')
}

export function verifyCsrf(cookieToken?: string, headerToken?: string) {
  return Boolean(cookieToken && headerToken && safeEqual(cookieToken, headerToken))
}

function sign(value: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function assertSecret(secret: string) {
  if (secret.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET must contain at least 32 characters.')
  }
}

function unixTime() {
  return Math.floor(Date.now() / 1000)
}
