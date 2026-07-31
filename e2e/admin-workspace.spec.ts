import { expect, test, type Page, type Route } from '@playwright/test'

const csrfToken = 'e2e-csrf-token'

const draft = {
  id: 'draft-e2e',
  source: null,
  translationKey: 'editorial-workspace-e2e',
  locale: 'zh-cn',
  slug: 'editorial-workspace-e2e',
  title: '端到端草稿',
  summary: '用于验证现代博客写作工作台的稳定草稿。',
  category: 'ai',
  publishDate: '2026-07-30',
  body: '# 初稿\n\n这是一段用于实时预览的正文。',
  assets: [],
  status: 'draft',
  revision: 'revision-1',
  updatedAt: '2026-07-30T08:00:00.000Z',
} as const

async function fulfillJson(route: Route, json: unknown, status = 200) {
  await route.fulfill({
    contentType: 'application/json',
    json,
    status,
  })
}

async function mockAuthenticatedAdmin(page: Page) {
  await page.route('**/api/admin/session**', async (route) => {
    await fulfillJson(route, {
      authenticated: true,
      csrfToken,
      writesEnabled: true,
    })
  })

  await page.route('**/api/admin/drafts**', async (route) => {
    if (route.request().method() === 'POST') {
      await fulfillJson(route, { data: draft }, 201)
      return
    }
    await fulfillJson(route, { data: [draft] })
  })

  await page.route('**/api/admin/drafts/draft-e2e**', async (route) => {
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON() as Record<string, unknown>
      await fulfillJson(route, {
        data: {
          ...draft,
          ...input,
          revision: 'revision-2',
          updatedAt: '2026-07-30T08:05:00.000Z',
        },
      })
      return
    }
    await fulfillJson(route, { data: draft })
  })
}

test('article library searches and filters published posts and drafts', async ({ page }) => {
  await mockAuthenticatedAdmin(page)
  await page.goto('/admin/posts')
  await expect(page.locator('main')).not.toContainText('正在准备写作工作台…')

  await expect(page.getByRole('heading', { name: '全部文章' })).toBeVisible()
  const rows = page.locator('article[role="row"]')
  await expect(rows.filter({ hasText: draft.title })).toHaveCount(1)

  await page.getByPlaceholder('搜索标题或 slug…').fill('editorial-workspace-e2e')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText(draft.title)

  await page.getByLabel('语言').selectOption('en')
  await expect(page.getByText('没有符合筛选条件的文章。')).toBeVisible()

  await page.getByLabel('语言').selectOption('zh-cn')
  await page.getByLabel('状态').selectOption('draft')
  await page.getByLabel('分类').selectOption('ai')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('草稿')

  await page.getByPlaceholder('搜索标题或 slug…').fill('')
  await page.getByLabel('状态').selectOption('published')
  await expect(rows.filter({ hasText: draft.title })).toHaveCount(0)
  await expect(rows.first()).toBeVisible()
})

