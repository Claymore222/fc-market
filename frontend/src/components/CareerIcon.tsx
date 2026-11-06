/** Local font assets keep the reference icon shapes available offline. */
export function CareerIcon({ name, size = 18 }: { name: string; size?: number }) {
  return <span className="career-icon" aria-hidden="true" style={{ fontSize: size, width: size, height: size }}>{name}</span>
}
