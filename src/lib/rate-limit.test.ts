import { describe, expect, it } from 'vitest'

import { checkRateLimit } from './rate-limit'

describe('rate limiting', () => {
  it('allows requests up to the limit and resets after the window', () => {
    const key = `test-${Math.random()}`
    expect(checkRateLimit({ key, limit: 2, windowMs: 1000, now: 100 }).allowed).toBe(true)
    expect(checkRateLimit({ key, limit: 2, windowMs: 1000, now: 200 }).allowed).toBe(true)
    expect(checkRateLimit({ key, limit: 2, windowMs: 1000, now: 300 }).allowed).toBe(false)
    expect(checkRateLimit({ key, limit: 2, windowMs: 1000, now: 1200 }).allowed).toBe(true)
  })
})
