import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { RecruitmentBoard } from '../src/api/recruitmentBoard'
import type { PlanDraft, PlanSuggestions, PlanView, PlanResult } from '../src/api/transferPlan'

test('automatic packages on copied careers respect budgets, skip unknown costs and write nothing', async ({ browser, request }) => {
  const base = process.env.FC_PACKAGE_REAL_URL
  test.skip(!base, 'Requires an isolated career/app database copy.')
  test.setTimeout(120000)
  const saves = await (await request.get(`${base}/api/saves`)).json()
  const out = resolve('..', 'scratch', 'transfer-packages'); await mkdir(out, { recursive: true })
  const evidence: unknown[] = []
  for (const team of ['Fenerbahçe', 'Gençlerbirliği']) {
    const uid = saves.find((s: { userTeamName: string }) => s.userTeamName === team).saveUid
    const plan = await (await request.get(`${base}/api/recruitment/plan?saveUid=${uid}`)).json() as PlanView
    const b = await (await request.get(`${base}/api/recruitment/board?saveUid=${uid}`)).json() as RecruitmentBoard
    const own = new Set(b.view.context.players.map(p => p.id))
    const response = await request.post(`${base}/api/recruitment/plan/suggestions?saveUid=${uid}`, { data: { source: plan.currentSource, formation: b.view.profile.formation } })
    expect(response.status(), await response.text()).toBe(200)
    const list = await response.json() as PlanSuggestions
    expect(list.packages.map(p => p.goal)).toEqual(['low', 'balanced', 'high'])
    for (const p of list.packages.filter(x => x.draft)) {
      const r = p.result!, ids = r.players.map(x => x.playerId)
      expect(new Set(ids).size).toBe(ids.length); expect(ids.some(id => own.has(id))).toBe(false)
      expect(r.players.every(x => x.fee !== null && x.weeklyWage !== null)).toBe(true)
      expect(r.budget.status).toBe('conditional'); expect(r.budget.unknownSigningFees).toBe(ids.length)
      expect(r.budget.remainingWithoutSales).toBeGreaterThanOrEqual(0); expect(r.budget.wageRemainingWithoutSales).toBeGreaterThanOrEqual(0)
      expect(p.picks.every(x => x.role !== 'squad')).toBe(true)
      const placed = r.after.slots.flatMap(s => [s.starterId, s.rotationId]).filter(id => id != null)
      expect(new Set(placed).size).toBe(placed.length)
      expect(p.openNeedsAfter).toBeLessThanOrEqual(p.openNeedsBefore)
      const manual = await (await request.post(`${base}/api/recruitment/plan/preview?saveUid=${uid}`, { data: { source: plan.currentSource, expectedVersion: plan.version, draft: p.draft } })).json() as PlanResult
      expect(manual.budget).toEqual(r.budget); expect(manual.after.filledRotation).toBe(r.after.filledRotation)
    }
    expect(((await (await request.get(`${base}/api/recruitment/plan?saveUid=${uid}`)).json()) as PlanView).version).toBe(plan.version)
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
    await context.addInitScript(uid => localStorage.setItem('fcm.save', uid), uid)
    const page = await context.newPage(), errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(`${base}/transfer`)
    const pack = page.locator('.transfer-package'); await pack.locator(':scope > summary').click()
    await pack.getByRole('button', { name: 'Paket öner', exact: true }).click()
    await expect(pack.locator('.package-option')).toHaveCount(3)
    await pack.getByRole('region', { name: 'Otomatik paketler' }).screenshot({ path: resolve(out, `${uid}-suggestions-desktop.png`), animations: 'disabled' })
    await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await page.locator('.recruitment-hub').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await pack.getByRole('region', { name: 'Otomatik paketler' }).screenshot({ path: resolve(out, `${uid}-suggestions-mobile.png`), animations: 'disabled' })
    expect(errors).toEqual([]); await context.close()
    evidence.push({ team, unknownCostSkipped: list.unknownCostSkipped, packages: list.packages.map(p => ({ goal: p.goal, sameAs: p.sameAs, picks: p.picks, status: p.result?.budget.status, fees: p.result?.budget.knownFees, wages: p.result?.budget.knownWeeklyWages, needs: [p.openNeedsBefore, p.openNeedsAfter], xi: [p.xiBefore, p.xiAfter] })) })
  }
  await writeFile(resolve(out, 'suggestions-evidence.json'), JSON.stringify(evidence, null, 2))
})

