import { test, expect, type Page } from '@playwright/test'

async function emptyCareer(page: Page) {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    return route.fulfill({ json: path === '/api/saves' ? []
      : { status: 'ok', database: { ok: true }, fieldMap: { warnings: [] } } })
  })
}

async function desktop(page: Page) {
  await page.addInitScript(() => {
    const listeners = new Set<(e: MessageEvent) => void>()
    const state = JSON.parse(localStorage.getItem('test.automation') ?? 'null') ?? {
      folder: 'C:\\Test Live Editor', valid: true, candidates: ['C:\\Test Live Editor'],
      scripts: ['export', 'assets', 'legacyAssets', 'manualExport'].map(id => ({ id, path: 'test/' + id, installed: false, matches: false, bundled: true, problem: null })),
    }
    const bridge = {
      addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.delete(fn),
      postMessage: (m: { type: string; id?: string; enabled?: boolean; mode?: string }) => {
        if (!m.type.startsWith('automation')) return
        if (m.type === 'automationSchedule') state.schedule = m.mode
        let data: unknown = { type: 'automation', ok: true, state }
        if (m.type === 'automationSet') {
          if (localStorage.getItem('test.fail')) data = { type: 'automation', ok: false, message: 'Erişim reddedildi; dosya değişmedi.' }
          else {
            const script = state.scripts.find((s: { id: string }) => s.id === m.id)
            script.installed = m.enabled; script.matches = m.enabled
            script.logged = m.enabled
            localStorage.setItem('test.automation', JSON.stringify(state))
          }
        }
        queueMicrotask(() => listeners.forEach(fn => fn(new MessageEvent('message', { data }))))
      },
    }
    Object.defineProperty(window, 'chrome', { value: { webview: bridge }, configurable: true })
  })
}

test('the guide explains setup in order, lists every export frequency and fits a phone', async ({ page }) => {
  const latest = { saveUid: 'A', careerKey: 'A@1', branch: 1, gameDate: '2027-01-01', source: 'save', userTeamName: 'Test FC' }
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path === '/api/saves') return route.fulfill({ json: [{ saveUid: 'A', userTeamName: 'Test FC', latest, branches: [{ branch: 1, careerKey: 'A@1', active: true }], snapshotCount: 1 }] })
    if (path === '/api/sync') return route.fulfill({ json: { current: latest, saved: latest, pendingExport: null, issues: [] } })
    if (path === '/api/health') return route.fulfill({ json: { status: 'ok', database: { ok: true }, fieldMap: { warnings: [] } } })
    return route.fulfill({ status: 404, json: {} })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/guide')
  await expect(page.getByRole('heading', { name: 'OYUNU AÇINCA NE OLUR' })).toBeVisible()
  await expect(page.locator('.guide-workspace dt')).toHaveText(['Günlük', 'Haftalık', 'Aylık', '3 aylık'])
  await expect(page.getByText('fc_export_manual.lua', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/guide-phone.png', fullPage: true })
})

test('regen tab lists likely candidates and labels them as possible matches', async ({ page }) => {
  const latest = { saveUid: 'A', careerKey: 'A@1', branch: 1, gameDate: '2030-07-31', source: 'save', userTeamName: 'Test FC' }
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path === '/api/saves') return route.fulfill({ json: [{ saveUid: 'A', userTeamName: 'Test FC', latest, branches: [{ branch: 1, careerKey: 'A@1', active: true }], snapshotCount: 2 }] })
    if (path === '/api/sync') return route.fulfill({ json: { current: latest, saved: latest, pendingExport: null, issues: [] } })
    if (path === '/api/health') return route.fulfill({ json: { status: 'ok', database: { ok: true }, fieldMap: { warnings: [] } } })
    if (path === '/api/regens') return route.fulfill({ json: { baselineDate: '2029-10-17', departed: 12, matches: [{ id: 1, name: 'N. Kanté', birthDate: '1991-03-29', nation: 'Fransa', nationCode: 'FR', position: 'CDM', overall: 83, potential: 90,
      candidates: [{ id: 2, name: 'Dorian Bertrand', age: 19, position: 'CDM', overall: 64, potential: 90, club: 'Lens', confidence: 'Güçlü' }] }] } })
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/scout?view=regens')
  await expect(page.getByRole('tab', { name: 'Regenler' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'N. Kanté' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Dorian Bertrand/ })).toContainText('Güçlü')
  await expect(page.getByText('olası eşleşmedir')).toBeVisible()
})

