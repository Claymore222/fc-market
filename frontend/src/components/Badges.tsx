import { signed } from '../lib/format'

/** Shared five-band CMTracker palette; zero is reserved for missing data. */
export function ratingTier(v: number | null | undefined): number {
  if (v === null || v === undefined) return 0
  if (v <= 50) return 1
  if (v <= 60) return 2
  if (v <= 70) return 3
  if (v <= 80) return 4
  return 5
}

export function Rating({ value, large }: { value: number | null | undefined; large?: boolean }) {
  return (
    <span className={`rating r${ratingTier(value)}${large ? ' lg' : ''}`}>{value ?? '–'}</span>
  )
}

/** Önceki snapshot'a göre OVR farkı: ↑ / ↓ okları. */
export function Delta({ value }: { value: number | null | undefined }) {
  if (!value) return <span className="delta" />
  const up = value > 0
  return (
    <span className={`delta num ${up ? 'up' : 'down'}`} title={`Önceki snapshot'a göre ${signed(value)}`}>
      {up ? '↑' : '↓'}
      {Math.abs(value)}
    </span>
  )
}

export function Position({ label, group }: { label: string | null; group: string | null }) {
  if (!label) return <span className="muted">–</span>
  return <span className={`pos g-${group ?? 'none'}`}>{label}</span>
}

export function OpportunityBar({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">–</span>
  return (
    <span className="opp">
      <span className="opp-bar"><i style={{ width: `${value}%` }} /></span>
      <b className="num">{value}</b>
    </span>
  )
}
