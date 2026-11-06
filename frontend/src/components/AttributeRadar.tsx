import type { AttributeGroup } from '../api/types'

/** Group averages from the API; all axes share the same 0–99 scale. */
export function AttributeRadar({ groups, compact = false }: { groups: AttributeGroup[]; compact?: boolean }) {
  if (groups.length < 3) return <p className="muted">Radar için yeterli özellik grubu yok.</p>
  const center = 150, radius = 96
  const point = (i: number, value: number) => {
    const angle = -Math.PI / 2 + i * 2 * Math.PI / groups.length
    return [center + Math.cos(angle) * value, center + Math.sin(angle) * value]
  }
  const polygon = (scale: number) => groups.map((_, i) => point(i, radius * scale).join(',')).join(' ')
  const complete = groups.every(g => g.score !== null)
  const short: Record<string,string> = { 'Hız': 'HIZ', 'Şut': 'ŞUT', 'Pas': 'PAS', 'Top sürme': 'DRİ', 'Savunma': 'DEF', 'Fizik': 'FİZ', 'Atlama': 'ATL', 'Top tutma': 'TUT', 'Degaj': 'DEG', 'Refleks': 'REF', 'Kaleci pozisyonu': 'POZ' }
  const tone = (v: number | null) => v === null ? '#8a8a8a' : v > 80 ? '#12eb83' : v > 70 ? '#14b341' : v > 60 ? '#ffd200' : v > 50 ? '#ff860a' : '#f84a46'
  return (
    <section className={`section radar-section ${compact ? 'is-compact' : ''}`}>
      {!compact && <h3><span className="label">Özellik profili</span><span className="muted small">0–99</span></h3>}
      <svg viewBox="0 0 300 300" role="img" aria-label={groups.map(g => `${g.name}: ${g.score ?? 'veri yok'}`).join(', ')}>
        {[.25, .5, .75, 1].map(scale => <polygon key={scale} points={polygon(scale)} fill="none" stroke="var(--line-strong)" />)}
        {groups.map((g, i) => <line key={g.name} x1={center} y1={center} x2={point(i, radius)[0]} y2={point(i, radius)[1]} stroke="var(--line)" />)}
        {complete && <polygon points={groups.map((g, i) => point(i, radius * Math.max(0, Math.min(99, g.score!)) / 99).join(',')).join(' ')} fill="color-mix(in srgb, var(--fc-accent) 22%, transparent)" stroke="var(--fc-accent)" strokeWidth="2" />}
        {groups.map((g, i) => {
          const [x, y] = point(i, radius + 28)
          const [dx, dy] = point(i, radius * Math.max(0, Math.min(99, g.score ?? 0)) / 99)
          return <g key={g.name}>
            {g.score !== null && <circle cx={dx} cy={dy} r="3" fill={compact ? tone(g.score) : 'var(--fc-accent)'} />}
            {compact ? <text x={x} y={y} textAnchor="middle" fill="var(--fc-muted)" fontSize="11">{short[g.name] ?? g.name}<tspan dx="4" fill={tone(g.score)} fontWeight="700">{g.score ?? '—'}</tspan></text>
              : <text x={x} y={y} textAnchor="middle" fill="var(--text-2)" fontSize="11">{g.name}<tspan x={x} dy="14" fill="var(--text)" fontWeight="700">{g.score ?? '—'}</tspan></text>}
          </g>
        })}
      </svg>
      {!compact && <p className="muted small">Özellik grubu ortalamaları. {complete ? 'Oyun içi kart puanı değildir.' : 'Eksik gruplar nedeniyle alan birleştirilmedi.'}</p>}
    </section>
  )
}
