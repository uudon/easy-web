import { describe, expect, it } from 'vitest'

import {
  createDraft,
  draftCreateSchema,
  hasRevisionConflict,
  hasSourceIdentityChange,
} from './admin-drafts'

const validDraftInput = {
  source: null,
  locale: 'zh-cn' as const,
  slug: 'modern-writing-workbench',
  title: '现代博客写作工作台',
  summary: '一套更适合中英文博客作者的写作和发布流程。',
  category: 'ai',
  publishDate: '2026-07-30',
  body: '# 写作工作台\n\n正文内容',
}

describe('draft creation', () => {
  it('accepts a safe draft payload and creates a stable draft record', () => {
    const input = draftCreateSchema.parse(validDraftInput)

    const draft = createDraft(input, {
      id: 'draft_01K1ED2M5PCQ5SW8FQH6C01Z1K',
      now: '2026-07-30T08:30:00.000Z',
      revision: 'revision-1',
    })

    expect(draft).toEqual({
      ...validDraftInput,
      id: 'draft_01K1ED2M5PCQ5SW8FQH6C01Z1K',
      assets: [],
      status: 'draft',
      revision: 'revision-1',
      updatedAt: '2026-07-30T08:30:00.000Z',
    })
  })

  it.each([
    [{ ...validDraftInput, locale: 'fr' }, 'unsupported locale'],
    [{ ...validDraftInput, slug: '../secrets' }, 'path traversal slug'],
    [{ ...validDraftInput, category: 'ai/../../secret' }, 'path traversal category'],
    [{ ...validDraftInput, title: '<script>alert(1)</script>' }, 'unsafe title'],
    [{ ...validDraftInput, publishDate: '2026-02-30' }, 'impossible date'],
    [{ ...validDraftInput, body: '' }, 'empty body'],
    [{ ...validDraftInput, summary: 'x'.repeat(361) }, 'oversized summary'],
    [{ ...validDraftInput, status: 'published' }, 'client-controlled status'],
    [{ ...validDraftInput, revision: 'forged' }, 'client-controlled revision'],
  ])('rejects %s (%s)', (payload, label) => {
    expect(label).toBeTruthy()
    expect(() => draftCreateSchema.parse(payload)).toThrow()
  })

  it('accepts a source article and an optional translation key', () => {
    const input = draftCreateSchema.parse({
      ...validDraftInput,
      source: { locale: 'en', slug: 'existing-post' },
      translationKey: 'existing-post',
    })

    expect(input.source).toEqual({ locale: 'en', slug: 'existing-post' })
    expect(input.translationKey).toBe('existing-post')
  })
})

describe('draft revision conflicts', () => {
  it('does not report a conflict when the base revision is current', () => {
    expect(hasRevisionConflict('revision-3', 'revision-3')).toBe(false)
  })

  it('reports a conflict when another editor has saved a newer revision', () => {
    expect(hasRevisionConflict('revision-2', 'revision-3')).toBe(true)
  })

  it('treats a missing base revision as a conflict for an existing draft', () => {
    expect(hasRevisionConflict(undefined, 'revision-1')).toBe(true)
  })

  it('does not report a conflict when neither side has a revision', () => {
    expect(hasRevisionConflict(undefined, undefined)).toBe(false)
  })
})

describe('published source identity', () => {
  it('blocks changing the slug of a draft created from a published article', () => {
    expect(
      hasSourceIdentityChange(
        { locale: 'zh-cn', slug: 'existing-post' },
        { slug: 'renamed-post' },
      ),
    ).toBe(true)
  })

  it('blocks changing the locale of a draft created from a published article', () => {
    expect(
      hasSourceIdentityChange(
        { locale: 'zh-cn', slug: 'existing-post' },
        { locale: 'en' },
      ),
    ).toBe(true)
  })

  it('allows ordinary edits and keeps new drafts unrestricted', () => {
    expect(
      hasSourceIdentityChange(
        { locale: 'zh-cn', slug: 'existing-post' },
        {},
      ),
    ).toBe(false)
    expect(hasSourceIdentityChange(null, { slug: 'new-post', locale: 'en' })).toBe(false)
  })
})
