import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const docsDir = path.join(rootDir, 'docs');
const zhTopicsDir = path.join(docsDir, 'zh-cn', 'topics');
const zhHomePath = path.join(docsDir, 'zh-cn', 'index.md');

const topicLabels = {
  ai: 'AI',
  programming: '编程',
  algorithms: '算法',
  architecture: '架构',
  'project-management': '项目管理',
};

const markerPairs = {
  homeFeatured: {
    start: '<!-- AUTO_HOME_FEATURED:START -->',
    end: '<!-- AUTO_HOME_FEATURED:END -->',
  },
  topicArticles: {
    start: '<!-- AUTO_TOPIC_ARTICLES:START -->',
    end: '<!-- AUTO_TOPIC_ARTICLES:END -->',
  },
};

const topicDirs = fs
  .readdirSync(zhTopicsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const allArticles = topicDirs.flatMap((topic) => readTopicArticles(topic));

for (const topic of topicDirs) {
  const articles = allArticles.filter((article) => article.topic === topic);
  const topicIndexPath = path.join(zhTopicsDir, topic, 'index.md');
  const list = articles
    .map((article, index) => `${index + 1}. [${article.title}](${article.route})`)
    .join('\n');

  replaceBetweenMarkers(topicIndexPath, markerPairs.topicArticles, list);
}

const latestArticles = allArticles
  .slice()
  .sort((left, right) => right.sortMs - left.sortMs)
  .slice(0, 6);

const featuredCards = [
  '<div class="journal-grid journal-grid--featured">',
  ...latestArticles.map((article) => {
    return [
      `  <a class="journal-link-card" href="${article.route}">`,
      `    <span class="journal-link-card__meta">${escapeHtml(article.topicLabel)}</span>`,
      `    <strong>${escapeHtml(article.title)}</strong>`,
      `    <p>${escapeHtml(article.excerpt)}</p>`,
      '  </a>',
    ].join('\n');
  }),
  '</div>',
].join('\n');

replaceBetweenMarkers(zhHomePath, markerPairs.homeFeatured, featuredCards);

function readTopicArticles(topic) {
  const topicDir = path.join(zhTopicsDir, topic);

  return fs
    .readdirSync(topicDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => entry.name.endsWith('.md'))
    .filter((entry) => entry.name !== 'index.md')
    .map((entry) => {
      const filePath = path.join(topicDir, entry.name);
      const content = fs.readFileSync(filePath, 'utf8');
      const stats = fs.statSync(filePath);
      const slug = entry.name.replace(/\.md$/, '');
      const sortMs = readGitTimestamp(filePath) ?? stats.mtimeMs;

      return {
        topic,
        topicLabel: topicLabels[topic] ?? topic,
        title: extractTitle(content, slug),
        excerpt: extractExcerpt(content),
        route: `/zh-cn/topics/${topic}/${slug}`,
        sortMs,
      };
    })
    .sort((left, right) => right.sortMs - left.sortMs);
}

function extractTitle(content, fallback) {
  const lines = normalizeBody(content).split('\n');
  const heading = lines.find((line) => line.startsWith('# '));
  return heading ? heading.slice(2).trim() : fallback;
}

function extractExcerpt(content) {
  const lines = normalizeBody(content).split('\n');
  let afterTitle = false;
  const paragraph = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!afterTitle) {
      if (line.startsWith('# ')) {
        afterTitle = true;
      }
      continue;
    }

    if (!line) {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }

    if (/^(#|>|-|[*]|\d+\.)\s/.test(line)) {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }

    paragraph.push(line);
  }

  const plainText = stripMarkdown(paragraph.join(' ')).trim();
  if (!plainText) {
    return '点击查看这篇文章的完整内容。';
  }

  return plainText.length > 72 ? `${plainText.slice(0, 72).trim()}...` : plainText;
}

function normalizeBody(content) {
  if (!content.startsWith('---\n')) {
    return content;
  }

  const closingIndex = content.indexOf('\n---\n', 4);
  return closingIndex === -1 ? content : content.slice(closingIndex + 5);
}

function stripMarkdown(value) {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/<[^>]+>/g, '');
}

function replaceBetweenMarkers(filePath, markers, replacement) {
  const source = fs.readFileSync(filePath, 'utf8');
  const startIndex = source.indexOf(markers.start);
  const endIndex = source.indexOf(markers.end);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Missing markers in ${filePath}`);
  }

  const before = source.slice(0, startIndex + markers.start.length);
  const after = source.slice(endIndex);
  const next = `${before}\n${replacement}\n${after}`;
  fs.writeFileSync(filePath, next);
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function readGitTimestamp(filePath) {
  const relativePath = path.relative(rootDir, filePath);
  const result = spawnSync('git', ['log', '-1', '--format=%ct', '--', relativePath], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return null;
  }

  const value = Number.parseInt((result.stdout ?? '').trim(), 10);
  return Number.isFinite(value) ? value * 1000 : null;
}
