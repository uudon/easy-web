type RateLimitEntry = {
  count: number
  resetAt: number
}

const entries = new Map<string, RateLimitEntry>()

export function checkRateLimit({
  key,
  limit,
  windowMs,
  now = Date.now(),
}: {
  key: string
  limit: number
  windowMs: number
  now?: number
}) {
  const current = entries.get(key)
  if (!current || current.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs }
  }

  const next = { ...current, count: current.count + 1 }
  entries.set(key, next)
  return {
    allowed: next.count <= limit,
    remaining: Math.max(0, limit - next.count),
    resetAt: next.resetAt,
  }
}
