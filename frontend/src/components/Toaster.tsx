import { Check } from 'lucide-react'
import { useToasts } from '../lib/toast'

export function Toaster() {
  const toasts = useToasts()
  return <div className="toaster" aria-live="polite">
    {toasts.map(t => <div key={t.id} className="toast"><Check size={15} />{t.message}</div>)}
  </div>
}
