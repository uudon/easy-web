import { expect, test } from '@playwright/test'

test('Chinese home, archive and article reading flow works', async ({ page }) => {
  await page.goto('/zh-cn')
  await expect(page).toHaveTitle(/施行的个人日记/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('把复杂的事')

  await page.getByRole('link', { name: '文章', exact: true }).click()
  await expect(page).toHaveURL(/\/zh-cn\/blog$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('全部文章')

  const articleLink = page.locator('.post-card h2 a').first()
  const title = await articleLink.textContent()
  await articleLink.click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title ?? '')
  await expect(page.locator('.prose')).toBeVisible()
})

test('legacy article URLs permanently redirect to the new route', async ({ page }) => {
  await page.goto('/zh-cn/topics/ai/build-your-ai-workflow')
  await expect(page).toHaveURL('/zh-cn/blog/build-your-ai-workflow')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('AI')
})

test('English locale and migrated pages remain available', async ({ page }) => {
  await page.goto('/en')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Think clearly')
  await page.goto('/en/about')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('.prose')).toBeVisible()
})

test('admin page requires authentication and never asks for a GitHub private key', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: '内容管理' })).toBeVisible()
  await expect(page.getByLabel('管理密码')).toBeVisible()
  await expect(page.getByText(/Private Key 不会进入这个页面/)).toBeVisible()
  await expect(page.getByText(/上传.*Private Key/i)).toHaveCount(0)
})
