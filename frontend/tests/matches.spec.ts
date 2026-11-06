import { test, expect, type Page } from '@playwright/test'
import { resolve } from 'node:path'

async function fixture(page: Page) {
  const requests: URL[] = []
  let fail = false, empty = false, preview = false
  const snap = (uid = 'A', id = uid) => ({ snapshotId: id, saveUid: uid, gameDate: id === 'preview' ? '2030-07-31' : '2030-07-28', seasonEndYear: 2031,
    userTeamId: 10, userTeamName: uid === 'A' ? 'Fenerbahçe' : 'Gençlerbirliği', source: id === 'preview' ? 'export' : 'save', revision: 1, branch: 1, careerKey: uid + '@1' })
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url()), path = url.pathname, uid = url.searchParams.get('saveUid') ?? 'A'
    if (!path.startsWith('/api/')) return route.continue()
    requests.push(url)
    const respond = (json: unknown, status = 200) => route.fulfill({ json, status })
    if (path === '/api/saves') return respond(['A', 'Z'].map(k => ({ saveUid: k, latest: snap(k), userTeamName: snap(k).userTeamName, snapshotCount: 2, branches: [] })))
    if (path === '/api/health') return respond({ status: 'ok', database: { ok: true }, fieldMap: { warnings: [] } })
    if (path === '/api/sync') return respond({ current: snap(uid), saved: snap(uid), pendingExport: null, issues: [], warnings: [{ fileName: 'old-export', message: 'İsim sonundaki karakter U+FFFD ile işaretlendi.' }] })
    if (path === '/api/club') return respond({ snapshot: snap(uid), club: { id: 10, name: snap(uid).userTeamName }, summary: { bestXiAverage: 80 } })
    if (path === '/api/matches') {
      if (fail) return respond({ title: 'Maç kaynağı okunamadı.' }, 503)
      const all = [{ id: 3, date: '2030-07-27', competitionId: 20, competition: 'Hazırlık turnuvası', isHome: true, opponentId: 1, opponent: uid === 'A' ? 'Wolves' : 'Ankara FK', goalsFor: 4, goalsAgainst: 2, result: 'W' },
        { id: 2, date: '2030-07-23', competitionId: 20, competition: 'Hazırlık turnuvası', isHome: false, opponentId: 2, opponent: 'Hoffenheim', goalsFor: 1, goalsAgainst: 0, result: 'W' },
        { id: 1, date: '2030-07-19', competitionId: 10, competition: 'Lig', isHome: true, opponentId: 3, opponent: 'Rakip', goalsFor: 0, goalsAgainst: 0, result: 'D' }]
      const matches = empty ? [] : all.filter(m => !url.searchParams.has('competitionId') || m.competitionId === Number(url.searchParams.get('competitionId')))
      return respond({ snapshot: snap(uid, preview ? 'preview' : uid), fixtureSource: empty ? null : snap(uid), available: matches.length, limit: Number(url.searchParams.get('limit')), matches,
        competitions: [{ id: 10, name: 'Lig' }, { id: 20, name: 'Hazırlık turnuvası' }], summary: !matches.length ? null : { played: matches.length,
          won: matches.filter(m => m.result === 'W').length, drawn: matches.filter(m => m.result === 'D').length, lost: 0,
          goalsFor: matches.reduce((n, m) => n + m.goalsFor, 0), goalsAgainst: matches.reduce((n, m) => n + m.goalsAgainst, 0), cleanSheets: matches.filter(m => m.goalsAgainst === 0).length, scoredGames: matches.filter(m => m.goalsFor > 0).length } })
    }
    return respond({}, 404)
  })
  return { requests, fail: (value: boolean) => { fail = value }, empty: () => { empty = true }, preview: () => { preview = true } }
}

test('match summary and competition/window filters preserve zero scores and explain unavailable metrics', async ({ page }) => {
  const api = await fixture(page); await page.goto('/matches')
  await expect(page.getByRole('heading', { name: 'Son maçların analizi' })).toBeVisible()
  await expect(page.locator('.matches-metric').first()).toContainText('2G · 1B · 0M')
  await expect(page.getByLabel('Biz 0, rakip 0')).toBeVisible()
  await expect(page.getByText('Topla oynama, pas yüzdesi', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Son 10 maç', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Son 10 maç', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Yarışma', { exact: true }).selectOption('20')
  await expect(page.locator('.matches-results li')).toHaveCount(2)
  expect(api.requests.some(u => u.pathname === '/api/matches' && u.searchParams.get('limit') === '10' && u.searchParams.get('competitionId') === '20')).toBe(true)
  await expect(page.getByText('1 export, eksik isim karakteri işaretlenerek aktarıldı.')).toBeVisible()
  await expect(page.getByText('kaynak aktarılamadı', { exact: false })).toHaveCount(0)
})

test('preview explains the older source and career change clears old results', async ({ page }) => {
  const api = await fixture(page); api.preview(); await page.goto('/matches')
  await expect(page.getByText('Maç sonuçları 28 Temmuz 2030', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Kariyer değiştir', exact: true }).click()
  await page.getByRole('button', { name: 'Gençlerbirliği kariyerini aç' }).click()
  await expect(page.locator('.matches-results')).toContainText('Ankara FK')
  await expect(page.locator('.matches-results')).not.toContainText('Wolves')
  await expect(page.getByTestId('matches-source')).toContainText('Gençlerbirliği')
})

test('failed and empty match sources show no invented summary', async ({ page }) => {
  const api = await fixture(page); api.fail(true); await page.goto('/matches')
  await expect(page.getByRole('heading', { name: 'Maç analizi okunamadı' })).toBeVisible()
  api.fail(false); api.empty(); await page.getByRole('button', { name: 'Yeniden dene', exact: true }).click()
  await expect(page.getByText('Bu kapsamda oynanmış maç bulunamadı', { exact: true })).toBeVisible()
  await expect(page.locator('.matches-metric')).toHaveCount(0)
})

test('mobile keyboard controls and details stay inside 390px with reduced motion', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await fixture(page); await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/matches')
  const lastFive = page.getByRole('button', { name: 'Son 5 maç', exact: true })
  await lastFive.focus(); await lastFive.press('Tab'); await expect(page.getByRole('button', { name: 'Son 10 maç', exact: true })).toBeFocused()
  await expect(page.locator('.matches-results li')).toHaveCount(3)
  expect(await page.locator('.matches-page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({ path: resolve('..', 'scratch', 'match-prep-20261030', 'mock-mobile.png'), fullPage: true, animations: 'disabled' })
})
