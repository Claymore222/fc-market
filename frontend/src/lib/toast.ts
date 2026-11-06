import { useSyncExternalStore } from 'react'

export interface Toast { id: number; message: string }
const LIFETIME = 2600
const listeners = new Set<() => void>()
let toasts: Toast[] = []
let next = 1

function publish(list: Toast[]) {
  toasts = list
  listeners.forEach(l => l())
}

/** Short confirmation for an action that otherwise changes nothing visible on screen. */
export function toast(message: string) {
  const id = next++
  publish([...toasts.slice(-2), { id, message }])
  setTimeout(() => publish(toasts.filter(t => t.id !== id)), LIFETIME)
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const useToasts = () => useSyncExternalStore(subscribe, () => toasts, () => toasts)
