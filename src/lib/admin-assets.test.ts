import { describe, expect, it } from 'vitest'

import { validateDraftAsset } from './admin-assets'

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
])
const webpBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
])

describe('draft image validation', () => {
  it.each([
    ['cover.jpg', 'image/jpeg', jpegBytes, { extension: 'jpg', mimeType: 'image/jpeg' }],
    ['cover.JPEG', 'image/jpeg', jpegBytes, { extension: 'jpg', mimeType: 'image/jpeg' }],
    ['diagram.png', 'image/png', pngBytes, { extension: 'png', mimeType: 'image/png' }],
    ['hero.webp', 'image/webp', webpBytes, { extension: 'webp', mimeType: 'image/webp' }],
  ])('accepts a valid %s file', (name, type, bytes, expected) => {
    expect(
      validateDraftAsset({
        name,
        type,
        size: bytes.byteLength,
        bytes,
      }),
    ).toEqual(expected)
  })

  it.each([
    ['cover.png', 'image/jpeg', jpegBytes, 'extension and MIME mismatch'],
    ['cover.jpg', 'image/png', jpegBytes, 'declared MIME mismatch'],
    ['cover.jpg', 'image/jpeg', pngBytes, 'magic-byte mismatch'],
    ['cover.gif', 'image/gif', new Uint8Array([0x47, 0x49, 0x46, 0x38]), 'unsupported type'],
    ['../cover.jpg', 'image/jpeg', jpegBytes, 'path traversal name'],
    ['cover.jpg.exe', 'image/jpeg', jpegBytes, 'double extension'],
  ])('rejects %s (%s)', (name, type, bytes) => {
    expect(() =>
      validateDraftAsset({
        name,
        type,
        size: bytes.byteLength,
        bytes,
      }),
    ).toThrow()
  })

  it('rejects files larger than 5 MiB', () => {
    expect(() =>
      validateDraftAsset({
        name: 'large.jpg',
        type: 'image/jpeg',
        size: 5 * 1024 * 1024 + 1,
        bytes: jpegBytes,
      }),
    ).toThrow()
  })

  it('rejects empty and truncated files even when metadata looks valid', () => {
    expect(() =>
      validateDraftAsset({
        name: 'empty.png',
        type: 'image/png',
        size: 0,
        bytes: new Uint8Array(),
      }),
    ).toThrow()

    expect(() =>
      validateDraftAsset({
        name: 'truncated.webp',
        type: 'image/webp',
        size: 4,
        bytes: webpBytes.slice(0, 4),
      }),
    ).toThrow()
  })
})
