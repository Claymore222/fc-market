// CMTracker görünümündeki ortak küçük parçalar: reyting rozeti, bayrak, oyuncu avatarı, saha yerleşimi, form oku.
import { useState } from 'react'
import type { MarketPlayer } from '../api/types'
import { money } from '../lib/format'
import { displayedWage } from './PlayerWage'

/** CMTracker's five rating bands; sampled from the reference attribute and OVR badges. */
export function ratingClass(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'bg-cmt-card text-gray-400'
  if (v > 80) return 'bg-[#12eb83] text-[#0b0b0b] font-bold'
  if (v > 70) return 'bg-[#14b341] text-[#0b0b0b] font-bold'
  if (v > 60) return 'bg-[#ffd200] text-[#0b0b0b] font-bold'
  if (v > 50) return 'bg-[#ff860a] text-[#0b0b0b] font-bold'
  return 'bg-[#f84a46] text-[#0b0b0b] font-bold'
}

export function RatingChip({ value, size = 'md', title }: { value: number | null | undefined; size?: 'sm' | 'md' | 'lg'; title?: string }) {
  const dims = size === 'sm' ? 'h-5 min-w-6 text-xs' : size === 'lg' ? 'h-7 min-w-8 text-base' : 'h-[26px] min-w-[30px] text-sm'
  return (
    <span title={title} className={`rating-chip inline-flex items-center justify-center rounded-[5px] px-1 font-tektur tabular-nums ${dims} ${ratingClass(value)}`}>
      {value ?? '–'}
    </span>
  )
}

/** ISO 3166 koduyla yerel SVG bayrak (flag-icons; Windows bayrak emojisi çizmiyor). Kod yoksa ülke adının ilk harfleri. */
export function Flag({ code, name, nationId }: { code: string | null | undefined; name?: string | null; nationId?: number | null }) {
  const [failed, setFailed] = useState(false)
  // Oyundan çıkarılan bayrak (tools/assets) varsa o; yoksa flag-icons.
  if (nationId && !failed) return <img src={`/api/nations/${nationId}/flag`} alt={name ?? code ?? ''} title={name ?? code ?? undefined}
    loading="lazy" className="inline-block h-[0.75em] w-auto rounded-[2px] align-baseline shadow-[0_0_0_1px_rgba(255,255,255,0.08)]" onError={() => setFailed(true)} />
  if (!code) return <span className="font-mono text-[11px] text-gray-500" title={name ?? undefined}>{name?.slice(0, 3).toUpperCase() ?? '–'}</span>
  const iso = code.toLowerCase() === 'uk' ? 'gb' : code.toLowerCase()
  return <span className={`fi fi-${iso} rounded-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]`} title={name ?? code} role="img" aria-label={name ?? code} />
}

/** Yüzü olmayan oyuncu: baş-omuz silueti (adı bilinmeyen "#id" oyuncularda da düzgün görünür). */
export function Silhouette({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="sil-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4a4f5c" /><stop offset="1" stopColor="#2c2f37" /></linearGradient>
      </defs>
      <circle cx="32" cy="25" r="11.5" fill="url(#sil-g)" />
      <path d="M9 64c1.5-13.5 11.5-21 23-21s21.5 7.5 23 21Z" fill="url(#sil-g)" />
    </svg>
  )
}

/** Oyuncu yüzü (yerel faces klasöründen); yoksa siluet. */
export function PlayerAvatar({ id, name, size = 32, ring }: { id: number; name: string; size?: number; ring?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span
      title={name}
      className={`relative inline-flex shrink-0 items-end justify-center overflow-hidden rounded-full border bg-gradient-to-b from-cmt-inner to-cmt-sub ${ring ?? 'border-cmt-line'}`}
      style={{ width: size, height: size }}
    >
      {failed
        ? <Silhouette className="h-[92%] w-[92%]" />
        : <img src={`/api/players/${id}/face`} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />}
    </span>
  )
}

