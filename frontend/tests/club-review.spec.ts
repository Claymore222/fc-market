import { test, expect, type Page } from '@playwright/test'

// Kulüp incelemesi: başka bir takımın oyun tarzı, ihtiyaçları, tahmini bütçesi ve kendi kulübünle kıyas.
const snap = { snapshotId: 'A', saveUid: 'A', gameDate: '2027-01-22', seasonEndYear: 2027, userTeamId: 10, userTeamName: 'Chesterfield',
  source: 'save', revision: 1, branch: 1, careerKey: 'A@1', transferBudget: 725_800 }
const club = (id: number, name: string, league: string, position: number, overall: number, value: number) => ({
  snapshot: snap, club: { id, name, leagueId: 1, league, overall, attack: overall, midfield: overall - 1, defense: overall - 1, clubWorth: 150_000,
    domesticPrestige: id === 10 ? 1 : 5, internationalPrestige: 1, youthDevelopment: 4, stadiumCapacity: 12_600, color1: '#e10000', color2: '#ffffff' },
  standing: { teamId: id, team: name, position, points: 47 }, table: [], tableConsistent: true, squad: [], setPieces: [],
  summary: { players: 30, averageAge: 27.7, squadValue: value, wages: 754_000, bestXiAverage: overall, expiringThisSeason: 4 } })
const slot = (s: string, position: string, priority: string, starter: string, rating: number, reasons: string[] = []) => ({
  slot: s, position, priority, needScore: priority === 'sufficient' ? 0 : 60, starterId: 1, starterName: starter, starterRating: rating,
  rotationId: 2, rotationName: 'Yedek ' + s, rotationRating: rating - 4, conditional: false, reasons: reasons.map(text => ({ code: 'x', text })) })
const review = (budget: { estimate: number; outsideCalibration: boolean }) => ({
  snapshot: snap, teamId: 20, teamName: 'Wrexham', players: 30,
  tactics: { formation: '3-4-2-1', offensiveRating: 3, offensiveLabel: 'Hücumcu diziliş', defenders: 3, midfielders: 5, attackers: 2,
    positions: ['GK', 'RCB', 'CB', 'LCB', 'RM', 'RCM', 'LCM', 'LM', 'RAM', 'LAM', 'ST'], buildUpPlay: 2, buildUpLabel: 'Dengeli',
    defensiveDepth: 30, defensiveLineLabel: 'Derin savunma çizgisi', leagueDefensiveDepth: 54.4 },
  budget: { clubWorth: 150_000, estimate: budget.estimate, low: budget.estimate * 0.85, high: budget.estimate * 1.15, calibrationPoints: 5, outsideCalibration: budget.outsideCalibration },
  needs: { formation: '3-4-2-1', formationExact: true, teamReference: 73, league: { own: 73, median: 72.3, rank: 7, clubs: 24 },
    lines: [{ position: 'ST', starter: 75, starterMedian: 72, starterRank: 3, rotation: 71, rotationMedian: 70, rotationRank: 7, clubs: 24 },
      { position: 'LM', starter: 72, starterMedian: 72, starterRank: 22, rotation: 70, rotationMedian: 70, rotationRank: 4, clubs: 24 }],
    slots: [slot('GK', 'GK', 'next-season', 'Patterson', 74, ['Danny Ward: sözleşme bitiyor.']),
      slot('RCB', 'CB', 'sufficient', 'Doyle', 75), slot('CB', 'CB', 'sufficient', 'Hyam', 72), slot('LCB', 'CB', 'urgent', 'Worrall', 72, ['Rotasyon açığı.']),
      slot('RM', 'RM', 'sufficient', 'Windass', 73), slot('RCM', 'CM', 'sufficient', 'Sheaf', 73), slot('LCM', 'CM', 'sufficient', "O'Brien", 72),
      slot('LM', 'LM', 'sufficient', 'Broadhead', 72), slot('RAM', 'CAM', 'sufficient', "O'Hare", 73), slot('LAM', 'CAM', 'sufficient', 'Cacace', 72),
      slot('ST', 'ST', 'sufficient', 'White', 75)] },
})

