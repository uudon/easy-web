import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { migrateContent } from './lib/content-migration.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const result = migrateContent({ rootDir })

console.log(
  `Migrated ${result.posts.length} posts and ${result.pages.length} pages; generated ${result.redirects.length} redirects.`,
)
