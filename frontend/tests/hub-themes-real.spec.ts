import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { RecruitmentBoard } from '../src/api/recruitmentBoard'

test('real copied careers open directly', async ({ page }) => {
  const base = process.env.FC_HUB_REAL_URL
  test.skip(!base, 'Requires the isolated copied career database and scratch app.db.')
  test.setTimeout(120000)
  const out = resolve('..', 'scratch', 'transfer-hub-themes'); await mkdir(out, { recursive: true })
  const saves = await (await page.request.get(`${base}/api/saves`)).json()
  const evidence: unknown[] = [], errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  for (const team of ['Fenerbahçe', 'Gençlerbirliği']) {
    const save = saves.find((s: { userTeamName: string }) => s.userTeamName === team)
    const before = await (await page.request.get(`${base}/api/analysis/profile?saveUid=${save.saveUid}`)).json()
    const started = Date.now(), response = await page.request.get(`${base}/api/recruitment/board?saveUid=${save.saveUid}`)
    expect(response.ok()).toBeTruthy(); const board = await response.json() as RecruitmentBoard, elapsedMs = Date.now() - started
    expect(board.positions).toHaveLength(12); expect(board.view.context.snapshot.source).toBe('save')
    expect(board.positions.some(p => p.recommendations.league?.starterReference !== null)).toBe(true)
    expect((await (await page.request.get(`${base}/api/analysis/profile?saveUid=${save.saveUid}`)).json()).version).toBe(before.version)
    for (const pos of board.positions) for (const group of pos.recommendations.groups) for (const p of group.candidates) {
      if (!p.isFreeAgent) { expect(p.cost.feeLow).toBeNull(); expect(p.cost.feeHigh).toBeNull() }
      if (p.lastTransfer) expect(p.lastTransfer.snapshotId).toBe(board.view.context.snapshot.snapshotId)
      expect(pos.recommendations.scopeKey).toBe(board.view.context.scopeKey)
    }
    await page.addInitScript(uid => localStorage.setItem('fcm.save', uid), save.saveUid)
    await page.setViewportSize({ width: 1440, height: 1200 }); await page.goto(`${base}/transfer`)
    await expect(page.getByRole('heading', { name: 'Transfer', exact: true })).toBeVisible()
    await expect(page.locator('.hub-player-card').first()).toBeVisible()
    await expect(page.locator('.hub-player-card').first().locator('.hub-row-score')).toBeVisible()
    await expect(page.locator('.hub-player-card').first().getByRole('button', { name: 'Kıyasla', exact: true })).toBeVisible()
    await expect(page.locator('.hub-player-card').first().locator('.hub-row-cost')).toContainText(/Bonservis bilinmiyor|Serbest/)
    expect(await page.getByRole('group', { name: 'Transfer adayları' }).locator('.hub-player-card').count()).toBeLessThanOrEqual(5)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: resolve(out, team === 'Fenerbahçe' ? 'fener-hub-desktop.png' : 'gencler-hub-desktop.png'), fullPage: true, animations: 'disabled' })
    await page.getByRole('group', { name: 'Oyuncu amacı' }).getByRole('button', { name: /İlk 11/ }).click()
    await expect(page.locator('.hub-player-card').first()).toBeVisible()
    const card = page.locator('.hub-player-card').first()
    await card.locator('.hub-player-identity').click()
    await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await page.locator('.recruitment-hub').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await expect(card.locator('.hub-row-score')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Kıyasla', exact: true })).toBeVisible()
    await card.screenshot({ path: resolve(out, team === 'Fenerbahçe' ? 'fener-hub-card-mobile.png' : 'gencler-hub-card-mobile.png'), animations: 'disabled' })
    await page.getByRole('button', { name: 'Tercihlerini kişiselleştir' }).click()
    await expect(page.getByRole('dialog', { name: 'Beklerinden ne bekliyorsun?' })).toBeVisible()
    await page.getByRole('button', { name: /^Teknik / }).click(); await page.keyboard.press('Escape')
    expect((await (await page.request.get(`${base}/api/analysis/profile?saveUid=${save.saveUid}`)).json()).version).toBe(before.version)
    evidence.push({ team, elapsedMs, snapshot: board.view.context.snapshot, sourceBudget: board.transferBudgetSource, profileVersion: board.view.version,
      formation: board.view.profile.formation, league: board.positions[0].recommendations.league,
      counts: board.positions.map(p => ({ position: p.position, groups: p.recommendations.groups.map(g => ({ key: g.key, total: g.total })) })) })
  }
  expect(errors).toEqual([])
  await writeFile(resolve(out, 'real-check.json'), JSON.stringify({ careers: evidence, errors }, null, 2))
})
