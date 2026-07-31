import { generateKeyPairSync } from 'node:crypto'
import { importPKCS8 } from 'jose'
import { describe, expect, it } from 'vitest'

import { normalizeGitHubPrivateKey } from './github-app'

describe('GitHub App private key normalization', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

  it('converts GitHub PKCS#1 RSA keys to PKCS#8 for jose', async () => {
    const pkcs1 = privateKey.export({ format: 'pem', type: 'pkcs1' }).toString()
    const normalized = normalizeGitHubPrivateKey(pkcs1)

    expect(normalized).toContain('-----BEGIN PRIVATE KEY-----')
    await expect(importPKCS8(normalized, 'RS256')).resolves.toBeDefined()
  })

  it('accepts PKCS#8 keys whose newlines are escaped in environment variables', async () => {
    const pkcs8 = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
    const escaped = pkcs8.replaceAll('\n', '\\n')
    const normalized = normalizeGitHubPrivateKey(escaped)

    await expect(importPKCS8(normalized, 'RS256')).resolves.toBeDefined()
  })
})
