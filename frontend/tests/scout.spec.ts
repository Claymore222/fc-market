import { test, expect, type Page } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import { PLAY_STYLES } from '../src/lib/playstyles'

/** PlayStyle rozetleri artık API'den gelir (EA görseli repoda yok); testte 256×256 düz bir PNG yeter. */
const BADGE = (() => {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type: string, data: Buffer) => { const t = Buffer.concat([Buffer.from(type), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(t)); return Buffer.concat([len, t, sum]) }
  const header = Buffer.alloc(13); header.writeUInt32BE(256, 0); header.writeUInt32BE(256, 4); header[8] = 8; header[9] = 0
  const rows = Buffer.alloc(257 * 256)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
})()

const saveOf = (key: string) => key.split('@')[0]
const snapshot = (key = 'career-a') => ({ snapshotId: `${key}-one`, saveUid: saveOf(key), gameDate: '2029-10-17', seasonEndYear: 2030, exportedAt: '2026-10-28T10:00:00Z', userTeamId: 326, userTeamName: saveOf(key) === 'career-a' ? 'Ankara FK' : 'Bursa FK', transferBudget: 12000000, wageBudget: null, branch: key.includes('@') ? Number(key.split('@')[1]) : 2, careerKey: key.includes('@') ? key : `${key}@2` })
const branch = (b: number, active: boolean) => ({ branch: b, careerKey: `career-a@${b}`, parentBranch: b === 1 ? null : 1, forkDate: b === 1 ? null : '2029-09-01', snapshotCount: 2, firstGameDate: '2029-08-01', lastGameDate: b === 1 ? '2029-11-01' : '2029-10-17', lastExportedAt: null, reason: b === 1 ? 'ilk snapshot' : 'yeni dal', active })
// 4-2-3-1: kaleci, 4 defans, 2 ön libero, 3 ofansif orta saha, 1 forvet (oyundaki yer kodlarıyla)
const XI = ['GK', 'RB', 'RCB', 'LCB', 'LB', 'RDM', 'LDM', 'RM', 'CAM', 'LM', 'ST']
const GROUP: Record<string, string> = { GK: 'GK', RB: 'DEF', RCB: 'DEF', LCB: 'DEF', LB: 'DEF', RDM: 'MID', LDM: 'MID', RM: 'MID', CAM: 'MID', LM: 'MID', ST: 'ATT' }
const club = (key: string) => {
  const squad = [
    ...XI.map((slot, i) => ({ player: { ...player(i + 1, saveOf(key)), position: slot, positionGroup: GROUP[slot] }, jersey: i + 1, role: 'XI', slot, slotRating: 75, form: 3, injured: i === 3, loanFromTeamId: null as number | null, loanEnd: null as string | null })),
    { player: player(20, saveOf(key)), jersey: 20, role: 'Sub', slot: null as unknown as string, slotRating: 0, form: 4, injured: false, loanFromTeamId: 5, loanEnd: '2030-06-30' },
  ]
  return { snapshot: snapshot(key), club: { id: 326, name: snapshot(key).userTeamName, leagueId: 68, league: 'Süper Lig', overall: 78, attack: 80, midfield: 77, defense: 76, clubWorth: null, buildUpPlay: null, defensiveDepth: 55, domesticPrestige: 7, internationalPrestige: 5, stadiumCapacity: 20000, foundationYear: 1923, leagueTitles: 2, domesticCups: 3, clWins: 0, elWins: 0, eclWins: 0, rivalTeamId: 1, rivalTeam: 'Rakip SK', youthDevelopment: 6, color1: '#ff0000', color2: '#000000' },
    standing: { teamId: 326, team: 'Ankara FK', position: 3, points: 0, played: 6, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, previousPosition: 5, isUser: true },
    table: [], tableConsistent: false, squad,
    setPieces: [{ role: 'captain', playerId: 9, name: player(9).name, overall: 75 }],
    summary: { players: squad.length, averageAge: 21.5, squadValue: 60000000, wages: 12000, bestXiAverage: 75, expiringThisSeason: 1 },
    fixtures: [{ id: 1, date: '2029-10-19', time: '19:00', homeTeamId: 326, homeTeam: 'Ankara FK', awayTeamId: 1, awayTeam: 'Rakip SK', competitionId: 68, isHome: true, homeLeaguePosition: 3, awayLeaguePosition: 8 }],
    academy: [], scouts: [{ id: 1, name: 'Ali Göz', experience: 3, knowledge: 4, nation: 'Türkiye', nationCode: 'TR', region: 1 }] }
}
const transfers = [
  { date: '2029-10-17', type: 'transfer', playerId: 101, playerName: 'Kalıcı Transfer', fromClubId: 1, fromClub: 'Rakip SK', toClubId: 326, toClub: 'Ankara FK', leagueId: 68, league: 'Lig', before: null, after: null, shortlisted: false, userTeam: true, event: null, count: 1, kind: 'permanent' },
  { date: '2029-10-17', type: 'transfer', playerId: 102, playerName: 'Kiralık Oyuncu', fromClubId: 2, fromClub: 'Devler FC', toClubId: 3, toClub: 'Küçükler SK', leagueId: 68, league: 'Lig', before: null, after: null, shortlisted: false, userTeam: false, event: null, count: 1, kind: 'loan' },
]
const player = (id: number, save = 'career-a') => ({ id, name: `${save === 'career-a' ? 'Atlas' : 'Bora'} ${id}`, age: id === 2 ? 30 : 19, birthDate: null, position: 'CM', position2: null, positionGroup: 'MID', overall: 75, potential: 88, ovrDelta: 1, growthPerMonth: 1, nationId: 48, nation: 'Türkiye', clubId: 326, club: snapshot(save).userTeamName, isFreeAgent: false, leagueId: 1, league: 'Lig', footCode: 1, foot: 'Sağ', height: 180, weight: 75, skillMoves: 3, weakFoot: 3, wage: 1000, contractEnd: 2030, contractYearsLeft: 0, value: 5000000, opportunity: 70 })

async function fixture(page: Page) {
  const lists = new Map<string, Set<number>>()
  const requests: URL[] = []
  let failPlayers = false, failShortlist = false, failHistory = false, branched = false
  let pendingExport = false, revision = 0, importIssue = false
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    requests.push(url)
    const save = url.searchParams.get('saveUid') ?? 'career-a'
    const snap = snapshot(save)
    const path = url.pathname
    const respond = (json: unknown, status = 200) => route.fulfill({ status, json })
    const saved = { ...snapshot(saveOf(save)), snapshotId: 'disk-17', source: 'save', revision }
    const draft = { ...snapshot(saveOf(save)), snapshotId: 'draft-20', gameDate: '2029-10-20', source: 'export', careerKey: `${saveOf(save)}@2` }
    const selected = pendingExport && save.includes('@') ? draft : saved
    if (path === '/api/sync') return respond({ current: selected, saved,
      pendingExport: pendingExport && saveOf(save) === 'career-a' ? draft : null,
      issues: importIssue ? [{ fileName: 'broken-export', message: 'CSV bulunamadı' }] : [] })
    if (path === '/api/health') return respond({ status: 'ok', database: { ok: true }, fieldMap: { warnings: [] }, latestSnapshot: snapshot() })
    if (path === '/api/saves') return respond(['career-a', 'career-b'].map(s => ({ saveUid: s, userTeamName: snapshot(s).userTeamName, snapshotCount: 2, latest: snapshot(s),
      branches: s === 'career-a' && branched ? [branch(1, false), branch(2, true)] : [] })))
    if (path === '/api/club') return respond({ ...club(url.searchParams.get('saveUid') ?? 'career-a'), ...(pendingExport ? { snapshot: selected } : {}) })
    if (path === '/api/teams') return respond({ snapshot: snap, teams: [
      { id: 326, name: 'Ankara FK', leagueId: 68, league: 'Süper Lig', overall: 78, attack: 80, midfield: 77, defense: 76, color1: '#ff0000', color2: '#000000', players: 12, averageAge: 24.5, squadValue: 60000000, bestXi: 75, bestPlayerId: 9, bestPlayer: 'Atlas 9', bestPlayerOverall: 75, isUser: true },
      { id: 7, name: 'Uzak Kulüp', leagueId: 1, league: 'Başka Lig', overall: 82, attack: 83, midfield: 81, defense: 80, color1: '#0000ff', color2: null, players: 25, averageAge: 26, squadValue: 90000000, bestXi: 81, bestPlayerId: 50, bestPlayer: 'Yıldız', bestPlayerOverall: 88, isUser: false },
    ] })
    if (path === '/api/feed') return respond({ snapshot: snap, snapshotCount: 2, total: transfers.length, items: transfers, userLeagueId: 68 })
    if (path === '/api/filters/options') return respond({ snapshot: snap, leagues: [], clubs: [], nations: [], positions: [], positionGroups: [], feet: [], ranges: { age: [16, 40], overall: [1, 99], potential: [1, 99], contractEnd: [2029, 2035], maxValue: 50000000 } })
    if (path === '/api/players') {
      if (failPlayers) return respond({ title: 'Test veri servisi kapalı' }, 503)
      let players = Array.from({ length: 250 }, (_, i) => ({ ...player(i + 1, save), overall: 75 + revision }))
      const q = url.searchParams.get('q')
      if (q) players = players.filter(p => p.name.toLowerCase().includes(q.toLowerCase()))
      if (url.searchParams.has('ageMax')) players = players.filter(p => p.age <= Number(url.searchParams.get('ageMax')))
      const pageNo = Number(url.searchParams.get('page') ?? 1)
      return respond({ snapshot: snap, total: players.length, page: pageNo, pageSize: 100, items: players.slice((pageNo - 1) * 100, pageNo * 100) })
    }
    if (path.match(/^\/api\/players\/\d+\/history$/)) {
      if (failHistory) return respond({ title: 'History unavailable' }, 503)
      return respond([{ snapshotId: 'old', gameDate: '2029-09-17', overall: 74, potential: 88, clubId: 326, club: snap.userTeamName, clubChanged: false }, { snapshotId: snap.snapshotId, gameDate: snap.gameDate, overall: 75, potential: 88, clubId: 326, club: snap.userTeamName, clubChanged: false }])
    }
    if (path.match(/^\/api\/players\/\d+$/)) {
      const p = player(Number(path.split('/').pop()), save)
      return respond({ snapshot: snap, player: p, hasFace: false, positionRatings: [], contract: { wage: 1000, endYear: 2030, yearsLeft: 0 }, stats: null,
        value: { value: 5000000, base: 4000000, ageRule: 'unknown', ageMultiplier: 1, contractMultiplier: 1, positionMultiplier: 1 },
        opportunity: { score: 70, components: [] },
        attributeGroups: ['Hız', 'Şut', 'Pas', 'Top sürme', 'Savunma', 'Fizik'].map((name, i) => ({ name, score: 10 + i * 15, attributes: [] })),
        attributeCategories: [{ name: 'Hareket', score: 70, attributes: [{ key: 'acceleration', label: 'Hızlanma', value: 72 }] }],
        profile: { releaseClause: 25000000, joinDate: '2027-07-01', internationalRep: 2, jersey: 8 },
      })
    }
    if (path.startsWith('/api/shortlist')) {
      if (!lists.has(save)) lists.set(save, new Set())
      const ids = lists.get(save)!
      if (route.request().method() !== 'GET') {
        if (failShortlist) return respond({ title: 'Kayıt diski kullanılamıyor' }, 503)
        const id = Number(path.split('/').pop())
        route.request().method() === 'DELETE' ? ids.delete(id) : ids.add(id)
        return respond({ playerId: id })
      }
      return respond({ snapshot: snap, count: ids.size, targetPriceTotal: 0, items: [...ids].map(id => ({ playerId: id, name: player(id, save).name, player: player(id, save), note: null, tags: [], targetPrice: null, overallChange: 0, clubChanged: false })) })
    }
    return respond({}, 404)
  })
  return { requests, lists, failPlayers: () => { failPlayers = true }, failShortlist: () => { failShortlist = true }, failHistory: () => { failHistory = true }, branch: () => { branched = true },
    pending: () => { pendingExport = true; branched = true }, revise: () => { revision++ }, issue: () => { importIssue = true } }
}

