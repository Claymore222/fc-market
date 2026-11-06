import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

const ACTIVE_PANEL = 'fcm:hover-panel'

/** Shared pointer/focus/touch lifecycle and viewport placement for small anchored panels. */
export function useHoverPanel(placement: 'bottom' | 'right' = 'bottom') {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const anchor = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const dismissed = useRef(false)
  const id = useId()
  const cancel = () => clearTimeout(timer.current)
  const show = () => {
    cancel()
    if (!dismissed.current) { window.dispatchEvent(new CustomEvent(ACTIVE_PANEL, { detail: id })); setOpen(true) }
  }
  const leave = () => { dismissed.current = false; cancel(); timer.current = setTimeout(() => setOpen(false), 140) }
  const hide = () => { cancel(); dismissed.current = true; setOpen(false) }
  const inside = (node: EventTarget | null) => node instanceof Node && (anchor.current?.contains(node) || panel.current?.contains(node))
  const blur = (e: React.FocusEvent) => { if (!inside(e.relatedTarget)) leave() }

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const a = anchor.current?.getBoundingClientRect(), p = panel.current?.getBoundingClientRect()
      if (!a || !p) return
      if (a.bottom < 0 || a.top > innerHeight || !a.width) { setOpen(false); return }
      if (placement === 'right' && a.right + 12 + p.width <= innerWidth - 8) {
        setPosition({ left: a.right + 12, top: Math.max(8, Math.min(innerHeight - p.height - 8, a.top)) })
        return
      }
      const left = Math.max(8, Math.min(innerWidth - p.width - 8, a.left + a.width / 2 - p.width / 2))
      const below = a.bottom + 8
      const top = below + p.height <= innerHeight - 8 ? below : Math.max(8, a.top - p.height - 8)
      setPosition({ left, top })
    }
    place()
    const ro = new ResizeObserver(place)
    if (panel.current) ro.observe(panel.current)
    addEventListener('resize', place)
    addEventListener('scroll', place, true)
    return () => { ro.disconnect(); removeEventListener('resize', place); removeEventListener('scroll', place, true) }
  }, [open, placement])

  useEffect(() => {
    if (!open) return
    const other = (e: Event) => { if ((e as CustomEvent<string>).detail !== id) { cancel(); setOpen(false) } }
    const outside = (e: PointerEvent) => { if (!inside(e.target)) hide() }
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault(); e.stopPropagation()
      const restore = panel.current?.contains(document.activeElement)
      hide()
      if (restore) anchor.current?.focus({ preventScroll: true })
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape, true)
    window.addEventListener(ACTIVE_PANEL, other)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); window.removeEventListener(ACTIVE_PANEL, other) }
  }, [open, id])
  useEffect(() => () => clearTimeout(timer.current), [])

  return { open, position, anchor, panel, id, show, hide, cancel, leave, blur,
    toggle: () => { cancel(); dismissed.current = false; setOpen(v => !v) },
    reset: () => { dismissed.current = false; show() } }
}