test('copied careers persist joint packages, sales and academy scenarios without touching manager preferences', async ({ browser, request }) => {
  const base = process.env.FC_PACKAGE_REAL_URL
  test.skip(!base, 'Requires an isolated career/app database copy.')
  test.setTimeout(120000)
  const health = await (await request.get(`${base}/api/health`)).json()
  expect(String(health.database.path).toLowerCase()).toContain('scratch') // fail before any plan write against a live database
  const saves = await (await request.get(`${base}/api/saves`)).json()
  const out = resolve('..', 'scratch', 'transfer-packages'); await mkdir(out, { recursive: true })
  const evidence: unknown[] = []
  for (const team of ['Fenerbahçe', 'Gençlerbirliği']) {
    const uid = saves.find((s: { userTeamName: string }) => s.userTeamName === team).saveUid
    const beforeProfile = await (await request.get(`${base}/api/analysis/profile?saveUid=${uid}`)).json()
    const b = await (await request.get(`${base}/api/recruitment/board?saveUid=${uid}`)).json() as RecruitmentBoard
    const club = await (await request.get(`${base}/api/club?saveUid=${uid}`)).json()
    const before = await (await request.get(`${base}/api/recruitment/plan?saveUid=${uid}`)).json() as PlanView
    const own = new Set(b.view.context.players.map(p => p.id)), academyIds = new Set<number>(club.academy.map((p: { player: { id: number } }) => p.player.id))
    const candidates = [...new Map(b.positions.filter(p => p.inFormation).flatMap(p => p.recommendations.groups.flatMap(g => g.candidates))
      .filter(c => !own.has(c.id) && !academyIds.has(c.id)).map(c => [c.id, c])).values()].slice(0, 2)
    expect(candidates).toHaveLength(2)
    const sale = b.view.context.players.find(p => !b.view.profile.protectedPlayerIds.includes(p.id))!
    const youth = club.academy.find((p: { player: { id: number } }) => !own.has(p.player.id))
    const draft: PlanDraft = { formation: b.view.profile.formation!, transfers: candidates.map(c => ({ playerId: c.id, fee: null, weeklyWage: null, signingFee: null })),
      sales: [{ playerId: sale.id, proceeds: 1000000 }], promotions: youth ? [{ playerId: youth.player.id, fee: null, weeklyWage: null, signingFee: null }] : [] }
    const body = { source: before.currentSource, expectedVersion: before.version, draft }
    const preview = await request.post(`${base}/api/recruitment/plan/preview?saveUid=${uid}`, { data: body })
    expect(preview.status(), await preview.text()).toBe(200)
    const result = await preview.json() as PlanResult
    expect(result.source).toEqual(before.currentSource)
    expect(result.budget.knownFees).toBe(result.players.filter(p => p.action !== 'sale').reduce((sum, p) => sum + (p.fee ?? 0), 0))
    expect(result.budget.unknownSigningFees).toBe(2 + (youth ? 1 : 0))
    expect(result.budget.status).not.toBe('within')
    const assignments = result.after.slots.flatMap(s => [s.starterId, s.rotationId]).filter(id => id != null)
    expect(assignments).not.toContain(sale.id); expect(new Set(assignments).size).toBe(assignments.length)
    const saved = await request.put(`${base}/api/recruitment/plan?saveUid=${uid}`, { data: body })
    expect(saved.status(), await saved.text()).toBe(200)
    const persisted = await (await request.get(`${base}/api/recruitment/plan?saveUid=${uid}`)).json() as PlanView
    expect(persisted.version).toBe(before.version + 1); expect(persisted.draft).toEqual(draft)
    const afterProfile = await (await request.get(`${base}/api/analysis/profile?saveUid=${uid}`)).json()
    expect(afterProfile.version).toBe(beforeProfile.version); expect(afterProfile.profile).toEqual(beforeProfile.profile)
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
    await context.addInitScript(uid => localStorage.setItem('fcm.save', uid), uid)
    const page = await context.newPage(), errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(`${base}/transfer`)
    const pack = page.locator('.transfer-package')
    await expect(pack.locator(':scope > summary')).toContainText(`${2 + 1 + (youth ? 1 : 0)} oyuncu`)
    await pack.locator(':scope > summary').click()
    await expect(pack.getByRole('region', { name: 'Transfer paketi hesabı' })).toBeVisible()
    await expect(pack).toContainText('Satışlar gerçekleşirse kalan bonservis')
    await pack.screenshot({ path: resolve(out, `${uid}-desktop.png`), animations: 'disabled' })
    await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await page.locator('.recruitment-hub').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await pack.screenshot({ path: resolve(out, `${uid}-mobile.png`), animations: 'disabled' })
    expect(errors).toEqual([])
    await context.close()
    evidence.push({ team, source: result.source, status: result.budget.status, budget: result.budget,
      before: [result.before.filledStarters, result.before.filledRotation], after: [result.after.filledStarters, result.after.filledRotation], promoted: !!youth, version: persisted.version })
  }
  await writeFile(resolve(out, 'evidence.json'), JSON.stringify(evidence, null, 2))
})