test('club trophy totals remain visible without a disclosure control', async ({ page }) => {
  await fixture(page); await page.goto('/trophies')
  const totals = page.getByRole('region', { name: 'Kulübün oyundaki toplam kupaları' })
  await expect(totals.getByText('Lig şampiyonluğu', { exact: true })).toBeVisible()
  await expect(totals.getByText('Yerel kupa', { exact: true })).toBeVisible()
  await expect(totals.locator('summary')).toHaveCount(0)
  await page.reload(); await expect(totals.getByText('Şampiyonlar Ligi', { exact: true })).toBeVisible()
})

test('trophy history uses the save archive and league fixture identity instead of the league table id', async ({ page }) => {
  await fixture(page)
  const base = club('career-a')
  const league = { ...base.fixtures[0], competitionId: 1512, competition: 'Süper Lig' }
  const cup = { ...league, id: 2, awayTeam: null, competitionId: 1487, competition: 'Türkiye Kupası' }
  const preseason = { ...league, id: 3, date: '2029-07-20', homeGoals: 2, awayGoals: 1, competitionId: 999, competition: 'Hazırlık turnuvası' }
  const old = { index: 1, seasonEndYear: 2029, teamId: 326, team: 'Ankara FK', completed: true,
    leagueTitles: 1, domesticCups: 0, continentalCups: 0, played: 40, won: 25, drawn: 8, lost: 7 }
  await page.route('**/api/club?*', route => route.fulfill({ json: { ...base, leagueCompetitionId: 1512,
    fixtures: [league, cup, preseason], managerCareer: { seasons: [old, { ...old, index: 2, seasonEndYear: 2028, teamId: 7, leagueTitles: 3 },
      { ...old, index: 3, seasonEndYear: 2027, leagueTitles: null, domesticCups: null, continentalCups: null }] } } }))
  await page.goto('/trophies')
  const journeys = page.getByRole('region', { name: 'Bu sezonki yarışmalar' })
  await expect(journeys).toContainText('Türkiye Kupası')
  await expect(journeys).not.toContainText('Süper Lig')
  await expect(journeys).not.toContainText('SÜRÜYOR')
  await expect(journeys).toContainText('Planlı maç yok')
  await expect(journeys).toContainText('Rakip bilgisi yok')
  const history = page.getByRole('region', { name: 'Sezonlara göre kupalar' })
  await expect(history).toContainText('2028/29')
  await expect(history).toContainText('Lig ×1')
  await expect(history).toContainText('25 G / 8 B / 7 M')
  await expect(history).not.toContainText('2027/28')
  await expect(history).toContainText('Kupa bilgisi eksik')
  await expect(history).not.toContainText("ikinci sezonun export")
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})

test('without a league competition mapping trophy fixtures remain unclassified competitions', async ({ page }) => {
  await fixture(page)
  await page.goto('/trophies')
  const journeys = page.getByRole('region', { name: 'Bu sezonki yarışmalar' })
  await expect(journeys.getByRole('heading', { name: /BU SEZONKİ YARIŞMALAR/ })).toBeVisible()
  await expect(journeys).toContainText('Adı çözümlenmemiş yarışma')
  await expect(journeys).not.toContainText('SÜRÜYOR')
  await expect(page.getByRole('region', { name: 'Sezonlara göre kupalar' })).toContainText('tamamlanmış sezon arşivi bu kayıtta yok')
})

test('home fallback labels fixture results without pretending to show league standings', async ({ page }) => {
  await fixture(page)
  const base = club('career-a')
  await page.route('**/api/club?*', route => route.fulfill({ json: { ...base, standing: null } }))
  await page.goto('/')
  const tile = page.locator('[data-tile="leaguePosition"]')
  await expect(tile.getByRole('heading', { name: 'Sonuçlar ve fikstür', exact: true })).toBeVisible()
  await expect(tile).toContainText('Rakip SK')
  await expect(tile.getByRole('heading', { name: 'Lig sırası', exact: true })).toHaveCount(0)
})

test('scout uses wide screens and puts recorded goalkeeper skills before optional columns without changing preferences', async ({ page }) => {
  await fixture(page)
  await page.addInitScript(() => localStorage.setItem('fcm.columns', JSON.stringify({ visible: ['name','ovr','pot','age','value','wage','pos','pac','sho','pas','dri','def','phy'], known: ['name','ovr','pot','age','value','wage','pos','pac','sho','pas','dri','def','phy'] })))
  await page.route('**/api/players?*', route => route.fulfill({ json: { snapshot: snapshot(), total: 1, page: 1, pageSize: 100, items: [{ ...player(3), position: 'GK', positionGroup: 'GK', gkDiving: 91, gkHandling: 90, gkKicking: 88, gkReflexes: 94, gkPositioning: 92 }] } }))
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/scout?pos=GK')
  await expect(page.getByRole('columnheader', { name: 'Atlama', exact: true })).toBeVisible()
  const headers = page.getByRole('columnheader')
  expect((await headers.allTextContents()).slice(3, 8)).toEqual(['Atlama','Tutma','Degaj','Refleks','GK poz.'])
  const width = await page.locator('.career-container').evaluate(el => el.getBoundingClientRect().width)
  expect(width).toBeGreaterThan(1800)
  const grid = page.getByRole('table', { name: 'Oyuncular', exact: true })
  const keeper = grid.getByRole('row', { name: 'Atlas 3' })
  await expect(keeper).toBeVisible()
  await expect(keeper.getByRole('cell').nth(3)).toContainText('91')
  const right = await grid.evaluate(el => el.getBoundingClientRect().right)
  expect((await headers.nth(7).boundingBox())!.x + (await headers.nth(7).boundingBox())!.width).toBeLessThanOrEqual(right)
  await page.getByRole('columnheader', { name: 'Refleks', exact: true }).click()
  await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe('gkReflexes')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fcm.columns')!).visible)).not.toContain('gkDiving')
  await page.goto('/scout?pos=GK,CB'); await expect(page.getByRole('columnheader', { name: 'Atlama', exact: true })).toHaveCount(0)
})

