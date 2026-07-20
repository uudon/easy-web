import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { publishDrafts } from './lib/draft-publisher.mjs';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const options = readOptions(process.argv.slice(2));

const publishedRecords = publishDrafts({
  rootDir,
  draftInputs: options.draftInputs,
  publishAll: options.publishAll,
  keepDraft: options.keepDraft,
});

if (publishedRecords.length === 0) {
  console.log('No draft articles found to publish.');
  process.exit(0);
}

run('npm', ['run', 'sync:content']);

for (const record of publishedRecords) {
  const relativeDestination = path.relative(rootDir, record.destinationPath);
  const archiveNote = record.archivedTo
    ? `, archived draft: ${path.relative(rootDir, record.archivedTo)}`
    : '';

  console.log(`Published: ${relativeDestination} (${record.title})${archiveNote}`);
}

function readOptions(args) {
  const draftInputs = [];
  let publishAll = false;
  let keepDraft = false;

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (value === '--all') {
      publishAll = true;
      continue;
    }

    if (value === '--keep-draft') {
      keepDraft = true;
      continue;
    }

    if (value === '--file') {
      const nextValue = args[index + 1];
      if (!nextValue) {
        throw new Error('Missing value after --file');
      }
      draftInputs.push(nextValue);
      index += 1;
      continue;
    }

    draftInputs.push(value);
  }

  if (!publishAll && draftInputs.length === 0) {
    throw new Error('Provide a draft file path or use --all.');
  }

  return {
    draftInputs,
    publishAll,
    keepDraft,
  };
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
