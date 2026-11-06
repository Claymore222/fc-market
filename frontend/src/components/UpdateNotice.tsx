import { useEffect, useState } from 'react'
import { Download, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import { isDesktop, onHostMessage, postHost, type UpdateStatus } from '../lib/host'

/** Masaüstünün güncelleme durumu; tarayıcıda (host yok) undefined kalır. */
export function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus>()
  useEffect(() => {
    const off = onHostMessage(m => { if (m.type === 'update') setStatus(m) })
    postHost('updateStatus')
    return off
  }, [])
  return status
}

const DISMISS_KEY = 'fcm.update.dismissed'
const readDismissed = () => { try { return sessionStorage.getItem(DISMISS_KEY) } catch { return null } }

const install = () => postHost('updateInstall')

/** Sağ altta küçük bildirim: yeni sürüm, indirme yüzdesi, kurulum. "Sonra" o sürüm için bu oturumda gizler. */
export function UpdateBanner() {
  const status = useUpdateStatus()
  const [dismissed, setDismissed] = useState(readDismissed)
  const [tried, setTried] = useState(false)
  if (!status) return null
  const busy = status.state === 'downloading' || status.state === 'installing'
  const failed = status.state === 'error' && tried
  if (!busy && !failed && (status.state !== 'available' || dismissed === status.version)) return null
  const later = () => {
    try { sessionStorage.setItem(DISMISS_KEY, status.version ?? '') } catch { /* yalnız bu görünüm */ }
    setDismissed(status.version ?? '')
  }
  const start = () => { setTried(true); install() }
  return <aside className="update-toast" role="status" aria-live="polite" aria-label="Uygulama güncellemesi">
    {status.state === 'available' && <>
      <div className="update-toast-head"><Sparkles size={16} /><strong>FC Market {status.version} hazır</strong>
        <button className="update-toast-close" aria-label="Sonra" title="Sonra" onClick={later}><X size={14} /></button></div>
      <p>Şu an {status.current} kullanıyorsun. {status.canInstall ? 'Güncelleme indirilip kurulur, FC Market yeniden açılır. Verilerin korunur.' : 'Yeni sürümü indirme sayfasından alabilirsin.'}</p>
      <div className="update-toast-actions">
        <button className="btn primary" onClick={start}><Download size={14} />{status.canInstall ? 'Şimdi güncelle' : 'İndirme sayfasını aç'}</button>
        <button className="btn" onClick={later}>Sonra</button>
      </div>
    </>}
    {status.state === 'downloading' && <>
      <div className="update-toast-head"><Loader2 size={16} className="animate-spin" /><strong>FC Market {status.version} indiriliyor</strong></div>
      <div className="update-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={status.progress}><span style={{ width: `${status.progress}%` }} /></div>
      <p>%{status.progress}</p>
    </>}
    {status.state === 'installing' && <>
      <div className="update-toast-head"><Loader2 size={16} className="animate-spin" /><strong>Kuruluyor…</strong></div>
      <p>FC Market birazdan kapanıp yeni sürümle açılacak.</p>
    </>}
    {failed && <>
      <div className="update-toast-head"><strong>Güncelleme tamamlanamadı</strong>
        <button className="update-toast-close" aria-label="Kapat" title="Kapat" onClick={() => setTried(false)}><X size={14} /></button></div>
      <p>{status.message}</p>
      <div className="update-toast-actions"><button className="btn" onClick={() => postHost('updateCheck')}><RefreshCw size={14} />Tekrar dene</button></div>
    </>}
  </aside>
}

const STATE_TEXT: Record<UpdateStatus['state'], string> = {
  idle: 'Henüz denetlenmedi.',
  disabled: 'Geliştirme sürümünde güncelleme denetlenmez.',
  checking: 'Denetleniyor…',
  none: 'En güncel sürümü kullanıyorsun.',
  available: 'Yeni sürüm hazır.',
  downloading: 'İndiriliyor…',
  installing: 'Kuruluyor; FC Market yeniden açılacak.',
  error: 'Denetlenemedi.',
}

/** Ayarlar → Sürüm: kurulu sürüm, elle denetim, varsa güncelle. */
export function UpdateSettings() {
  const status = useUpdateStatus()
  const desktop = isDesktop()
  const busy = !status || ['checking', 'downloading', 'installing'].includes(status.state)
  return <section className="automation-folder" aria-labelledby="update-title">
    <h3 id="update-title" className="flex items-center gap-2 text-xs font-semibold text-gray-300"><Sparkles size={15} />SÜRÜM</h3>
    {!desktop ? <p className="mt-2 text-xs text-gray-400">Güncelleme FC Market masaüstü uygulamasında denetlenir.</p> : <>
      <p className="mt-2 text-sm text-gray-200">Kurulu sürüm <strong className="font-mono text-gray-100">{status?.current ?? '…'}</strong></p>
      <p className="mt-1 text-xs text-gray-400">{status ? (status.state === 'available' ? `FC Market ${status.version} hazır.` : status.state === 'downloading' ? `İndiriliyor… %${status.progress}` : STATE_TEXT[status.state]) : 'Durum okunuyor…'}</p>
      {status?.state === 'error' && status.message && <p className="mt-1 text-xs text-amber-300">{status.message}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {status?.state === 'available'
          ? <button className="btn primary" onClick={install}><Download size={14} />{status.canInstall ? 'Şimdi güncelle' : 'İndirme sayfasını aç'}</button>
          : <button className="btn" disabled={busy || status?.state === 'disabled'} onClick={() => postHost('updateCheck')}>
            <RefreshCw size={14} className={status?.state === 'checking' ? 'animate-spin' : ''} />Güncellemeleri denetle</button>}
        <button className="btn" onClick={() => postHost('updateOpenPage')}>Sürüm notları</button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-gray-500">Açılışta ve 12 saatte bir GitHub'daki son sürüme bakılır. Güncelleme yalnız onay verince kurulur; verilerin korunur.</p>
    </>}
  </section>
}
