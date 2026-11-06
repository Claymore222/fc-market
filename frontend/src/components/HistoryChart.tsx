import { useEffect, useRef, useState } from 'react'
import type { HistoryPoint } from '../api/types'
import { gameDate, monthShort } from '../lib/format'
import { t } from '../lib/i18n'

const H = 160
const PAD = { top: 12, right: 40, bottom: 22, left: 28 }

/**
 * OVR (düz) ve POT (kesikli) zaman serisi. Tek eksen; renk + çizgi stili + uç etiketleri ile ayrışır.
 * Üzerine gelince snapshot tooltip'i; kulüp değişimi dikey kesikli çizgi.
 */
export function HistoryChart({ points }: { points: HistoryPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  // SVG piksel genişliği = kap genişliği; böylece metin ve çizgi kalınlığı drawer genişliğinden bağımsız kalır.
  const ref = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(440)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const valid = points.filter((p) => p.overall !== null || p.potential !== null)
  if (valid.length < 2) return <p className="muted" ref={ref}>{t('drawer.history.single')}</p>

  const values = valid.flatMap((p) => [p.overall, p.potential]).filter((v): v is number => v !== null)
  const lo = Math.max(0, Math.floor((Math.min(...values) - 2) / 5) * 5)
  const hi = Math.min(99, Math.ceil((Math.max(...values) + 2) / 5) * 5)
  const iw = W - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (valid.length === 1 ? iw / 2 : (i / (valid.length - 1)) * iw)
  const y = (v: number) => PAD.top + ih - ((v - lo) / Math.max(1, hi - lo)) * ih
  const path = (key: 'overall' | 'potential') =>
    valid.map((p, i) => (p[key] === null ? null : `${x(i)},${y(p[key]!)}`)).filter(Boolean).join(' L')

  const ticks: number[] = []
  const step = hi - lo > 20 ? 10 : 5
  for (let v = lo; v <= hi; v += step) ticks.push(v)
  const lastP = valid[valid.length - 1]
  const xEvery = Math.ceil(valid.length / Math.max(3, Math.floor(iw / 70)))

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const rel = ((e.clientX - r.left) / r.width) * iw
    setHover(Math.max(0, Math.min(valid.length - 1, Math.round((rel / iw) * (valid.length - 1)))))
  }
  const hp = hover !== null ? valid[hover] : null

  return (
    <div className="chart" ref={ref}>
      <div className="legend">
        <span><i className="l-ovr" />OVR</span>
        <span><i className="l-pot" />POT</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('drawer.history')}>
        {ticks.map((v) => (
          <g key={v}>
            <line className="gridline" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="axis" x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end">{v}</text>
          </g>
        ))}
        {valid.map((p, i) =>
          i % xEvery === 0 || i === valid.length - 1 ? (
            <text key={p.snapshotId} className="axis" x={x(i)} y={H - 6} textAnchor="middle">{monthShort(p.gameDate)}</text>
          ) : null,
        )}
        {valid.map((p, i) =>
          p.clubChanged ? <line key={`x${i}`} className="xfer" x1={x(i)} x2={x(i)} y1={PAD.top} y2={PAD.top + ih} /> : null,
        )}
        {hover !== null && <line className="hover-line" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} />}
        <path className="ln-pot" d={`M${path('potential')}`} />
        <path className="ln-ovr" d={`M${path('overall')}`} />
        {hp && hp.potential !== null && <circle className="dot-pot" cx={x(hover!)} cy={y(hp.potential)} r={4.5} />}
        {hp && hp.overall !== null && <circle className="dot-ovr" cx={x(hover!)} cy={y(hp.overall)} r={4.5} />}
        {lastP.potential !== null && (
          <text className="end-label num" x={W - PAD.right + 6} y={y(lastP.potential) + (lastP.potential === lastP.overall ? -4 : 4)}>
            POT {lastP.potential}
          </text>
        )}
        {lastP.overall !== null && (
          <text className="end-label num" x={W - PAD.right + 6} y={y(lastP.overall) + (lastP.potential === lastP.overall ? 10 : 4)}>
            OVR {lastP.overall}
          </text>
        )}
        <rect x={PAD.left} y={0} width={iw} height={H} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hp && (
        <div className="tooltip" style={{ left: `${(x(hover!) / W) * 100}%`, top: `${(Math.min(y(hp.overall ?? hi), y(hp.potential ?? hi)) / H) * 100}%` }}>
          <div className="muted">{gameDate(hp.gameDate)}</div>
          <div>OVR <b className="num">{hp.overall ?? '–'}</b> · POT <b className="num">{hp.potential ?? '–'}</b></div>
          {hp.club && <div className="muted">{hp.clubChanged ? t('drawer.history.transfer', { club: hp.club }) : hp.club}</div>}
        </div>
      )}
    </div>
  )
}
