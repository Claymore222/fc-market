/** Local diagnostics only: the native host stores these in logs/app/ui; no network transmission. */
const recent = new Map<string, number>()
export function reportUiError(kind: string, reason: unknown, componentStack?: string | null) {
  const error = reason instanceof Error ? reason : new Error(String(reason))
  const key = `${kind}:${error.message}:${location.pathname}`
  const now = Date.now()
  if (now - (recent.get(key) ?? 0) < 2000) return
  recent.set(key, now)
  if (recent.size > 50) recent.delete(recent.keys().next().value!)
  const record = { type: 'uiError', kind, message: error.message.slice(0, 2000), stack: error.stack?.slice(0, 6000),
    componentStack: componentStack?.slice(0, 6000), path: location.pathname, at: new Date(now).toISOString() }
  try {
    const host = (window as unknown as { chrome?: { webview?: { postMessage(m: unknown): void } } }).chrome?.webview
    host?.postMessage(record)
  } catch { /* A failed WebView bridge must not throw while handling the original error. */ }
}

export function installUiDiagnostics() {
  window.addEventListener('error', event => { if (event.error) reportUiError('window', event.error) })
  window.addEventListener('unhandledrejection', event => reportUiError('promise', event.reason))
}
