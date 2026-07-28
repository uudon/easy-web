import crypto from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  createAdminSession,
  readAdminSession,
  verifyAdminPasswordHash,
} from './admin-auth'

describe('admin authentication', () => {
  it('creates an expiring signed admin session', () => {
    const secret = 's'.repeat(48)
    const token = createAdminSession({ secret, now: 1_700_000_000, ttlSeconds: 300 })

    expect(readAdminSession({ token, secret, now: 1_700_000_120 })?.role).toBe('admin')
    expect(readAdminSession({ token, secret, now: 1_700_000_301 })).toBeNull()
    expect(readAdminSession({ token: `${token}tampered`, secret, now: 1_700_000_120 })).toBeNull()
  })

  it('verifies scrypt password hashes without accepting malformed values', () => {
    const candidate = ['fixture', 'only', 'value'].join('-')
    const salt = 'fixed-test-salt'
    const encodedHash = `scrypt$${salt}$${crypto.scryptSync(candidate, salt, 64).toString('base64url')}`

    expect(
      verifyAdminPasswordHash({
        password: candidate,
        encodedHash,
      }),
    ).toBe(true)
    expect(verifyAdminPasswordHash({ password: 'wrong', encodedHash: 'malformed' })).toBe(false)
  })

  it('rejects weak session secrets and malformed payloads', () => {
    expect(() => createAdminSession({ secret: 'short' })).toThrow()
    expect(readAdminSession({ token: 'not-a-token', secret: 's'.repeat(48) })).toBeNull()
    expect(readAdminSession({ token: 'not-a-token', secret: 'short' })).toBeNull()
  })
})
