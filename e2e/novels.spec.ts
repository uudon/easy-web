import { expect, test } from '@playwright/test'

test('Chinese visitors can open the independent novel shelf', async ({ page }) => {
  await page.goto('/zh-cn')
  await page.getByRole('link', { name: '小说', exact: true }).click()

  await expect(page).toHaveURL(/\/zh-cn\/novels$/)
  await expect(page.getByRole('heading', { level: 1, name: '连载小说' })).toBeVisible()
  await expect(page.getByText('小说会在这里陆续出现')).toBeVisible()
})

test('English navigation does not expose the Chinese-only novel shelf', async ({ page }) => {
  await page.goto('/en')

  await expect(page.getByRole('link', { name: /novel/i })).toHaveCount(0)
  await page.goto('/en/novels')
  await expect(page.getByRole('heading', { name: '这一页还没有写下。' })).toBeVisible()
})

test('the admin workspace exposes novel management after authentication', async ({ page }) => {
  await page.route('**/api/admin/session**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        authenticated: true,
        csrfToken: 'novel-e2e-csrf',
        writesEnabled: true,
      },
    })
  })
  await page.route('**/api/admin/drafts**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { data: [] } })
  })

  await page.goto('/admin')
  await page.getByRole('link', { name: '小说管理' }).click()

  await expect(page).toHaveURL(/\/admin\/novels$/)
  await expect(page.getByRole('heading', { name: '小说管理' })).toBeVisible()
  await expect(page.getByRole('button', { name: '新建作品' })).toBeVisible()
})

test('chapter autosave and publish are serialized on the latest revision', async ({ page }) => {
  const novel = {
    title: '纸月亮',
    slug: 'paper-moon',
    summary: '海边旧书店的故事。',
    cover: '',
    genre: '现实幻想',
    status: '连载中',
    startDate: '2026-01-01',
    updatedAt: '2026-01-01',
    chapterCount: 0,
    latestChapter: null,
  }
  const draft = {
    id: 'novel_draft_1234567890',
    source: null,
    novelSlug: novel.slug,
    slug: 'chapter-1',
    title: '第一章 来客',
    order: 1,
    publishDate: '2026-01-01',
    volume: '',
    body: '初稿。',
    assets: [],
    status: 'draft',
    revision: 'revision-1',
    updatedAt: '2026-01-01T08:00:00.000Z',
  }
  let revision = 1
  let concurrentSaves = 0
  let maxConcurrentSaves = 0
  const saveBaseRevisions: string[] = []
  let publishedRevision = ''
  let firstSaveStarted: (() => void) | undefined
  const firstSave = new Promise<void>((resolve) => {
    firstSaveStarted = resolve
  })

  await page.route('**/api/admin/session**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { authenticated: true, csrfToken: 'novel-csrf', writesEnabled: true },
    })
  })
  await page.route('**/api/admin/drafts**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { data: [] } })
  })
  await page.route('**/api/admin/novels**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { data: [novel] } })
  })
  await page.route('**/api/admin/novel-chapters**', async (route) => {
    await route.fulfill({ contentType: 'application/json', json: { data: [] } })
  })
  await page.route('**/api/admin/novel-drafts**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (pathname === '/api/admin/novel-drafts' && request.method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', json: { data: [draft] } })
      return
    }
    if (pathname.endsWith('/publish') && request.method() === 'POST') {
      publishedRevision = String(request.postDataJSON().baseRevision)
      await route.fulfill({
        contentType: 'application/json',
        json: { data: { sha: 'published', url: '/zh-cn/novels/paper-moon/chapter-1' } },
      })
      return
    }
    if (pathname.endsWith(draft.id) && request.method() === 'PUT') {
      const input = request.postDataJSON()
      saveBaseRevisions.push(String(input.baseRevision))
      concurrentSaves += 1
      maxConcurrentSaves = Math.max(maxConcurrentSaves, concurrentSaves)
      firstSaveStarted?.()
      await new Promise((resolve) => setTimeout(resolve, 350))
      revision += 1
      concurrentSaves -= 1
      await route.fulfill({
        contentType: 'application/json',
        json: {
          data: {
            ...draft,
            ...input,
            revision: `revision-${revision}`,
            updatedAt: `2026-01-01T08:00:0${revision}.000Z`,
          },
        },
      })
      return
    }
    await route.fulfill({ status: 500, json: { error: { message: pathname } } })
  })

  await page.goto('/admin/novels')
  await page.getByRole('button', { name: '编辑', exact: true }).first().click()
  await page.getByLabel('章节正文 Markdown').fill('自动保存后的最新版正文。')
  await firstSave
  await page.getByRole('button', { name: '发布', exact: true }).click()

  await expect(page.getByRole('status')).toContainText('章节已发布')
  expect(maxConcurrentSaves).toBe(1)
  expect(saveBaseRevisions).toEqual(['revision-1', 'revision-2'])
  expect(publishedRevision).toBe('revision-3')
})