test('browser settings explain desktop requirement, stay centered and fit mobile', async ({ page }) => {
  await emptyCareer(page)
  await page.goto('/')
  const opener = page.getByRole('button', { name: 'Ayarlar', exact: true })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Ayarlar' })
  await expect(dialog).toContainText('masaüstü uygulamasında kullanılabilir')
  await expect(dialog.getByRole('switch', { name: 'Otomatik kariyer senkronu' })).toBeDisabled()
  const box = await dialog.boundingBox()
  expect(Math.abs(box!.x + box!.width / 2 - 720)).toBeLessThan(2)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(opener).toBeFocused()
})

test('desktop autorun toggles, manual asset installation and reopening show actual host state', async ({ page }) => {
  await emptyCareer(page); await desktop(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const daily = dialog.getByRole('switch', { name: 'Otomatik kariyer senkronu' })
  await expect(daily).not.toBeChecked()
  await daily.click()
  await expect(daily).toBeChecked()
  await expect(dialog.getByRole('status')).toContainText('sonraki oyun açılışında')
  await dialog.getByRole('switch', { name: 'Görsel script’i' }).click()
  await expect(dialog).toContainText('Kurulu · elle çalıştır')
  await page.reload()
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click()
  await expect(daily).toBeChecked()
  await expect(dialog.getByRole('switch', { name: 'Görsel script’i' })).toBeChecked()
  await daily.click()
  await expect(daily).not.toBeChecked()
  const manual = dialog.getByRole('switch', { name: 'Manuel kariyer export’u' })
  await manual.click()
  await expect(manual).toBeChecked()
  await expect(daily).not.toBeChecked()
  await expect(dialog).toContainText('sonraki günler ve aylar için otomasyon açmaz')
  await page.reload()
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click()
  await expect(manual).toBeChecked()
  await expect(daily).not.toBeChecked()
  await dialog.getByRole('button', { name: 'Klasör seç' }).click() // picker cancel still yields camelCase status
  await expect(dialog).toContainText('C:\\Test Live Editor')
  await expect(dialog.getByRole('button', { name: 'Ayarları kapat' })).toBeEnabled()
})

test('host failure keeps switch unchanged and allows retry', async ({ page }) => {
  await emptyCareer(page); await desktop(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click()
  const daily = page.getByRole('switch', { name: 'Otomatik kariyer senkronu' })
  await expect(daily).toBeEnabled()
  await page.evaluate(() => localStorage.setItem('test.fail', '1'))
  await daily.click()
  await expect(page.getByRole('alert')).toContainText('Erişim reddedildi')
  await expect(daily).not.toBeChecked()
  await page.evaluate(() => localStorage.removeItem('test.fail'))
  await daily.click()
  await expect(daily).toBeChecked()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('custom script conflicts are visible and cannot be toggled', async ({ page }) => {
  await emptyCareer(page)
  await page.addInitScript(() => localStorage.setItem('test.automation', JSON.stringify({ folder: 'C:\\LE', valid: true, candidates: [],
    scripts: [{ id: 'export', installed: true, matches: false, bundled: true, problem: 'Dosya paket sürümünden farklı; otomatik değiştirilmez.' }] })))
  await desktop(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Otomatik kariyer senkronu' })).toBeChecked()
  await expect(page.getByRole('switch', { name: 'Otomatik kariyer senkronu' })).toBeDisabled()
  await expect(page.getByRole('dialog')).toContainText('Dosya paket sürümünden farklı')
})

test('plain installed script can enable logging while remaining installed', async ({ page }) => {
  await emptyCareer(page)
  await page.addInitScript(() => localStorage.setItem('test.automation', JSON.stringify({ folder: 'C:\\LE', valid: true, candidates: [],
    scripts: [{ id: 'assets', installed: true, matches: true, logged: false, bundled: true, problem: null }], logDirectory: 'C:\\FCExport\\logs' })))
  await desktop(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click()
  await page.getByRole('button', { name: 'Loglamayı etkinleştir' }).click()
  await expect(page.getByRole('switch', { name: 'Görsel script’i' })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Loglamayı etkinleştir' })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toContainText('C:\\FCExport\\logs')
})

test('export frequency defaults to monthly and changes from settings', async ({ page }) => {
  await emptyCareer(page); await desktop(page); await page.goto('/')
  await page.getByRole('button', { name: 'Ayarlar' }).first().click()
  const select = page.getByLabel('Export sıklığı')
  await expect(select).toHaveValue('monthly')
  await select.selectOption('quarterly')
  await expect(select).toHaveValue('quarterly')
  await expect(page.locator('.automation-schedule')).toContainText('Ocak, Nisan, Temmuz ve Ekim')
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('sonraki oyun gününde')
})
