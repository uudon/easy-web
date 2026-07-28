import { importPKCS8, SignJWT } from 'jose'

import type { ContentWriteInput } from './content-write'
import { toContentFile } from './content-write'
import type { PostSummary } from './content'

const githubApi = 'https://api.github.com'
const apiVersion = '2022-11-28'

type GitHubConfig = {
  appId: string
  installationId?: string
  privateKey: string
  owner: string
  repo: string
  branch: string
}

type GitHubFile = {
  content: string
  encoding: string
  sha: string
}

export async function publishContent(input: ContentWriteInput) {
  assertWritesEnabled()
  const config = readGitHubConfig()
  const token = await createInstallationToken(config)
  const contentFile = toContentFile(input)
  const existingIndex = await readRepositoryJson<PostSummary[]>(
    token,
    config,
    'content/index.json',
    [],
  )
  const nextIndex = upsertPostIndex(existingIndex, input)

  return commitFiles({
    token,
    config,
    message: `feat: publish ${input.locale}/${input.slug}`,
    files: [
      contentFile,
      { path: 'content/index.json', content: `${JSON.stringify(nextIndex, null, 2)}\n` },
    ],
  })
}

export async function deleteContent({ locale, slug }: Pick<ContentWriteInput, 'locale' | 'slug'>) {
  assertWritesEnabled()
  const config = readGitHubConfig()
  const token = await createInstallationToken(config)
  const existingIndex = await readRepositoryJson<PostSummary[]>(
    token,
    config,
    'content/index.json',
    [],
  )
  const nextIndex = existingIndex.filter(
    (post) => !(post.locale === locale && post.slug === slug),
  )

  return commitFiles({
    token,
    config,
    message: `chore: remove ${locale}/${slug}`,
    files: [
      { path: `content/posts/${locale}/${slug}.md`, content: null },
      { path: 'content/index.json', content: `${JSON.stringify(nextIndex, null, 2)}\n` },
    ],
  })
}

function upsertPostIndex(existingIndex: PostSummary[], input: ContentWriteInput) {
  const nextPost: PostSummary = {
    title: input.title,
    summary: input.summary,
    date: input.date,
    locale: input.locale,
    category: input.category,
    slug: input.slug,
    originalPath: `/${input.locale}/blog/${input.slug}`,
  }
  const withoutCurrent = existingIndex.filter(
    (post) => !(post.locale === input.locale && post.slug === input.slug),
  )
  return [...withoutCurrent, nextPost].sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.title.localeCompare(right.title),
  )
}

async function createInstallationToken(config: GitHubConfig) {
  const appJwt = await createAppJwt(config)
  const installationId =
    config.installationId ?? (await discoverInstallationId(appJwt, config))
  const response = await githubFetch(`/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    token: appJwt,
  })
  const data = (await response.json()) as { token?: string }
  if (!data.token) throw new Error('GitHub did not return an installation token.')
  return data.token
}

async function createAppJwt(config: GitHubConfig) {
  const now = Math.floor(Date.now() / 1000)
  const key = await importPKCS8(normalizePrivateKey(config.privateKey), 'RS256')
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(config.appId)
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 8 * 60)
    .sign(key)
}

async function discoverInstallationId(appJwt: string, config: GitHubConfig) {
  const response = await githubFetch(
    `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/installation`,
    { token: appJwt },
  )
  const data = (await response.json()) as { id?: number }
  if (!data.id) throw new Error('GitHub App is not installed on the configured repository.')
  return String(data.id)
}

async function readRepositoryJson<T>(
  token: string,
  config: GitHubConfig,
  filePath: string,
  fallback: T,
) {
  const encodedPath = encodeRepositoryPath(filePath)
  const response = await githubFetch(
    `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}`,
    { token, allowNotFound: true },
  )
  if (response.status === 404) return fallback
  const file = (await response.json()) as GitHubFile
  if (file.encoding !== 'base64' || !file.content) return fallback
  try {
    return JSON.parse(Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8')) as T
  } catch {
    return fallback
  }
}

async function commitFiles({
  token,
  config,
  message,
  files,
}: {
  token: string
  config: GitHubConfig
  message: string
  files: Array<{ path: string; content: string | null }>
}) {
  const repoPath = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`
  const refResponse = await githubFetch(
    `${repoPath}/git/ref/heads/${encodeURIComponent(config.branch)}`,
    { token },
  )
  const ref = (await refResponse.json()) as { object?: { sha?: string } }
  const parentSha = ref.object?.sha
  if (!parentSha) throw new Error('Unable to resolve the repository branch.')

  const commitResponse = await githubFetch(`${repoPath}/git/commits/${parentSha}`, { token })
  const parentCommit = (await commitResponse.json()) as { tree?: { sha?: string } }
  const baseTree = parentCommit.tree?.sha
  if (!baseTree) throw new Error('Unable to resolve the repository tree.')

  const treeEntries = await Promise.all(
    files.map(async (file) => {
      if (file.content === null) {
        return { path: file.path, mode: '100644', type: 'blob', sha: null }
      }
      const blobResponse = await githubFetch(`${repoPath}/git/blobs`, {
        method: 'POST',
        token,
        body: { content: file.content, encoding: 'utf-8' },
      })
      const blob = (await blobResponse.json()) as { sha?: string }
      if (!blob.sha) throw new Error(`Unable to create content blob for ${file.path}.`)
      return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha }
    }),
  )

  const treeResponse = await githubFetch(`${repoPath}/git/trees`, {
    method: 'POST',
    token,
    body: { base_tree: baseTree, tree: treeEntries },
  })
  const tree = (await treeResponse.json()) as { sha?: string }
  if (!tree.sha) throw new Error('Unable to create the content tree.')

  const newCommitResponse = await githubFetch(`${repoPath}/git/commits`, {
    method: 'POST',
    token,
    body: { message, tree: tree.sha, parents: [parentSha] },
  })
  const newCommit = (await newCommitResponse.json()) as { sha?: string }
  if (!newCommit.sha) throw new Error('Unable to create the content commit.')

  await githubFetch(`${repoPath}/git/refs/heads/${encodeURIComponent(config.branch)}`, {
    method: 'PATCH',
    token,
    body: { sha: newCommit.sha, force: false },
  })

  return { sha: newCommit.sha }
}

async function githubFetch(
  pathname: string,
  options: {
    token: string
    method?: 'GET' | 'POST' | 'PATCH'
    body?: unknown
    allowNotFound?: boolean
  },
) {
  const response = await fetch(`${githubApi}${pathname}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${options.token}`,
      'X-GitHub-Api-Version': apiVersion,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  })

  if (!response.ok && !(options.allowNotFound && response.status === 404)) {
    throw new Error(`GitHub request failed with status ${response.status}.`)
  }
  return response
}

function readGitHubConfig(): GitHubConfig {
  return {
    appId: requireEnvironment('GITHUB_APP_ID'),
    installationId: process.env.GITHUB_APP_INSTALLATION_ID,
    privateKey: requireEnvironment('GITHUB_APP_PRIVATE_KEY'),
    owner: requireEnvironment('GITHUB_OWNER'),
    repo: requireEnvironment('GITHUB_REPO'),
    branch: process.env.GITHUB_BRANCH || 'main',
  }
}

function requireEnvironment(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, '\n').trim()
}

function encodeRepositoryPath(value: string) {
  return value.split('/').map(encodeURIComponent).join('/')
}

function assertWritesEnabled() {
  if (process.env.ENABLE_CONTENT_WRITES !== 'true') {
    throw new Error('Content writes are disabled in this environment.')
  }
}
