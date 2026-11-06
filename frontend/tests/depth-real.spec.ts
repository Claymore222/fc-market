import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test('depth works with copied Fenerbahce and Gencler careers, survives reopening and never duplicates a player', async ({ page }) => {
  const base = process.env.FC_DEPTH_REAL_URL
  test.skip(!base, 'Requires an isolated API with a copied career database and a scratch app.db.')
  const out = resolve('..', 'scratch', 'analysis-phase-b')
  await mkdir(out, { recursive: true })
  const saves = await (await page.request.get(`${base}/api/saves`)).json()
  const checked: unknown[] = [], errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  for (const name of ['Fenerbahçe', 'Gençlerbirliği']) {
    const save = saves.find((s: { userTeamName: string }) => s.userTeamName === name)
    expect(save).toBeTruthy()
    await page.addInitScript(uid => localStorage.setItem('fcm.save', uid), save.saveUid)
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.goto(`${base}/transfer/plan`)
    await expect(page.getByTestId('analysis-source')).toContainText(name)
    await page.getByLabel('Ana diziliş', { exact: true }).selectOption('4-3-3')
    await page.getByLabel('Alternatif diziliş', { exact: true }).selectOption('4-2-3-1')
    await page.getByRole('button', { name: 'Planı kaydet', exact: true }).click()
    await expect(page.getByText('Plan kaydedildi.', { exact: true })).toBeVisible()
    const runResponse = page.waitForResponse(r => r.url().includes('/api/analysis/run'))
    const started = Date.now()
    await page.getByRole('button', { name: 'Kadroyu analiz et', exact: true }).click()
    const response = await runResponse
    expect(response.ok()).toBeTruthy()
    const report = await response.json(), ms = Date.now() - started
    expect(report.scopeKey).toBe(save.latest.careerKey)
    expect(report.snapshot.source).toBe('save'); expect(report.draft).toBe(false)
    expect(report.formations).toHaveLength(2)
    for (const f of report.formations) {
      expect(f.slots).toHaveLength(11)
      for (const keys of [['starterId', 'rotationId'], ['readyStarterId', 'readyRotationId'], ['nextSeasonStarterId', 'nextSeasonRotationId']]) {
        const ids = f.slots.flatMap((s: Record<string, unknown>) => keys.map(k => s[k])).filter((id: unknown) => id !== null)
        expect(new Set(ids).size).toBe(ids.length)
      }
    }
    const panel = page.getByTestId('depth-report')
    await expect(panel).toContainText('Kayıtlı plan ile')
    await expect(panel).toContainText(name)
    await expect(panel.locator('.depth-position')).toHaveCount(11)
    await panel.locator('.depth-position').first().click()
    await panel.locator('.depth-priorities button').first().click()
    await page.locator('.depth-section').screenshot({ path: resolve(out, name === 'Fenerbahçe' ? 'fener-depth-desktop.png' : 'gencler-depth-desktop.png'), animations: 'disabled' })
    await page.reload()
    await expect(page.getByLabel('Ana diziliş', { exact: true })).toHaveValue('4-3-3')
    const rerun = page.waitForResponse(r => r.url().includes('/api/analysis/run'))
    await page.getByRole('button', { name: 'Kadroyu analiz et', exact: true }).click()
    expect((await (await rerun).json()).id).toBe(report.id)
    await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' })
    await panel.getByLabel('Derinlik görünümü').selectOption('future')
    expect(await page.locator('.analysis-page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.locator('.depth-section').screenshot({ path: resolve(out, name === 'Fenerbahçe' ? 'fener-depth-mobile.png' : 'gencler-depth-mobile.png'), animations: 'disabled' })
    checked.push({ name, elapsedMs: ms, report })
  }
  expect(errors).toEqual([])
  await writeFile(resolve(out, 'real-check.json'), JSON.stringify({ careers: checked, errors }, null, 2))
})