/** Oyunun form değeri (1–5): oklarla. Ölçek oyunda doğrulanmadı; 3 nötr kabul edilir. */
export function FormArrow({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-gray-600">–</span>
  const map: Record<number, [string, string]> = {
    5: ['⇈', 'text-[#12eb83]'], 4: ['↑', 'text-[#14b341]'], 3: ['→', 'text-gray-400'], 2: ['↓', 'text-[#ff860a]'], 1: ['⇊', 'text-[#f84a46]'],
  }
  const [icon, cls] = map[value] ?? ['·', 'text-gray-500']
  return <span className={`font-bold ${cls}`} title={`Form: ${value}/5 (oyundaki form değeri)`}>{icon}</span>
}

/** Diziliş yeri → saha koordinatı (% olarak; hücum yukarı). */
export const SLOT_XY: Record<string, [number, number]> = {
  GK: [50, 90], SW: [50, 81],
  RB: [86, 72], RCB: [63, 76], CB: [50, 76], LCB: [37, 76], LB: [14, 72],
  RWB: [88, 58], LWB: [12, 58],
  RDM: [64, 59], CDM: [50, 59], LDM: [36, 59],
  RCM: [67, 48], CM: [50, 48], LCM: [33, 48],
  RM: [84, 36], LM: [16, 36],
  RAM: [66, 33], CAM: [50, 35], LAM: [34, 33],
  RW: [82, 19], LW: [18, 19], RF: [65, 20], LF: [35, 20],
  RS: [63, 12], ST: [50, 12], LS: [37, 12],
}

/**
 * Yerlerden diziliş adı: savunma, ön libero, orta saha, ofansif orta saha, forvet hatları. Kanat orta sahaları (RM/LM)
 * ofansif orta saha varsa onun hattına, yoksa orta saha hattına sayılır; tek ön libero orta sahaya katılır (4-3-3).
 */
export function formationOf(slots: string[]): string | null {
  if (slots.length === 0) return null
  const has = (s: string) => slots.filter(x => x === s).length
  const count = (list: string[]) => list.reduce((n, s) => n + has(s), 0)
  const def = count(['SW', 'RWB', 'RB', 'RCB', 'CB', 'LCB', 'LB', 'LWB'])
  const dm = count(['RDM', 'CDM', 'LDM'])
  const cm = count(['RCM', 'CM', 'LCM'])
  const wide = count(['RM', 'LM'])
  const am = count(['RAM', 'CAM', 'LAM'])
  const fw = count(['RW', 'LW', 'RF', 'LF', 'RS', 'ST', 'LS'])
  const rows: number[] = [def]
  const amRow = am > 0 ? am + wide : 0
  const midRow = cm + (am > 0 ? 0 : wide)
  if (dm >= 2 && (midRow > 0 || amRow > 0)) { rows.push(dm); if (midRow) rows.push(midRow) }
  else if (dm + midRow > 0) rows.push(dm + midRow)
  if (amRow) rows.push(amRow)
  if (fw) rows.push(fw)
  return rows.filter(n => n > 0).join('-')
}

export const GROUP_TITLES: Record<string, string> = { GK: 'KALECİLER', DEF: 'DEFANS', MID: 'ORTA SAHA', ATT: 'FORVETLER' }

export function surname(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts.length > 1 ? parts[parts.length - 1] : name).toUpperCase()
}

/**
 * CMTracker FUT tarzı oyuncu kartı (Kadro → Kartlar, Scout → Izgara): solda OVR, bayrak ve forma no, sağda POT ve
 * mevkiler, ortada büyük yüz; altta yaş, değer, maaş.
 */
function CardFace({ id }: { id: number }) {
  const [failed, setFailed] = useState(false)
  return <span className="pc-face">{failed ? <Silhouette /> : <img src={`/api/players/${id}/face`} alt="" loading="lazy" onError={() => setFailed(true)} />}</span>
}

function CardCrest({ clubId }: { clubId: number }) {
  const [failed, setFailed] = useState(false)
  return failed ? null : <img className="pc-club" src={`/api/teams/${clubId}/crest`} alt="" loading="lazy" onError={() => setFailed(true)} />
}

export function FutCard({ p, jersey, loan, highlight, onClick, onHover }: {
  p: MarketPlayer; jersey?: number | null; loan?: boolean; highlight?: boolean
  onClick: () => void; onHover?: (on: boolean) => void
}) {
  const others = (p.positions ?? []).filter(x => x !== p.position).slice(0, 3)
  const compact = (v: number | null | undefined) => money(v).replace(/\s/g, '')
  return (
    <button onClick={onClick} onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)} aria-label={p.name} className={`pc-card ${highlight ? 'is-highlight' : ''}`}>
      <span className="pc-top">
        {p.nationId !== null && p.nationId !== undefined && <span className="pc-flag" style={{ backgroundImage: `url(/api/nations/${p.nationId}/flag)` }} />}
        <span className="pc-backdrop" />
        {loan && <span className="pc-loan">KİRALIK</span>}
        <span className="pc-rating is-ovr"><b>OVR</b><RatingChip value={p.overall} size="lg" /></span>
        <span className="pc-rating is-pot"><b>POT</b><RatingChip value={p.potential} size="lg" /></span>
        {p.clubId !== null && p.clubId !== undefined && <CardCrest clubId={p.clubId} />}
        {jersey !== undefined && jersey !== null && <span className="pc-jersey"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2.5 4 4.5 1 8.8 4 11 6 9.6V21.5h12V9.6l2 1.4 3-2.2-3-4.3-4-2c-1 1.4-2.4 2.1-4 2.1s-3-.7-4-2.1Z" /></svg><b>{jersey}</b></span>}
        <span className="pc-pos"><b>{p.position ?? '–'}</b>{others.map(x => <i key={x}>{x}</i>)}</span>
        <CardFace id={p.id} />
      </span>
      <span className="pc-bottom">
        <b>{p.name}</b>
        <span className="pc-data"><span title="Yaş">{p.age ?? '–'} yaş</span><span title="Tahmini değer">{compact(p.value)}</span><span title="Haftalık maaş">{compact(displayedWage(p))}</span></span>
      </span>
    </button>
  )
}

/** Duran top rolleri (ClubService SetPiece.Role) → CMTracker'daki etiketler. cornerSupport ayrı listelenir. */
export const SET_PIECE_LABELS: Record<string, string> = {
  captain: 'KAPTAN', penalties: 'PENALTI', freeKicks: 'SERBEST VURUŞ SOL / SAĞ', leftFreeKick: 'SERBEST VURUŞ SOL',
  rightFreeKick: 'SERBEST VURUŞ SAĞ', corners: 'KORNER SOL / SAĞ', leftCorner: 'KORNER SOL', rightCorner: 'KORNER SAĞ',
  longFreeKick: 'UZUN SERBEST VURUŞ', throwInLeft: 'TAÇ SOL', throwInRight: 'TAÇ SAĞ',
}
