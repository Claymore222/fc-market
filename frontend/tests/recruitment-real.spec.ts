import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { RecruitmentResult } from '../src/api/recruitment'
import type { RecruitmentBoard } from '../src/api/recruitmentBoard'

test('a real plan leads to Transfer with ranked candidates, inspect, shortlist, groups and mobile', async ({ page }) => {
  const base = process.env.FC_RECRUITMENT_REAL_URL
  test.skip(!base, 'Requires an isolated API with a copied career database and a scratch app.db.')
  const out = resolve('..', 'scratch', 'analysis-phase-c'); await mkdir(out, { recursive: true })
  const saves = await (await page.request.get(`${base}/api/saves`)).json()
  const checked: unknown[] = [], errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  for (const name of ['Fenerbahçe', 'Gençlerbirliği']) {
    const save = saves.find((s: { userTeamName: string }) => s.userTeamName === name); expect(save).toBeTruthy()
    await page.addInitScript(uid => localStorage.setItem('fcm.save', uid), save.saveUid)
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.goto(`${base}/transfer/plan`)
    await expect(page.getByTestId('analysis-source')).toContainText(name)
    await page.getByLabel('Ana diziliş', { exact: true }).selectOption('4-3-3')
    await page.getByLabel('Savunma yaklaşımı', { exact: true }).selectOption('high-press')
    await page.getByLabel('Savunma çizgisi', { exact: true }).fill('80')
    await page.getByLabel('Merkezden pas', { exact: true }).check()
    await page.getByLabel('4-3-3 · LCB', { exact: true }).selectOption('13')
    // Explicit synthetic user budgets; they are not asserted to be the career's actual budget.
    await page.getByLabel('Ayırdığın bonservis bütçesi', { exact: true }).fill('10000000')
    await page.getByLabel('Ayırdığın maaş bütçesi', { exact: true }).fill('50000')
    await page.getByRole('button', { name: 'Planı kaydet', exact: true }).click()
    await expect(page.getByText('Plan kaydedildi.', { exact: true })).toBeVisible()
    const depthResponse = page.waitForResponse(r => r.url().endsWith(`/api/analysis/run?saveUid=${save.saveUid}`))
    await page.getByRole('button', { name: 'Kadroyu analiz et', exact: true }).click()
    const report = await (await depthResponse).json()
    await page.getByTestId('depth-report').locator('.depth-position').filter({ hasText: /^LCB/ }).click()
    const boardResponse = page.waitForResponse(r => r.url().includes('/api/recruitment/board'))
    const started = Date.now(); await page.getByTestId('depth-report').getByRole('link', { name: 'CB önerilerini gör', exact: true }).click()
    const response = await boardResponse; expect(response.ok()).toBeTruthy()
    const board = await response.json() as RecruitmentBoard, elapsedMs = Date.now() - started
    await expect(page).toHaveURL(/\/transfer\?mevki=CB$/)
    const result = board.positions.find(p => p.position === 'CB')!.recommendations as RecruitmentResult
    expect(result.snapshot.snapshotId).toBe(report.snapshot.snapshotId)
    expect(result.sources?.attributes?.snapshotId).toBe(report.snapshot.snapshotId)
    expect(result.snapshot.source).toBe('save'); expect(result.poolSize).toBeGreaterThan(10000)
    expect(result.target.preferences).toContain('Yüksek savunma çizgisi')
    const own = new Set((await (await page.request.get(`${base}/api/analysis/profile?saveUid=${save.saveUid}`)).json()).context.players.map((p: { id: number }) => p.id))
    for (const g of result.groups) for (const p of g.candidates) {
      expect(own.has(p.id)).toBe(false); expect(p.positions).toContain('CB'); expect(p.knownAttributes).toBe(p.totalAttributes)
      expect(p.score).toBeGreaterThanOrEqual(0); expect(p.score).toBeLessThanOrEqual(100)
      if (p.currentWage === null) expect(p.cost.status).not.toBe('within-estimate')
    }
    const hub = page.getByRole('region', { name: 'Stoper önerileri', exact: true }), rows = hub.getByRole('group', { name: 'Transfer adayları' }).locator('.hub-player-card')
    const tabs = { starter: 'İlk 11', rotation: 'Yedek', development: 'Genç yatırım' } as Record<string, string>
    for (const g of result.groups) {
      await hub.getByRole('group', { name: 'Oyuncu amacı' }).getByRole('button', { name: new RegExp(`^${tabs[g.key]}`) }).click()
      await expect(rows).toHaveCount(Math.min(5, g.candidates.length))
    }
    const rotation = result.groups.find(g => g.key === (report.profile.horizon === 'develop' ? 'development' : 'rotation'))!; expect(rotation.total).toBeGreaterThan(0)
    await hub.getByRole('group', { name: 'Oyuncu amacı' }).getByRole('button', { name: new RegExp(`^${tabs[rotation.key]}`) }).click()
    const card = rows.first(), first = rotation.candidates[0]
    await card.locator('.hub-player-identity').click()
    await expect(page.getByRole('dialog', { name: first.name, exact: true })).toBeVisible()
    // The first Escape may only close a hover tip left under the mouse.
    await expect(async () => { await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 400 }) }).toPass({ timeout: 5000 })
    await card.locator('.star').click(); await expect(page.locator('.toast').first()).toBeVisible()
    await card.evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 160 }))
    await card.screenshot({ path: resolve(out, name === 'Fenerbahçe' ? 'fener-candidate-desktop.png' : 'gencler-candidate-desktop.png'), animations: 'disabled' })
    await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await page.locator('.recruitment-hub').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    expect(await hub.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await card.screenshot({ path: resolve(out, name === 'Fenerbahçe' ? 'fener-candidate-mobile.png' : 'gencler-candidate-mobile.png'), animations: 'disabled' })
    checked.push({ name, elapsedMs, result })
  }
  expect(errors).toEqual([])
  await writeFile(resolve(out, 'real-check.json'), JSON.stringify({ careers: checked, errors }, null, 2))
})
