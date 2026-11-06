import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AnalysisProfileView, DepthReport, ManagerProfile } from '../src/api/analysis'

const catalog = JSON.parse(readFileSync(resolve('..', 'config/squad-analysis.json'), 'utf8'))
const roles = Object.entries(JSON.parse(readFileSync(resolve('..', 'config/field-map.json'), 'utf8')).roles as Record<string, {name: string; position: string}>).map(([id, r]) => ({ id: Number(id), ...r }))
const defaults = (): ManagerProfile => ({ formation: null, secondaryFormation: null, attack: ['balanced'], defense: 'mid-block', tempo: 'balanced', defensiveLine: null,
  horizon: 'balanced', matchMode: 'mixed', transferBudget: null, weeklyWageBudget: null, reservePercent: 15, targetTransfers: 2,
  minAge: null, maxAge: null, preferredLeagueIds: [], protectedPlayerIds: [], departurePlayerIds: [], rolePreferences: {} })

async function fixture(page: Page) {
  const stored = new Map<string, { profile: ManagerProfile; version: number }>()
  const writes: { key: string; body: Record<string, unknown> }[] = []
  const runs: { key: string; body: Record<string, unknown> }[] = []
  let runFailure = 0
  let revision = 0, failure = 0, readsFail = false, delayed = false
  let release: (() => void) | undefined
  const snap = (key = 'A') => ({ snapshotId: key.includes('@') ? 'preview-' + key : 'disk-' + key, saveUid: key.split('@')[0], gameDate: key.includes('@') ? '2030-07-31' : '2030-07-28',
    seasonEndYear: 2031, exportedAt: null, userTeamId: 10, userTeamName: key.startsWith('A') ? 'Fenerbahçe' : 'Gençlerbirliği', transferBudget: 0, wageBudget: 9999999,
    careerKey: key.includes('@') ? key : key + '@1', branch: key.endsWith('@2') ? 2 : 1, source: key.includes('@') ? 'export' : 'save', revision })
  const value = (v: unknown) => ({ value: v, state: v === null ? 'missing' : 'known', origin: { snapshotId: 'disk-A', gameDate: '2030-07-28', kind: 'save' }, note: null })
  const data = (key: string): AnalysisProfileView => {
    const snapshot = snap(key), scope = snapshot.careerKey + '|' + (key.includes('@') ? 'preview' : 'saved')
    const row = stored.get(scope)
    return { profile: row?.profile ?? defaults(), version: row?.version ?? 0, updatedAt: null, savedSnapshotId: row ? snapshot.snapshotId : null, savedSnapshotRevision: row ? revision : null,
      context: { snapshot: snapshot as AnalysisProfileView['context']['snapshot'], scopeKey: snapshot.careerKey, viewMode: key.includes('@') ? 'preview' : 'saved', configVersion: '1-test', suggestedFormation: null,
        players: [{ id: 1, name: 'Atlas Bir', age: 21, overall: 80, potential: 90, positions: ['ST'], slot: 'ST', weeklyWage: 0, contractEnd: 2031, fitness: null, roles: [], playStyles: [], playStylesPlus: [], attributes: { acceleration: 0 }, availability: {}, loan: value(null) }],
        catalog, roles, leagues: [{ id: 68, name: 'Süper Lig' }], inputs: { transferBudget: value(0), weeklyWageHeadroom: value(null) },
        coverage: [{ key: 'wages', label: 'Haftalık maaş', known: 1, total: 1, state: 'known', origin: value(0).origin, note: '0 gerçek değer.' },
          { key: 'fitness', label: 'Kondisyon', known: 0, total: 1, state: 'missing', origin: null, note: 'Eksik kondisyon 100 kabul edilmez.' }] } }
  }
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname, key = url.searchParams.get('saveUid') ?? 'A'
    if (!path.startsWith('/api/')) return route.continue()
    const respond = (json: unknown, status = 200) => route.fulfill({ json, status })
    if (path === '/api/analysis/profile') {
      if (route.request().method() === 'GET') return readsFail ? respond({ title: 'Veri servisi kapalı' }, 503) : respond(data(key))
      const body = route.request().postDataJSON(); writes.push({ key, body })
      if (delayed) await new Promise<void>(done => { release = done })
      if (failure) return respond({ title: failure === 409 ? 'Profil başka bir pencerede değiştirildi.' : 'Disk dolu; profil kaydedilemedi.' }, failure)
      const v = data(key)
      if (body.snapshotRevision !== revision || body.expectedVersion !== v.version) return respond({ title: 'Veri değişti. Güncel planı yükle.' }, 409)
      if (!body.profile.attack.length) return respond({ title: 'Hücum tercihini kontrol et.' }, 400)
      stored.set(v.context.scopeKey + '|' + v.context.viewMode, { profile: body.profile, version: v.version + 1 })
      return respond(data(key))
    }
    if (path === '/api/analysis/run') {
      const body = route.request().postDataJSON(); runs.push({ key, body })
      const v = data(key)
      if (delayed) await new Promise<void>(done => { release = done })
      if (runFailure) return respond({ title: 'Analiz geçici olarak hesaplanamadı.' }, runFailure)
      if (body.snapshotRevision !== v.context.snapshot.revision || body.expectedVersion !== v.version) return respond({ title: 'Analiz kaynağı değişti.' }, 409)
      const profile = body.profile as ManagerProfile
      const report: DepthReport = { id: 'report-' + key, createdAt: new Date(Date.UTC(2026, 9, 30, 1, 0, runs.length)).toISOString(), snapshot: v.context.snapshot,
        scopeKey: v.context.scopeKey, viewMode: v.context.viewMode, configVersion: v.context.configVersion, rulesVersion: '1', profileHash: 'test', profile,
        draft: JSON.stringify(profile) !== JSON.stringify(v.profile), warnings: ['Kondisyon bilinmiyorsa sağlıklı sayılmaz.'],
        formations: [profile.formation, profile.secondaryFormation].filter((f): f is string => !!f).map(f => ({ formation: f,
          teamReference: 80, starterFloor: 72, rotationFloor: 66, filledStarters: 1, filledRotation: 0, readyStarters: 0, readyRotation: 0, nextSeasonStarters: 0, nextSeasonRotation: 0,
          slots: (catalog.formations[f] as string[]).map(slot => ({ slot, position: catalog.slotAliases[slot] ?? slot, starterId: slot === 'ST' ? 1 : null,
            rotationId: null, readyStarterId: null, readyRotationId: null, nextSeasonStarterId: null, nextSeasonRotationId: null, developmentId: null, preferredRoleId: null,
            priority: slot === 'ST' ? 'window' : 'urgent', needScore: slot === 'ST' ? 70 : 100, conditional: false, temporaryGap: slot === 'ST',
            reasons: [{ code: 'rotation-gap', text: 'Bağımsız rotasyon oyuncusu yok.' }, ...(slot === 'ST' ? [{ code: 'temporary-gap', text: 'Geçici sakatlık kalıcı transfer ihtiyacı değildir.' }] : [])] })) })) }
      return respond(report)
    }
    if (path === '/api/saves') return respond(['A', 'Z'].map(k => ({ saveUid: k, userTeamName: snap(k).userTeamName, snapshotCount: 3, latest: snap(k), branches: k === 'A' ? [1, 2].map(b => ({ branch: b, careerKey: 'A@' + b, active: b === 1, lastGameDate: '2030-07-31' })) : [] })))
    if (path === '/api/sync') return respond({ current: snap(key), saved: snap(key.split('@')[0]), pendingExport: key === 'A' ? snap('A@1') : null, issues: [] })
    if (path === '/api/health') return respond({ status: 'ok', database: { ok: true }, fieldMap: { warnings: [] } })
    if (path === '/api/club') return respond({ snapshot: snap(key), club: { id: 10, name: snap(key).userTeamName }, summary: { players: 0, bestXiAverage: 80 }, squad: [], fixtures: [], table: [], setPieces: [], academy: [], scouts: [] })
    return respond({}, 404)
  })
  return { stored, writes, runs, failRun: (status: number) => { runFailure = status }, bump: () => { revision++ }, fail: (status: number) => { failure = status }, failRead: () => { readsFail = true }, delay: () => { delayed = true }, release: () => release?.() }
}
const saveButton = (page: Page) => page.getByRole('button', { name: 'Planı kaydet', exact: true })
async function switchTo(page: Page, name: string) { await page.getByRole('button', { name: 'Kariyer değiştir' }).click(); await page.getByRole('button', { name }).click() }

