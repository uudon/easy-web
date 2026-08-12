import { generateKeyPairSync } from 'node:crypto'
import { importPKCS8 } from 'jose'
import { describe, expect, it } from 'vitest'

import {
  isPublishedNovelChapterPath,
  normalizeGitHubPrivateKey,
  parseRepositoryJson,
} from './github-app'

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

describe('repository JSON parsing', () => {
  it('fails closed instead of replacing a damaged novel index with an empty one', () => {
    expect(() => parseRepositoryJson('{bad-json', 'content/novels/index.json')).toThrow(
      'Repository JSON is invalid: content/novels/index.json',
    )
    expect(
      parseRepositoryJson<{ title: string }>(
        '{"title":"纸月亮"}',
        'content/novels/index.json',
      ),
    ).toEqual({ title: '纸月亮' })
  })
})

describe('published novel chapter paths', () => {
  it('excludes a novel description from chapter enumeration', () => {
    expect(isPublishedNovelChapterPath('content/novels/paper-moon/chapter-01.md')).toBe(true)
    expect(isPublishedNovelChapterPath('content/novels/paper-moon/description.md')).toBe(false)
  })
})
