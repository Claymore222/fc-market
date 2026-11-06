import { test, expect, type Page } from '@playwright/test'

async function fixture(page: Page) {
  let broken = false
  const snap = { snapshotId: 'S', saveUid: 'A', gameDate: '2030-07-28', seasonEndYear: 2031, userTeamId: 10, userTeamName: 'Test FC', source: 'save', revision: 1 }
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    const respond = (json: unknown) => route.fulfill({ json })
    if (path === '/api/saves') return respond([{ saveUid: 'A', latest: snap, userTeamName: 'Test FC', branches: [] }])
    if (path === '/api/club') return respond({ snapshot: snap, club: { id: 10, name: 'Test FC' }, summary: { bestXiAverage: 80 } })
    if (path === '/api/health') return respond({ status: 'ok', database: { ok: true }, fieldMap: { warnings: [] } })
    if (path === '/api/sync') return respond({ current: snap, saved: snap, pendingExport: null, issues: [] })
    if (path === '/api/matches') return respond({ snapshot: snap, fixtureSource: null, matches: broken ? null : [], summary: null, competitions: broken ? null : [], available: 0, limit: 5 })
    return route.fulfill({ status: 404, json: {} })
  })
  return { breakNextRender: () => { broken = true }, restore: () => { broken = false } }
}

test('a rendering failure shows recovery actions, logs the error locally and reloads without erasing career selection', async ({ page }) => {
  const api = await fixture(page)
  const messages: { type: string; kind: string; message: string }[] = []
  await page.exposeFunction('captureUiError', (message: typeof messages[number]) => messages.push(message))
  await page.goto('/matches')
  await expect(page.getByRole('heading', { name: 'Son maçların analizi' })).toBeVisible()
  await page.evaluate(() => {
    localStorage.setItem('fcm.save', 'A')
    Object.assign(window, { chrome: { webview: { postMessage: (m: unknown) => (window as unknown as { captureUiError(m: unknown): void }).captureUiError(m) } } })
  })
  api.breakNextRender()
  await page.getByRole('button', { name: 'Yenile', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ekran gösterilirken bir hata oluştu' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ekran gösterilirken bir hata oluştu' })).toBeFocused()
  await expect.poll(() => messages.some(m => m.type === 'uiError' && m.kind === 'render')).toBe(true)
  await expect(page.getByRole('link', { name: 'Genel bakışa dön' })).toHaveAttribute('href', '/')
  expect(await page.evaluate(() => localStorage.getItem('fcm.save'))).toBe('A')
  api.restore()
  await page.getByRole('button', { name: 'Sayfayı yeniden yükle' }).click()
  await expect(page.getByRole('heading', { name: 'Son maçların analizi' })).toBeVisible()
  await expect(page.locator('.app-recovery')).toHaveCount(0)
})

test('event and promise diagnostics cannot blank the UI even if the native bridge fails', async ({ page }) => {
  await fixture(page); await page.goto('/matches')
  await expect(page.getByRole('heading', { name: 'Son maçların analizi' })).toBeVisible()
  await page.evaluate(() => {
    Object.assign(window, { chrome: { webview: { postMessage() { throw new Error('Bridge unavailable') } } } })
    dispatchEvent(new ErrorEvent('error', { error: new Error('Event handler failed') }))
    dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: new Error('Promise failed') }))
  })
  await expect(page.getByRole('heading', { name: 'Son maçların analizi' })).toBeVisible()
  await expect(page.locator('.app-recovery')).toHaveCount(0)
})
