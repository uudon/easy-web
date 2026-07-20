import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  normalizeSlug,
  parseFrontmatter,
  publishDrafts,
  readDraftRecord,
} from '../scripts/lib/draft-publisher.mjs';

test('parseFrontmatter reads simple key-value pairs', () => {
  const result = parseFrontmatter(`---\ntitle: Sample Title\nslug: sample-title\n---\n# Hello`);

  assert.deepEqual(result.data, {
    title: 'Sample Title',
    slug: 'sample-title',
  });
  assert.equal(result.body, '# Hello');
});

test('normalizeSlug slugifies simple filenames', () => {
  assert.equal(normalizeSlug('My New_Post'), 'my-new-post');
});

test('publishDrafts copies article into docs and archives the draft', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-web-drafts-'));

  fs.mkdirSync(path.join(rootDir, 'docs', 'zh-cn', 'topics', 'ai'), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, 'docs', 'zh-cn', 'topics', 'ai', 'index.md'),
    '<!-- AUTO_TOPIC_ARTICLES:START -->\n<!-- AUTO_TOPIC_ARTICLES:END -->\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(rootDir, 'docs', 'zh-cn', 'index.md'),
    '<!-- AUTO_HOME_FEATURED:START -->\n<!-- AUTO_HOME_FEATURED:END -->\n',
    'utf8',
  );

  const draftDir = path.join(rootDir, 'drafts', 'zh-cn', 'ai');
  fs.mkdirSync(draftDir, { recursive: true });
  const draftPath = path.join(draftDir, 'my-first-draft.md');
  fs.writeFileSync(
    draftPath,
    '# 我的第一篇草稿\n\n这里是正文。\n',
    'utf8',
  );

  const [result] = publishDrafts({
    rootDir,
    draftInputs: [draftPath],
  });

  assert.equal(result.topic, 'ai');
  assert.equal(result.slug, 'my-first-draft');
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'docs', 'zh-cn', 'topics', 'ai', 'my-first-draft.md'), 'utf8'),
    '# 我的第一篇草稿\n\n这里是正文。\n',
  );
  assert.equal(fs.existsSync(draftPath), false);
  assert.equal(
    fs.existsSync(path.join(rootDir, 'drafts', 'archive', 'zh-cn', 'ai', 'my-first-draft.md')),
    true,
  );
});

test('readDraftRecord accepts frontmatter slug when filename is not route-safe', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-web-drafts-'));
  fs.mkdirSync(path.join(rootDir, 'docs', 'zh-cn', 'topics', 'project-management'), { recursive: true });
  const draftDir = path.join(rootDir, 'drafts', 'zh-cn', 'project-management');
  fs.mkdirSync(draftDir, { recursive: true });
  const draftPath = path.join(draftDir, '范围管理草稿.md');

  fs.writeFileSync(
    draftPath,
    `---\ntitle: 什么是范围管理\nslug: scope-management\n---\n\n正文\n`,
    'utf8',
  );

  const result = readDraftRecord({
    rootDir,
    draftPath,
    topicNames: new Set(['project-management']),
  });

  assert.equal(result.title, '什么是范围管理');
  assert.equal(result.slug, 'scope-management');
});

test('readDraftRecord recognizes the thinking topic', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-web-drafts-'));
  fs.mkdirSync(path.join(rootDir, 'docs', 'zh-cn', 'topics', 'thinking'), { recursive: true });
  const draftDir = path.join(rootDir, 'drafts', 'zh-cn', 'thinking');
  fs.mkdirSync(draftDir, { recursive: true });
  const draftPath = path.join(draftDir, 'system-design-notes.md');

  fs.writeFileSync(
    draftPath,
    '# 系统设计中的一些思考\n\n正文\n',
    'utf8',
  );

  const result = readDraftRecord({
    rootDir,
    draftPath,
    topicNames: new Set(['thinking']),
  });

  assert.equal(result.topic, 'thinking');
  assert.equal(result.title, '系统设计中的一些思考');
  assert.equal(result.slug, 'system-design-notes');
});
