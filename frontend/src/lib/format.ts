// Türkçe biçimler: "37,4 M€", "850 B€", "1 Oca 2027". Sayılar CSS'te tabular-nums ile hizalanır.

const LOCALE = 'tr-TR'
const nf1 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nf0 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const nfUpTo1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 })
const dateLong = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })
const dateShort = new Intl.DateTimeFormat(LOCALE, { month: 'short', year: '2-digit' })

const NBSP = ' '

/** 37400000 → "37,4 M€", 850000 → "850 B€", 1400 → "1,4 B€" (B = bin; küçük kulübün maaşında bin yetmez) */
export function money(v: number | null | undefined): string {
  if (v === null || v === undefined) return '–'
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${nf1.format(v / 1_000_000)}${NBSP}M€`
  if (abs >= 10_000) return `${nf0.format(v / 1_000)}${NBSP}B€`
  if (abs >= 1_000) return `${nfUpTo1.format(v / 1_000)}${NBSP}B€`
  return `${nf0.format(v)}${NBSP}€`
}

export const num = (v: number | null | undefined) => (v === null || v === undefined ? '–' : nf0.format(v))
export const dec1 = (v: number | null | undefined) => (v === null || v === undefined ? '–' : nf1.format(v))
export const dec2 = (v: number | null | undefined) => (v === null || v === undefined ? '–' : nf2.format(v))

/** +2 / −1 / 0 (gerçek eksi işareti) */
export function signed(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined) return '–'
  const s = digits ? (digits === 1 ? nf1 : nf2).format(Math.abs(v)) : nf0.format(Math.abs(v))
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s
}

const parseDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const gameDate = (iso: string | null | undefined) => (iso ? dateLong.format(parseDate(iso)) : '–')
export const monthShort = (iso: string) => dateShort.format(parseDate(iso))
