import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createSessionToken,
  parseSessionToken,
  validateContentPath,
  verifyCsrfToken,
} from '../scripts/lib/security.mjs'

test('session tokens are signed, expire and reject tampering', () => {
  const secret = 'a'.repeat(48)
  const now = 1_700_000_000
  const token = createSessionToken({ secret, now, ttlSeconds: 3600 })

  assert.equal(parseSessionToken({ token, secret, now: now + 60 })?.role, 'admin')
  assert.equal(parseSessionToken({ token: `${token}x`, secret, now: now + 60 }), null)
  assert.equal(parseSessionToken({ token, secret, now: now + 3601 }), null)
})

test('CSRF verification requires matching cookie and header values', () => {
  assert.equal(verifyCsrfToken({ cookieToken: 'same-token', headerToken: 'same-token' }), true)
  assert.equal(verifyCsrfToken({ cookieToken: 'same-token', headerToken: 'different-token' }), false)
  assert.equal(verifyCsrfToken({ cookieToken: '', headerToken: '' }), false)
})

test('content writes are restricted to route-safe markdown and config paths', () => {
  assert.equal(validateContentPath('content/posts/zh-cn/my-post.md'), true)
  assert.equal(validateContentPath('content/pages/en/about.md'), true)
  assert.equal(validateContentPath('../.env'), false)
  assert.equal(validateContentPath('src/app/page.tsx'), false)
  assert.equal(validateContentPath('content/posts/zh-cn/../../.env'), false)
})
