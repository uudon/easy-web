import crypto from 'node:crypto'

import type { DraftAsset } from './admin-drafts'

export const maxDraftAssetBytes = 5 * 1024 * 1024

type AssetInput = {
  name: string
  type: string
  size: number
  bytes: Uint8Array
}

const definitions = {
  jpg: {
    mimeType: 'image/jpeg' as const,
    matches: (bytes: Uint8Array) =>
      bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  png: {
    mimeType: 'image/png' as const,
    matches: (bytes: Uint8Array) =>
      bytes.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (value, index) => bytes[index] === value,
      ),
  },
  webp: {
    mimeType: 'image/webp' as const,
    matches: (bytes: Uint8Array) =>
      bytes.length >= 12 &&
      Buffer.from(bytes.slice(0, 4)).toString('ascii') === 'RIFF' &&
      Buffer.from(bytes.slice(8, 12)).toString('ascii') === 'WEBP',
  },
}

export function validateDraftAsset(input: AssetInput) {
  if (
    !input.name ||
    input.name.includes('/') ||
    input.name.includes('\\') ||
    input.name.includes('..') ||
    input.name.length > 255 ||
    /[\u0000-\u001f\u007f]/.test(input.name) ||
    input.size <= 0 ||
    input.size !== input.bytes.byteLength ||
    input.size > maxDraftAssetBytes
  ) {
    throw new Error('Invalid image upload.')
  }
  const nameParts = input.name.toLocaleLowerCase().split('.')
  if (nameParts.length !== 2 || !nameParts[0]) throw new Error('Invalid image filename.')
  const declaredExtension = nameParts[1]
  const extension = declaredExtension === 'jpeg' ? 'jpg' : declaredExtension
  const definition = definitions[extension as keyof typeof definitions]
  if (!definition || input.type !== definition.mimeType || !definition.matches(input.bytes)) {
    throw new Error('Image type validation failed.')
  }
  return {
    extension: extension as 'jpg' | 'png' | 'webp',
    mimeType: definition.mimeType,
  }
}

export function createDraftAsset({
  draftId,
  originalName,
  alt,
  extension,
  mimeType,
  size,
  now = new Date(),
}: {
  draftId: string
  originalName: string
  alt: string
  extension: 'jpg' | 'png' | 'webp'
  mimeType: DraftAsset['mimeType']
  size: number
  now?: Date
}): DraftAsset {
  const id = crypto.randomUUID().replaceAll('-', '')
  const year = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const filename = `${id}.${extension}`
  return {
    id,
    name: originalName,
    path: `content/draft-assets/${draftId}/${filename}`,
    publicPath: `/uploads/${year}/${month}/${filename}`,
    mimeType,
    size,
    alt: alt.trim(),
  }
}
