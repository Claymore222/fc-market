import { t } from '../lib/i18n'
import { ratingTier } from './Badges'

/** Pozisyonların sahadaki yeri (% olarak; hücum yukarıda), oyundaki pozisyon genelleri ekranına benzer. */
const SLOTS: Record<string, [x: number, y: number]> = {
  ST: [50, 9],
  LW: [17, 15], RW: [83, 15],
  CAM: [50, 35],
  LM: [14, 44], RM: [86, 44],
  CM: [50, 48],
  LWB: [14, 61], RWB: [86, 61],
  CDM: [50, 61],
  LB: [17, 76], RB: [83, 76],
  CB: [50, 78],
  GK: [50, 93],
}

interface Props {
  ratings: { position: string; rating: number | null }[]
  primary: string | null
  secondary: string | null
  secondaryPositions?: string[]
  overall: number | null
}

/**
 * Dikey saha üzerinde her pozisyonun geneli. Ana/yan pozisyonun çevresi ısı bölgesiyle vurgulanır,
 * OVR'ın çok altında kalan pozisyonlar soluklaşır. Her değer etiketli, renk tek başına anlam taşımaz.
 */
export function PitchMap({ ratings, primary, secondary, secondaryPositions, overall }: Props) {
  const secondaries = new Set((secondaryPositions ?? (secondary ? [secondary] : [])).filter(pos => pos !== primary))
  const placed = (ratings ?? []).filter((r) => SLOTS[r.position]) // eski backend bu alanı göndermeyebilir
  const best = placed.reduce<(typeof placed)[number] | null>(
    (b, r) => (r.rating !== null && (b === null || (b.rating ?? -1) < r.rating) ? r : b), null)

  const zone = (pos: string | null, kind: 'primary' | 'secondary') => {
    const s = pos ? SLOTS[pos] : undefined
    return s ? <div key={pos} className={`zone ${kind}`} style={{ left: `${s[0]}%`, top: `${s[1]}%` }} /> : null
  }

  return (
    <div>
      <div className="pitch" role="list" aria-label={t('drawer.positions')}>
        <svg className="pitch-lines" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true">
          <rect x="1" y="1" width="66" height="103" rx="1" />
          <line x1="1" y1="52.5" x2="67" y2="52.5" />
          <circle cx="34" cy="52.5" r="9.15" />
          <circle cx="34" cy="52.5" r="0.6" className="spot" />
          <rect x="13.85" y="1" width="40.3" height="16.5" />
          <rect x="24.85" y="1" width="18.3" height="5.5" />
          <rect x="13.85" y="87.5" width="40.3" height="16.5" />
          <rect x="24.85" y="98.5" width="18.3" height="5.5" />
          <path d="M26.7 17.5 A9.15 9.15 0 0 0 41.3 17.5" />
          <path d="M26.7 87.5 A9.15 9.15 0 0 1 41.3 87.5" />
        </svg>
        {[...secondaries].map(pos => zone(pos, 'secondary'))}
        {zone(primary, 'primary')}
        {placed.map((r) => {
          const [x, y] = SLOTS[r.position]
          const role = r.position === primary ? 'primary' : secondaries.has(r.position) ? 'secondary' : ''
          const weak = overall !== null && r.rating !== null && r.rating < overall - 10 && !role
          return (
            <div
              key={r.position}
              role="listitem"
              className={`slot ${role}${weak ? ' weak' : ''}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              title={role === 'primary' ? t('drawer.positions.primary') : role === 'secondary' ? t('drawer.positions.secondary') : undefined}
            >
              <span className="slot-pos">{r.position}</span>
              <span className={`rating r${ratingTier(r.rating)}`}>{r.rating ?? '–'}</span>
            </div>
          )
        })}
      </div>
      <div className="pitch-legend">
        <span><i className="lg-primary" />{t('drawer.positions.primary')}</span>
        <span><i className="lg-secondary" />{t('drawer.positions.secondary')}</span>
        {best && best.rating !== null && (
          <span className="muted">{t('drawer.positions.best', { pos: best.position, n: best.rating })}</span>
        )}
      </div>
      <p className="pitch-note muted">{t('drawer.positions.note')}</p>
    </div>
  )
}