test('profile saves roles, mixed play style and real zero budgets; survives reopening', async ({ page }) => {
  const api = await fixture(page)
  await page.goto('/transfer/plan')
  await expect(page.getByRole('navigation', { name: 'Kariyer sekmeleri' }).getByRole('button', { name: 'TRANSFER', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(saveButton(page)).toBeDisabled()
  await page.getByLabel('Ana diziliş', { exact: true }).selectOption('4-2-3-1')
  await page.getByLabel('4-2-3-1 · ST', { exact: true }).selectOption('42')
  await page.getByLabel('Çizgi ve orta', { exact: true }).check()
  await page.getByLabel('Savunma yaklaşımı', { exact: true }).selectOption('high-press')
  await page.getByRole('button', { name: 'Bu tutarı kullan' }).click()
  await page.getByLabel('Ayırdığın maaş bütçesi', { exact: false }).fill('0')
  await page.getByText('Ek transfer tercihleri', { exact: false }).click()
  await page.getByLabel('Atlas Bir kadro kararı').selectOption('keep')
  await saveButton(page).click()
  await expect(page.getByText('Plan kaydedildi.', { exact: true })).toBeVisible()
  expect(api.writes[0].body.profile).toMatchObject({ transferBudget: 0, weeklyWageBudget: 0, attack: ['balanced', 'wing-play'], protectedPlayerIds: [1], rolePreferences: { '4-2-3-1': { ST: 42 } } })
  await page.reload()
  await expect(page.getByLabel('Ana diziliş', { exact: true })).toHaveValue('4-2-3-1')
  await expect(page.getByLabel('Ayırdığın bonservis bütçesi', { exact: false })).toHaveValue('0')
  await expect(page.getByLabel('4-2-3-1 · ST', { exact: true })).toHaveValue('42')
  await expect(page.getByLabel('Çizgi ve orta', { exact: true })).toBeChecked()
})

test('career, branch and unsaved export preferences remain separate', async ({ page }) => {
  await fixture(page); await page.goto('/transfer/plan')
  await page.getByLabel('Ana diziliş', { exact: true }).selectOption('4-2-3-1'); await saveButton(page).click()
  await expect(page.getByText('Plan kaydedildi.', { exact: true })).toBeVisible()
  await switchTo(page, 'Gençlerbirliği kariyerini aç')
  await expect(page.getByLabel('Ana diziliş', { exact: true })).toHaveValue('')
  await page.getByLabel('Ana diziliş', { exact: true }).selectOption('4-4-2'); await saveButton(page).click()
  await expect(page.getByText('Plan kaydedildi.', { exact: true })).toBeVisible()
  await switchTo(page, 'Fenerbahçe kariyerini aç')
  await expect(page.getByLabel('Ana diziliş', { exact: true })).toHaveValue('4-2-3-1')
  await page.getByRole('button', { name: 'Export’u incele' }).click()
  await expect(page.getByLabel('Ana diziliş', { exact: true })).toHaveValue('')
  await expect(page.getByTestId('analysis-source')).toContainText('Ayrı export önizleme planı')
  await page.getByLabel('Ana diziliş', { exact: true }).selectOption('4-3-3'); await saveButton(page).click()
  await expect(page.getByText('Plan kaydedildi.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Kaydedilmiş kayda dön' }).click()
  await expect(page.getByLabel('Ana diziliş', { exact: true })).toHaveValue('4-2-3-1')
  await page.getByRole('button', { name: 'Kariyer değiştir' }).click()
  await page.getByText('Kayıt yuvaları ve arşivler (2)', { exact: true }).click()
  await page.getByRole('button', { name: /^Dal 2/ }).click()
  await expect(page.getByLabel('Ana diziliş', { exact: true })).toHaveValue('')
})

test('new same-day revision preserves edits and blocks saving until explicit reload', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer/plan')
  await page.getByLabel('Ana diziliş', { exact: true }).selectOption('3-5-2')
  api.bump(); await page.getByRole('button', { name: 'Yenile', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Güncel planı yükle' })).toBeVisible()
  await expect(page.getByLabel('Ana diziliş', { exact: true })).toHaveValue('3-5-2')
  await expect(saveButton(page)).toBeDisabled()
  await page.getByRole('button', { name: 'Güncel planı yükle' }).click()
  await expect(page.getByLabel('Ana diziliş', { exact: true })).toHaveValue('')
  await page.getByLabel('Ana diziliş', { exact: true }).selectOption('3-4-3'); await saveButton(page).click()
  await expect(page.getByText('Plan kaydedildi.', { exact: true })).toBeVisible()
  expect(api.writes[0].body.snapshotRevision).toBe(1)
})

test('failed write and concurrent edit never claim success or discard input', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer/plan')
  await page.getByLabel('Ana diziliş', { exact: true }).selectOption('4-4-2')
  api.fail(503); await saveButton(page).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Disk dolu' })).toBeVisible()
  await expect(page.getByText('Plan kaydedildi.', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Ana diziliş', { exact: true })).toHaveValue('4-4-2')
  api.fail(409); await saveButton(page).click()
  await expect(saveButton(page)).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Güncel planı yükle' })).toBeVisible()
  api.failRead(); await page.getByRole('button', { name: 'Güncel planı yükle' }).click()
  await expect(page.getByText('Güncel plan yüklenemedi.', { exact: false })).toBeVisible()
  await expect(page.getByLabel('Ana diziliş', { exact: true })).toHaveValue('4-4-2')
})

test('a delayed save response cannot overwrite another career form', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer/plan')
  await page.getByLabel('Ana diziliş', { exact: true }).selectOption('4-4-2'); api.delay(); await saveButton(page).click()
  await expect.poll(() => api.writes.length).toBe(1)
  await switchTo(page, 'Gençlerbirliği kariyerini aç'); api.release()
  await expect(page.getByLabel('Ana diziliş', { exact: true })).toHaveValue('')
  await expect(page.getByTestId('analysis-source')).toContainText('Z@1')
  await expect(page.getByText('Plan kaydedildi.', { exact: true })).toHaveCount(0)
})

test('preferences for a departed player or removed league can be reviewed and cleared explicitly', async ({ page }) => {
  const api = await fixture(page)
  api.stored.set('A@1|saved', { version: 1, profile: { ...defaults(), formation: '4-2-3-1', protectedPlayerIds: [999], preferredLeagueIds: [999] } })
  await page.goto('/transfer/plan')
  await expect(page.getByRole('button', { name: 'Geçersiz tercihleri temizle' })).toBeVisible()
  await expect(saveButton(page)).toBeDisabled()
  await page.getByRole('button', { name: 'Geçersiz tercihleri temizle' }).click()
  await saveButton(page).click()
  await expect(page.getByText('Plan kaydedildi.', { exact: true })).toBeVisible()
  expect(api.writes[0].body.profile).toMatchObject({ protectedPlayerIds: [], preferredLeagueIds: [] })
})

test('mobile keyboard form and coverage keep unknowns visible without overflow', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await fixture(page); await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/transfer/plan')
  const formation = page.getByLabel('Ana diziliş', { exact: true })
  await formation.focus(); await expect(formation).toBeFocused()
  await formation.selectOption('4-3-3'); await formation.press('Tab')
  await expect(page.getByLabel('Alternatif diziliş', { exact: true })).toBeFocused()
  await expect(page.getByLabel('4-3-3 · ST', { exact: true }).locator('option')).not.toContainText(['Defans'])
  await page.getByText('Kondisyon', { exact: true }).click()
  await expect(page.getByText('Eksik kondisyon 100 kabul edilmez.', { exact: true })).toBeVisible()
  await expect(page.getByText('Bilinmiyor / hafta', { exact: true })).toBeVisible()
  expect(await page.locator('.analysis-page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({ path: resolve('..', 'scratch', 'analysis-mobile.png'), fullPage: true, animations: 'disabled' })
})

const analyze = (page: Page) => page.getByRole('button', { name: 'Kadroyu analiz et', exact: true })
test('depth uses draft without saving; scenarios, priorities and explanation are accessible', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer/plan')
  await expect(analyze(page)).toBeDisabled()
  await page.getByLabel('Ana diziliş', { exact: true }).selectOption('4-3-3')
  await analyze(page).click()
  const report = page.getByTestId('depth-report')
  await expect(report.getByRole('heading', { name: 'İhtiyaç raporu' })).toBeFocused()
  await expect(report).toContainText('Kaydedilmemiş plan ile')
  expect(api.writes).toHaveLength(0); expect(api.runs[0].body.profile).toMatchObject({ formation: '4-3-3' })
  const st = report.getByRole('button', { name: 'ST: Bu transfer dönemi', exact: true })
  await st.focus(); await st.press('Space')
  const detail = report.getByRole('region', { name: 'ST ihtiyaç ayrıntısı' })
  await expect(detail).toContainText('Atlas Bir'); await expect(detail).toContainText('Geçici sakatlık kalıcı transfer ihtiyacı değildir.')
  await report.getByLabel('Derinlik görünümü').selectOption('today')
  await expect(detail).not.toContainText('Atlas Bir')
  await expect(report).toContainText('bilinmeyen uygunluk sağlıklı sayılmaz')
  await report.getByLabel('Derinlik görünümü').selectOption('future')
  await expect(report).toContainText('kesin ayrılış değildir')
  await page.getByLabel('Alternatif diziliş', { exact: true }).selectOption('4-4-2')
  await expect(report).toContainText('Bu rapor önceki girdilere ait')
  await analyze(page).click(); await report.getByRole('button', { name: '4-4-2 · alternatif', exact: true }).click()
  await expect(report.getByRole('button', { name: '4-4-2 · alternatif', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('depth becomes explicitly old when profile or same-day revision changes', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer/plan')
  await page.getByLabel('Ana diziliş', { exact: true }).selectOption('4-3-3'); await analyze(page).click()
  const report = page.getByTestId('depth-report'); await expect(report).toBeVisible()
  await page.getByLabel('Takım projesi', { exact: true }).selectOption('develop')
  await expect(report).toContainText('Önceki sonuç')
  api.bump(); await page.getByRole('button', { name: 'Yenile', exact: true }).click()
  await expect(analyze(page)).toBeDisabled(); await expect(report).toContainText('önceki girdilere ait')
})

test('analysis failure keeps previous report and preferences; explicit retry succeeds', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer/plan')
  await page.getByLabel('Ana diziliş', { exact: true }).selectOption('4-3-3'); await analyze(page).click()
  await expect(page.getByTestId('depth-report')).toBeVisible()
  api.failRun(503); await analyze(page).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Analiz geçici olarak hesaplanamadı' })).toBeVisible()
  await expect(page.getByTestId('depth-report')).toBeVisible()
  await expect(page.getByLabel('Ana diziliş', { exact: true })).toHaveValue('4-3-3')
  api.failRun(0); await analyze(page).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Analiz geçici olarak hesaplanamadı' })).toHaveCount(0)
})

test('a delayed analysis cannot appear in another career', async ({ page }) => {
  const api = await fixture(page); await page.goto('/transfer/plan')
  await page.getByLabel('Ana diziliş', { exact: true }).selectOption('4-3-3'); api.delay(); await analyze(page).click()
  await expect.poll(() => api.runs.length).toBe(1)
  await switchTo(page, 'Gençlerbirliği kariyerini aç'); api.release()
  await expect(page.getByTestId('analysis-source')).toContainText('Z@1')
  await expect(page.getByTestId('depth-report')).toHaveCount(0)
})

test('depth works at 390px with reduced motion and visible keyboard focus', async ({ page }) => {
  await fixture(page); await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto('/transfer/plan'); await page.getByLabel('Ana diziliş', { exact: true }).selectOption('4-3-3')
  await analyze(page).click(); const report = page.getByTestId('depth-report'); await expect(report).toBeVisible()
  await report.getByRole('button', { name: 'GK: Acil', exact: true }).focus()
  await page.keyboard.press('Space'); await expect(report.getByRole('region', { name: 'GK ihtiyaç ayrıntısı' })).toBeVisible()
  await report.getByText('Yöntem, eksik veriler ve rapor kimliği', { exact: true }).click()
  await expect(report).toContainText('Kondisyon bilinmiyorsa sağlıklı sayılmaz.')
  expect(await page.locator('.analysis-page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  expect(await report.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({ path: resolve('..', 'scratch', 'depth-mobile.png'), fullPage: true, animations: 'disabled' })
})

test('a need opens Transfer on that position and says when the plan is not saved yet', async ({ page }) => {
  await fixture(page); await page.goto('/transfer/plan')
  await page.getByLabel('Ana diziliş', { exact: true }).selectOption('4-3-3'); await analyze(page).click()
  const report = page.getByTestId('depth-report')
  await report.getByRole('button', { name: 'ST: Bu transfer dönemi', exact: true }).click()
  await expect(report).toContainText('önce planı kaydet')
  await report.getByRole('link', { name: 'ST önerilerini gör', exact: true }).click()
  await expect(page).toHaveURL(/\/transfer\?mevki=ST$/)
})

test('the old analysis address lands on the team plan', async ({ page }) => {
  await fixture(page); await page.goto('/squad/analysis')
  await expect(page).toHaveURL(/\/transfer\/plan$/)
  await expect(page.getByRole('heading', { name: 'Takım planı', level: 1 })).toBeVisible()
})
