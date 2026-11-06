import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CareerIcon } from './CareerIcon'
import { useHoverPanel } from '../lib/useHoverPanel'

/** The same help affordance works with a pointer, keyboard and touch. */
export function InfoTip({ title, children, trigger, triggerClassName, panelClassName, heading, placement }: {
  title: string; children: ReactNode; trigger?: ReactNode; triggerClassName?: string; panelClassName?: string; heading?: string; placement?: 'bottom' | 'right'
}) {
  const h = useHoverPanel(placement)
  return <>
    <button ref={h.anchor} type="button" className={triggerClassName ?? (trigger ? 'style-tip' : 'info-tip')} aria-label={`${title} hakkında`} aria-expanded={h.open}
      aria-describedby={h.open ? h.id : undefined} onPointerEnter={e => { if (e.pointerType !== 'touch') h.reset() }} onPointerLeave={h.leave}
      onFocus={h.show} onBlur={h.blur} onClick={h.reset}>
      {trigger ?? <CareerIcon name="info" size={16} />}
    </button>
    {h.open && createPortal(<div ref={h.panel} id={h.id} role="tooltip" className={panelClassName ?? 'info-popover'} style={h.position}
      onPointerEnter={h.cancel} onPointerLeave={h.leave}>
      <span className="popover-heading">{heading ?? 'NE GÖSTERİR'}</span>{typeof children === 'string' ? <p>{children}</p> : children}
    </div>, document.body)}
  </>
}
