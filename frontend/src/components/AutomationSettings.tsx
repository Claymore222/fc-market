import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderOpen, RefreshCw, Settings2, X, Zap, Image } from 'lucide-react'
import { isDesktop, onHostMessage, postHost, setAutomation, setExportSchedule, type AutomationStatus, type AutomationScript, type ExportSchedule } from '../lib/host'
import { ThemePicker } from './ThemePicker'
import { StorageSettings } from './StorageSettings'
import { UpdateSettings } from './UpdateNotice'

export const SCHEDULES: { id: ExportSchedule; label: string; detail: string }[] = [
  { id: 'daily', label: 'Günlük', detail: 'Her oyun günü hafif export, ay başında tam export. En çok takılan seçenek.' },
  { id: 'weekly', label: 'Haftalık', detail: 'Yedi oyun gününde bir hafif export, ay başında tam export.' },
  { id: 'monthly', label: 'Aylık', detail: 'Yalnız ay başında tam export. Takılma ayda bir olur.' },
  { id: 'quarterly', label: '3 aylık', detail: 'Ocak, Nisan, Temmuz ve Ekim başında tam export. En az takılan seçenek.' },
]

export function AutomationSettings({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [state, setState] = useState<AutomationStatus>()
  const [busy, setBusy] = useState(isDesktop())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const desktop = isDesktop()
  useEffect(() => {
    const el = dialog.current!
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    el.showModal()
    const off = onHostMessage(m => {
      if (m.type !== 'automation') return
      setBusy(false)
      if (m.state) setState(m.state)
      setError(m.ok ? '' : m.message ?? 'İşlem tamamlanamadı.')
      if (!m.ok) setNotice('')
    })
    postHost('automationStatus')
    return () => { off(); el.close(); document.body.style.overflow = overflow; focused?.focus({ preventScroll: true }) }
  }, [])
  // A missing/unresponsive host must not leave an endless disabled loading screen.
  useEffect(() => {
    if (!busy) return
    const timer = setTimeout(() => { setBusy(false); setError('Masaüstü yanıt vermedi. Durumu yeniden kontrol et.') }, 15000)
    return () => clearTimeout(timer)
  }, [busy])
  const request = (type: 'automationStatus' | 'automationFolder') => {
    setBusy(true); setError(''); setNotice(''); postHost(type)
  }
  const toggle = (script: AutomationScript) => {
    setBusy(true); setError(''); setNotice(script.id === 'export'
      ? 'Değişiklik sonraki oyun açılışında uygulanır. Oyun açıksa yeniden başlat.'
      : script.id === 'manualExport' ? 'Manuel export script listesi güncellendi. Oyunda fc_export_manual.lua kullan.'
      : script.id === 'assets' ? 'Script listesi güncellendi.' : 'Görsel script’i otomatik başlangıçtan kaldırıldı.')
    setAutomation(script.id, !script.installed)
  }
  const schedule = SCHEDULES.find(s => s.id === (state?.schedule ?? 'monthly'))!
  const changeSchedule = (mode: ExportSchedule) => {
    setBusy(true); setError(''); setNotice('Yeni sıklık sonraki oyun gününde geçerli olur. Kayıtlar yine her kaydedişte okunur.')
    setExportSchedule(mode)
  }
  return createPortal(<dialog ref={dialog} className="automation-settings" aria-labelledby="automation-title"
    onCancel={e => { e.preventDefault(); if (!busy) onClose() }} onClick={e => {
      if (busy || e.target !== e.currentTarget) return
      const r = e.currentTarget.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose()
    }}>
    <header><div><Settings2 size={20} /><h2 id="automation-title">Ayarlar</h2></div>
      <button className="btn" aria-label="Ayarları kapat" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <div className="automation-body">
      <ThemePicker />
      <UpdateSettings />
      <StorageSettings />
      <h3 className="text-xs font-semibold text-gray-300">Otomasyon ve script’ler</h3>
      <p className="text-sm leading-relaxed text-gray-400">Live Editor kurulumunu seç, otomatik senkronu buradan yönet.</p>
      {!desktop && <p role="status" className="automation-note">Bu ayarlar FC Market masaüstü uygulamasında kullanılabilir. Tarayıcıdan script dosyaları değiştirilemez.</p>}
      <section className="automation-folder">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-300"><FolderOpen size={15} />LIVE EDITOR KLASÖRÜ</div>
        <p className="mt-2 break-all font-mono text-xs text-gray-400">{state?.folder ?? 'Klasör seçilmedi'}</p>
        {state && !state.valid && <p className="mt-2 text-xs text-amber-300">Bu klasörde Live Editor bulunamadı. İçinde lua bulunan ana klasörü seç.</p>}
        {state && state.candidates.length > 1 && <p className="mt-2 text-xs text-gray-500">Birden fazla kurulum bulundu. Oyunu açtığın launcher’ın klasörünü seç.</p>}
        <div className="mt-3 flex gap-2"><button className="btn" disabled={!desktop || busy} onClick={() => request('automationFolder')}><FolderOpen size={14} />Klasör seç</button>
          <button className="btn" disabled={!desktop || busy} onClick={() => request('automationStatus')}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />Durumu kontrol et</button></div>
      </section>
      {(['export', 'manualExport', 'assets'] as const).map(id => {
        const script = state?.scripts.find(s => s.id === id)
        const available = desktop && !busy && state?.valid && script?.bundled && (!script.installed || script.matches)
        const title = id === 'export' ? 'Otomatik kariyer senkronu' : id === 'manualExport' ? 'Manuel kariyer export’u' : 'Görsel script’i'
        return <section key={id} className="automation-script">
          <div className="flex items-start justify-between gap-5"><div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-100">{id !== 'assets' ? <Zap size={17} className="text-indigo-400" /> : <Image size={17} className="text-indigo-400" />}{title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">{id === 'export'
              ? 'İlk oyun gününde bir tam export alır, sonrası seçtiğin sıklıkla devam eder.'
              : id === 'manualExport' ? 'Kariyer açıkken F8 → Features → Lua Engine → fc_export_manual.lua. Yalnız çalıştırdığında tam snapshot alır; sonraki günler ve aylar için otomasyon açmaz. Günlük senkronu da kapalı tut.'
              : 'Yüzler, armalar ve bayraklar. Kurduktan sonra kariyer açıkken F8 → Features → Lua Engine → fc_assets.lua ile çalıştır.'}</p>
          </div><button role="switch" aria-label={title} aria-checked={script?.installed ?? false} disabled={!available}
            className="automation-switch" onClick={() => script && toggle(script)}><span /></button></div>
          {id === 'export' && <div className="automation-schedule"><label>Export sıklığı<select value={schedule.id} disabled={!desktop || busy} onChange={e => changeSchedule(e.target.value as ExportSchedule)}>{SCHEDULES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label><p>{schedule.detail}</p></div>}
          <div className="mt-3 flex items-center justify-between gap-2 text-[11px]"><code className="text-gray-500">{id === 'export' ? 'lua/autorun/fc_export.lua' : id === 'manualExport' ? 'lua/scripts/fc_export_manual.lua' : 'lua/scripts/fc_assets.lua'}</code>
            <span className={script?.installed ? 'text-emerald-400' : 'text-gray-500'}>{!script ? 'Durum okunmadı' : script.installed ? (script.matches ? id === 'export' ? 'Açık' : 'Kurulu · elle çalıştır' : 'Farklı sürüm') : id === 'export' ? 'Kapalı' : 'Kurulu değil'}</span></div>
          {script?.problem && <p className="mt-2 text-xs text-amber-300">{script.problem}</p>}
          {script?.installed && script.matches && script.logged === false && <button className="btn mt-3" disabled={!available}
            onClick={() => { setBusy(true); setError(''); setNotice('Script loglaması güncellendi.'); setAutomation(script.id, true) }}>Loglamayı etkinleştir</button>}
          {script && !script.bundled && <p className="mt-2 text-xs text-amber-300">Paket script’i eksik; uygulamayı yeniden kur.</p>}
        </section>
      })}
      <p className="automation-note">Elle güncellemek için fc_export_manual.lua kullan. Eski fc_export.lua’yı elle çalıştırmak da günlük/aylık otomasyonu açar. Oyun zaten açıksa, mevcut otomasyonu durdurmak için oyunu yeniden başlat veya kariyerde manuel script’i bir kez çalıştır.</p>
      <section className="automation-note"><p>Her script’in başlangıç, bitiş ve hataları ayrı tarihli loglara yazılır. Lua logları logs/lua altında script adına; uygulama logları logs/app altında işleme göre ayrılır.</p>
        {state?.logDirectory && <code className="mt-2 block break-all text-xs">{state.logDirectory}</code>}</section>
      {state?.scripts.find(s => s.id === 'legacyAssets' && s.installed) && <section className="automation-note">
        <p>fc_assets.lua autorun klasöründe de bulunuyor. Görselleri kariyer yüklüyken elle çıkar; oyun açılışında kariyer verisi henüz hazır olmaz.</p>
        <button className="btn mt-3" disabled={busy || !state.scripts.find(s => s.id === 'legacyAssets')?.matches}
          onClick={() => toggle(state.scripts.find(s => s.id === 'legacyAssets')!)}>Görsel script’ini autorun’dan kaldır</button>
        {state.scripts.find(s => s.id === 'legacyAssets')?.problem && <p className="mt-2">Farklı sürüm; dosyayı elle kontrol et.</p>}
      </section>}
      {busy && <p role="status" className="text-xs text-gray-400">Dosya durumu kontrol ediliyor…</p>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {notice && !busy && !error && <p role="status" className="automation-note">{notice}</p>}
      <p className="text-[11px] leading-relaxed text-gray-500">Autorun değişikliği sonraki oyun açılışında geçerli olur. Kapatılan script önce FC Market’in yerel yedek klasörüne kopyalanır. Farklı içerikteki dosyalar korunur. Kayıt okuma ve uygulama senkronu çalışmaya devam eder.</p>
    </div>
  </dialog>, document.body)
}
