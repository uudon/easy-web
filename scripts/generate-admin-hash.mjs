import { createPasswordHash } from './lib/security.mjs'

const password = process.argv[2]
if (!password) {
  console.error('Usage: npm run admin:hash -- "your-long-password"')
  process.exitCode = 1
} else {
  console.log(createPasswordHash(password))
}
