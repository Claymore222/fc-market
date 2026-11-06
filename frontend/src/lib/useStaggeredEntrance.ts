import { useLayoutEffect, useRef, type RefObject } from 'react'

/** Animate one visible batch per result set, never recycled virtual rows on scroll. */
export function useStaggeredEntrance<T extends HTMLElement>(root: RefObject<T | null>, batchKey: string, ready: boolean, contentKey: string) {
  const batch = useRef<{ key: string; started: boolean; animations: Animation[] } | null>(null)

  useLayoutEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const cancel = () => batch.current?.animations.forEach(a => a.cancel())
    const changed = () => { if (motion.matches) cancel() }
    motion.addEventListener('change', changed)
    return () => { motion.removeEventListener('change', changed); cancel(); batch.current = null }
  }, [])

  useLayoutEffect(() => {
    if (batch.current?.key !== batchKey) {
      batch.current?.animations.forEach(a => a.cancel())
      batch.current = { key: batchKey, started: false, animations: [] }
    }
    const current = batch.current
    if (current.started || !ready || !root.current) return
    const bounds = root.current.getBoundingClientRect()
    const top = Math.max(0, bounds.top), bottom = Math.min(innerHeight, bounds.bottom)
    const rows = Array.from(root.current.querySelectorAll<HTMLElement>('[data-entrance-row]')).filter(el => {
      const r = el.getBoundingClientRect()
      return r.bottom > top && r.top < bottom
    }).slice(0, 16)
    if (!rows.length) return
    current.started = true
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    current.animations = rows.map((el, i) => {
      const animation = el.animate([
        { opacity: .15, translate: '-16px 0' },
        { opacity: 1, translate: '0 0' },
      ], { duration: 280, delay: Math.min(i * 28, 280), easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' })
      animation.id = 'list-entrance'
      return animation
    })
  }, [root, batchKey, ready, contentKey])
}
