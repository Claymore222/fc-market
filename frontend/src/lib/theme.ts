import { get, send } from '../api/client'

/** Colours live in palette.css; a theme here only names a palette and whether it is light or dark. */
export const THEMES = [
  { id: 'moon', name: 'Mavi Cam', caption: 'Gece · mavi', mode: 'dark', colors: ['#101c2e', '#8db8ef', '#203750'] },
  { id: 'forest', name: 'Gece Tribünü', caption: 'Koyu · yeşil', mode: 'dark', colors: ['#10251b', '#9bd9af', '#203b30'] },
  { id: 'violet', name: 'Mor Gece', caption: 'Gece · mor', mode: 'dark', colors: ['#19162c', '#c6b0ff', '#33294e'] },
  { id: 'ice', name: 'Buz Camı', caption: 'Açık · mavi', mode: 'light', colors: ['#e6f1ff', '#1f5cbd', '#ffffff'] },
  { id: 'ivory', name: 'Krem Defter', caption: 'Açık · krem', mode: 'light', colors: ['#f2ebdb', '#3b5d44', '#fffdf5'] },
  { id: 'paper', name: 'Beyaz Stüdyo', caption: 'Açık · kırmızı', mode: 'light', colors: ['#f7f9fc', '#b92c3e', '#ffffff'] },
] as const

export type ThemeId = typeof THEMES[number]['id']
export const DEFAULT_THEME: ThemeId = 'moon'
const STORAGE_KEY = 'fcm.theme'
const known = (id: unknown): id is ThemeId => THEMES.some(t => t.id === id)

function cached(): ThemeId {
  try { const id = localStorage.getItem(STORAGE_KEY); return known(id) ? id : DEFAULT_THEME } catch { return DEFAULT_THEME }
}

export function currentTheme(): ThemeId {
  const id = document.documentElement.dataset.palette
  return known(id) ? id : DEFAULT_THEME
}

export function applyTheme(id: ThemeId) {
  const root = document.documentElement
  root.dataset.palette = id
  root.dataset.theme = THEMES.find(t => t.id === id)!.mode
  try { localStorage.setItem(STORAGE_KEY, id) } catch { /* the cache only avoids a flash on start */ }
}

/** The cache paints the first frame; app.db stays the source of truth. A missing API never blocks startup. */
export async function startTheme() {
  applyTheme(cached())
  try {
    const saved = await get<{ theme: string | null }>('/api/settings/theme')
    if (known(saved.theme) && saved.theme !== currentTheme()) applyTheme(saved.theme)
  } catch { /* keep the cached theme */ }
}

export async function chooseTheme(id: ThemeId) {
  // Fades only this one switch; a permanent colour transition would slow every hover.
  const root = document.documentElement
  root.classList.add('theme-changing')
  setTimeout(() => root.classList.remove('theme-changing'), 320)
  applyTheme(id)
  try { await send('PUT', '/api/settings/theme', {}, { theme: id }) } catch { /* stays cached until the API is back */ }
}