test('saved career remains default; unconfirmed export can be previewed and returned without persisting the preview', async ({ page }) => {
  const api = await fixture(page); api.pending()
  await page.goto('/squad')
  await expect(page.getByText('henüz kayıtla eşleşmedi', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Export’u incele' }).click()
  await expect(page.getByText('Export önizlemesi:', { exact: false })).toBeVisible()
  await expect.poll(() => api.requests.filter(u => u.pathname === '/api/club').at(-1)?.searchParams.get('saveUid')).toBe('career-a@2')
  await page.getByRole('button', { name: 'Kaydedilmiş kayda dön' }).click()
  await expect(page.getByText('henüz kayıtla eşleşmedi', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Export’u incele' }).click()
  await page.reload()
  await expect(page.getByText('henüz kayıtla eşleşmedi', { exact: false })).toBeVisible()
  await expect(page.getByText('Export önizlemesi:', { exact: false })).toHaveCount(0)
})

test('same snapshot revision refreshes cached player rows automatically', async ({ page }) => {
  const api = await fixture(page)
  await page.goto('/scout')
  const row = page.getByRole('row', { name: 'Atlas 1', exact: true })
  await expect(row).toBeVisible()
  await expect.poll(() => api.requests.filter(u => u.pathname === '/api/sync').length).toBeGreaterThan(0)
  api.revise()
  await expect(row.getByText('76', { exact: true })).toBeVisible({ timeout: 15000 })
})

test('an import warning leaves the career usable and fits a narrow screen', async ({ page }) => {
  const api = await fixture(page); api.issue()
  await page.goto('/scout')
  await expect(page.getByText('1 kaynak aktarılamadı.', { exact: false })).toBeVisible()
  await page.getByText('Aktarım ayrıntıları', { exact: true }).click()
  await expect(page.getByText('CSV bulunamadı', { exact: false })).toBeVisible()
  await expect(page.getByRole('row', { name: 'Atlas 1', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  const warning = page.getByRole('status').filter({ hasText: '1 kaynak aktarılamadı' })
  expect(await warning.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})

test('real-data workspace, search, presets and virtual paging use the selected career', async ({ page }) => {
  const api = await fixture(page)
  await page.goto('/scout')
  await expect(page.getByRole('heading', { name: 'Ankara FK' })).toBeVisible()
  await expect(page.getByRole('row', { name: 'Atlas 1', exact: true })).toBeVisible()
  await page.locator('.player-grid').evaluate(el => { el.scrollTop = el.querySelector('.tr')!.getBoundingClientRect().height * 130 })
  await expect(page.getByRole('row', { name: 'Atlas 131', exact: true })).toBeVisible()
  expect(api.requests.some(u => u.pathname === '/api/players' && Number(u.searchParams.get('page')) > 1)).toBeTruthy()
  await page.getByPlaceholder('Oyuncu ara…').fill('Atlas 249')
  await expect(page.getByRole('row', { name: 'Atlas 249', exact: true })).toBeVisible()
  await expect(page.getByRole('row', { name: 'Atlas 131', exact: true })).toHaveCount(0)
  await page.locator('.preset').filter({ hasText: 'Wonderkid' }).click()
  await expect.poll(() => api.requests.some(u => u.pathname === '/api/players' && u.searchParams.get('ageMax') === '21' && u.searchParams.get('potMin') === '85' && !u.searchParams.has('q'))).toBeTruthy()
  await page.getByRole('button', { name: 'Kariyer değiştir' }).click()
  await expect(page.getByRole('main', { name: 'Kariyerler' })).toBeVisible()
  await page.getByRole('button', { name: 'Bursa FK kariyerini aç' }).click()
  await expect(page.getByRole('row', { name: 'Bora 1', exact: true })).toBeVisible()
  await expect(page.getByRole('row', { name: /^Atlas/ })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Bursa FK' })).toBeVisible()
})

test('scout entrance is staggered once per result set and respects reduced motion', async ({ page }) => {
  await page.addInitScript(() => {
    const records: { id: string; delay: number; from: string }[] = []
    Object.assign(window, { entranceRecords: records })
    const original = Element.prototype.animate
    Element.prototype.animate = function(frames, options) {
      const animation = original.call(this, frames, options)
      if (this.hasAttribute('data-entrance-row')) records.push({
        id: this.getAttribute('data-entrance-row')!,
        delay: typeof options === 'object' ? Number(options.delay ?? 0) : 0,
        from: Array.isArray(frames) ? String(frames[0].translate ?? '') : '',
      })
      return animation
    }
  })
  await fixture(page)
  await page.goto('/scout')
  const records = () => page.evaluate(() => (window as unknown as { entranceRecords: { id: string; delay: number; from: string }[] }).entranceRecords)
  await expect.poll(async () => (await records()).length).toBeGreaterThan(1)
  const first = await records()
  expect(first.length).toBeLessThanOrEqual(16)
  expect(first[0].from).toBe('-16px 0')
  expect(first[1].delay).toBeGreaterThan(first[0].delay)
  await page.locator('.player-grid').evaluate(el => { el.scrollTop = el.querySelector('.tr')!.getBoundingClientRect().height * 130 })
  await expect(page.getByRole('row', { name: 'Atlas 131', exact: true })).toBeVisible()
  await page.locator('.player-grid').evaluate(el => { el.scrollTop = 0 })
  await expect(page.getByRole('row', { name: 'Atlas 1', exact: true })).toBeVisible()
  expect(await records()).toHaveLength(first.length)
  await page.getByPlaceholder('Oyuncu ara…').fill('Atlas 250')
  await expect(page.getByRole('row', { name: 'Atlas 250', exact: true })).toBeVisible()
  await expect.poll(async () => (await records()).slice(first.length).map(r => r.id)).toEqual(['250'])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => page.locator('.player-grid').evaluate(el => el.getAnimations({ subtree: true }).filter(a => a.id === 'list-entrance' && a.playState === 'running').length)).toBe(0)
  await page.reload()
  await expect(page.getByRole('row', { name: 'Atlas 250', exact: true })).toBeVisible()
  expect(await records()).toHaveLength(0)
})

test('detail has true radar values, snapshot history, modal focus and persisted shortlist', async ({ page }) => {
  const api = await fixture(page)
  await page.goto('/scout')
  await page.getByRole('row', { name: 'Atlas 1', exact: true }).press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Atlas 1' })).toBeVisible()
  await expect(dialog.getByRole('img', { name: /Hız: 10/ })).toBeVisible()
  await dialog.getByRole('button', { name: 'Gelişim', exact: true }).click()
  await expect(dialog.getByText(/Gelecek tahmini içermez/)).toBeVisible()
  await expect(dialog.getByText(/TAKIMA AL|YILDIZ YAP/)).toHaveCount(0)
  const star = dialog.getByRole('button', { name: /ekle/i })
  await star.click()
  await expect.poll(() => api.lists.get('career-a')?.has(1)).toBe(true)
  await expect(dialog.locator('.star')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('row', { name: 'Atlas 1', exact: true }).locator('.star')).toHaveAttribute('aria-pressed', 'true')
})

test('failed list never falls back to demo players', async ({ page }) => {
  const api = await fixture(page)
  api.failPlayers()
  await page.goto('/scout')
  await expect(page.getByText(/Liste yüklenemedi/)).toBeVisible()
  await expect(page.getByRole('row', { name: /Atlas|Pedri|Haaland/ })).toHaveCount(0)
})

test('shortlist and history failures remain visible and do not show success', async ({ page }) => {
  const api = await fixture(page)
  api.failShortlist(); api.failHistory()
  await page.goto('/scout?player=1')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Gelişim', exact: true }).click()
  await expect(dialog.getByText(/Geçmiş yüklenemedi/)).toBeVisible()
  await dialog.getByRole('button', { name: /ekle/i }).click()
  await expect(dialog.getByRole('alert').filter({ hasText: 'Kaydedilemedi' })).toBeVisible()
  await expect(dialog.locator('.star')).toHaveAttribute('aria-pressed', 'false')
})

test('1024px filters open above table, reduced motion and legacy URL work', async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/market')
  await expect(page.getByRole('row', { name: 'Atlas 1', exact: true })).toBeVisible()
  await page.locator('.toolbar .icon-btn').click()
  await expect(page.getByPlaceholder('Oyuncu ara…')).toBeVisible()
  await page.getByPlaceholder('Oyuncu ara…').fill('not-found')
  await expect(page.locator('.grid-empty')).toBeVisible()
  expect(await page.locator('.page-enter').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('squad shows the real squad, starting eleven on the pitch and set pieces', async ({ page }) => {
  await fixture(page)
  await page.goto('/squad')
  await expect(page.getByRole('heading', { name: 'Ankara FK' })).toBeVisible()
  await expect(page.getByText('4-2-3-1')).toBeVisible()
  await expect(page.getByRole('row', { name: /Atlas 9/ })).toBeVisible()
  await expect(page.getByText('KİRALIK')).toBeVisible()
  await expect(page.getByRole('button', { name: /KAPTAN.*Atlas 9/ })).toBeVisible()
  await page.getByRole('button', { name: 'Kartlar' }).click()
  await page.getByRole('button', { name: /Atlas 1\b/ }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('SERBEST KALMA')).toBeVisible()
  await dialog.getByRole('button', { name: 'Özellikler', exact: true }).click()
  await expect(dialog.getByText('Hızlanma')).toBeVisible()
})

test('goalkeeper radar shows keeper attributes, not outfield groups', async ({ page }) => {
  await fixture(page)
  const keeper = ['Atlama', 'Top tutma', 'Degaj', 'Refleks', 'Kaleci pozisyonu'].map((label, i) => ({ key: `gk${i}`, label, value: 70 + i }))
  await page.route('**/api/players/3*', route => route.fulfill({ json: { snapshot: snapshot(), player: { ...player(3), position: 'GK', positionGroup: 'GK' }, hasFace: false, positionRatings: [],
    contract: { wage: 1000, endYear: 2030, yearsLeft: 0 }, stats: null, profile: {}, opportunity: { score: 70, components: [] },
    value: { value: 5000000, base: 4000000, ageRule: 'unknown', ageMultiplier: 1, contractMultiplier: 1, positionMultiplier: 1 },
    attributeGroups: ['Hız', 'Şut', 'Pas'].map(name => ({ name, score: 20, attributes: [] })), attributeCategories: [{ name: 'Kaleci', score: 72, attributes: keeper }] } }))
  await page.goto('/scout?player=3')
  const radar = page.getByRole('dialog').getByRole('img', { name: /Atlama: 70/ })
  await expect(radar).toHaveAttribute('aria-label', 'Atlama: 70, Top tutma: 71, Degaj: 72, Refleks: 73, Kaleci pozisyonu: 74')
})

test('player detail is split into tabs while the card and actions stay in view', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await fixture(page); await page.goto('/scout?player=1')
  const dialog = page.getByRole('dialog'), tabs = dialog.getByRole('group', { name: 'Oyuncu bilgileri' })
  await expect(tabs.getByRole('button', { name: 'Özet', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByText('SERBEST KALMA')).toBeVisible()
  await expect(dialog.getByText(/Gelecek tahmini içermez/)).toHaveCount(0)
  for (const name of ['Özellikler', 'Mevkiler', 'Gelişim', 'Değer']) {
    await tabs.getByRole('button', { name, exact: true }).click()
    await expect(tabs.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(dialog.getByText('SERBEST KALMA')).toHaveCount(0)
    await expect(dialog.getByRole('img', { name: /Hız: 10/ })).toBeVisible()
    await expect(dialog.locator('.star')).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('home transfer tiles navigate to transfer market page with world or club scope and sub-header', async ({ page }) => {
  await fixture(page)
  await page.goto('/?bolum=transfers')
  await expect(page.getByText('KULÜBE GENEL BAKIŞ')).toBeVisible()
  await page.getByRole('link', { name: 'Transfer piyasası: tümü' }).click()
  await expect(page).toHaveURL(/\/transfer\/market$/)
  await expect(page.locator('.transfer-drawer')).toHaveCount(0)
  const subNav = page.getByRole('navigation', { name: 'Transfer bölümleri' })
  await expect(subNav.getByRole('link', { name: 'TRANSFER PİYASASI' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: 'Dünya', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('row', { name: /Kalıcı Transfer/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /Kiralık Oyuncu/ })).toBeVisible()
  await page.getByRole('button', { name: 'Kiralık', exact: true }).click()
  await expect(page.getByRole('row', { name: /Kalıcı Transfer/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Tümü' }).click()

  await page.goto('/?bolum=transfers')
  await page.getByRole('link', { name: 'Kulübün transferleri: tümü' }).click()
  await expect(page).toHaveURL(/\/transfer\/market\?kapsam=club$/)
  await expect(page.getByRole('button', { name: /Ankara FK/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('row', { name: /Kiralık Oyuncu/ })).toHaveCount(0)
  await expect(page.getByRole('row', { name: /Kalıcı Transfer/ })).toBeVisible()
})

test('career branches can be selected and are sent as save@branch', async ({ page }) => {
  const api = await fixture(page)
  api.branch()
  await page.goto('/squad')
  await expect(page.locator('.career-branch')).toHaveText('Dal 2'); await expect(page.locator('.career-branch')).toHaveAttribute('title', /.+/)
  await page.getByRole('button', { name: 'Kariyer değiştir' }).click()
  await page.getByText('Kayıt yuvaları ve arşivler (2)', { exact: true }).click()
  await page.getByRole('button', { name: /^Dal 1 · / }).click()
  await expect.poll(() => api.requests.some(u => u.pathname === '/api/club' && u.searchParams.get('saveUid') === 'career-a@1')).toBeTruthy()
  await page.reload()
  await expect(page.getByText('Dal 1', { exact: true })).toBeVisible()
})

test('same-date branches show save slot labels and explain why unrelated history is not merged', async ({ page }) => {
  await fixture(page)
  const branches = [1, 2].map(b => ({ ...branch(b, b === 2), parentBranch: null, forkDate: null,
    lastGameDate: '2029-10-17', snapshotCount: b === 2 ? 1 : 5,
    slots: [{ title: b === 1 ? 'Maç öncesi' : 'Maç sonrası', fileName: `CmMgrC-${b}`, gameDate: '2029-10-17' }] }))
  await page.route('**/api/saves', route => route.fulfill({ json: [{ saveUid: 'career-a', userTeamName: 'Ankara FK', latest: snapshot(), branches }] }))
  await page.route('**/api/feed?*', route => route.fulfill({ json: { snapshot: snapshot(), snapshotCount: 1, total: 0, items: [] } }))
  await page.goto('/transfers')
  await expect(page.getByText('Önceki dal bağlantısı doğrulanmadığı için diğer dalların geçmişi buraya katılmıyor.')).toBeVisible()
  await page.getByRole('button', { name: 'Kayıt yuvalarını incele' }).click()
  await page.getByText('Kayıt yuvaları ve arşivler (2)', { exact: true }).click()
  const before = page.getByRole('button', { name: 'Dal 1 · 17 Ekim 2029 arşivini aç' })
  await expect(before).toContainText('Maç öncesi')
  await expect(before).toContainText('CmMgrC-1')
  await expect(before).toContainText('5 görüntü')
  await expect(before).toContainText('Önceki dal bağlantısı doğrulanmadı')
  await expect(page.getByRole('button', { name: 'Dal 2 · 17 Ekim 2029 arşivini aç' })).toContainText('Son kaydın dalı')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await before.click()
  await expect(page.locator('.career-branch')).toHaveText('Dal 1')
  await page.reload()
  await expect(page.locator('.career-branch')).toHaveText('Dal 1')
})

test('scout teams tab lists clubs and opens another club squad', async ({ page }) => {
  const api = await fixture(page)
  await page.goto('/scout')
  await page.getByRole('tab', { name: 'Takımlar' }).click()
  const rows = page.getByRole('row', { name: /Uzak Kulüp|Ankara FK/ })
  await expect(rows.first()).toContainText('Uzak Kulüp') // GEN 82 önde
  await page.getByRole('row', { name: /Uzak Kulüp/ }).click()
  await expect(page).toHaveURL(/\/squad\?team=7/)
  await expect.poll(() => api.requests.some(u => u.pathname === '/api/club' && u.searchParams.get('teamId') === '7')).toBeTruthy()
})

test('home shows fixtures and youth shows the scouting network when exported', async ({ page }) => {
  await fixture(page)
  await page.goto('/')
  await expect(page.getByLabel('Maç günü')).toHaveCount(1)
  await expect(page.locator('.match-time')).toContainText('19:00')
  await expect(page.getByText('Rakip SK').first()).toBeVisible()
  await page.goto('/youth')
  await expect(page.getByText('Ali Göz')).toBeVisible()
})

test('calendar help, selected day and full fixtures work with keyboard and pointer', async ({ page }) => {
  await fixture(page)
  await page.goto('/')
  const calendar = page.locator('[data-tile="calendar"]')
  const help = calendar.getByRole('button', { name: 'Takvim hakkında' })
  await help.hover()
  await expect(page.getByRole('tooltip')).toContainText('sonraki 7 günün maçları')
  await page.mouse.move(0, 0)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await help.focus()
  await expect(page.getByRole('tooltip')).toBeVisible()
  await help.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await calendar.getByRole('button', { name: /18 Ekim 2029, maç yok/ }).click()
  await expect(calendar.getByText('Bu gün için kayıtlı maç yok.')).toBeVisible()
  await calendar.getByRole('button', { name: /19 Ekim 2029, Rakip SK/ }).click()
  await expect(calendar.locator('.calendar-agenda')).toContainText('Rakip SK')
  await calendar.getByRole('button', { name: 'TÜMÜ', exact: true }).click()
  const fixtures = page.getByRole('dialog', { name: 'SEZON TAKVİMİ' })
  await expect(fixtures).toContainText('19:00')
  await expect(fixtures).toContainText('Rakip SK')
  await fixtures.press('Escape')
  await expect(fixtures).toHaveCount(0)
})

test('season calendar is centered and supports month navigation, filters and list view', async ({ page }) => {
  await fixture(page)
  await page.goto('/')
  const open = page.locator('[data-tile="calendar"]').getByRole('button', { name: 'TÜMÜ', exact: true })
  await open.click()
  const calendar = page.getByRole('dialog', { name: 'SEZON TAKVİMİ' })
  const viewport = page.viewportSize()!
  // Measure the resting position after the opening transition has settled.
  await expect.poll(async () => {
    const bounds = await calendar.boundingBox()
    return bounds ? Math.max(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2), Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2)) : Infinity
  }).toBeLessThan(1)
  await expect(calendar.getByRole('grid', { name: 'Ekim 2029' })).toBeVisible()
  await calendar.getByRole('button', { name: 'Sonraki ay' }).click()
  await expect(calendar.getByRole('grid', { name: 'Kasım 2029' })).toBeVisible()
  await calendar.getByRole('button', { name: 'Bugüne git' }).click()
  await expect(calendar.getByRole('grid', { name: 'Ekim 2029' })).toBeVisible()
  await calendar.locator('[data-day="2029-10-17"]').press('ArrowRight')
  await expect(calendar.locator('[data-day="2029-10-18"]')).toBeFocused()
  await expect(calendar.locator('.season-day-detail')).toContainText('Bu gün için seçili filtrelere uyan kayıtlı maç yok.')
  await calendar.locator('[data-day="2029-10-19"]').click()
  await expect(calendar.locator('.season-day-detail')).toContainText('Rakip SK')
  await calendar.getByRole('radiogroup', { name: 'Saha', exact: true }).getByRole('radio', { name: 'Deplasman' }).click()
  await expect(calendar.locator('.season-calendar-summary')).toContainText('0 maç')
  await expect(calendar.locator('.season-cell-match')).toHaveCount(0)
  await calendar.getByRole('radiogroup', { name: 'Saha', exact: true }).getByRole('radio', { name: 'Tümü' }).click()
  const status = calendar.getByRole('radiogroup', { name: 'Durum' })
  await status.getByRole('radio', { name: 'Oynanan' }).click()
  await expect(calendar.locator('.season-calendar-summary')).toContainText('0 maç')
  await status.getByRole('radio', { name: 'Gelecek' }).click()
  await expect(calendar.locator('.season-calendar-summary')).toContainText('1 maç')
  await calendar.getByRole('radio', { name: 'Liste', exact: true }).click()
  await expect(calendar.getByRole('grid')).toHaveCount(0)
  await expect(calendar.locator('.season-calendar-list')).toContainText('Rakip SK')
  await calendar.getByRole('button', { name: 'Takvimi kapat' }).click()
  await expect(calendar).toHaveCount(0)
  await expect(open).toBeFocused()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open.click()
  await expect(calendar).toHaveCSS('animation-name', 'none')
  await calendar.press('Escape')
})

test('position filter is one tidy grid: groups on top, pitch-ordered positions below', async ({ page }) => {
  await fixture(page)
  const labels = ['GK', 'RB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'ST', 'LW']
  await page.route('**/api/filters/options?*', route => route.fulfill({ json: {
    snapshot: snapshot(), leagues: [], clubs: [], nations: [], feet: [], positions: labels.map(label => ({ label, group: null, count: 1 })),
    positionGroups: [{ key: 'GK', positions: ['GK'] }, { key: 'DEF', positions: ['RB', 'CB', 'LB'] }, { key: 'MID', positions: ['CDM', 'CM', 'CAM', 'RM', 'LM'] }, { key: 'ATT', positions: ['RW', 'LW', 'ST'] }],
    ranges: { age: [16, 40], overall: [1, 99], potential: [1, 99], contractEnd: [2029, 2035], maxValue: 50000000 }, roles: [], playStyles: [], playStylesPlus: [],
  } }))
  await page.goto('/scout')
  const pitch = page.locator('.pos-pitch'), groups = page.locator('.pos-groups')
  await expect(pitch.locator('.chip')).toHaveCount(11); await expect(pitch.locator('.chip').first()).toHaveText('LW')
  await expect(groups.locator('.chip')).toHaveText(['Kaleci', 'Defans', 'Orta', 'Hücum'])
  await groups.getByRole('button', { name: 'Defans' }).click()
  await expect(page).toHaveURL(/pos=DEF/)
  await expect(pitch.getByRole('button', { name: 'CB', exact: true })).toHaveClass(/\bon\b/)
  await expect(pitch.getByRole('button', { name: 'ST', exact: true })).not.toHaveClass(/\bon\b/)
  await pitch.getByRole('button', { name: 'ST', exact: true }).click(); await expect(page).toHaveURL(/pos=DEF%2CST|pos=DEF,ST/)
  await page.getByRole('button', { name: 'Pozisyon filtresini temizle' }).click(); await expect(page).not.toHaveURL(/pos=/)
  const widths = await pitch.locator('.chip').evaluateAll(els => els.slice(0, 6).map(el => Math.round(el.getBoundingClientRect().width)))
  expect(new Set(widths).size).toBe(1)
})

test('watchlist uses wide screens like scout', async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/shortlist')
  await expect(page.locator('.shortlist-workspace')).toBeVisible()
  const width = await page.locator('.career-container').evaluate(el => el.getBoundingClientRect().width)
  expect(width).toBeGreaterThan(1800)
})

test('scout filters stay after visiting another page and can still be cleared', async ({ page }) => {
  await fixture(page)
  await page.goto('/scout')
  const filters = page.getByRole('complementary', { name: 'Filtreler' })
  const wages = filters.getByRole('group', { name: 'Haftalık maaş (€)', exact: true }).getByRole('textbox', { name: 'en az', exact: true })
  await wages.fill('1000')
  await expect(page).toHaveURL(/wageMin=1000/)
  await page.getByText('TROPHIES', { exact: true }).first().click()
  await expect(page).not.toHaveURL(/scout/)
  await page.getByText('SCOUT', { exact: true }).first().click()
  await expect(page).toHaveURL(/wageMin=1000/)
  await expect(wages).toHaveValue('1000')
  await wages.fill('')
  await expect(page).not.toHaveURL(/wageMin/)
  await page.reload()
  await expect(page).not.toHaveURL(/wageMin/)
})

test('advanced scout filters reach the API and survive reload', async ({ page }) => {
  const api = await fixture(page)
  await page.route('**/api/filters/options?*', route => route.fulfill({ json: {
    snapshot: snapshot(), leagues: [], clubs: [], nations: [], positions: [], positionGroups: [], feet: [],
    ranges: { age: [16, 40], overall: [1, 99], potential: [1, 99], contractEnd: [2029, 2035], maxValue: 50000000 },
    roles: [{ id: 33, name: 'Yarı kanat · CAM', count: 3 }], playStyles: [{ id: 0, name: 'Plase şut', count: 5 }],
    playStylesPlus: [{ id: 21, name: 'Süratli+', count: 2 }],
  } }))
  await page.goto('/scout')
  const filters = page.getByRole('complementary', { name: 'Filtreler' })
  await filters.getByLabel('Sözleşme durumu', { exact: true }).selectOption('true')
  const wages = filters.getByRole('group', { name: 'Haftalık maaş (€)', exact: true })
  await wages.getByRole('textbox', { name: 'en az', exact: true }).fill('1000')
  await expect(page).toHaveURL(/wageMin=1000/)
  await wages.getByRole('textbox', { name: 'en çok', exact: true }).fill('5000')
  await expect(page).toHaveURL(/wageMax=5000/)
  const years = filters.getByRole('group', { name: 'Kalan sözleşme (yıl)', exact: true })
  await years.getByRole('textbox', { name: 'en çok', exact: true }).fill('1')
  await filters.getByLabel('En az zayıf ayak', { exact: true }).selectOption('4')
  await filters.getByLabel('En az beceri', { exact: true }).selectOption('3')
  await filters.getByLabel('Ek mevkileri dahil et').check()
  await filters.locator('summary').filter({ hasText: 'Roller ve oyun stilleri' }).click()
  await filters.getByRole('button', { name: 'Roller', exact: true }).click()
  await filters.getByLabel('Yarı kanat · CAM').check()
  await filters.getByRole('button', { name: 'Roller', exact: true }).click()
  await filters.getByLabel('Yalnız ++ roller').check()
  await filters.getByRole('button', { name: 'Oyun stilleri (+ dahil)', exact: true }).click()
  await filters.getByLabel('Plase şut', { exact: true }).check()
  await filters.getByRole('button', { name: 'Oyun stilleri (+ dahil)', exact: true }).click()
  await filters.getByRole('button', { name: 'Yalnız oyun stili+', exact: true }).click()
  await filters.getByLabel('Süratli+', { exact: true }).check()
  await filters.getByRole('button', { name: 'Yalnız oyun stili+', exact: true }).click()
  await expect.poll(() => api.requests.some(u => u.pathname === '/api/players' &&
    ['freeAgent=true', 'wageMin=1000', 'wageMax=5000', 'contractYearsMax=1', 'weakFootMin=4', 'skillMovesMin=3',
      'role=33', 'roleLevelMin=2', 'playStyle=0', 'playStylePlus=21', 'includeSecondary=true'].every(pair => u.search.includes(pair)))).toBe(true)
  await page.reload()
  await expect(filters.getByLabel('Sözleşme durumu', { exact: true })).toHaveValue('true')
  await expect(filters.getByLabel('Yalnız ++ roller')).toBeChecked()
  await expect(wages.getByRole('textbox', { name: 'en az', exact: true })).toHaveValue('1000')
  await filters.getByRole('button', { name: 'Temizle', exact: true }).click()
  await expect(filters.getByLabel('Sözleşme durumu', { exact: true })).toHaveValue('')
  expect(new URL(page.url()).searchParams.has('playStyle')).toBe(false)
})

test('finance shows all recorded movements and season history keeps observation dates', async ({ page }) => {
  await fixture(page)
  const record = { played: 7, won: 4, drawn: 2, lost: 1, goalsFor: 12, goalsAgainst: 6, biggestWin: null, biggestLoss: null }
  await page.route('**/api/club?*', route => route.fulfill({ json: { ...club('career-a'), seasonRecord: record,
    observedSeasons: [{ seasonEndYear: 2030, asOf: '2029-10-17', snapshotId: 'now', teamId: 326, record },
      { seasonEndYear: 2029, asOf: '2029-03-01', snapshotId: 'old', teamId: 326, record }],
    finance: { transferBudgetStart: 20000000, transferBudget: 12000000, wageBudget: 500000, wageBudgetLeft: 450000, wageHeadroom: 3000,
      transactions: Array.from({ length: 8 }, (_, i) => ({ date: '2029-10-17', kind: i % 2 ? 16 : 13, label: i % 2 ? 'Oyuncu maaşları' : 'Forma satışı', amount: i % 2 ? -250 : 1000 })) },
  } }))
  await page.goto('/?bolum=board')
  const history = page.locator('[data-tile="seasonHistory"]')
  await expect(history).toContainText('1 Mart 2029')
  await expect(history).toContainText('2028/29')
  await expect(page.locator('[data-tile="managerCv"]')).toContainText('14 maç · 8 G / 4 B / 2 M')
  await page.getByRole('navigation', { name: 'Bölümler' }).getByRole('button', { name: 'KULÜP VE FİNANS' }).click()
  const opener = page.getByRole('button', { name: 'Tüm finans hareketleri (8) →' })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Kayıtlı finans hareketleri' })
  await expect(dialog.getByRole('row')).toHaveCount(9)
  await expect(dialog).toContainText('4.000 €')
  await dialog.getByLabel('Yön', { exact: true }).selectOption('expense')
  await expect(dialog.getByRole('row')).toHaveCount(5)
  await expect(dialog).toContainText('4 hareket gösteriliyor')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await dialog.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('finance tile ranks season categories and opens details without a transaction log', async ({ page }) => {
  await fixture(page)
  const cat = (kind: number, label: string | null, income: number, expense: number) => ({ kind, label, income, expense })
  await page.route('**/api/club?*', route => route.fulfill({ json: { ...club('career-a'),
    finance: { transferBudgetStart: 52600000, transferBudget: 36900000, wageBudget: 56400000, wageBudgetLeft: 14100000, wageHeadroom: 324000,
      transactions: [], categories: [cat(0, 'Oyuncu satışı', 32000000, 0), cat(3, null, 3087980, 2116500), cat(13, 'Forma satışı', 8344500, 0),
        cat(16, 'Oyuncu maaşları', 0, 2129000), cat(22, 'Diğer', 0, 44335999), cat(5, null, 0, 0)] },
  } }))
  await page.goto('/?bolum=finances')
  const top = page.getByLabel('En büyük finans kategorileri')
  await expect(top).toContainText('Oyuncu satışı')
  await expect(top).toContainText('Tür 3')
  await expect(top).not.toContainText('Tür 5')
  await expect(page.getByTitle('Maaş bütçesinin %25 kaldı')).toBeVisible()
  await page.getByRole('button', { name: 'Finans ayrıntısı →' }).click()
  const dialog = page.getByRole('dialog', { name: 'Kayıtlı finans hareketleri' })
  await expect(dialog.getByRole('region', { name: 'Sezon finans toplamları' })).toContainText('Forma satışı')
  await dialog.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('decoded manager archive, security and league goal are shown independently of current fixtures', async ({ page }) => {
  await fixture(page)
  const season = { index: 1, seasonEndYear: 2027, teamId: 326, team: 'Ankara FK', leagueId: 68, position: 1, objective: 'Ligi kazan',
    objectiveStatus: 'Karşılandı', played: 53, won: 42, drawn: 7, lost: 4, goalsFor: 150, goalsAgainst: 46, points: 133,
    jobSecurity: 84, biggestBuy: 'Antony', biggestSale: 'Espí', completed: true, leagueTitles: 1, biggestBuyFee: 50000000, biggestSaleFee: 128000000 }
  await page.route('**/api/club?*', route => route.fulfill({ json: { ...club('career-a'), managerCareer: {
    snapshotId: 'now', asOf: '2029-10-17', played: 53, won: 42, drawn: 7, lost: 4, goalsFor: 150, goalsAgainst: 46,
    seasons: [{ ...season, index: 2, seasonEndYear: 2028, position: null, objectiveStatus: 'Sürüyor', played: 0, won: 0, drawn: 0, lost: 0, jobSecurity: 74, completed: false, leagueTitles: 0, biggestBuy: null, biggestSale: null }, season],
  } } }))
  await page.goto('/?bolum=board')
  await expect(page.getByRole('meter', { name: 'Yönetim güveni' })).toHaveAttribute('aria-valuenow', '74')
  await expect(page.locator('[data-tile="managerCv"]')).toContainText('53 maç · 42 G / 7 B / 4 M')
  await expect(page.getByLabel('Transfer rekorları')).toContainText('Antony · 50,0 M€ (2026/27)')
  await expect(page.getByLabel('Geçen sezona göre değişim')).toContainText('2026/27 sonu 84 → −10')
  await expect(page.locator('[data-tile="jobSecurity"]')).toContainText('Güvende')
  await expect(page.locator('[data-tile="seasonHistory"]')).toContainText('🏆 Lig')
  await expect(page.locator('[data-tile="seasonHistory"]')).toContainText('2026/27')
  await expect(page.locator('[data-tile="board"]')).toContainText('Ligi kazan')
  await expect(page.locator('[data-tile="board"]')).toContainText('Kupa hedefleri ve asgari başarı koşulları henüz okunamıyor.')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})

test('youth details, academy scouts and the club race stay separate from player awards', async ({ page }) => {
  await fixture(page)
  const row = (teamId: number, team: string, position: number | null, previousPosition: number, points: number, played: number) =>
    ({ teamId, team, position, points, played, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, previousPosition, isUser: teamId === 326 })
  const preseason = [row(327, 'Beşiktaş', null, 2, 0, 0), row(326, 'Ankara FK', null, 1, 0, 0), row(325, 'Galatasaray', null, 3, 0, 0), row(9, 'Konya', null, 4, 0, 0)]
  let table = preseason, consistent = false
  await page.route('**/api/club?*', route => route.fulfill({ json: { ...club('career-a'), table, tableConsistent: consistent,
    academy: [{ player: { ...player(40), name: 'Genç Yıldız', age: 15, position: 'RB', overall: 59, potential: 88 }, tier: 0, potentialVariance: 5, monthsInSquad: 16 }] } }))
  await page.goto('/?bolum=youth')
  await expect(page.locator('[data-tile="academy"]')).toContainText('RB · 15 y · 16 ay · POT ±5 · kademe 0')
  await expect(page.locator('[data-tile="scouts"]')).toContainText('ALTYAPI GÖZLEMCİLERİ · 1')
  const race = page.getByLabel('Kulüp yarışı')
  await expect(race).toContainText('GEÇEN SEZONUN İLK ÜÇÜ')
  await expect(race).toContainText('1. Ankara FK')
  await expect(race).not.toContainText('Konya')
  table = [row(325, 'Galatasaray', 1, 3, 9, 3), row(326, 'Ankara FK', 2, 1, 7, 3), row(327, 'Beşiktaş', 3, 2, 6, 3)]
  consistent = true
  await page.reload()
  await expect(race).toContainText('1. Galatasaray')
  await expect(race).toContainText('7 P')
})

test('availability lists bans and yellow-card accumulation from the save', async ({ page }) => {
  await fixture(page)
  await page.route('**/api/club?*', route => route.fulfill({ json: { ...club('career-a'), discipline: [
    { playerId: 1, name: 'Karim Adeyemi', yellows: 0, ban: 1, competitionKey: 0 },
    { playerId: 2, name: 'Nathan Ngoy', yellows: 2, ban: 0, competitionKey: 0 },
    { playerId: 2, name: 'Nathan Ngoy', yellows: 2, ban: 0, competitionKey: 1900 }] } }))
  await page.goto('/?bolum=injuries')
  const list = page.getByLabel('Kart ve cezalar')
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(list.getByRole('listitem').first()).toContainText('CEZALI · 1 maç')
  await expect(list.getByRole('listitem').nth(1)).toContainText('2 sarı')
  await expect(list.getByRole('listitem').nth(1)).toContainText('2 sarı (1900)')
})

test('board objectives per competition and the manager record from the save', async ({ page }) => {
  await fixture(page)
  const match = (date: string, opponent: string, f: number, a: number) => ({ date, opponentId: 1, opponent, for: f, against: a, competition: null })
  await page.route('**/api/club?*', route => route.fulfill({ json: { ...club('career-a'),
    objectives: [{ competitionId: 68, competition: 'Süper Lig', kind: 0, target: 17, stretch: null, minimum: 13 },
      { competitionId: 268, competition: 'Türkiye Kupası', kind: 1, target: 7, stretch: 11, minimum: 5 }],
    manager: { wage: 15000, earnings: 3165000, season: 5, difficulty: 6, halfLength: 5,
      biggestWin: match('2026-08-22', 'Konyaspor', 10, 0), biggestLoss: match('2028-03-07', 'Manchester City', 1, 4) } } }))
  await page.goto('/?bolum=board')
  const objectives = page.getByLabel('Yönetim hedefleri listesi')
  await expect(objectives.getByRole('listitem').first()).toContainText('Ligi kazan')
  await expect(objectives.getByRole('listitem').first()).toContainText('Basamak 13')
  await expect(objectives.getByRole('listitem').nth(1)).toContainText('Basamak 7 · üst 11')
  const info = page.getByLabel('Menajer bilgileri')
  await expect(info).toContainText('Ultimate · 5 dk')
  await expect(info).toContainText('10-0 · Konyaspor')
  await expect(info).toContainText('1-4 · Manchester City')
})

test('main-team scout network and pre-season invitations come from the save', async ({ page }) => {
  await fixture(page)
  const scout = (name: string, coverNation: string | null) => ({ name, coverNationId: coverNation ? 18 : null, coverNation, coverCode: null,
    nationId: 48, nation: 'Türkiye', nationCode: 'TR', experience: 4, judgement: 3 })
  await page.route('**/api/club?*', route => route.fulfill({ json: { ...club('career-a'),
    scoutNetwork: { newScoutsDate: '2030-07-28', hired: [scout('Anil Kara', 'Fransa')], available: [scout('Ali Kaya', null), scout('Mehmet Batur', null)] },
    preseason: { confirmedDate: '2030-07-12', invites: [
      { competitionId: 840, key: 'cm_pst_eu_intl_cup', entered: true, prize: 4000000, teams: ['Ankara FK', 'PSV'] },
      { competitionId: 844, key: 'cm_pst_eu_shield', entered: false, prize: 3900000, teams: ['Ankara FK', 'Lazio'] }] } } }))
  await page.goto('/?bolum=youth')
  const network = page.getByLabel('Ana takım gözlemcileri')
  await expect(network).toContainText('1 işe alınmış · 2 alınabilir')
  await expect(network).toContainText('Fransa gözlüyor')
  await expect(network).toContainText('Yeni gözlemciler 28 Temmuz 2030')
  await expect(page.locator('[data-tile="scouts"]')).toContainText('ALTYAPI GÖZLEMCİLERİ · 1')
  await page.getByRole('navigation', { name: 'Bölümler' }).getByRole('button', { name: 'DÜNYA' }).click()
  const invites = page.getByLabel('Hazırlık turnuvası davetleri')
  await expect(invites.getByRole('listitem').first()).toContainText('European International Cup')
  await expect(invites.getByRole('listitem').first()).toContainText('KATILDI')
  await expect(invites.getByRole('listitem').first()).toContainText('PSV')
  await expect(invites.getByRole('listitem').nth(1)).toContainText('REDDEDİLDİ')
  await expect(page.locator('[data-tile="preSeason"]')).toContainText('onay 12 Temmuz 2030')
})

test('recorded free-agent wage, all positions and equipment stay clearly labelled', async ({ page }) => {
  await fixture(page)
  const p = { ...player(1), isFreeAgent: true, club: 'Serbest', wage: null, recordedWage: 2400, contractEnd: null,
    position: 'CB', position2: 'RB', positions: ['CB', 'RB', 'CM'] }
  await page.route('**/api/players?*', route => route.fulfill({ json: { snapshot: snapshot(), total: 1, page: 1, pageSize: 100, items: [p] } }))
  await page.route('**/api/players/1?*', route => route.fulfill({ json: {
    snapshot: snapshot(), player: p, hasFace: false, attributeGroups: [], attributeCategories: [], stats: null,
    positionRatings: ['CB', 'RB', 'CM'].map(position => ({ position, rating: 75 })),
    contract: { wage: null, endYear: null, yearsLeft: 0 }, value: {}, opportunity: { score: 70, components: [] },
    profile: { equipment: { bootType: 87, bootDesign: 0, bootColor1: 30, bootColor2: 31, gloveType: 133 } },
  } }))
  await page.goto('/scout')
  const row = page.locator('.scout-workspace .tr').first()
  await expect(row).toContainText('kayıt')
  await expect(row.locator('[title^="Serbest oyuncunun"]')).toContainText('2.400 €')
  await row.getByText('Atlas 1', { exact: true }).click()
  const detail = page.getByRole('dialog')
  await expect(detail).toContainText('KAYITTAKİ MAAŞ')
  await expect(detail).toContainText('Aktif sözleşme veya istediği maaş anlamına gelmez.')
  await expect(detail.locator('.player-identity')).toContainText('CM')
  await detail.getByRole('button', { name: 'Mevkiler', exact: true }).click()
  await expect(detail.locator('.pitch .slot.secondary')).toHaveCount(2)
  await detail.getByRole('button', { name: 'Özet', exact: true }).click()
  await expect(detail.getByRole('region', { name: 'Ekipman' })).toContainText('Kod #87')
  await expect(detail.getByRole('region', { name: 'Ekipman' })).toContainText('Kod #133')
  await expect(detail.getByRole('region', { name: 'Ekipman' })).toContainText('Tasarım: Kod #0')
})

test('pitch previews open on hover and focus; player detail restores the squad', async ({ page }) => {
  await fixture(page)
  await page.goto('/squad')
  const starter = page.locator('.lineup-player').first()
  await starter.locator('.lineup-player-button').hover()
  await expect(page.getByRole('dialog', { name: 'Atlas 1 · GK yedekleri' })).toContainText('Atlas 1')
  await page.mouse.move(0, 0)
  await starter.locator('.lineup-player-button').focus()
  await expect(page.getByRole('dialog', { name: 'Atlas 1 · GK yedekleri' })).toBeVisible()
  await starter.locator('.lineup-player-button').press('Enter')
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Atlas 1' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Geri', exact: true }).click()
  await expect(page.locator('.squad-table')).toBeVisible()
  await expect(page.locator('.player-detail-view')).toHaveCount(0)
})

test('home goalkeeper preview stays above the next row of cards', async ({ page }) => {
  await fixture(page)
  await page.goto('/')
  await page.locator('.home-hub').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)))
  const tile = page.locator('[data-tile="startingXi"]')
  await tile.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const goalkeeper = tile.locator('.lineup-player').first()
  await goalkeeper.locator('button').hover()
  const preview = page.getByRole('dialog', { name: 'Atlas 1 · GK yedekleri' })
  await expect(preview).toBeVisible()
  // A portal must paint above cards and stay inside the viewport after flipping.
  const isOnTop = () => preview.evaluate(el => {
    const r = el.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && (top === el || el.contains(top))
  })
  await expect.poll(isOnTop).toBe(true)
  await page.mouse.move(0, 0)
  await goalkeeper.locator('button').focus()
  await expect.poll(isOnTop).toBe(true)
})

test('home opens one section at a time, keeps it in the address and hides empty tiles until asked', async ({ page }) => {
  await fixture(page)
  await page.goto('/')
  const tabs = page.getByRole('navigation', { name: 'Bölümler' })
  await expect(page.getByRole('region', { name: 'Bugünün özeti' })).toBeVisible()
  await expect(page.locator('.hub-section')).toHaveCount(1)
  await expect(page.locator('[data-tile="calendar"]')).toBeVisible(); await expect(page.locator('[data-tile="managerCv"]')).toHaveCount(0)
  await tabs.getByRole('button', { name: 'TURNUVALAR' }).click()
  await expect(page).toHaveURL(/bolum=competitions/)
  await expect(tabs.getByRole('button', { name: 'TURNUVALAR' })).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('[data-tile="calendar"]')).toHaveCount(0)
  const empty = page.locator('[data-tile="goldenBoot"]')
  await expect(empty).toBeHidden()
  await page.getByRole('button', { name: 'Göster', exact: true }).click(); await expect(empty).toContainText('Bu yüklemede veri yok')
  await page.getByRole('button', { name: 'Gizle', exact: true }).click(); await expect(empty).toBeHidden()
  await page.reload(); await expect(tabs.getByRole('button', { name: 'TURNUVALAR' })).toHaveAttribute('aria-current', 'true')
  await tabs.getByRole('button', { name: 'GENEL BAKIŞ' }).click(); await expect(page).not.toHaveURL(/bolum=/)
})

test('today panel links decisions to their screens and stays honest without a transfer board', async ({ page }) => {
  await fixture(page)
  await page.goto('/')
  const today = page.getByRole('region', { name: 'Bugünün özeti' })
  await expect(today.getByRole('link', { name: /Transfer merkezi/ })).toHaveAttribute('href', '/transfer', { timeout: 15000 })
  await today.getByRole('button', { name: /Sözleşmeler/ }).click(); await expect(page).toHaveURL(/bolum=transfers/)
  await today.getByRole('button', { name: /Kadro durumu/ }).click(); await expect(page).toHaveURL(/bolum=injuries/)
})

test('squad full stats switch shows form and match columns and flat list switch sorts across all positions', async ({ page }) => {
  await fixture(page)
  const base = club('career-a')
  const squad = base.squad.map((m, idx) => idx === 0
    ? { ...m, player: { ...m.player, overall: 71, potential: 84 } } // GK Atlas 1
    : idx === 10
      ? { ...m, player: { ...m.player, overall: 86, potential: 95 } } // ST Atlas 11
      : idx === 4
        ? { ...m, player: { ...m.player, overall: 82, potential: 93 } } // LB Atlas 5
        : m)
  await page.route('**/api/club?*', route => route.fulfill({ json: { ...base, squad } }))
  await page.goto('/squad')
  await expect(page.getByRole('columnheader', { name: 'MAÇ' })).toHaveCount(0)
  await page.getByRole('switch', { name: 'Tüm istatistikler' }).click()
  await expect(page.getByRole('columnheader', { name: 'MAÇ' }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'XI' }).first()).toBeVisible()
  await expect(page.locator('tr.squad-group')).toHaveCount(4)

  await page.getByRole('switch', { name: 'Tüm oyuncular tek listede' }).click()
  await expect(page.locator('tr.squad-group')).toHaveCount(0)
  await expect(page.locator('tr.squad-row').first()).toContainText('Atlas 11')
  await expect(page.locator('tr.squad-row').nth(1)).toContainText('Atlas 5')

  await page.getByRole('button', { name: /POT/ }).click()
  await expect(page.locator('tr.squad-row').first()).toContainText('Atlas 11')
  await expect(page.locator('tr.squad-row').nth(1)).toContainText('Atlas 5')
  await expect(page.locator('tr.squad-row').last()).toContainText('Atlas 1')
})

test('scout grid layout shows FUT cards with paging', async ({ page }) => {
  const api = await fixture(page)
  await page.goto('/scout')
  await page.getByRole('button', { name: 'Izgara' }).click()
  await expect(page.getByRole('button', { name: 'Atlas 1', exact: true })).toBeVisible()
  // A present/clickable card can still collapse into a strip: check its visible contents.
  for (const width of [1426, 1024, 390]) {
    await page.setViewportSize({ width, height: 953 })
    const card = page.locator('.scout-card-grid .pc-card').first()
    await expect.poll(() => card.evaluate(el => {
      const box = el.getBoundingClientRect()
      const face = el.querySelector('.pc-face')!.getBoundingClientRect()
      const name = el.querySelector('.pc-bottom > b')!.getBoundingClientRect()
      const ratings = [...el.querySelectorAll('.pc-rating')].map(x => x.getBoundingClientRect())
      return [face, name, ...ratings].every(r => r.height > 0 && r.top >= box.top && r.bottom <= box.bottom)
    })).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Sonraki sayfa' }).click()
  await expect.poll(() => api.requests.some(u => u.pathname === '/api/players' && u.searchParams.get('page') === '2' && u.searchParams.get('pageSize') === '24')).toBeTruthy()
})

test('compare: add from player panel and search, side by side, remove', async ({ page }) => {
  await fixture(page)
  await page.goto('/scout')
  await page.evaluate(() => localStorage.removeItem('fcmarket.compare'))
  for (const name of ['Atlas 1', 'Atlas 2']) {
    await page.getByRole('row', { name, exact: true }).press('Enter')
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: '+ Karşılaştır' }).click()
    await expect(dialog.getByRole('button', { name: 'Karşılaştırmada ✓' })).toBeVisible()
    await page.keyboard.press('Escape')
  }
  await page.getByRole('navigation', { name: 'Kariyer sekmeleri' }).getByRole('button', { name: 'KARŞILAŞTIR' }).click()
  await expect(page).toHaveURL(/\/compare$/)
  await expect(page.getByText('Genel (OVR)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Atlas 1 çıkar' })).toBeVisible()
  await page.getByLabel('Karşılaştırmaya oyuncu ekle').fill('Atlas 3')
  await page.getByRole('button', { name: /Atlas 3\b/ }).first().click()
  await expect(page.getByRole('button', { name: 'Atlas 3 çıkar' })).toBeVisible()
  await page.getByRole('button', { name: 'Atlas 1 çıkar' }).click()
  await expect(page.getByRole('button', { name: 'Atlas 1 çıkar' })).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'Özellik profilleri' })).toBeVisible()
})

test('transfer page: observed transfers, free agents, expiring and budget lists', async ({ page }) => {
  const api = await fixture(page)
  await page.goto('/transfer/market')
  await expect(page.getByRole('tab', { name: 'Transferler', selected: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Serbest oyuncular' }).click()
  await expect.poll(() => api.requests.some(u => u.pathname === '/api/players' && u.searchParams.get('freeAgent') === 'true')).toBe(true)
  await expect(page.getByRole('button', { name: 'Atlas 1 karşılaştırmaya ekle' })).toBeVisible()
  await page.getByRole('tab', { name: 'Sözleşmesi bitenler' }).click()
  await expect.poll(() => api.requests.some(u => u.searchParams.has('contractEndsBy') && u.searchParams.get('freeAgent') === 'false')).toBe(true)
  await page.getByRole('tab', { name: 'Bütçeme uygun' }).click()
  await expect.poll(() => api.requests.some(u => u.searchParams.has('valueMax') && u.searchParams.get('sort') === 'opportunity,pot')).toBe(true)
})

test('back button closes the player panel and stays on the page; tabs match exact paths', async ({ page }) => {
  await fixture(page)
  await page.goto('/squad')
  await page.goto('/scout')
  await page.getByRole('row', { name: 'Atlas 2', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/scout(\?|$)/)
  await page.getByRole('row', { name: 'Atlas 3', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Geri|Kapat/ }).first().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goBack() // panel kapatıldıktan sonra geri: scout'tan önceki sayfa
  await expect(page).toHaveURL(/\/squad$/)

  await page.goto('/transfers')
  const tabs = page.getByRole('navigation', { name: 'Kariyer sekmeleri' })
  await expect(tabs.getByRole('button', { name: 'AKIŞ' })).toHaveAttribute('aria-current', 'page')
  await expect(tabs.getByRole('button', { name: 'TRANSFER' })).not.toHaveAttribute('aria-current', 'page')
})


test('all 36 official normal and plus badges render; legacy CF is absent from the pitch', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await fixture(page)
  await page.route('**/api/playstyles/*', route => route.fulfill({ body: BADGE, contentType: 'image/png' }))
  await page.route('**/api/players/1?*', async route => {
    const p = player(1)
    await route.fulfill({ json: { snapshot: snapshot(), player: p, hasFace: false,
      positionRatings: [{ position: 'CF', rating: 99 }, { position: 'ST', rating: 80 }],
      contract: { wage: 1000, endYear: 2030, yearsLeft: 0 }, stats: null,
      value: { value: 5000000, base: 4000000, ageRule: 'unknown', ageMultiplier: 1, contractMultiplier: 1, positionMultiplier: 1 },
      opportunity: { score: 70, components: [] },
      attributeGroups: [], attributeCategories: [],
      profile: { playStyles: Object.keys(PLAY_STYLES), playStylesPlus: Object.keys(PLAY_STYLES) } } })
  })
  await page.goto('/scout')
  await page.getByRole('row', { name: 'Atlas 1', exact: true }).press('Enter')
  const dialog = page.getByRole('dialog')
  const icons = dialog.locator('.player-styles img[src^="/api/playstyles/"]')
  await expect(dialog).toBeVisible()
  expect(errors).toEqual([])
  await expect(icons).toHaveCount(72)
  await expect.poll(() => icons.evaluateAll(imgs => imgs.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth === 256))).toBe(true)
  await dialog.getByRole('button', { name: 'Mevkiler', exact: true }).click()
  await expect(dialog.locator('.pitch .slot-pos')).toHaveText(['ST'])
  await dialog.getByRole('button', { name: 'Özet', exact: true }).click()
  const hover = dialog.getByRole('button', { name: 'Plase şut+ hakkında', exact: true })
  await hover.hover()
  await expect(page.getByRole('tooltip')).toContainText('Finesse Shot')
})


async function depthFixture(page: Page) {
  const api = await fixture(page)
  const base = club('career-a')
  const reserve = (id: number, role: string, ovr: number | null, position: string, positions: string[]) => ({
    ...base.squad[0], player: { ...player(id), position, positions, overall: ovr }, slot: null, role, injured: id === 36,
  })
  const cb = reserve(31, 'Sub', 88, 'CB', ['CB'])
  const squad = [...base.squad.map(m => m.player.id === 3
    ? { ...m, player: { ...m.player, position: 'CM', positions: ['CM'] } } : m),
    reserve(30, 'Reserve', 83, 'ST', ['ST', 'LW', 'CB']), cb, cb,
    reserve(32, 'Reserve', null, 'CB', ['CB']), reserve(33, 'Sub', 99, 'ST', ['ST']),
    reserve(34, 'LoanedOut', 99, 'CB', ['CB']), reserve(35, 'XI', 99, 'CB', ['CB']),
    reserve(36, 'Sub', 90, 'CB', ['CB'])]
  await page.route(/\/api\/club(?:\?|$)/, route => route.fulfill({ json: { ...base, squad } }))
  return api
}

test('pitch alternatives use the formation slot, all positions, correct ordering and only unique bench/reserves', async ({ page }) => {
  const api = await depthFixture(page)
  await page.goto('/')
  const tile = page.locator('[data-tile="startingXi"]')
  const marker = tile.getByRole('button', { name: 'Atlas 3 · RCB', exact: true })
  await marker.hover()
  const preview = page.getByRole('dialog', { name: 'Atlas 3 · CB yedekleri' })
  const rows = preview.locator('.lineup-depth-list li')
  await expect(rows).toHaveCount(4)
  await expect(rows.locator('b')).toHaveText(['Atlas 36', 'Atlas 31', 'Atlas 30', 'Atlas 32'])
  await expect(preview).toContainText('Sakatlık işareti')
  await expect(preview).not.toContainText('Atlas 33')
  await expect(preview).not.toContainText('Atlas 34')
  await expect(preview).not.toContainText('Atlas 35')
  // Moving from the marker into the panel must keep links usable.
  await rows.first().hover()
  await expect(preview).toBeVisible()
  expect(api.requests.filter(u => /^\/api\/players\/\d+$/.test(u.pathname))).toHaveLength(0)
  await preview.getByRole('button', { name: 'Atlas 30 detayını aç' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Atlas 30' })).toBeVisible()
  await page.getByRole('button', { name: 'Geri', exact: true }).click()
  await expect(marker).toBeFocused()
})

test('pitch preview supports keyboard dismissal, empty depth and viewport edges', async ({ page }) => {
  await depthFixture(page)
  await page.goto('/')
  const marker = page.locator('[data-tile="startingXi"]').getByRole('button', { name: 'Atlas 1 · GK', exact: true })
  await marker.focus()
  const preview = page.getByRole('dialog', { name: 'Atlas 1 · GK yedekleri' })
  await expect(preview).toContainText('Bu mevkide kayıtlı yedek/rezerv yok.')
  await marker.press('ArrowDown')
  await expect(preview.getByRole('button', { name: 'Atlas 1 detayını aç' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)
  await expect(marker).toBeFocused()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.mouse.move(0, 0)
  const right = page.locator('[data-tile="startingXi"]').getByRole('button', { name: 'Atlas 2 · RB', exact: true })
  await right.hover()
  const box = await page.getByRole('dialog', { name: 'Atlas 2 · RB yedekleri' }).boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
})

async function roleFixture(page: Page) {
  await fixture(page)
  await page.route('**/api/players/1?*', route => route.fulfill({ json: {
    snapshot: snapshot(), player: player(1), hasFace: false, positionRatings: [], attributeGroups: [], attributeCategories: [], stats: null,
    contract: { wage: 1000, endYear: 2030, yearsLeft: 0 }, value: {}, opportunity: { score: 70, components: [] },
    profile: { roles: [{ code: 138, name: 'Kanat', position: 'LW', level: 2 }, { code: 23, name: 'Kanat', position: 'RM', level: 1 },
      { code: 299, name: 'Rol #99', position: null, level: 2 }] },
  } }))
}

test('recent matches from the career save appear under the season stats', async ({ page }) => {
  await fixture(page)
  const line = { competitionId: 1927, competition: 'League Two', appearances: 2, goals: 0, assists: 0, yellow: 0, red: 0, cleanSheets: 0, minutes: 180, averageRating: 6.25 }
  await page.route('**/api/players/1?*', route => route.fulfill({ json: {
    snapshot: snapshot(), player: player(1), hasFace: false, positionRatings: [], attributeGroups: [], attributeCategories: [],
    stats: { total: line, competitions: [line], source: 'save', recent: [
      { date: '2026-07-21', competition: 'League Two', minutes: 90, rating: 5.7 },
      { date: '2026-07-17', competition: 'League Two', minutes: 83, rating: 6.8 }] },
    matchRatings: [{ date: '2026-07-21', minutes: 90, rating: 6 }],
    contract: { wage: 1000, endYear: 2030, yearsLeft: 0 }, value: {}, opportunity: { score: 70, components: [] }, profile: {},
  } }))
  await page.goto('/scout?player=1')
  const detail = page.getByRole('dialog')
  await detail.getByRole('button', { name: 'Gelişim', exact: true }).click()
  await expect(detail.getByRole('heading', { name: 'SON MAÇLAR' })).toBeVisible()
  await expect(detail.getByText('Kayıttaki maç puanları')).toHaveCount(0)
  await expect(detail.getByRole('listitem').filter({ hasText: "83'" })).toContainText('6,8')
})

test('roles show descriptions, familiarity and focus maps; unknown codes stay honest', async ({ page }) => {
  await roleFixture(page)
  await page.goto('/scout?player=1')
  const detail = page.getByRole('dialog')
  await detail.getByRole('button', { name: 'Mevkiler', exact: true }).click()
  const role = detail.getByRole('button', { name: 'Kanat LW ++ hakkında', exact: true })
  await role.hover()
  const tip = page.getByRole('tooltip')
  await expect(tip).toContainText('Üst düzey rol aşinalığı')
  await expect(tip.getByRole('figure')).toHaveCount(3)
  await expect(tip).toContainText('Şematik rol bölgeleri')
  await tip.hover()
  await expect(tip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tip).toHaveCount(0)
  await expect(detail.getByRole('heading', { name: 'Atlas 1' })).toBeVisible()
  await role.click()
  await expect(tip).toBeVisible()
  await detail.getByRole('heading', { name: 'Atlas 1' }).click()
  await expect(tip).toHaveCount(0)
  await detail.getByRole('button', { name: 'Kanat RM + hakkında', exact: true }).focus()
  await expect(tip).toContainText('Gelişmiş rol aşinalığı')
  await expect(tip.getByRole('figure')).toHaveCount(2)
  await detail.getByRole('button', { name: 'Rol #99  ++ hakkında', exact: true }).hover()
  await expect(tip).toContainText('henüz eşlenmedi')
  await expect(tip.getByRole('figure')).toHaveCount(0)
})

test.describe('touch hover cards', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  test('tap opens role and lineup panels; outside tap closes without losing the page', async ({ page }) => {
    await roleFixture(page)
    await page.goto('/scout?player=1')
    await page.getByRole('dialog').getByRole('button', { name: 'Mevkiler', exact: true }).click()
    await page.getByRole('button', { name: 'Kanat LW ++ hakkında', exact: true }).tap()
    const tip = page.getByRole('tooltip')
    await expect(tip).toBeVisible()
    expect(await tip.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.getByRole('heading', { name: 'Atlas 1' }).tap()
    await expect(tip).toHaveCount(0)
    await page.goto('/')
    await page.locator('[data-tile="startingXi"]').getByRole('button', { name: 'Atlas 1 · GK', exact: true }).tap()
    const preview = page.getByRole('dialog', { name: 'Atlas 1 · GK yedekleri' })
    await expect(preview).toBeVisible()
    await expect(preview).toHaveCSS('animation-name', 'none')
    await preview.getByRole('button', { name: 'Atlas 1 detayını aç' }).tap()
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Atlas 1' })).toBeVisible()
  })
})
