import { useSyncExternalStore } from 'react'
import { toast } from './toast'

/** Karşılaştırma listesi (en fazla 4 oyuncu): tarayıcıda saklanır, sekmeler ve bileşenler arasında senkron. */
export const COMPARE_MAX = 4
const KEY = 'fcmarket.compare'
const listeners = new Set<() => void>()
let cache: number[] | null = null

function read(): number[] {
  if (cache) return cache
  try { cache = (JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown[]).filter((x): x is number => typeof x === 'number').slice(0, COMPARE_MAX) }
  catch { cache = [] }
  return cache
}

function write(ids: number[]) {
  cache = ids
  try { localStorage.setItem(KEY, JSON.stringify(ids)) } catch { /* özel pencere: yalnız bellekte */ }
  listeners.forEach(l => l())
}

if (typeof window !== 'undefined')
  window.addEventListener('storage', e => { if (e.key === KEY) { cache = null; listeners.forEach(l => l()) } })

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export function useCompare() {
  const ids = useSyncExternalStore(subscribe, read, read)
  return {
    ids,
    has: (id: number) => ids.includes(id),
    full: ids.length >= COMPARE_MAX,
    toggle: (id: number) => {
      if (!ids.includes(id) && ids.length >= COMPARE_MAX) return toast('Karşılaştırma listesi dolu')
      toast(ids.includes(id) ? 'Karşılaştırmadan çıkarıldı' : 'Karşılaştırmaya eklendi')
      write(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
    },
    addMany: (next: number[]) => {
      const merged = [...new Set([...read(), ...next])]
      if (merged.length > COMPARE_MAX) return false
      write(merged); return true
    },
    remove: (id: number) => write(ids.filter(x => x !== id)),
    clear: () => write([]),
  }
}
