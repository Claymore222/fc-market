import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

test('real copied career keeps its disk checkpoint, exposes an unsaved export and returns safely', async ({ page }) => {
  const base = process.env.FC_SYNC_REAL_URL
  const uid = process.env.FC_SYNC_REAL_UID
  test.skip(!base || !uid, 'Isolated copied career API required; never use the original career database.')
  const out = resolve('..', 'scratch', 'sync-resilience-ui')
  await mkdir(out, { recursive: true })
  await page.addInitScript(uid => localStorage.setItem('fcm.save', uid), uid!)
  await page.route('**/api/**', route => route.request().method() === 'GET' ? route.continue() : route.abort())
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const response = await page.request.get(`${base}/api/sync?saveUid=${uid}`)
  expect(response.ok()).toBeTruthy()
  const state = await response.json()
  expect(state.current.snapshotId).toBe(state.saved.snapshotId)
  expect(state.current.source).toBe('save')
  expect(state.pendingExport.snapshotId).toBe('TEST_UNSAVED_FUTURE')
  await page.goto(`${base}/squad`)
  await expect(page.getByRole('button', { name: 'Export’u incele' })).toBeVisible()
  await expect(page.locator('.squad-table')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.career-save-badge')).toContainText('Kayıt')
  await expect(page.getByText('1 kaynak aktarılamadı.', { exact: false })).toBeVisible()
  await page.screenshot({ path: resolve(out, 'saved-checkpoint-desktop.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Export’u incele' }).click()
  await expect(page.getByText('Export önizlemesi:', { exact: false })).toBeVisible()
  await expect(page.locator('.squad-table')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.career-save-badge')).toContainText('Export')
  await page.setViewportSize({ width: 390, height: 844 })
  const notice = page.getByRole('status').filter({ hasText: 'Export önizlemesi:' })
  expect(await notice.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: resolve(out, 'export-preview-mobile.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Kaydedilmiş kayda dön' }).click()
  await expect(page.getByRole('button', { name: 'Export’u incele' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Export’u incele' })).toBeVisible()
  expect(errors).toEqual([])
})