test('new editor supports writing, preview, publish review and mobile modes', async ({ page }) => {
  await mockAuthenticatedAdmin(page)
  await page.setViewportSize({ width: 390, height: 844 })

  await page.goto('/admin/editor/new')
  await expect(page.locator('main')).not.toContainText('正在准备写作工作台…')
  await expect(page).toHaveURL(/\/admin\/editor\/draft-e2e$/)
  await expect(page.getByLabel('文章标题')).toHaveValue(draft.title)

  const title = '写作工作台端到端验证'
  await page.getByLabel('文章标题').fill(title)
  await page.getByLabel('Markdown 正文').fill('## 实时预览\n\n新的正文内容。')

  await page.getByRole('button', { name: '预览', exact: true }).click()
  await expect(page.getByRole('button', { name: '预览', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const preview = page.getByRole('region', { name: '文章预览' })
  await expect(preview).toBeVisible()
  await expect(preview.getByRole('heading', { level: 1 })).toHaveText(title)
  await expect(preview.getByRole('heading', { level: 2 })).toHaveText('实时预览')

  await page.getByRole('button', { name: '设置', exact: true }).click()
  await expect(page.getByRole('complementary', { name: '文章设置' })).toBeVisible()

  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(page.getByRole('region', { name: '文章编辑器' })).toBeVisible()

  await page.getByRole('button', { name: /^发布/ }).click()
  const publishDialog = page.getByRole('dialog', { name: '发布前检查' })
  await expect(publishDialog).toBeVisible()
  await expect(publishDialog.getByRole('heading', { name: title })).toBeVisible()
  await expect(publishDialog.getByText('/zh-cn/blog/editorial-workspace-e2e')).toBeVisible()
  await expect(publishDialog.getByRole('button', { name: '确认发布' })).toBeEnabled()
})

test('publish failure remains visible inside the publish drawer without losing content', async ({ page }) => {
  await page.route('**/api/admin/session**', async (route) => {
    await fulfillJson(route, {
      authenticated: true,
      csrfToken,
      writesEnabled: true,
    })
  })
  await page.route('**/api/admin/drafts**', async (route) => {
    if (route.request().method() === 'POST') {
      await fulfillJson(
        route,
        { error: { code: 'UPSTREAM_ERROR', message: '云草稿服务暂时不可用。' } },
        502,
      )
      return
    }
    await fulfillJson(route, { data: [] })
  })

  await page.goto('/admin/editor/new')
  await expect(page.getByLabel('文章标题')).toBeVisible()
  await page.getByLabel('文章标题').fill('不能静默失败的发布测试')
  await page.getByLabel('文章摘要').fill('验证发布失败时保留正文并明确展示原因。')
  const body = '## 正文不会丢失\n\n即使云服务失败，用户也必须看到清楚的反馈。'
  await page.getByLabel('Markdown 正文').fill(body)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByLabel('Slug').fill('visible-publish-failure')

  await page.getByRole('button', { name: /^发布/ }).click()
  const publishDialog = page.getByRole('dialog', { name: '发布前检查' })
  await publishDialog.getByRole('button', { name: '确认发布' }).click()

  await expect(publishDialog.getByRole('alert')).toContainText('云草稿服务暂时不可用')
  await expect(page.getByLabel('Markdown 正文')).toHaveValue(body)
  await expect(publishDialog.getByRole('button', { name: '确认发布' })).toBeEnabled()
})

test('a local fallback draft reconnects, saves the latest revision and publishes successfully', async ({ page }) => {
  let createAttempts = 0
  let savedBody = ''
  let publishedRevision = ''
  await page.route('**/api/admin/session**', async (route) => {
    await fulfillJson(route, {
      authenticated: true,
      csrfToken,
      writesEnabled: true,
    })
  })
  await page.route('**/api/admin/drafts**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (pathname === '/api/admin/drafts' && request.method() === 'GET') {
      await fulfillJson(route, { data: [] })
      return
    }
    if (pathname === '/api/admin/drafts' && request.method() === 'POST') {
      createAttempts += 1
      if (createAttempts === 1) {
        await fulfillJson(
          route,
          { error: { code: 'UPSTREAM_ERROR', message: '首次连接失败。' } },
          502,
        )
        return
      }
      await fulfillJson(route, { data: draft }, 201)
      return
    }
    if (pathname === '/api/admin/drafts/draft-e2e' && request.method() === 'PUT') {
      const input = request.postDataJSON() as Record<string, unknown>
      savedBody = String(input.body ?? '')
      await fulfillJson(route, {
        data: {
          ...draft,
          ...input,
          revision: 'revision-2',
          updatedAt: '2026-07-30T08:05:00.000Z',
        },
      })
      return
    }
    if (
      pathname === '/api/admin/drafts/draft-e2e/publish' &&
      request.method() === 'POST'
    ) {
      publishedRevision = String(
        (request.postDataJSON() as { baseRevision?: string }).baseRevision ?? '',
      )
      await fulfillJson(route, {
        data: {
          sha: '1234567890abcdef',
          url: '/zh-cn/blog/reconnected-publish',
          status: 'deploying',
        },
      })
      return
    }
    await fulfillJson(
      route,
      { error: { code: 'UNEXPECTED_TEST_REQUEST', message: pathname } },
      500,
    )
  })

  await page.goto('/admin/editor/new')
  await page.getByLabel('文章标题').fill('重新连接后成功发布')
  await page.getByLabel('文章摘要').fill('本地内容会先同步到云草稿，再使用最新版本发布。')
  const body = '## 真实发布顺序\n\n创建云草稿、保存正文、最后发布。'
  await page.getByLabel('Markdown 正文').fill(body)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByLabel('Slug').fill('reconnected-publish')

  await page.getByRole('button', { name: /^发布/ }).click()
  await page.getByRole('dialog', { name: '发布前检查' })
    .getByRole('button', { name: '确认发布' })
    .click()

  await expect(page.getByRole('status')).toContainText('发布提交成功 · 12345678')
  expect(createAttempts).toBe(2)
  expect(savedBody).toBe(body)
  expect(publishedRevision).toBe('revision-2')
  await expect(page.getByLabel('Markdown 正文')).toHaveValue(body)
})

test('revision conflicts keep the current text and explain how to recover', async ({ page }) => {
  await mockAuthenticatedAdmin(page)
  await page.route('**/api/admin/drafts/draft-e2e', async (route) => {
    if (route.request().method() === 'PUT') {
      await fulfillJson(
        route,
        {
          error: {
            code: 'REVISION_CONFLICT',
            message: '草稿已被其他页面更新。',
          },
        },
        409,
      )
      return
    }
    await fulfillJson(route, { data: draft })
  })

  await page.goto('/admin/editor/draft-e2e')
  const body = '## 当前标签页的内容\n\n这段内容不能被冲突响应覆盖。'
  await page.getByLabel('Markdown 正文').fill(body)
  await page.keyboard.press('Control+S')

  await expect(page.getByRole('status')).toContainText('另一处编辑已经保存了更新版本')
  await expect(page.locator('.save-indicator.conflict')).toHaveText('版本冲突')
  await expect(page.getByLabel('Markdown 正文')).toHaveValue(body)
})

test('image upload requires alt text and inserts the staged public path', async ({ page }) => {
  await mockAuthenticatedAdmin(page)
  let uploaded = false
  await page.route('**/api/admin/drafts/draft-e2e/assets', async (route) => {
    uploaded = true
    await fulfillJson(route, {
      data: {
        draft: {
          ...draft,
          revision: 'revision-with-asset',
          assets: [
            {
              id: 'asset-e2e',
              name: 'asset-e2e.png',
              path: 'content/drafts/assets/draft-e2e/asset-e2e.png',
              publicPath: '/uploads/2026/07/asset-e2e.png',
              mimeType: 'image/png',
              size: 9,
              alt: '发布流程图',
            },
          ],
        },
        asset: {
          id: 'asset-e2e',
          name: 'asset-e2e.png',
          path: 'content/drafts/assets/draft-e2e/asset-e2e.png',
          publicPath: '/uploads/2026/07/asset-e2e.png',
          mimeType: 'image/png',
          size: 9,
          alt: '发布流程图',
        },
      },
    })
  })

  await page.goto('/admin/editor/draft-e2e')
  page.once('dialog', (dialog) => void dialog.accept('发布流程图'))
  await page.locator('input[type="file"]').setInputFiles({
    name: 'flow.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
  })

  await expect(page.getByRole('status')).toContainText('图片已暂存')
  await expect(page.getByLabel('Markdown 正文')).toHaveValue(
    /!\[发布流程图\]\(\/uploads\/2026\/07\/asset-e2e\.png\)/,
  )
  expect(uploaded).toBe(true)
})

test('draft deletion requires the exact title and removes the row after success', async ({ page }) => {
  await mockAuthenticatedAdmin(page)
  let deletedRevision = ''
  await page.route('**/api/admin/drafts/draft-e2e', async (route) => {
    if (route.request().method() === 'DELETE') {
      deletedRevision = String(
        (route.request().postDataJSON() as { baseRevision?: string }).baseRevision ?? '',
      )
      await fulfillJson(route, { data: { deleted: true } })
      return
    }
    await fulfillJson(route, { data: draft })
  })

  await page.goto('/admin/posts')
  page.once('dialog', (dialog) => void dialog.accept(draft.title))
  await page.getByRole('button', { name: `删除 ${draft.title}` }).click()

  await expect(page.getByText('草稿已删除。')).toBeVisible()
  await expect(page.getByText(draft.title)).toHaveCount(0)
  expect(deletedRevision).toBe(draft.revision)
})

test('local recovery survives reload, toolbar edits render, and publish focus stays trapped', async ({ page }) => {
  await mockAuthenticatedAdmin(page)
  const recoveredDraft = {
    ...draft,
    title: '自动恢复的文章',
    slug: 'recovered-article',
    summary: '刷新页面后仍然存在的本地恢复内容。',
    body: '## 恢复正文\n\n未保存的内容。',
  }
  await page.addInitScript((value) => {
    const key = 'easy-web:admin-draft:draft-e2e'
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value))
  }, {
    draft: recoveredDraft,
    savedAt: '2099-01-01T00:00:00.000Z',
  })

  await page.goto('/admin/editor/draft-e2e')
  await expect(page.getByLabel('文章标题')).toHaveValue('自动恢复的文章')
  await page.getByRole('button', { name: '加粗' }).click()
  await expect(page.getByLabel('Markdown 正文')).toHaveValue(/\*\*文字\*\*/)
  await page.waitForTimeout(350)
  const bodyBeforeReload = await page.getByLabel('Markdown 正文').inputValue()

  await page.reload()
  await expect(page.getByLabel('Markdown 正文')).toHaveValue(bodyBeforeReload)
  await page.getByRole('button', { name: /^发布/ }).click()
  const dialog = page.getByRole('dialog', { name: '发布前检查' })
  const confirm = dialog.getByRole('button', { name: '确认发布' })
  await confirm.focus()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '关闭发布窗口' })).toBeFocused()
})

