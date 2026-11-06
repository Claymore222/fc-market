import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ClubView } from '../../api/types'
import { money } from '../../lib/format'
import { RatingChip } from '../cmt'

export interface NavTab {
  id: string
  label: string
  path: string
  /** Bu sekmede sayılan ek yollar (eski adresler) */
  also?: string[]
}

/** CMTracker sekme sırası; Challenges/Comments yerine yerel araçlar (izleme listesi, değişim akışı). */
export const MAIN_NAV_TABS: NavTab[] = [
  { id: 'home', label: 'HOME', path: '/' },
  { id: 'squad', label: 'SQUAD', path: '/squad' },
  { id: 'youth', label: 'YOUTH', path: '/youth' },
  { id: 'trophies', label: 'TROPHIES', path: '/trophies' },
  { id: 'scout', label: 'SCOUT', path: '/scout', also: ['/market'] },
  { id: 'shortlist', label: 'İZLEME', path: '/shortlist' },
  { id: 'transfer', label: 'TRANSFER', path: '/transfer' },
  { id: 'compare', label: 'KARŞILAŞTIR', path: '/compare' },
  { id: 'transfers', label: 'AKIŞ', path: '/transfers' },
]
/** Kulüp arması yok: takım renkleriyle kalkan ve baş harfler. */
export function ClubCrest({ name, color1, color2, size = 64, teamId }: { name: string; color1?: string | null; color2?: string | null; size?: number; teamId?: number | null }) {
  const [failed, setFailed] = useState(false)
  // Oyundan çıkarılan arma (tools/assets) varsa o; yoksa takım renkli kalkan.
  if (teamId && !failed) return <img src={`/api/teams/${teamId}/crest`} alt={`${name} arması`} width={size} height={size} loading="lazy"
    className="shrink-0 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]" style={{ width: size, height: size }} onError={() => setFailed(true)} />
  const initials = name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(w => w.length > 1 && !/^(fc|sk|cf|ac|afc|fk|sc)$/i.test(w))
    .slice(0, 2).map(w => w[0]).join('').toUpperCase() || name.slice(0, 2).toUpperCase()
  const c1 = color1 ?? 'var(--fc-accent)'
  const c2 = color2 && color2 !== c1 ? color2 : '#1e1e1e'
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 64 74" role="img" aria-label={`${name} arması`} className="shrink-0 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
      <path d="M32 2 L60 10 V36 C60 54 47 66 32 72 C17 66 4 54 4 36 V10 Z" fill={c2} stroke={c1} strokeWidth="3" />
      <path d="M32 8 L54 14.5 V36 C54 50 44 60 32 65 Z" fill={c1} opacity="0.9" />
      <text x="32" y="44" textAnchor="middle" fontFamily="Tektur, sans-serif" fontWeight="900" fontSize={initials.length > 1 ? 20 : 26}
        fill="var(--fc-text)" stroke="#000" strokeWidth="0.6" paintOrder="stroke">{initials}</text>
    </svg>
  )
}

/** Kariyer sekmeleri. Q ve E önceki/sonraki sekmeye geçer. */
export function CareerTabs() {
  const navigate = useNavigate()
  const location = useLocation()
  const activeIndex = Math.max(0, MAIN_NAV_TABS.findIndex(tab =>
    tab.path === '/' ? location.pathname === '/' : [tab.path, ...(tab.also ?? [])].some(p => location.pathname === p || location.pathname.startsWith(p + '/'))))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
        || el?.getAttribute('contenteditable') === 'true'
      if (typing || e.ctrlKey || e.altKey || e.metaKey || e.repeat || document.querySelector('dialog[open], [role="dialog"]')) return
      const k = e.key.toLowerCase()
      if (k !== 'q' && k !== 'e') return
      e.preventDefault()
      const n = MAIN_NAV_TABS.length
      navigate(MAIN_NAV_TABS[(activeIndex + (k === 'q' ? n - 1 : 1)) % n].path)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeIndex, navigate])

  return (
    <nav className="career-tabs cmt-scroll-none" aria-label="Kariyer sekmeleri">
      {MAIN_NAV_TABS.map((tab, idx) => (
        <button key={tab.id} onClick={() => navigate(tab.path)} aria-current={idx === activeIndex ? 'page' : undefined}
          className={`career-tab ${idx === activeIndex ? 'is-active' : ''}`}>{tab.label}</button>
      ))}
    </nav>
  )
}

/** Yalnız Home'da: kulübün lig, sezon ve karne özeti. */
export function CareerSummary({ club }: { club: ClubView }) {
  const season = `${String(club.snapshot.seasonEndYear - 1).slice(2)}/${String(club.snapshot.seasonEndYear).slice(2)}`
  const standing = club.standing
  const record = club.managerCareer ?? club.seasonRecord
  return (
    <div className="career-summary">
      <div>
        <h2>KULÜBE GENEL BAKIŞ</h2>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
          {club.club.league && <span>{club.club.league}</span>}
          <span>•</span><span>FC 27</span>
          <span>•</span><span>Sezon {season}</span>
        </div>
      </div>
      <div className="career-metrics">
        <Metric label="İLK 11"><RatingChip value={club.summary.bestXiAverage === null ? null : Math.round(club.summary.bestXiAverage)} size="lg" /></Metric>
        {record || (club.tableConsistent && standing) ? <>
          <Metric label={club.managerCareer ? 'MENAJER KARNESİ' : record ? 'SEZON KARNESİ' : 'LİG KARNESİ'}>
            <span className="font-tektur text-base font-bold text-gray-300">
              <span className="font-normal text-gray-500">G</span><span className="text-cmt-text">{record?.won ?? standing?.won}</span>
              <span className="ml-1 font-normal text-gray-500"> B</span><span className="text-cmt-text">{record?.drawn ?? standing?.drawn}</span>
              <span className="ml-1 font-normal text-gray-500"> M</span><span className="text-cmt-text">{record?.lost ?? standing?.lost}</span>
            </span>
          </Metric>
          <Metric label="GOLLER">
            <span className="font-tektur text-base font-bold text-cmt-text">{record?.goalsFor ?? standing?.goalsFor}:{record?.goalsAgainst ?? standing?.goalsAgainst}</span>
          </Metric>
        </> : <>
          <Metric label="LİG SIRASI" divider>
            <span className="font-tektur text-base font-bold text-cmt-text" title="Oyundaki tablodan; puan/gol sayıları bu kayıtta güncel değil">
              {standing?.position ? `${standing.position}.` : '–'}
            </span>
          </Metric>
          <Metric label="TRANSFER BÜTÇESİ" divider>
            <span className="font-tektur text-base font-bold text-cmt-mint">{money(club.snapshot.transferBudget)}</span>
          </Metric>
        </>}
      </div>
    </div>
  )
}

function Metric({ label, divider, children }: { label: string; divider?: boolean; children: React.ReactNode }) {
  return (
    <div className={`career-metric ${divider ? 'has-divider' : ''}`}>
      <div className="font-mono text-[11px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}
