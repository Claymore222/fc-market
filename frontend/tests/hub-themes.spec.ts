import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ManagerProfile } from '../src/api/analysis'
import type { RecruitmentBoard } from '../src/api/recruitmentBoard'
import { THEMES } from '../src/lib/theme'
import type { PlanDraft, PlanResult, PlanSource, PlanView } from '../src/api/transferPlan'

const catalog = JSON.parse(readFileSync(resolve('..', 'config/squad-analysis.json'), 'utf8'))
const positions = ['GK', 'RB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'ST']
const defaults = (): ManagerProfile => ({ formation: '4-3-3', secondaryFormation: null, attack: ['balanced'], defense: 'mid-block', tempo: 'balanced', defensiveLine: null, horizon: 'balanced', matchMode: 'mixed', transferBudget: 20000000, weeklyWageBudget: 50000, reservePercent: 15, targetTransfers: 2, minAge: null, maxAge: null, preferredLeagueIds: [], protectedPlayerIds: [], departurePlayerIds: [], rolePreferences: {}, playerPreferences: {} })
async function fixture(page: Page) {
  let revision = 1, fail = false, delay = false, release: (() => void) | undefined, savedTheme: string | null = null
  let transform = (value: RecruitmentBoard) => value
  const stored = new Map<string, { profile: ManagerProfile; version: number }>(), writes: unknown[] = [], reads: string[] = []
  const plans = new Map<string, PlanView>(), planWrites: unknown[] = []
  let planFailure = false, planConflict = false
  let delayPreview = false, releasePreview: (() => void) | undefined
  let suggestDelay = false, suggestEmpty = false, suggestNoNeed = false, releaseSuggest: (() => void) | undefined
  const snap = (key: string) => ({ snapshotId: `${key}-disk`, saveUid: key.split('@')[0], gameDate: '2030-07-28', seasonEndYear: 2031, userTeamId: 10, userTeamName: key.startsWith('A') ? 'Fenerbahçe' : 'Gençlerbirliği', transferBudget: 20000000, wageBudget: null, careerKey: key.includes('@') ? key : key + '@1', branch: 1, source: key.includes('@') ? 'export' : 'save', revision })
  const row = (key: string) => stored.get(key) ?? { profile: defaults(), version: 0 }
  const board = (key: string): RecruitmentBoard => {
    const snapshot = snap(key), saved = row(key)
    return { formationSource: 'profile', transferBudgetSource: 'save', wageBudgetSource: 'save', teamReference: 82, warnings: ['Geçmiş transfer yeni fiyat değildir.'],
      view: { version: saved.version, updatedAt: null, profile: saved.profile, savedConfigVersion: null, savedSnapshotId: null, savedSnapshotRevision: null,
        context: { snapshot: snapshot as RecruitmentBoard['view']['context']['snapshot'], scopeKey: snapshot.careerKey, viewMode: key.includes('@') ? 'preview' : 'saved', configVersion: '3-test', suggestedFormation: '4-3-3', players: [], inputs: {}, coverage: [], catalog, roles: [], leagues: [] } },
      positions: positions.map((pos, index) => ({ position: pos, inFormation: !['CAM', 'RM', 'LM'].includes(pos), formation: '4-3-3', slot: pos, priority: pos === 'LB' ? 'window' : 'sufficient', needScore: pos === 'LB' ? 70 : 0, reasons: [{ code: 'rotation-gap', text: 'Sol bekte bağımsız rotasyon seçeneği eksik.' }],
        recommendations: { reportId: `${key}-${pos}`, snapshot: snapshot as RecruitmentBoard['view']['context']['snapshot'], scopeKey: snapshot.careerKey, viewMode: key.includes('@') ? 'preview' : 'saved', configVersion: '2-test', formation: '4-3-3', slot: pos, poolSize: 20000, excluded: {}, internal: [], warnings: [], league: { leagueId: 68, name: 'Süper Lig', starterReference: 73.8, measuredClubs: 18 },
          target: { position: pos, label: 'İki yönlü oyuncu', preferences: saved.profile.playerPreferences?.[pos] ? ['Teknik tercih'] : [], attributes: {}, critical: [], styles: [], roleId: null, preferredFoot: null, starterMinimum: 80, rotationMinimum: 74, developmentMinimum: 64, labels: {} },
          groups: ['starter', 'rotation', 'development'].map((group, g) => ({ key: group, label: group, minimumOverall: 70, total: 40, candidates: Array.from({ length: 10 }, (_, i) => ({ id: 1000 + index * 100 + g * 10 + i, name: `${pos} Aday ${i + 1}`, club: 'Örnek Kulüp', clubId: 20, league: 'Süper Lig', positions: [pos], age: g === 2 ? 18 : 25, overall: 82 - i, potential: 90, score: 90 - i, attributeScore: 85, qualityScore: 80, developmentScore: 90, bonus: 0, knownAttributes: 8, totalAttributes: 8, roleLevel: null, styles: [], stylesPlus: [], estimatedValue: 8000000, currentWage: i === 1 ? null : 15000, recordedWageOnly: false, isFreeAgent: false,
            cost: { feeLow: null, feeHigh: null, wageLow: 15000, wageHigh: 15000, status: i === 1 ? 'unknown' : 'reference-within', referenceAmount: 8000000, referenceKind: 'value-model' },
            lastTransfer: i === 0 ? { amount: 6500000, date: '2029-07-01', fromTeamId: 30, fromClub: 'Eski Kulüp', toTeamId: 20, toClub: 'Örnek Kulüp', snapshotId: snapshot.snapshotId } : null,
            tags: [pos === 'LB' ? 'Hızlı bek' : 'Teknik oyuncu'], comparedPlayerId: 1, comparedPlayerName: 'Mevcut Oyuncu', overallGain: 3, attributeGain: 5, strengths: [{ key: 'stamina', label: 'Dayanıklılık', value: 85, weight: 3 }], weaknesses: [], reasons: ['Kayıtlı mevki uyumlu; mevcut oyuncuya profil katkısı sağlar.'] })) })) } })) }
  }
  const player = (id: number) => ({ id, name: `Oyuncu ${id}`, position: id === 1 ? 'GK' : 'CM', positions: ['CM'], age: 24, overall: 82, potential: 90, wage: 10000, value: 5000000 })
  const club = (key: string) => ({ snapshot: snap(key), club: { id: 10, name: snap(key).userTeamName, league: 'Süper Lig', color1: '#3347a8', color2: '#f7d04b' }, summary: { players: 11, bestXiAverage: 82, avgAge: 24, totalValue: 20000000, weeklyWage: 100000, expiring: 1, injured: 0, loanIn: 0, loanOut: 0 }, squad: Array.from({ length: 11 }, (_, i) => ({ player: player(i + 1), role: 'XI', jersey: i + 1, slot: catalog.formations['4-3-3'][i], slotRating: 82, form: 3, injured: false, loanFromTeamId: null, loanEnd: null })), table: [], setPieces: [], fixtures: [
    { id: 1, date: '2030-07-27', homeTeam: snap(key).userTeamName, awayTeam: 'Rakip Takım', homeTeamId: 10, awayTeamId: 20, isHome: true, homeGoals: 2, awayGoals: 1, competition: 'Hazırlık', time: '20:00' },
    { id: 2, date: '2030-08-01', homeTeam: snap(key).userTeamName, awayTeam: 'Yeni Rakip', homeTeamId: 10, awayTeamId: 30, isHome: true, homeGoals: null, awayGoals: null, competition: 'Süper Lig', time: '19:00' } ] })
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), key = url.searchParams.get('saveUid') ?? 'A', path = url.pathname
    if (!path.startsWith('/api/')) return route.continue()
    const respond = (json: unknown, status = 200) => route.fulfill({ json, status })
    if (path === '/api/settings/theme') { if (route.request().method() === 'PUT') savedTheme = route.request().postDataJSON().theme; return respond({ theme: savedTheme }) }
    if (path === '/api/recruitment/board') { reads.push(key); const data = transform(board(key)); if (delay) { delay = false; await new Promise<void>(done => { release = done }) } return fail ? respond({ title: 'Kaynak geçici olarak kapalı' }, 503) : respond(data) }
    if (path === '/api/analysis/profile') {
      if (route.request().method() === 'GET') return respond(board(key).view)
      const body = route.request().postDataJSON(); writes.push(body)
      if (body.snapshotRevision !== revision || body.expectedVersion !== row(key).version) return respond({ title: 'Kariyer değişti; güncel veriyi yükle.' }, 409)
      stored.set(key, { profile: body.profile, version: row(key).version + 1 }); return respond(board(key).view)
    }
    if (path === '/api/saves') return respond(['A', 'Z'].map(k => ({ saveUid: k, userTeamName: snap(k).userTeamName, latest: snap(k), branches: [{ branch: 1, careerKey: k + '@1', active: true }], snapshotCount: 1 })))
    if (path === '/api/health') return respond({ status: 'ok', database: { ok: true }, fieldMap: { warnings: [] } })
    if (path === '/api/sync') return respond({ current: snap(key), saved: snap(key), pendingExport: null, issues: [] })
    if (path === '/api/club') return respond({ ...club(key), academy: [{ player: { ...player(501), name: 'Akademi Adayı', overall: 60, potential: 90 } }] })
    if (path.startsWith('/api/recruitment/plan')) {
      const current = transform(board(key))
      const source: PlanSource = { scopeKey: current.view.context.scopeKey, viewMode: current.view.context.viewMode, snapshotId: current.view.context.snapshot.snapshotId,
        revision, configVersion: current.view.context.configVersion, recruitmentVersion: current.positions[0].recommendations.configVersion, planVersion: '1-test', profileVersion: current.view.version }
      if (route.request().method() === 'GET') {
        const saved = plans.get(key)
        return respond(saved ? { ...saved, currentSource: source, stale: saved.result?.source.revision !== revision } : { currentSource: source, version: 0, draft: null, result: null, updatedAt: null, stale: false })
      }
      if (planFailure) return respond({ title: 'Paket servisi geçici olarak kapalı.' }, 503)
      if (path.endsWith('/suggestions')) {
        const body = route.request().postDataJSON(), result = (id: number, knownFees: number) => ({ source, snapshot: snap(key), createdAt: '2026-10-31',
          players: [{ playerId: id, name: `Aday ${id}`, positions: ['LB'], action: 'transfer', fee: knownFees, feeSource: 'value-model', weeklyWage: 9000, wageSource: 'estimate', signingFee: null }],
          budget: { transferBudget: 8500000, weeklyWageBudget: 85000, knownFees, unknownFees: 0, knownWeeklyWages: 9000, unknownWeeklyWages: 0, knownSigningFees: 0, unknownSigningFees: 1, knownSaleProceeds: 0, unknownSaleProceeds: 0, knownWageRelease: 0, unknownWageRelease: 0,
            remainingWithoutSales: 8500000 - knownFees, wageRemainingWithoutSales: 76000, remainingWithSales: 8500000 - knownFees, wageRemainingWithSales: 76000, status: 'conditional',
            range: { feeLow: knownFees * .9, feeHigh: knownFees * 5, wageLow: 8100, wageHigh: 13500, highFitsBudget: knownFees * 5 <= 8500000 } },
          before: { formation: body.formation, filledStarters: 11, filledRotation: 8, slots: [{ slot: 'LB', position: 'LB', starterRating: 80, rotationRating: null }] },
          after: { formation: body.formation, filledStarters: 11, filledRotation: 9, slots: [{ slot: 'LB', position: 'LB', starterRating: 80, rotationRating: 78 }] },
          warnings: [{ code: 'scenario', text: 'Oyunda işlem yapmaz.' }] })
        const option = (goal: string, id: number, fee: number) => ({ goal, draft: { formation: body.formation, transfers: [{ playerId: id, fee: null, weeklyWage: null, signingFee: null }], sales: [], promotions: [] }, result: result(id, fee),
          picks: [{ playerId: id, name: `Aday ${id}`, slot: 'LB', role: 'rotation', ratingBefore: null, ratingAfter: 78 }], openNeedsBefore: 1, openNeedsAfter: 0, xiBefore: 80, xiAfter: 80.5, sameAs: null })
        if (suggestDelay) { suggestDelay = false; await new Promise<void>(done => { releaseSuggest = done }) }
        const noNeed = { goal: 'low', draft: null, result: null, picks: [], openNeedsBefore: 0, openNeedsAfter: 0, xiBefore: 80, xiAfter: 80, sameAs: null, empty: 'no-need' }
        return respond({ source, formation: body.formation, packages: suggestEmpty ? [] : [suggestNoNeed ? noNeed : option('low', 2001, 500000), option('balanced', 2002, 2000000), { ...option('high', 2002, 2000000), sameAs: 'balanced' }],
          unknownCostSkipped: 2, notes: suggestEmpty ? [{ code: 'budget', text: 'Bonservis veya maaş bütçesi bilinmiyor.' }] : [{ code: 'rule', text: 'Paketler kural tabanlı aramayla üretilir.' }, { code: 'unknown-cost', text: '2 aday dışarıda kaldı; bilinmeyen maliyet ucuz sayılmadı.' }] })
      }
      const body = route.request().postDataJSON(), draft = body.draft as PlanDraft
      if (JSON.stringify(body.source) !== JSON.stringify(source)) return respond({ title: 'Paket kaynağı değişti.' }, 409)
      const candidates = current.positions.flatMap(p => p.recommendations.groups.flatMap(g => g.candidates))
      const players = [...draft.transfers, ...draft.promotions].map(p => {
        const c = candidates.find(c => c.id === p.playerId), promo = draft.promotions.includes(p)
        return { playerId: p.playerId, name: promo ? 'Akademi Adayı' : c?.name ?? 'Aday', positions: c?.positions ?? ['CM'], action: promo ? 'promotion' : 'transfer',
          fee: promo ? 0 : p.fee ?? c?.cost.referenceAmount ?? null, feeSource: p.fee != null ? 'user' : 'value-model', weeklyWage: p.weeklyWage ?? c?.currentWage ?? null,
          wageSource: p.weeklyWage != null ? 'user' : 'estimate', signingFee: p.signingFee }
      }).concat(draft.sales.map(p => ({ playerId: p.playerId, name: `Oyuncu ${p.playerId}`, positions: ['CM'], action: 'sale', fee: p.proceeds, feeSource: 'user', weeklyWage: 10000, wageSource: 'current', signingFee: null })))
      const buys = players.filter(p => p.action !== 'sale'), sales = players.filter(p => p.action === 'sale')
      const knownFees = buys.reduce((n, p) => n + (p.fee ?? 0), 0), unknownFees = buys.filter(p => p.fee == null).length
      const knownWeeklyWages = buys.reduce((n, p) => n + (p.weeklyWage ?? 0), 0), unknownWeeklyWages = buys.filter(p => p.weeklyWage == null).length
      const knownSigningFees = buys.reduce((n, p) => n + (p.signingFee ?? 0), 0), unknownSigningFees = buys.filter(p => p.signingFee == null).length
      const knownSaleProceeds = sales.reduce((n, p) => n + (p.fee ?? 0), 0), unknownSaleProceeds = sales.filter(p => p.fee == null).length
      const knownWageRelease = sales.length * 10000
      const transferBudget = (current.view.profile.transferBudget ?? 0) * .85, weeklyWageBudget = (current.view.profile.weeklyWageBudget ?? 0) * .85
      const remainingWithoutSales = unknownFees ? null : transferBudget - knownFees - knownSigningFees
      const wageRemainingWithoutSales = unknownWeeklyWages ? null : weeklyWageBudget - knownWeeklyWages
      const remainingWithSales = remainingWithoutSales == null || unknownSaleProceeds ? null : remainingWithoutSales + knownSaleProceeds
      const wageRemainingWithSales = wageRemainingWithoutSales == null ? null : wageRemainingWithoutSales + knownWageRelease
      const depth = { formation: draft.formation, filledStarters: 11, filledRotation: 8, slots: [{ slot: 'LB', position: 'LB', starterRating: 80, rotationRating: null }] }
      const result = { source, snapshot: snap(key), createdAt: '2026-10-31', players,
        budget: { transferBudget, weeklyWageBudget, knownFees, unknownFees, knownWeeklyWages, unknownWeeklyWages, knownSigningFees, unknownSigningFees, knownSaleProceeds, unknownSaleProceeds, knownWageRelease, unknownWageRelease: 0,
          remainingWithoutSales, wageRemainingWithoutSales, remainingWithSales, wageRemainingWithSales,
          status: (remainingWithSales ?? 0) < 0 || (wageRemainingWithSales ?? 0) < 0 ? 'above' : remainingWithSales == null || wageRemainingWithSales == null ? 'unknown' : unknownSigningFees || sales.length ? 'conditional' : 'within' },
        before: depth, after: { ...depth, filledRotation: 8 + buys.length - sales.length, slots: [{ ...depth.slots[0], rotationRating: buys.length ? 78 : null }] },
        warnings: [{ code: 'scenario', text: 'Oyunda işlem yapmaz; satış gerçekleşmiş gelir değildir.' }] } as unknown as PlanResult
      if (path.endsWith('/preview')) {
        if (delayPreview) { delayPreview = false; await new Promise<void>(done => { releasePreview = done }) }
        return respond(result)
      }
      if (planConflict || body.expectedVersion !== (plans.get(key)?.version ?? 0)) return respond({ title: 'Paket başka pencerede değiştirildi.' }, 409)
      planWrites.push(body)
      const saved: PlanView = { currentSource: source, version: body.expectedVersion + 1, draft, result, updatedAt: result.createdAt, stale: false }
      plans.set(key, saved); return respond(saved)
    }
    if (path === '/api/shortlist') return respond({ snapshot: snap(key), count: 0, targetPriceTotal: 0, items: [] })
    if (path === '/api/feed') return respond({ items: [], snapshotCount: 3 })
    if (path.startsWith('/api/shortlist/')) return respond({})
    return respond({}, 404)
  })
  return { writes, reads, stored, planWrites, plans, delaySuggest: () => { suggestDelay = true }, releaseSuggest: () => releaseSuggest?.(), emptySuggest: (value: boolean) => { suggestEmpty = value }, noNeedSuggest: () => { suggestNoNeed = true }, delayPreview: () => { delayPreview = true }, releasePreview: () => releasePreview?.(), failPlan: (value: boolean) => { planFailure = value }, conflictPlan: (value: boolean) => { planConflict = value }, theme: () => savedTheme, setTheme: (id: string) => { savedTheme = id }, bump: () => { revision++ }, fail: (value: boolean) => { fail = value }, delay: () => { delay = true }, release: () => release?.(), transform: (fn: typeof transform) => { transform = fn } }
}

