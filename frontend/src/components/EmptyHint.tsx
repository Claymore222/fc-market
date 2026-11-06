import type { ReactNode } from 'react'

/** An empty page says what to do next, not just that nothing is there. */
export function EmptyHint({ text, children }: { text: string; children?: ReactNode }) {
  return <div className="empty-hint"><p>{text}</p>{children && <div>{children}</div>}</div>
}
