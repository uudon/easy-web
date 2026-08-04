import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildContentRecord,
  migrateContent,
  normalizeContentSlug,
} from '../scripts/lib/content-migration.mjs'

test('normalizeContentSlug creates stable route-safe slugs', () => {
  assert.equal(normalizeContentSlug('Karpathy-Inspired_Claude Code Guidelines'), 'karpathy-inspired-claude-code-guidelines')
})

test('buildContentRecord classifies topic articles and preserves their old route', () => {
  const record = buildContentRecord({
    relativePath: 'docs/zh-cn/topics/ai/build-your-ai-workflow.md',
    content: '# 构建你的 AI 工作流\n\n从真实任务开始。',
    modifiedAt: new Date('2026-01-02T00:00:00.000Z'),
  })

  assert.equal(record.kind, 'post')
  assert.equal(record.locale, 'zh-cn')
  assert.equal(record.category, 'ai')
  assert.equal(record.slug, 'build-your-ai-workflow')
  assert.equal(record.title, '构建你的 AI 工作流')
  assert.equal(record.originalPath, '/zh-cn/topics/ai/build-your-ai-workflow')
  assert.equal(record.body, '从真实任务开始。')
})

test('buildContentRecord keeps section indexes as pages', () => {
  const record = buildContentRecord({
    relativePath: 'docs/en/topics/algorithms/index.md',
    content: '# Algorithms\n\nA learning map.',
    modifiedAt: new Date('2026-01-02T00:00:00.000Z'),
  })

  assert.equal(record.kind, 'page')
  assert.equal(record.locale, 'en')
  assert.equal(record.pagePath, 'topics/algorithms')
  assert.equal(record.originalPath, '/en/topics/algorithms/')
})

test('migrateContent writes posts, pages, indexes and redirects without dropping source files', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-web-content-'))
  const articleDir = path.join(rootDir, 'docs', 'zh-cn', 'topics', 'thinking')
  const pageDir = path.join(rootDir, 'docs', 'zh-cn')
  fs.mkdirSync(articleDir, { recursive: true })
  fs.mkdirSync(pageDir, { recursive: true })
  fs.writeFileSync(
    path.join(articleDir, 'deep-work.md'),
    '# 深度工作\n\n专注是一种能力。\n',
    'utf8',
  )
  fs.writeFileSync(
    path.join(pageDir, 'about.md'),
    [
      '---',
      'title: "关于我"',
      'summary: "这是个人介绍。"',
      'avatar: "/images/about/shixing.jpg"',
      'avatarAlt: "施行的个人头像"',
      '---',
      '',
      '# 关于我',
      '',
      '这是个人介绍。',
      '',
    ].join('\n'),
    'utf8',
  )

  const result = migrateContent({ rootDir })

  assert.equal(result.posts.length, 1)
  assert.equal(result.pages.length, 1)
  assert.equal(fs.existsSync(path.join(rootDir, 'content', 'posts', 'zh-cn', 'deep-work.md')), true)
  assert.equal(fs.existsSync(path.join(rootDir, 'content', 'pages', 'zh-cn', 'about.md')), true)
  assert.match(
    fs.readFileSync(path.join(rootDir, 'content', 'pages', 'zh-cn', 'about.md'), 'utf8'),
    /pagePath: "about"/,
  )
  assert.match(
    fs.readFileSync(path.join(rootDir, 'content', 'pages', 'zh-cn', 'about.md'), 'utf8'),
    /avatar: "\/images\/about\/shixing.jpg"/,
  )
  assert.equal(result.pages[0].avatar, '/images/about/shixing.jpg')
  assert.equal(result.pages[0].avatarAlt, '施行的个人头像')
  assert.equal(fs.existsSync(path.join(rootDir, 'content', 'index.json')), true)
  assert.equal(fs.existsSync(path.join(rootDir, 'content', 'redirects.json')), true)
  assert.equal(fs.existsSync(path.join(articleDir, 'deep-work.md')), true)
})
