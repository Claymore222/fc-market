import type { MessageKey } from './i18n'

/** URL'deki filtre parametreleri birebir /api/players parametreleridir. */
export const FILTER_KEYS = [
  'q', 'ageMin', 'ageMax', 'pos', 'ovrMin', 'ovrMax', 'potMin', 'potMax', 'league', 'club', 'nation',
  'contractEndsBy', 'valueMax', 'foot', 'oppMin', 'sort', 'dir',
  'wageMin', 'wageMax', 'freeAgent', 'contractYearsMin', 'contractYearsMax', 'weakFootMin', 'skillMovesMin',
  'role', 'roleLevelMin', 'playStyle', 'playStylePlus', 'includeSecondary',
] as const
export type FilterKey = (typeof FILTER_KEYS)[number]
export type Filters = Partial<Record<FilterKey, string>>

export function readFilters(sp: URLSearchParams): Filters {
  const f: Filters = {}
  for (const k of FILTER_KEYS) {
    const v = sp.get(k)
    if (v) f[k] = v
  }
  return f
}

export const csv = (v: string | undefined) => (v ? v.split(',').filter(Boolean) : [])

// --- Sıralama --------------------------------------------------------------

export type SortDir = 'asc' | 'desc'
export interface SortSpec { key: string; dir: SortDir }

export const DEFAULT_SORT: SortSpec[] = [{ key: 'ovr', dir: 'desc' }]

export function readSort(f: Filters): SortSpec[] {
  const keys = csv(f.sort)
  if (!keys.length) return DEFAULT_SORT
  const dirs = csv(f.dir)
  return keys.map((key, i) => ({ key, dir: (dirs[i] ?? dirs[dirs.length - 1] ?? 'desc') === 'asc' ? 'asc' : 'desc' }))
}

export function writeSort(specs: SortSpec[]): Pick<Filters, 'sort' | 'dir'> {
  if (!specs.length) return { sort: undefined, dir: undefined }
  return { sort: specs.map((s) => s.key).join(','), dir: specs.map((s) => s.dir).join(',') }
}

/**
 * Başlığa tıklama: aynı birincil kolon → yön değişir; başka kolon → tek sıralama.
 * Shift ile: listede yoksa ikincil olarak eklenir, varsa yönü değişir.
 */
export function nextSort(current: SortSpec[], key: string, defaultDir: SortDir, additive: boolean): SortSpec[] {
  const idx = current.findIndex((s) => s.key === key)
  const flip = (s: SortSpec): SortSpec => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' })
  if (additive) {
    if (idx < 0) return [...current, { key, dir: defaultDir }]
    return current.map((s, i) => (i === idx ? flip(s) : s))
  }
  if (idx === 0 && current.length === 1) return [flip(current[0])]
  return [{ key, dir: defaultDir }]
}

// --- Hazır presetler -------------------------------------------------------

export interface Preset {
  id: string
  label: MessageKey
  hint: MessageKey
  filters: (seasonEndYear: number) => Filters
}

export const PRESETS: Preset[] = [
  {
    id: 'wonderkid', label: 'preset.wonderkid', hint: 'preset.wonderkid.hint',
    filters: () => ({ ageMax: '21', potMin: '85', sort: 'pot,ovr', dir: 'desc,desc' }),
  },
  {
    id: 'free', label: 'preset.free', hint: 'preset.free.hint',
    filters: (y) => ({ contractEndsBy: String(y), sort: 'ovr', dir: 'desc' }),
  },
  {
    id: 'bargain', label: 'preset.bargain', hint: 'preset.bargain.hint',
    filters: () => ({ oppMin: '70', sort: 'opportunity', dir: 'desc' }),
  },
  {
    id: 'star', label: 'preset.star', hint: 'preset.star.hint',
    filters: () => ({ ovrMin: '82', ageMax: '28', sort: 'ovr', dir: 'desc' }),
  },
]

const same = (a: Filters, b: Filters) =>
  FILTER_KEYS.every((k) => (a[k] ?? '') === (b[k] ?? ''))

export const activePreset = (f: Filters, seasonEndYear: number | undefined) =>
  seasonEndYear === undefined ? undefined : PRESETS.find((p) => same(f, p.filters(seasonEndYear)))
