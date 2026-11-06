// Masaüstü penceresiyle (WebView2) konuşma. Tarayıcıda (geliştirme, testler) host yoktur; çağrılar sessizce boşa gider.

export type HostMessage =
  | { type: 'saveAdding'; file: string }
  | { type: 'saveAdded'; ok: boolean; cancelled?: boolean; file?: string; message?: string }
  | { type: 'automation'; ok: boolean; state?: AutomationStatus; message?: string }
  | { type: 'resumeCareer' }

export interface AutomationScript {
  id: 'export' | 'assets' | 'legacyAssets' | 'manualExport'
  path: string | null
  installed: boolean
  matches: boolean
  bundled: boolean
  problem: string | null
  logged?: boolean
}
export interface AutomationStatus {
  folder: string | null
  valid: boolean
  candidates: string[]
  scripts: AutomationScript[]
  logDirectory?: string | null
  schedule?: ExportSchedule
}
export type ExportSchedule = 'daily' | 'weekly' | 'monthly' | 'quarterly'

interface WebView {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void
  removeEventListener(type: 'message', listener: (e: MessageEvent) => void): void
}

const webview = (): WebView | undefined => (window as unknown as { chrome?: { webview?: WebView } }).chrome?.webview

export const isDesktop = () => webview() !== undefined
export const isCareerEntered = () => !isDesktop() || Boolean((window as unknown as { __fcmEntered?: boolean }).__fcmEntered)

/** enterCareer: tam boy pencere; showLauncher: küçük dikey pencere; addSave: dosya seçtir ve içe aktar. */
export function postHost(type: 'enterCareer' | 'showLauncher' | 'addSave' | 'automationStatus' | 'automationFolder') {
  webview()?.postMessage({ type })
}

export function setAutomation(id: AutomationScript['id'], enabled: boolean) {
  webview()?.postMessage({ type: 'automationSet', id, enabled })
}

export function setExportSchedule(mode: ExportSchedule) {
  webview()?.postMessage({ type: 'automationSchedule', mode })
}

export function onHostMessage(handler: (m: HostMessage) => void): () => void {
  const view = webview()
  if (!view) return () => {}
  const listener = (e: MessageEvent) => handler(e.data as HostMessage)
  view.addEventListener('message', listener)
  return () => view.removeEventListener('message', listener)
}