test('read-only mode keeps browsing available and disables every write action', async ({ page }) => {
  await page.route('**/api/admin/session**', async (route) => {
    await fulfillJson(route, {
      authenticated: true,
      csrfToken,
      writesEnabled: false,
    })
  })

  await page.goto('/admin/editor/new')
  await expect(page.getByText('当前环境为只读模式')).toBeVisible()
  await expect(page.locator('.editor-save-button')).toBeDisabled()
  await page.getByRole('button', { name: /^发布/ }).click()
  await expect(
    page.getByRole('dialog', { name: '发布前检查' })
      .getByRole('button', { name: '确认发布' }),
  ).toBeDisabled()
})

test('logout clears the admin workspace without exposing content controls', async ({ page }) => {
  await mockAuthenticatedAdmin(page)
  await page.route('**/api/admin/session', async (route) => {
    if (route.request().method() === 'DELETE') {
      await fulfillJson(route, { authenticated: false })
      return
    }
    await fulfillJson(route, {
      authenticated: true,
      csrfToken,
      writesEnabled: true,
    })
  })

  await page.goto('/admin')
  await page.getByRole('button', { name: '退出登录' }).click()

  await expect(page.getByRole('heading', { name: '回到你的 写作现场。' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '工作台导航' })).toHaveCount(0)
})
