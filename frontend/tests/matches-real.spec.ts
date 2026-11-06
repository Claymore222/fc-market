import { test, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test('real copied career match scores and archive source are visible', async ({ page }) => {
  const base = process.env.FC_MATCH_REAL_URL, uid = process.env.FC_MATCH_REAL_UID
  test.skip(!base || !uid, 'Copied career API required; no original database writes.')
  const out = resolve('..', 'scratch', 'match-prep-20261030')
  const response = await page.request.get(`${base}/api/matches?saveUid=${uid}`)
  expect(response.ok()).toBe(true)
  const v = await response.json()
  expect(v.fixtureSource.source).toBe('save'); expect(v.summary.played).toBeGreaterThan(0)
  await page.addInitScript(uid => localStorage.setItem('fcm.save', uid), uid!)
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${base}/matches`)
  await expect(page.locator('.matches-results li')).toHaveCount(v.matches.length)
  await expect(page.locator('.career-save-badge')).toContainText('Kayıt', { timeout: 20000 })
  await page.screenshot({ path: resolve(out, 'matches-desktop.png'), fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.locator('.matches-page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: resolve(out, 'matches-mobile.png'), fullPage: true, animations: 'disabled' })
  await page.reload(); await expect(page.locator('.matches-results li')).toHaveCount(v.matches.length)
  expect(errors).toEqual([])
  await writeFile(resolve(out, 'real-matches.json'), JSON.stringify(v, null, 2))
})
