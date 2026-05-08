import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

run('npm', ['run', 'sync:content']);
run('npm', ['run', 'build']);
run('git', ['add', 'docs', 'scripts', 'package.json', 'package-lock.json']);

const stagedFiles = capture('git', ['diff', '--cached', '--name-only'])
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

if (stagedFiles.length === 0) {
  console.log('No content changes to publish.');
  process.exit(0);
}

const commitMessage = readCommitMessage(stagedFiles);
run('git', ['commit', '-m', commitMessage]);

const branch = capture('git', ['branch', '--show-current']).trim();
run('git', ['push', '-u', 'origin', branch]);
run('bash', ['scripts/deploy-tencent.sh']);

function readCommitMessage(stagedFiles) {
  const explicit = readCliValue('--message');
  if (explicit) {
    return explicit;
  }

  const articleFiles = stagedFiles.filter((file) => {
    return file.startsWith('docs/zh-cn/topics/') && file.endsWith('.md') && !file.endsWith('/index.md');
  });

  if (articleFiles.length === 1) {
    const slug = path.basename(articleFiles[0], '.md');
    return `feat: publish ${slug} article`;
  }

  return 'feat: publish content updates';
}

function readCliValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return '';
  }

  return process.argv[index + 1] ?? '';
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      SSH_KEY_PATH: process.env.SSH_KEY_PATH || resolveDefaultSshKey(),
    },
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    process.exit(result.status ?? 1);
  }

  return result.stdout ?? '';
}

function resolveDefaultSshKey() {
  const candidates = [
    '/Volumes/macOS/documents/密钥/mac.pem',
    '/Volumes/macOS/documents/key/codex.pem',
  ];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found ?? '';
}