test('automatic packages stay proposals until one is chosen, and taking one needs no recalculation', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer'); await expect(page.locator('.hub-player-card')).toHaveCount(5)
  const pack = page.locator('.transfer-package'); await pack.locator(':scope > summary').click()
  const area = pack.getByRole('region', { name: 'Otomatik paketler' })
  await expect(area.locator('.package-option')).toHaveCount(0)
  await area.getByRole('button', { name: 'Paket öner', exact: true }).click()
  await expect(area.locator('.package-option')).toHaveCount(3)
  expect(api.planWrites).toHaveLength(0)
  await expect(pack.locator(':scope > summary')).toContainText('Adayları birlikte planla')
  const low = area.getByRole('article', { name: 'Düşük harcama paketi' })
  await expect(low).toContainText('Aday 2001'); await expect(low).toContainText('LB · Rotasyon · 78'); await expect(low).toContainText('1 → 0'); await expect(low).toContainText('80 → 80,5')
  await expect(low).toContainText('Olası aralık (varsayım)'); await expect(low.locator('.package-range strong')).toHaveCount(0)
  await expect(area.getByRole('article', { name: 'Dengeli paketi' }).locator('.package-range strong')).toHaveText('Üst uçta bütçe aşılır')
  await expect(area.getByRole('article', { name: 'Yüksek katkı paketi' })).toContainText('Dengeli paketiyle aynı')
  await expect(area.getByRole('article', { name: 'Yüksek katkı paketi' }).getByRole('button')).toHaveCount(0)
  await area.getByText('Paketler nasıl hazırlandı?').click(); await expect(area).toContainText('bilinmeyen maliyet ucuz sayılmadı')
  await low.getByRole('button', { name: 'Bu paketi taslağa al', exact: true }).click()
  await expect(pack.locator(':scope > summary')).toContainText('1 oyuncu')
  await expect(pack.getByRole('region', { name: 'Transfer paketi hesabı' })).toContainText('Koşullu bütçe uyumu')
  await expect(pack.getByRole('region', { name: 'Transfer paketi hesabı' })).toContainText('Olası aralık (varsayım)')
  const draft = area.getByRole('article', { name: 'Mevcut taslağın' })
  await expect(draft).toContainText('Aday 2001'); await expect(area.locator('.package-option')).toHaveCount(4)
  await pack.getByRole('button', { name: 'Paketi kaydet', exact: true }).click()
  await expect.poll(() => api.planWrites.length).toBe(1)
})
test('small club wages keep their precision', async ({ page }) => {
  const api = await fixture(page)
  api.transform(b => ({ ...b, view: { ...b.view, profile: { ...b.view.profile, weeklyWageBudget: 1650, reservePercent: 15 } } }))
  await page.goto('/transfer'); await expect(page.locator('.hub-facts')).toContainText('1,4 B€')
})
test('an empty low-spend package says there is nothing to fix', async ({ page }) => {
  const api = await fixture(page); api.noNeedSuggest(); await page.goto('/transfer'); await expect(page.locator('.hub-player-card')).toHaveCount(5)
  const pack = page.locator('.transfer-package'); await pack.locator(':scope > summary').click()
  await pack.getByRole('button', { name: 'Paket öner', exact: true }).click()
  const low = pack.getByRole('article', { name: 'Düşük harcama paketi' })
  await expect(low).toContainText('kapatılması gereken açık ihtiyaç yok'); await expect(low.getByRole('button')).toHaveCount(0)
})
test('taking a package over a filled draft asks first and keeps the draft on cancel', async ({ page }) => {
  await fixture(page); await page.goto('/transfer'); await expect(page.locator('.hub-player-card')).toHaveCount(5)
  await page.locator('.hub-player-card').first().getByRole('button', { name: 'Pakete ekle', exact: true }).click()
  const pack = page.locator('.transfer-package'); await pack.locator(':scope > summary').click()
  const area = pack.getByRole('region', { name: 'Otomatik paketler' })
  await area.getByRole('button', { name: 'Paket öner', exact: true }).click()
  const low = area.getByRole('article', { name: 'Düşük harcama paketi' })
  const before = await pack.locator('.package-players > li').first().innerText()
  await low.getByRole('button', { name: 'Bu paketi taslağa al', exact: true }).click()
  await expect(low).toContainText('Mevcut taslağın bu paketle değişecek')
  await low.getByRole('button', { name: 'Vazgeç', exact: true }).click()
  expect(await pack.locator('.package-players > li').first().innerText()).toBe(before)
  await low.getByRole('button', { name: 'Bu paketi taslağa al', exact: true }).click()
  await low.getByRole('button', { name: 'Evet, değiştir', exact: true }).click()
  await expect(pack.locator('.package-players > li').first()).toContainText('Aday 2001')
})
test('automatic packages hide on formation change, explain a missing budget and fit a phone', async ({ page }) => {
  const api = await fixture(page); await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/transfer'); await expect(page.locator('.hub-player-card')).toHaveCount(5)
  const pack = page.locator('.transfer-package'); await pack.locator(':scope > summary').click()
  const area = pack.getByRole('region', { name: 'Otomatik paketler' })
  await area.getByRole('button', { name: 'Paket öner', exact: true }).click()
  await expect(area.locator('.package-option')).toHaveCount(3)
  expect(await page.locator('.recruitment-hub').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await pack.getByLabel('Paket dizilişi', { exact: true }).selectOption('4-4-2')
  await expect(area.locator('.package-option')).toHaveCount(0)
  await expect(area.getByRole('button', { name: 'Paket öner', exact: true })).toBeVisible()
  api.emptySuggest(true); await area.getByRole('button', { name: 'Paket öner', exact: true }).click()
  await expect(area.getByRole('status')).toContainText('bütçesi bilinmiyor')
  await expect(area.locator('.package-option')).toHaveCount(0)
  api.emptySuggest(false); api.failPlan(true)
  await area.getByRole('button', { name: 'Yeniden öner', exact: true }).click()
  await expect(area.getByRole('alert')).toContainText('Paket servisi geçici olarak kapalı')
})
test('a delayed package suggestion cannot leak into a different career', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer'); await expect(page.locator('.hub-player-card')).toHaveCount(5)
  const pack = page.locator('.transfer-package'); await pack.locator(':scope > summary').click()
  api.delaySuggest(); await pack.getByRole('button', { name: 'Paket öner', exact: true }).click()
  await expect(pack.getByRole('button', { name: 'Hazırlanıyor…', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Kariyer değiştir' }).click(); await page.getByRole('button', { name: 'Gençlerbirliği kariyerini aç' }).click()
  await expect(page.locator('.hub-facts')).toHaveAttribute('aria-label', /Gençlerbirliği/); api.releaseSuggest()
  await page.locator('.transfer-package > summary').click()
  await expect(page.locator('.package-option')).toHaveCount(0)
})
test('a delayed package calculation cannot leak into a different career', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer')
  await page.locator('.hub-player-card').first().getByRole('button', { name: 'Pakete ekle', exact: true }).click()
  const pack = page.locator('.transfer-package'); await pack.locator(':scope > summary').click()
  api.delayPreview(); await pack.getByRole('button', { name: 'Paketi hesapla', exact: true }).click()
  await expect(pack.getByRole('button', { name: 'Paketi hesapla', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Kariyer değiştir', exact: true }).click()
  await page.getByRole('button', { name: 'Gençlerbirliği kariyerini aç', exact: true }).click()
  await expect(page.getByLabel('Gençlerbirliği transfer özeti')).toBeVisible()
  api.releasePreview()
  await pack.locator(':scope > summary').click()
  await expect(pack.getByRole('region', { name: 'Transfer paketi hesabı' })).toHaveCount(0)
  await expect(pack).not.toContainText('1 oyuncu')
  expect(api.planWrites).toHaveLength(0)
})

test('a package read failure never becomes an empty editable plan and can be retried', async ({ page }) => {
  await fixture(page)
  let unavailable = true
  await page.route('**/api/recruitment/plan?*', async (route, request) => {
    if (request.method() !== 'GET' || !unavailable) return route.fallback()
    return route.fulfill({ status: 503, json: { title: 'Kaydedilmiş paket okunamıyor.' } })
  })
  await page.goto('/transfer')
  const pack = page.locator('.transfer-package'); await pack.locator(':scope > summary').click()
  await expect(pack.getByRole('alert')).toContainText('Kaydedilmiş paket okunamıyor')
  await expect(page.locator('.hub-player-card').first().getByRole('button', { name: 'Pakete ekle', exact: true })).toBeDisabled()
  await expect(pack.getByRole('button', { name: 'Paketi kaydet', exact: true })).toHaveCount(0)
  unavailable = false; await pack.getByRole('button', { name: 'Paketi yeniden yükle', exact: true }).click()
  await expect(page.locator('.hub-player-card').first().getByRole('button', { name: 'Pakete ekle', exact: true })).toBeEnabled()
})

test('a joint package preserves unsaved edits, calculates shared limits and saves explicitly', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer')
  const rows = page.locator('.hub-player-card')
  await rows.first().getByRole('button', { name: 'Pakete ekle', exact: true }).click()
  await rows.nth(1).getByRole('button', { name: 'Pakete ekle', exact: true }).click()
  const pack = page.locator('.transfer-package'); await pack.locator(':scope > summary').click()
  await expect(pack).toContainText('2 oyuncu')
  await pack.getByLabel('Bonservis senaryosu (€)', { exact: true }).nth(0).fill('13000000')
  await pack.getByLabel('Bonservis senaryosu (€)', { exact: true }).nth(1).fill('13000000')
  await page.reload(); await pack.locator(':scope > summary').click()
  await expect(pack.getByLabel('Bonservis senaryosu (€)', { exact: true }).first()).toHaveValue('13000000')
  expect(api.planWrites).toHaveLength(0)
  await pack.getByRole('button', { name: 'Paketi hesapla', exact: true }).click()
  await expect(pack.getByRole('region', { name: 'Transfer paketi hesabı' })).toContainText('Senaryo bütçe dışında')
  await expect(pack).toContainText('26,0 M€')
  await pack.getByRole('button', { name: 'Paketi kaydet', exact: true }).click()
  await expect(pack).toContainText('Kaydedildi · sürüm 1'); expect(api.planWrites).toHaveLength(1)
  await page.reload(); await pack.locator(':scope > summary').click()
  await expect(pack).toContainText('2 oyuncu')
  await expect(pack.getByLabel('Bonservis senaryosu (€)', { exact: true }).first()).toHaveValue('13000000')
  await page.getByRole('button', { name: 'Kariyer değiştir', exact: true }).click()
  await page.getByRole('button', { name: 'Gençlerbirliği kariyerini aç', exact: true }).click()
  await expect(page.locator('.transfer-package > summary')).toContainText('Adayları birlikte planla')
})

test('package sales, promotion and formation are scenarios and stale inputs survive errors', async ({ page }) => {
  const api = await fixture(page)
  api.transform(b => ({ ...b, view: { ...b.view, context: { ...b.view.context, players: [{ id: 1, name: 'Satılabilir Oyuncu', age: 24, overall: 80, potential: 85,
    positions: ['GK'], slot: 'GK', weeklyWage: 10000, contractEnd: 2031, fitness: null, roles: null, playStyles: null, playStylesPlus: null,
    attributes: {}, availability: {}, loan: { value: null, state: 'missing', origin: null, note: null } }] } } }))
  await page.goto('/transfer')
  await page.locator('.hub-player-card').first().getByRole('button', { name: 'Pakete ekle', exact: true }).click()
  const pack = page.locator('.transfer-package'); await pack.locator(':scope > summary').click()
  await pack.getByLabel('Satış senaryosuna ekle', { exact: true }).selectOption('1')
  await pack.getByLabel('Satış geliri senaryosu (€)', { exact: true }).fill('5000000')
  await pack.getByLabel('Akademiden terfi senaryosu', { exact: true }).selectOption('501')
  await pack.getByLabel('Paket dizilişi', { exact: true }).selectOption('4-4-2')
  api.failPlan(true); await pack.getByRole('button', { name: 'Paketi hesapla', exact: true }).click()
  await expect(pack.getByRole('alert')).toContainText('Paket servisi geçici olarak kapalı')
  await expect(pack.getByLabel('Satış geliri senaryosu (€)', { exact: true })).toHaveValue('5000000')
  await expect(pack.getByRole('button', { name: 'Paketi kaydet', exact: true })).toBeDisabled()
  api.failPlan(false); await pack.getByRole('button', { name: 'Paketi hesapla', exact: true }).click()
  await expect(pack).toContainText('Satışlar gerçekleşirse kalan bonservis')
  await expect(pack.getByRole('region', { name: 'Transfer paketi hesabı' })).toContainText('4-4-2')
  api.conflictPlan(true); await pack.getByRole('button', { name: 'Paketi kaydet', exact: true }).click()
  await expect(pack.getByRole('alert')).toContainText('başka pencerede')
  expect(api.planWrites).toHaveLength(0)
  api.bump(); await page.getByRole('button', { name: 'Yenile', exact: true }).click()
  await expect(pack.getByRole('button', { name: 'Güncel veriyle hesapla', exact: true })).toBeVisible()
  await expect(pack.getByLabel('Satış geliri senaryosu (€)', { exact: true })).toHaveValue('5000000')
  await expect(pack.getByRole('button', { name: 'Paketi kaydet', exact: true })).toBeDisabled()
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await page.locator('.recruitment-hub').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await pack.getByRole('button', { name: 'Önerilere dön', exact: true }).click()
  await expect(pack).not.toHaveAttribute('open')
  await expect(pack.locator(':scope > summary')).toBeFocused()
})

test('team brief orders actual formation needs, explains each one and opens the matching candidates', async ({ page }) => {
  const api = await fixture(page)
  api.transform(b => ({ ...b, positions: b.positions.map(p => {
    const priority = p.position === 'CB' ? 'urgent' : p.position === 'LB' || p.position === 'ST' ? 'window' : p.position === 'CM' ? 'next-season' : !p.inFormation ? 'urgent' : 'sufficient'
    return { ...p, priority, needScore: p.position === 'LB' ? 85 : p.position === 'ST' ? 70 : 100, reasons: [{ code: priority === 'urgent' ? 'starter-gap' : priority === 'next-season' ? 'contract' : 'rotation-gap', text: `${p.position} için kayıtlı ihtiyaç gerekçesi.` }] }
  }) }))
  await page.goto('/transfer')
  await expect(page.locator('.hub-verdict')).toHaveText('Öncelik: Stoper. Sonra Sol bek, Santrfor. Gelecek sezon: Merkez orta saha.')
  const rail = page.getByRole('complementary', { name: 'Transfer öncelikleri' })
  await expect(rail.locator('.hub-position').first()).toContainText('Stoper')
  await expect(rail.getByRole('heading', { name: 'Bu dönem' })).toBeVisible(); await expect(rail.getByRole('heading', { name: 'Gelecek sezon' })).toBeVisible()
  await expect(rail).not.toContainText('10 numara')
  await expect(page.getByRole('region', { name: 'Stoper önerileri' })).toContainText('CB için kayıtlı ihtiyaç gerekçesi.')
  await rail.locator('.hub-position').filter({ hasText: 'Sol bek' }).click()
  await expect(page.getByRole('heading', { name: 'Sol bek', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Sol bek önerileri' })).toContainText('LB için kayıtlı ihtiyaç gerekçesi.')
  expect(api.writes).toHaveLength(0)
})

test('team brief distinguishes a covered squad from insufficient data without forcing a transfer', async ({ page }) => {
  const api = await fixture(page)
  api.transform(b => ({ ...b, positions: b.positions.map(p => ({ ...p, priority: 'sufficient', needScore: 0, reasons: [] })) }))
  await page.goto('/transfer')
  const verdict = page.locator('.hub-verdict')
  await expect(verdict).toHaveText('Bu dönem takviye gerekmiyor.')
  api.transform(b => ({ ...b, positions: b.positions.map(p => ({ ...p, priority: 'unknown', needScore: null, reasons: [] })) }))
  await page.reload(); await expect(verdict).toContainText('Kesin bir sıra çıkarılamadı')
})

test('transfer opens directly with five candidates, three goals, explicit fee evidence and flexible counts', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer')
  await expect(page.getByRole('heading', { name: 'Transfer', exact: true })).toBeVisible()
  await expect(page.locator('.hub-player-card')).toHaveCount(5); expect(api.writes).toHaveLength(0)
  await expect(page.getByRole('heading', { name: 'Sol bek', exact: true })).toBeVisible()
  await expect(page.locator('.hub-player-card').first()).toContainText('6,5 M€')
  await expect(page.locator('.hub-player-card').first().locator('.hub-candidate-cost-note')).toContainText('bugünkü satış fiyatı değil')
  await expect(page.locator('.hub-player-card').nth(1).locator('.hub-row-cost')).toContainText('Bonservis bilinmiyor')
  await expect(page.locator('.hub-player-card').nth(1).locator('.hub-row-cost')).toContainText('Maliyet bilgisi eksik')
  await page.getByRole('button', { name: 'Daha fazla göster' }).click(); await expect(page.locator('.hub-player-card')).toHaveCount(10)
  await expect(page.getByRole('button', { name: 'Daha fazla göster' })).toHaveCount(0)
  await page.getByRole('group', { name: 'Oyuncu amacı' }).getByRole('button', { name: /Genç yatırım/ }).click()
  await expect(page.locator('.hub-player-card').first()).toContainText('18 yaş')
  await page.getByRole('button', { name: 'Tüm mevkiler', exact: true }).click()
  await expect(page.locator('.hub-position')).toHaveCount(12)
  await page.locator('.hub-position').filter({ hasText: '10 numara' }).click()
  await expect(page.getByRole('heading', { name: '10 numara', exact: true })).toBeVisible()
  await expect(page.locator('.hub-results-heading')).toContainText('alternatif senaryosu')
})
test('equal priorities keep the same winner in the brief and the opened position', async ({ page }) => {
  const api = await fixture(page)
  api.transform(b => ({ ...b, positions: b.positions.map(p => p.inFormation ? { ...p, priority: 'next-season', needScore: p.position === 'ST' ? 45 : 30, reasons: [{ code: 'contract', text: `${p.position} sözleşme riski.` }] } : p) }))
  await page.goto('/transfer')
  await expect(page.locator('.hub-verdict')).toContainText('Gelecek sezon: Santrfor')
  await expect(page.locator('.hub-position').first()).toContainText('Santrfor')
  await expect(page.getByRole('heading', { name: 'Santrfor', exact: true })).toBeVisible()
})

test('a weak starter line opens the starter list, a thin bench the rotation list', async ({ page }) => {
  const api = await fixture(page)
  api.transform(b => ({ ...b, positions: b.positions.map(p => p.position === 'ST' ? { ...p, priority: 'window', needScore: 90, reasons: [{ code: 'league-starter', text: 'İlk seçenekler ligde zayıf kalıyor.' }] } : p) }))
  await page.goto('/transfer')
  const purposes = page.getByRole('group', { name: 'Oyuncu amacı' })
  await expect(purposes.getByRole('button', { name: /İlk 11/ })).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.hub-position').filter({ hasText: 'Sol bek' }).click()
  await expect(purposes.getByRole('button', { name: /Yedek/ })).toHaveAttribute('aria-pressed', 'true')
})

test('the page answers first and stays short: five rows, no repeated reports', async ({ page }) => {
  await fixture(page); await page.goto('/transfer')
  await expect(page.locator('.hub-verdict')).toContainText('Öncelik: Sol bek')
  await expect(page.locator('.hub-player-card')).toHaveCount(5)
  await expect(page.locator('.hub-player-card').first().locator('.hub-player-reasons ul')).toBeHidden()
  await page.locator('.hub-player-card').first().getByText('Neden önerildi?').click()
  await expect(page.locator('.hub-player-card').first().locator('.hub-player-reasons ul')).toBeVisible()
  expect(await page.locator('.hub-player-card').nth(1).evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(150)
})

test('recommendation rows expose fit, measured profile and honest cost evidence before expanding', async ({ page }) => {
  const api = await fixture(page)
  api.transform(b => ({ ...b, positions: b.positions.map(p => ({ ...p, recommendations: { ...p.recommendations,
    groups: p.recommendations.groups.map(g => ({ ...g, candidates: g.candidates.map(c => ({ ...c, cost: { ...c.cost, expectedWage: c.currentWage } })) })) } })) }))
  await page.goto('/transfer')
  const rows = page.getByRole('group', { name: 'Transfer adayları' }).locator('.hub-player-card')
  const first = rows.first(), second = rows.nth(1)
  await expect(first.getByLabel('Uyum: 90,0 / 100')).toBeVisible()
  await expect(first.getByText('Hızlı bek', { exact: true })).toBeVisible()
  await expect(first.locator('.hub-candidate-profile')).toContainText('Dayanıklılık 85')
  await expect(first.locator('.hub-candidate-profile')).toContainText('+3 tahmini mevki puanı')
  await expect(first.locator('.hub-row-wage')).toHaveText('~15 B€tahmini')
  await expect(first.locator('.hub-row-cost')).toContainText('Tahmini bütçe uyumu')
  await expect(first.locator('.hub-row-cost')).toContainText('Bonservis bilinmiyor')
  await expect(first.locator('.hub-candidate-cost-note')).toHaveText('Son transfer: 6,5 M€ · 1 Temmuz 2029 · bugünkü satış fiyatı değil.')
  await expect(second.locator('.hub-candidate-cost-note')).toContainText('Değer tahmini: 8,0 M€')
  await expect(second.locator('.hub-row-cost')).toContainText('Maliyet bilgisi eksik')
  await expect(first.locator('details')).not.toHaveAttribute('open')
  await expect(first.getByRole('button', { name: 'Kıyasla', exact: true })).toBeVisible()
  await expect(page.locator('.hub-budget-note')).toContainText('%15 güvenlik payı')
  for (const width of [1426, 1024, 390]) {
    await page.setViewportSize({ width, height: 953 })
    expect(await first.evaluate(el => {
      const box = el.getBoundingClientRect()
      return [...el.querySelectorAll('.hub-row-score,.hub-row-cost,.hub-row-actions,.hub-profile-tag')].every(child => {
        const r = child.getBoundingClientRect()
        return r.width > 0 && r.left >= box.left && r.right <= box.right + 1
      })
    })).toBe(true)
    expect(await page.locator('.recruitment-hub').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  }
})

test('unknown costs and recorded free-agent wages never become an asking price or active wage', async ({ page }) => {
  const api = await fixture(page)
  api.transform(b => ({ ...b, positions: b.positions.map(p => ({ ...p, recommendations: { ...p.recommendations,
    groups: p.recommendations.groups.map(g => ({ ...g, candidates: g.candidates.map((c, i) => ({ ...c,
      lastTransfer: null, tags: [], strengths: [], currentWage: i === 0 ? null : 15000, isFreeAgent: i === 1, recordedWageOnly: i === 1,
      cost: { ...c.cost, status: 'unknown', referenceAmount: null, referenceKind: null, expectedWage: null } })) })) } })) }))
  await page.goto('/transfer')
  const first = page.locator('.hub-player-card').first(), free = page.locator('.hub-player-card').nth(1)
  await expect(first.locator('.hub-row-wage')).toContainText('maaş bilinmiyor')
  await expect(first.locator('.hub-candidate-cost-note')).toHaveText('Bonservis için kullanılabilir fiyat referansı yok.')
  await expect(first.locator('.hub-candidate-profile')).not.toContainText('Hızlı')
  await expect(free.locator('.hub-row-wage')).toContainText('kayıttaki')
  await expect(free.locator('.hub-candidate-cost-note')).toContainText('imza ücreti ve yeni ücret talebi bilinmiyor')
  await free.locator('summary').click()
  await expect(free.locator('.hub-player-reasons')).toContainText('Aktif sözleşme veya yeni ücret talebi değildir.')
})

test('direct comparison adds the candidate and own player together, respecting the four-player limit', async ({ page }) => {
  const api = await fixture(page)
  await page.addInitScript(() => localStorage.setItem('fcmarket.compare', JSON.stringify([3, 4, 5])))
  await page.goto('/transfer')
  const first = page.locator('.hub-player-card').first()
  await expect(first.getByRole('button', { name: 'Kıyasla', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fcmarket.compare')!))).toEqual([3, 4, 5])
  await page.addInitScript(() => localStorage.setItem('fcmarket.compare', JSON.stringify([1310, 3, 4])))
  await page.reload()
  const button = first.getByRole('button', { name: 'Kıyasla', exact: true })
  await expect(button).toBeEnabled()
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/compare$/)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fcmarket.compare')!))).toEqual([1310, 3, 4, 1])
  expect(api.writes).toHaveLength(0)
})

test('free squad fixes, the contract plan and league context come before the market', async ({ page }) => {
  const api = await fixture(page)
  const items = Array.from({ length: 7 }, (_, i) => ({ playerId: i + 1, name: `Sözleşmeli ${i + 1}`, age: 27, rating: 72 - i, slot: 'ST', role: i < 2 ? 'starter' : 'rotation', weeklyWage: 9000, action: 'Önce yenile' }))
  api.transform(b => ({ ...b, league: { own: 69.9, median: 70.4, rank: 11, clubs: 18 }, contracts: { endYear: 2027, players: 15, squad: 28, starters: 7, wages: 94000, wageBill: 174000, items },
    xi: { savedAverage: 68.2, improvedAverage: 69.5, options: [{ slot: 'LB', position: 'LB', currentId: 1, currentName: 'Dursun', currentRating: 64, betterId: 2, betterName: 'Rodrigues', betterRating: 71, gain: 7, note: 'Gelişim için oynuyorsa bilinçli tercih olabilir.' }] },
    view: { ...b.view, context: { ...b.view.context, leagueObjective: { target: 6, stretch: 9, minimum: 1 } } } }))
  await page.goto('/transfer')
  const steps = page.getByRole('region', { name: 'Transferden önce yapılacaklar' })
  await expect(steps).toContainText('68,2 → 69,5'); await expect(steps).toContainText('Rodrigues 71'); await expect(steps).toContainText('+7')
  await expect(steps).toContainText("15 sözleşme 2027'de bitiyor"); await expect(steps).toContainText('%54')
  await expect(steps.locator('li:visible')).toHaveCount(0)
  await steps.locator('summary').first().click(); await expect(steps.locator('li:visible')).toHaveCount(1)
  await steps.locator('summary').last().click(); await expect(steps.locator('li:visible')).toHaveCount(8)
  const facts = page.getByLabel('Fenerbahçe transfer özeti')
  await expect(facts).toContainText('11. / 18'); await expect(facts).toContainText('Seviye 6')
  await page.setViewportSize({ width: 390, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('over-budget players stay apart from recommendations and wage room is explicit', async ({ page }) => {
  const api = await fixture(page)
  api.transform(b => ({ ...b, positions: b.positions.map(p => ({ ...p, recommendations: { ...p.recommendations, groups: p.recommendations.groups.map(g => ({ ...g, total: 12, overBudgetTotal: 2,
    candidates: g.candidates.slice(0, 3).map((c, i) => i === 0 ? { ...c, positionRating: 79, cost: { ...c.cost, status: 'reference-wage', expectedWage: 42000 } } : c),
    overBudget: g.candidates.slice(3, 5).map(c => ({ ...c, cost: { ...c.cost, status: 'reference-above' } })) })) } })) }))
  await page.goto('/transfer')
  const results = page.getByRole('region', { name: 'Sol bek önerileri' })
  const main = results.getByRole('group', { name: 'Transfer adayları' })
  await expect(main.locator('.hub-player-card')).toHaveCount(3)
  await expect(main.locator('.hub-player-card').first()).toContainText('Maaş alanı gerekir')
  await expect(main.locator('.hub-player-card').first()).toContainText('~42 B€')
  await expect(main.locator('.hub-player-card').first()).toContainText('LB 79')
  await expect(page.getByRole('group', { name: 'Oyuncu amacı' }).getByRole('button', { name: /Yedek/ })).toContainText('10')
  await results.getByText('Bütçe üstü seçenekler (2)').click()
  await expect(results.getByRole('group', { name: 'Bütçe üstü adaylar' }).locator('.hub-player-card')).toHaveCount(2)
  api.transform(b => ({ ...b, positions: b.positions.map(p => ({ ...p, recommendations: { ...p.recommendations, groups: p.recommendations.groups.map(g => ({ ...g, total: 2, overBudgetTotal: 2, candidates: [], overBudget: g.candidates.slice(0, 2).map(c => ({ ...c, cost: { ...c.cost, status: 'reference-above' } })) })) } })) }))
  await page.reload()
  await expect(results).toContainText('Bütçene uyan aday çıkmadı')
  await expect(results.getByRole('group', { name: 'Bütçe üstü adaylar' }).locator('.hub-player-card')).toHaveCount(2)
})

test('optional sequential preference cards save only on apply and survive reopening', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer'); await expect(page.locator('.hub-player-card')).toHaveCount(5)
  await page.getByRole('button', { name: 'Tercihlerini kişiselleştir' }).click()
  await page.getByRole('button', { name: /^Hızlı / }).click(); await page.getByRole('button', { name: 'Devam', exact: true }).click()
  await page.getByRole('button', { name: /^Topla çözsün/ }).click(); await page.getByRole('button', { name: 'Devam', exact: true }).click()
  await page.getByRole('button', { name: /^Uzun pivot/ }).click(); await page.getByRole('button', { name: 'Devam', exact: true }).click()
  await page.getByRole('button', { name: /^Oyunu kursun/ }).click(); await page.getByRole('button', { name: 'Devam', exact: true }).click()
  expect(api.writes).toHaveLength(0)
  await page.getByRole('button', { name: 'Tercihleri uygula' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(api.stored.get('A')?.profile.playerPreferences).toMatchObject({ RB: 'quick-back', LB: 'quick-back', RW: 'technical-wing', ST: 'target-striker', CAM: 'technical-ten' })
  await page.reload(); await expect(page.locator('.hub-player-card')).toHaveCount(5)
  await page.getByRole('button', { name: 'Tercihlerini kişiselleştir' }).click()
  await expect(page.getByRole('button', { name: /^Hızlı / })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('cancel never persists preferences; stale save retains selections and explains conflict', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer'); await expect(page.locator('.hub-player-card')).toHaveCount(5)
  await page.getByRole('button', { name: 'Tercihlerini kişiselleştir' }).click(); await page.getByRole('button', { name: /^Teknik / }).click(); await page.keyboard.press('Escape')
  expect(api.writes).toHaveLength(0)
  await page.getByRole('button', { name: 'Tercihlerini kişiselleştir' }).click(); await page.getByRole('button', { name: /^Hızlı / }).click()
  await page.getByRole('button', { name: 'Devam', exact: true }).click()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Bu tercihi değiştirme' }).click()
  api.bump(); await page.getByRole('button', { name: 'Tercihleri uygula' }).click()
  await expect(page.getByRole('alert')).toContainText('Kariyer değişti')
  await expect(page.locator('.hub-answer-review')).toContainText('Hızlı')
})
test('a link opens Transfer on a position, even one outside the current formation', async ({ page }) => {
  await fixture(page); await page.goto('/transfer?mevki=CAM')
  await expect(page.locator('.hub-results-heading h2')).toHaveText('10 numara')
  await expect(page.getByRole('button', { name: '10 numara' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Yalnız dizilişim' }).click()
  await expect(page.getByRole('button', { name: 'Tüm mevkiler' })).toBeVisible()
  await expect(page.getByRole('button', { name: '10 numara' })).toHaveCount(0)
})
test('budget is edited on the plan page and saving there refreshes Transfer', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer'); await expect(page.locator('.hub-player-card')).toHaveCount(5)
  await page.getByRole('link', { name: 'Bütçeyi düzenle' }).click()
  await expect(page).toHaveURL(/\/transfer\/plan#butce$/)
  await expect(page.locator('#butce')).toBeInViewport()
  await expect(page.getByRole('navigation', { name: 'Kariyer sekmeleri' }).getByRole('button', { name: 'TRANSFER', exact: true })).toHaveAttribute('aria-current', 'page')
  const reads = api.reads.length
  await page.getByLabel('Ayırdığın bonservis bütçesi', { exact: true }).fill('5000000')
  await page.getByRole('button', { name: 'Planı kaydet', exact: true }).click()
  await page.getByRole('link', { name: 'Önerilere dön' }).click()
  await expect(page.locator('.hub-player-card')).toHaveCount(5)
  await expect.poll(() => api.reads.length).toBeGreaterThan(reads)
  await expect(page.locator('.hub-facts')).toContainText('4,3 M')
})
test('empty pages say where to go next', async ({ page }) => {
  await fixture(page); await page.goto('/compare')
  await expect(page.locator('.empty-hint').getByRole('link', { name: "Scout'ta ara" })).toHaveAttribute('href', '/scout')
  await page.goto('/shortlist')
  await expect(page.locator('.empty-hint').getByRole('link', { name: 'Transfer önerileri' })).toHaveAttribute('href', '/transfer')
  await page.goto('/transfers')
  await expect(page.locator('.empty-hint')).toContainText('Bu filtrelerle haber yok')
  await expect(page.getByRole('button', { name: 'Filtreleri sıfırla' })).toHaveCount(0)
  await page.goto('/transfers?watched=1')
  await page.getByRole('button', { name: 'Filtreleri sıfırla' }).click()
  await expect(page).toHaveURL(/\/transfers$/)
})
test('mobile hub fits, reduced motion is respected and late board cannot leak between careers', async ({ page }) => {
  const api = await fixture(page); await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/transfer'); await expect(page.locator('.hub-player-card')).toHaveCount(5)
  expect(await page.locator('.recruitment-hub').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  expect(await page.locator('.hub-player-card').first().evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s')
  api.delay(); await page.getByRole('button', { name: 'Yenile', exact: true }).first().click({ noWaitAfter: true })
  await page.getByRole('button', { name: 'Kariyer değiştir' }).click(); await page.getByRole('button', { name: 'Gençlerbirliği kariyerini aç' }).click(); api.release()
  await expect(page.getByLabel('Gençlerbirliği transfer özeti')).toBeVisible()
})
test('squad cards follow the CMTracker layout and the row toggle is a real icon', async ({ page }) => {
  await fixture(page); await page.goto('/squad')
  await expect(page.locator('.squad-expand svg').first()).toBeVisible()
  await expect(page.locator('.squad-expand').first()).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: /Kartlar/ }).click()
  const card = page.locator('.pc-card').first()
  await expect(page.locator('.pc-card')).toHaveCount(11)
  await expect(card.locator('.pc-rating')).toHaveCount(2); await expect(card.locator('.pc-jersey')).toContainText('1')
  const box = await card.boundingBox(); expect(Math.round(box!.height)).toBe(210)
  expect(await card.locator('.pc-top').evaluate(el => Math.round(el.getBoundingClientRect().height))).toBe(147)
  expect(await card.locator('.pc-data').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  expect(await card.locator('.pc-rating').first().evaluate(el => Number(getComputedStyle(el).zIndex))).toBeGreaterThan(await card.locator('.pc-face').evaluate(el => Number(getComputedStyle(el).zIndex)))
})

test('side cards keep their rounded corners and nothing is cut at an angle', async ({ page }) => {
  await fixture(page); await page.goto('/squad')
  const footer = page.locator('.squad-sidebar > div > :last-child').first()
  await expect(footer).toHaveCSS('border-bottom-left-radius', '7px'); await expect(footer).toHaveCSS('border-bottom-right-radius', '7px')
  expect(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => getComputedStyle(e).clipPath.startsWith('polygon')).length)).toBe(0)
})

test('one top bar holds club, tabs and actions; content starts right under it', async ({ page }) => {
  await fixture(page); await page.goto('/squad')
  const bar = page.locator('.app-bar')
  await expect(bar.getByRole('heading', { name: 'Fenerbahçe' })).toBeVisible()
  await expect(bar.getByRole('navigation', { name: 'Kariyer sekmeleri' }).getByRole('button')).toHaveCount(9)
  await expect(bar.getByRole('button', { name: 'Yenile', exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Yenile', exact: true })).toHaveCount(1)
  const height = await bar.evaluate(el => el.getBoundingClientRect().height); expect(height).toBeLessThanOrEqual(58)
  expect(await page.locator('.career-main').evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(100)
  await page.evaluate(() => window.scrollTo(0, 400)); expect(await bar.evaluate(el => Math.round(el.getBoundingClientRect().top))).toBe(0)
  await page.keyboard.press('e'); await expect(page).toHaveURL(/\/youth/)
})

test('no text is smaller than 11px and icon buttons stay comfortably clickable', async ({ page }) => {
  await fixture(page)
  for (const path of ['/squad', '/transfer']) {
    await page.goto(path); await expect(page.locator('.app-bar')).toBeVisible(); await page.waitForTimeout(300)
    const result = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const tiny: string[] = []
      while (walker.nextNode()) { const el = walker.currentNode.parentElement!; if (walker.currentNode.textContent!.trim() && el.getClientRects().length && parseFloat(getComputedStyle(el).fontSize) < 11) tiny.push(el.className.toString()) }
      const small = [...document.querySelectorAll('button,summary')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && Math.round(r.height) < 24 }).length
      return { tiny, small }
    })
    expect(result.tiny).toEqual([]); expect(result.small).toBe(0)
  }
})

test('motion: sections open smoothly, actions confirm themselves and reduced motion turns it all off', async ({ page }) => {
  await fixture(page); await page.goto('/transfer')
  const first = page.locator('.hub-player-card').first(); await expect(first).toBeVisible()
  await first.locator('.star').click()
  await expect(page.locator('.toast')).toHaveText('İzleme listesine eklendi')
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 4000 })
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('details')!, '::details-content').transitionProperty)).toContain('height')
  await page.goto('/squad'); await page.getByRole('button', { name: /Kartlar/ }).click()
  expect(await page.locator('.view-swap').first().evaluate(el => getComputedStyle(el).animationName)).toBe('ui-reveal')
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload(); await page.getByRole('button', { name: /Kartlar/ }).click()
  expect(await page.locator('.view-swap').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none')
})

test('harmless import warnings share one closable notice line', async ({ page }) => {
  const api = await fixture(page)
  await page.route('**/api/sync?*', route => route.fulfill({ json: { current: { snapshotId: 'A', gameDate: '2030-07-28', source: 'save' }, saved: { snapshotId: 'A', gameDate: '2030-07-28', source: 'save' }, pendingExport: null, issues: [], warnings: [{ fileName: 'e1', message: 'isim', sourceKey: 'e1' }] } }))
  await page.goto('/squad'); expect(api.writes).toHaveLength(0)
  await expect(page.getByText('1 export, eksik isim karakteri işaretlenerek aktarıldı.')).toBeVisible()
  await page.getByRole('button', { name: 'Uyarıyı kapat' }).click()
  await expect(page.locator('.fc-notice-note')).toHaveCount(0)
  await page.reload(); await expect(page.locator('.app-bar')).toBeVisible(); await expect(page.locator('.fc-notice-note')).toHaveCount(0)
})

test('settings switch the whole app between themes, persist them and ignore unknown ids', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer')
  const root = page.locator('html'), background = () => page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)
  await expect(root).toHaveAttribute('data-palette', 'moon')
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Ayarlar' })
  await expect(dialog.getByRole('radio')).toHaveCount(THEMES.length)
  await expect(dialog.getByRole('radio', { name: /Mavi Cam/ })).toBeChecked()
  const seen = new Set<string>()
  for (const theme of THEMES) {
    await dialog.getByText(theme.name, { exact: true }).click()
    await expect(root).toHaveAttribute('data-palette', theme.id); await expect(root).toHaveAttribute('data-theme', theme.mode)
    seen.add(await page.locator('.recruitment-hub').evaluate(el => getComputedStyle(el).getPropertyValue('--fc-panel').trim() + getComputedStyle(el).getPropertyValue('--fc-accent').trim()))
    if (theme.id !== 'moon') await expect.poll(api.theme).toBe(theme.id)
  }
  expect(seen.size).toBe(THEMES.length)
  await dialog.getByText('Krem Defter', { exact: true }).click(); await expect.poll(api.theme).toBe('ivory')
  await page.reload(); await expect(root).toHaveAttribute('data-palette', 'ivory'); await expect(root).toHaveAttribute('data-theme', 'light')
  expect(await background()).not.toBe('rgb(16, 28, 46)')
  api.setTheme('forest'); await page.reload(); await expect(root).toHaveAttribute('data-palette', 'forest')
  api.setTheme('not-a-theme'); await page.evaluate(() => localStorage.setItem('fcm.theme', 'bogus')); await page.reload()
  await expect(root).toHaveAttribute('data-palette', 'moon')
})
