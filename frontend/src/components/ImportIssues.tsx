import { useState } from 'react'
import { X } from 'lucide-react'
import type { SyncInfo } from '../api/types'

const DISMISSED = 'fcm.notice.warnings'

function WarningDetails({ warnings, children }: { warnings: NonNullable<SyncInfo['warnings']>; children?: React.ReactNode }) {
  return <details className="fc-notice-details"><summary className="cursor-pointer">{warnings.length} export, eksik isim karakteri işaretlenerek aktarıldı.</summary>{children}
    <p className="mt-2">Kaynak dosyalar korunuyor. Okunamayan isim karakteri � ile gösteriliyor; diğer veriler aktarıldı.</p>
    <ul className="mt-2 space-y-2 break-words">{warnings.map((warning, i) => <li key={i}><strong>{warning.fileName}</strong>: {warning.message}</li>)}</ul>
  </details>
}

export function ImportIssues({ issues = [], warnings = [] }: { issues?: SyncInfo['issues']; warnings?: SyncInfo['warnings'] }) {
  if (!issues.length && !warnings.length) return null
  return <>{issues.length > 0 && <aside role="status" className="fc-strip is-warn px-4 py-3 text-xs">
    <div className="mx-auto max-w-[1280px]">
      <p>{issues.length} kaynak aktarılamadı. Diğer veriler kullanılabilir; sorunlu dosyalar yeniden denenecek.</p>
      <details className="mt-2"><summary className="cursor-pointer">Aktarım ayrıntıları</summary>
        <ul className="mt-2 space-y-2 break-words">{issues.map((issue, i) => <li key={i}><strong>{issue.fileName}</strong>: {issue.message}</li>)}</ul>
      </details>
    </div>
  </aside>}{warnings.length > 0 && <aside role="status" className="fc-strip px-4 py-2 text-xs"><div className="mx-auto max-w-[1280px]"><WarningDetails warnings={warnings} /></div></aside>}</>
}

const signature = (warnings: NonNullable<SyncInfo['warnings']>) => warnings.map(w => w.fileName).sort().join('|')
const dismissed = () => { try { return localStorage.getItem(DISMISSED) } catch { return null } }

/** Harmless, permanent import notes: part of the notice line and closable until a new file is flagged. */
export function ImportWarnings({ warnings = [] }: { warnings?: SyncInfo['warnings'] }) {
  const [closed, setClosed] = useState(dismissed)
  if (!warnings.length || closed === signature(warnings)) return null
  const close = () => {
    const value = signature(warnings); setClosed(value)
    try { localStorage.setItem(DISMISSED, value) } catch { /* stays closed for this session */ }
  }
  return <div className="fc-notice-note"><WarningDetails warnings={warnings} /><button type="button" aria-label="Uyarıyı kapat" title="Uyarıyı kapat" onClick={close}><X size={13} /></button></div>
}

export const hasOpenWarnings = (warnings: SyncInfo['warnings'] = []) => warnings.length > 0 && dismissed() !== signature(warnings)
