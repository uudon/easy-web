import fs from 'node:fs';
import path from 'node:path';

const supportedLocale = 'zh-cn';
const draftRootName = 'drafts';
const archiveRootName = 'archive';
const markdownExtension = '.md';
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function publishDrafts({
  rootDir,
  draftInputs = [],
  publishAll = false,
  keepDraft = false,
}) {
  const topicNames = discoverTopicNames(rootDir);
  const draftPaths = resolveDraftPaths({ rootDir, draftInputs, publishAll });

  if (draftPaths.length === 0) {
    return [];
  }

  return draftPaths.map((draftPath) => {
    const draftRecord = readDraftRecord({ rootDir, draftPath, topicNames });
    const destinationPath = path.join(
      rootDir,
      'docs',
      supportedLocale,
      'topics',
      draftRecord.topic,
      `${draftRecord.slug}${markdownExtension}`,
    );

    ensureDirectory(path.dirname(destinationPath));
    fs.writeFileSync(destinationPath, draftRecord.content, 'utf8');

    let archivedTo = '';
    if (!keepDraft) {
      archivedTo = archiveDraft({ rootDir, draftPath, relativePath: draftRecord.relativePath });
    }

    return {
      ...draftRecord,
      destinationPath,
      archivedTo,
    };
  });
}

export function resolveDraftPaths({ rootDir, draftInputs = [], publishAll = false }) {
  if (publishAll) {
    const localeDraftDir = path.join(rootDir, draftRootName, supportedLocale);
    if (!fs.existsSync(localeDraftDir)) {
      return [];
    }

    return walkMarkdownFiles(localeDraftDir).sort();
  }

  return draftInputs.map((draftInput) => {
    const absolutePath = path.resolve(rootDir, draftInput);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Draft file not found: ${draftInput}`);
    }
    if (!absolutePath.endsWith(markdownExtension)) {
      throw new Error(`Draft must be a Markdown file: ${draftInput}`);
    }
    return absolutePath;
  });
}

export function readDraftRecord({ rootDir, draftPath, topicNames }) {
  const relativePath = path.relative(rootDir, draftPath);
  const normalizedRelativePath = relativePath.split(path.sep).join('/');
  const parts = normalizedRelativePath.split('/');

  if (parts.length < 4 || parts[0] !== draftRootName || parts[1] !== supportedLocale) {
    throw new Error(
      `Draft path must look like drafts/${supportedLocale}/<topic>/<file>.md: ${normalizedRelativePath}`,
    );
  }

  if (parts.includes(archiveRootName)) {
    throw new Error(`Archived drafts cannot be published again: ${normalizedRelativePath}`);
  }

  const topic = parts[2];
  if (!topicNames.has(topic)) {
    throw new Error(`Unknown topic "${topic}" for draft ${normalizedRelativePath}`);
  }

  const content = fs.readFileSync(draftPath, 'utf8');
  const { data, body } = parseFrontmatter(content);
  const title = readTitle({ data, body });
  const fileSlug = path.basename(draftPath, markdownExtension);
  const slug = normalizeSlug(data.slug || fileSlug);

  return {
    topic,
    title,
    slug,
    content,
    draftPath,
    relativePath: normalizedRelativePath,
  };
}

export function parseFrontmatter(content) {
  if (!content.startsWith('---\n')) {
    return {
      data: {},
      body: content,
    };
  }

  const closingIndex = content.indexOf('\n---\n', 4);
  if (closingIndex === -1) {
    return {
      data: {},
      body: content,
    };
  }

  const rawFrontmatter = content.slice(4, closingIndex);
  const body = content.slice(closingIndex + 5);
  const data = Object.fromEntries(
    rawFrontmatter
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex === -1) {
          return ['', ''];
        }

        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
        return [key, value];
      })
      .filter(([key]) => key),
  );

  return { data, body };
}

export function readTitle({ data, body }) {
  if (data.title) {
    return data.title.trim();
  }

  const headingLine = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '));

  if (!headingLine) {
    throw new Error('Draft article must include a frontmatter title or a level-1 heading.');
  }

  const title = headingLine.slice(2).trim();
  if (!title) {
    throw new Error('Draft article title cannot be empty.');
  }

  return title;
}

export function normalizeSlug(value) {
  const source = String(value || '').trim();
  if (!source) {
    throw new Error('Draft slug cannot be empty.');
  }

  const normalized = source
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!normalized || !slugPattern.test(normalized)) {
    throw new Error(
      `Draft slug must use lowercase letters, numbers, and hyphens only. Received: ${value}`,
    );
  }

  return normalized;
}

function archiveDraft({ rootDir, draftPath, relativePath }) {
  const draftRelativePath = relativePath.replace(`${draftRootName}/`, '');
  const archivePath = path.join(rootDir, draftRootName, archiveRootName, draftRelativePath);
  ensureDirectory(path.dirname(archivePath));
  fs.renameSync(draftPath, archivePath);
  cleanupEmptyDirectories(path.dirname(draftPath), path.join(rootDir, draftRootName));
  return archivePath;
}

function discoverTopicNames(rootDir) {
  const topicsDir = path.join(rootDir, 'docs', supportedLocale, 'topics');
  return new Set(
    fs
      .readdirSync(topicsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
}

function walkMarkdownFiles(dirPath) {
  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === archiveRootName) {
        return [];
      }

      return walkMarkdownFiles(entryPath);
    }

    return entry.isFile() && entry.name.endsWith(markdownExtension) ? [entryPath] : [];
  });
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanupEmptyDirectories(dirPath, stopDir) {
  let currentDir = dirPath;
  while (currentDir.startsWith(stopDir) && currentDir !== stopDir) {
    if (fs.readdirSync(currentDir).length > 0) {
      return;
    }

    fs.rmdirSync(currentDir);
    currentDir = path.dirname(currentDir);
  }
}
