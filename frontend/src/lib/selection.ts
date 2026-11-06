import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

/**
 * Seçili oyuncu (?player=). Açmak tarihe yeni kayıt ekler: tarayıcının / farenin geri tuşu paneli kapatır (ya da panelde
 * açılan bir önceki oyuncuya döner). Kapat düğmesi panelde açılan tüm oyuncuları geçip listeye döner; bağlantıyla doğrudan
 * açılmışsa parametre silinir.
 */
/** swap: panel açıkken başka oyuncuya geçiş (ör. listede önceki/sonraki) tarihe yeni kayıt eklemez. */
export function useSelectedPlayer(): [number | null, (id: number | null, opts?: { swap?: boolean }) => void] {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const id = params.get('player') ? Number(params.get('player')) : null
  const depth = (location.state as { drawer?: number } | null)?.drawer ?? 0
  const origin = useRef<{ element: HTMLElement; x: number; y: number }>()
  useEffect(() => {
    if (id !== null || !origin.current) return
    const previous = origin.current
    origin.current = undefined
    const frame = requestAnimationFrame(() => {
      if (previous.element.isConnected) previous.element.focus({ preventScroll: true })
      window.scrollTo({ left: previous.x, top: previous.y, behavior: 'instant' })
    })
    return () => cancelAnimationFrame(frame)
  }, [id])
  const set = useCallback(
    (v: number | null, opts?: { swap?: boolean }) => {
      // Capture before the player panel hides its source list/pitch. A portal button disappears on open.
      if (v !== null && id === null && document.activeElement instanceof HTMLElement)
        origin.current = { element: document.activeElement, x: scrollX, y: scrollY }
      if (v === null && depth > 0) {
        navigate(-depth)
        return
      }
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (v === null) next.delete('player')
        else next.set('player', String(v))
        return next
      }, v === null ? { replace: true } : opts?.swap && depth > 0 ? { replace: true, state: { drawer: depth } } : { state: { drawer: depth + 1 } })
    },
    [setParams, navigate, depth, id],
  )
  return [id, set]
}