async function fixture(page: Page, budget = { estimate: 23_920_000, outsideCalibration: false }) {
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url()), path = url.pathname
    if (!path.startsWith('/api/')) return route.continue()
    const respond = (json: unknown, status = 200) => route.fulfill({ json, status })
    if (path === '/api/saves') return respond([{ saveUid: 'A', latest: snap, userTeamName: 'Chesterfield', snapshotCount: 1, branches: [] }])
    if (path === '/api/health') return respond({ status: 'ok', database: { ok: true }, fieldMap: { warnings: [] } })
    if (path === '/api/sync') return respond({ current: snap, saved: snap, pendingExport: null, issues: [], warnings: [] })
    if (path === '/api/club/review') return respond(review(budget))
    if (path === '/api/club') return url.searchParams.get('teamId') === '20'
      ? respond(club(20, 'Wrexham', 'England Championship (2)', 4, 72, 99_750_000)) : respond(club(10, 'Chesterfield', 'England League Two (4)', 1, 63, 18_400_000))
    return respond({}, 404)
  })
}

test('club review shows how the team plays, where it needs players, its budget and a comparison with my club', async ({ page }) => {
  await fixture(page)
  await page.goto('/club-review?team=20')
  await expect(page.getByRole('heading', { name: 'Wrexham', level: 1 })).toBeVisible()
  await expect(page.getByText('England Championship (2) · ligde 4. · 47 puan')).toBeVisible()
  await expect(page.getByText('7. / 24')).toBeVisible()
  const style = page.getByRole('region', { name: 'Nasıl oynuyor' })
  await expect(style).toContainText('3-4-2-1')
  await expect(style).toContainText('Derin savunma çizgisi')
  await expect(style).toContainText('lig ort. 54,4')
  // Saha hatları dizilişteki yere göre: RM/LM orta saha hattında, RAM/LAM önünde.
  const lines = await page.locator('.review-pitch .depth-pitch-line').evaluateAll(rows => rows.map(r => [...r.querySelectorAll('b')].map(b => b.textContent).join(' ')).filter(Boolean))
  expect(lines).toEqual(['ST', 'RAM LAM', 'RM RCM LCM LM', 'RCB CB LCB', 'GK'])
  const needs = page.locator('.review-priorities li')
  await expect(needs).toHaveCount(2)
  await expect(needs.first()).toContainText('Acil')
  await expect(needs.first()).toContainText('LCB')
  await expect(needs.nth(1)).toContainText('Gelecek sezon')
  await expect(page.getByRole('region', { name: 'Bütçe ve kulüp' })).toContainText('20,3 M€ – 27,5 M€')
  await expect(page.getByRole('note')).toHaveCount(0)
  const compare = page.getByRole('region', { name: 'Senin kulübünle kıyas' })
  await expect(compare.getByRole('row', { name: /Transfer bütçesi/ })).toContainText('~23,9 M€ (tahmini, sezon başı)')
  await expect(compare.getByRole('row', { name: /Transfer bütçesi/ })).toContainText('726 B€ (şu an kalan)')
  await expect(compare.getByRole('row', { name: /Kadro değeri/ })).toContainText('99,8 M€')
})

test('a budget far outside the calibrated clubs is marked as a rough guess', async ({ page }) => {
  await fixture(page, { estimate: 514_100_000, outsideCalibration: true })
  await page.goto('/club-review?team=20')
  await expect(page.getByRole('note')).toContainText('kaba bir işaret')
  await expect(page.getByText('≈ 514,1 M€')).toBeVisible()
})

test('teams list and another club squad link to the review', async ({ page }) => {
  await fixture(page)
  await page.goto('/squad?team=20')
  await page.getByRole('link', { name: 'Kulüp incelemesi' }).click()
  await expect(page).toHaveURL(/\/club-review\?team=20$/)
  await expect(page.getByRole('heading', { name: 'Wrexham', level: 1 })).toBeVisible()
})
