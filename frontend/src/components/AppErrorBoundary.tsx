import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportUiError } from '../lib/uiDiagnostics'

export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(reason: unknown) { return { error: reason instanceof Error ? reason : new Error(String(reason)) } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    reportUiError('render', error, info.componentStack)
    document.getElementById('app-recovery-title')?.focus()
  }
  render() {
    if (!this.state.error) return this.props.children
    return <main className="app-recovery" role="alert"><div><span className="analysis-eyebrow">FC MARKET</span>
      <h1 id="app-recovery-title" tabIndex={-1}>Ekran gösterilirken bir hata oluştu</h1>
      <p>Genel bakışa dönerek devam edebilirsin. Kaydedilmiş veriler korunuyor; kaydedilmemiş form seçimleri yenilenebilir.</p>
      <div className="app-recovery-actions"><a className="btn primary" href="/">Genel bakışa dön</a><button className="btn" onClick={() => location.reload()}>Sayfayı yeniden yükle</button></div>
      <details><summary>Hata ayrıntısı</summary><p>{this.state.error.message}</p></details>
    </div></main>
  }
}
