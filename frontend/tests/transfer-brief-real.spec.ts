import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { RecruitmentBoard } from '../src/api/recruitmentBoard'

test('real copied careers expose grounded formation priorities and open the right position', async ({ page }) => {
  const base = process.env.FC_HUB_REAL_URL
  test.skip(!base, 'Requires an isolated copied career database.')
  test.setTimeout(90000)
  const out = resolve('..', 'scratch', 'design-elements'); await mkdir(out, { recursive: true })
  const saves = await (await page.request.get(`${base}/api/saves`)).json()
  const evidence: unknown[] = [], errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const ranks: Record<string, number> = { urgent: 0, window: 1, 'next-season': 2 }
  for (const team of ['Fenerbahçe', 'Gençlerbirliği']) {
    const save = saves.find((s: { userTeamName: string }) => s.userTeamName === team)
    await page.addInitScript(uid => localStorage.setItem('fcm.save', uid), save.saveUid)
    await page.setViewportSize({ width: 1440, height: 1200 })
    const pending = page.waitForResponse(r => r.url().includes('/api/recruitment/board') && r.ok())
    await page.goto(`${base}/transfer`)
    const board = await (await pending).json() as RecruitmentBoard
    const needs = board.positions.filter(p => p.inFormation && p.priority in ranks).sort((a, b) => ranks[a.priority] - ranks[b.priority] || (b.needScore ?? -1) - (a.needScore ?? -1))
    const brief = page.getByRole('complementary', { name: 'Transfer öncelikleri' })
    await expect(brief).toBeVisible()
    if (needs.length) {
      const button = brief.locator('.hub-position').first()
      await expect(button).toContainText(({ GK: 'Kaleci', RB: 'Sağ bek', CB: 'Stoper', LB: 'Sol bek', CDM: 'Ön libero', CM: 'Merkez orta saha', CAM: '10 numara', RM: 'Sağ orta saha', LM: 'Sol orta saha', RW: 'Sağ kanat', LW: 'Sol kanat', ST: 'Santrfor' } as Record<string, string>)[needs[0].position])
      const codes = needs[0].priority === 'next-season' ? ['contract', 'future-gap'] : ['starter-gap', 'starter-quality', 'league-starter', 'rotation-gap', 'league-rotation', 'rotation-quality']
      await button.click()
      await expect(page.locator('.hub-results-heading')).toContainText(codes.map(code => needs[0].reasons.find(r => r.code === code)?.text).find(Boolean) ?? needs[0].reasons[0]?.text ?? '')
      await expect(page.locator('.hub-position.is-selected i')).toHaveText(needs[0].position)
    }
    evidence.push({ team, snapshot: board.view.context.snapshot.snapshotId, needs: needs.map(p => ({ position: p.position, priority: p.priority, score: p.needScore })), report: await page.locator('.hub-verdict').innerText() })
    await brief.screenshot({ path: resolve(out, team === 'Fenerbahçe' ? 'brief-fener-desktop.png' : 'brief-gencler-desktop.png') })
    await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await page.locator('.recruitment-hub').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await brief.screenshot({ path: resolve(out, team === 'Fenerbahçe' ? 'brief-fener-mobile.png' : 'brief-gencler-mobile.png') })
  }
  expect(errors).toEqual([])
  await writeFile(resolve(out, 'real-check.json'), JSON.stringify({ evidence, errors }, null, 2))
})
