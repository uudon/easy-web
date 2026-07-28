import crypto from 'node:crypto'

const allowedContentPath =
  /^content\/(?:posts|pages)\/(?:zh-cn|en)\/[a-z0-9][a-z0-9/-]*\.md$/

export function createSessionToken({ secret, now = currentUnixTime(), ttlSeconds = 60 * 60 * 12 }) {
  assertSessionSecret(secret)
  const payload = {
    role: 'admin',
    issuedAt: now,
    expiresAt: now + ttlSeconds,
    nonce: crypto.randomBytes(16).toString('base64url'),
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(encodedPayload, secret)
  return `${encodedPayload}.${signature}`
}

export function parseSessionToken({ token, secret, now = currentUnixTime() }) {
  try {
    assertSessionSecret(secret)
    const [encodedPayload, suppliedSignature, ...remainder] = String(token ?? '').split('.')
    if (!encodedPayload || !suppliedSignature || remainder.length > 0) return null

    const expectedSignature = sign(encodedPayload, secret)
    if (!safeEqual(suppliedSignature, expectedSignature)) return null

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    if (
      payload?.role !== 'admin' ||
      !Number.isInteger(payload.issuedAt) ||
      !Number.isInteger(payload.expiresAt) ||
      payload.issuedAt > now + 60 ||
      payload.expiresAt <= now
    ) {
      return null
    }

    return { ...payload }
  } catch {
    return null
  }
}

export function verifyCsrfToken({ cookieToken, headerToken }) {
  if (!cookieToken || !headerToken) return false
  return safeEqual(cookieToken, headerToken)
}

export function validateContentPath(contentPath) {
  if (typeof contentPath !== 'string' || contentPath.includes('..') || contentPath.includes('\\')) {
    return false
  }
  return allowedContentPath.test(contentPath)
}

export function createCsrfToken() {
  return crypto.randomBytes(24).toString('base64url')
}

export function verifyPasswordHash({ password, encodedHash }) {
  try {
    const [algorithm, salt, expected] = String(encodedHash ?? '').split('$')
    if (algorithm !== 'scrypt' || !salt || !expected) return false
    const derived = crypto.scryptSync(password, salt, 64).toString('base64url')
    return safeEqual(derived, expected)
  } catch {
    return false
  }
}

export function createPasswordHash(password) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('Admin passwords must contain at least 12 characters.')
  }
  const salt = crypto.randomBytes(16).toString('base64url')
  const derived = crypto.scryptSync(password, salt, 64).toString('base64url')
  return `scrypt$${salt}$${derived}`
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url')
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function assertSessionSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET must contain at least 32 characters.')
  }
}

function currentUnixTime() {
  return Math.floor(Date.now() / 1000)
}
