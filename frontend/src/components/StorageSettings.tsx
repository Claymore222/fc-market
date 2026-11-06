import { useQuery } from '@tanstack/react-query'
import { HardDrive, RefreshCw } from 'lucide-react'
import { get } from '../api/client'

type StorageItem = { id: string; label: string; path: string; bytes: number; files: number; exists: boolean }
type StorageReport = { items: StorageItem[]; totalBytes: number }

const HINTS: Record<string, string> = {
  careerDb: 'Kayıtlardan ve export’lardan okunan tüm kariyer geçmişi. Uygulama yalnız okur.',
  appDb: 'Kısa liste, transfer planı, tercihler ve tema.',
  exports: 'Live Editor’ün yazdığı CSV’ler, ham görseller ve loglar (kariyer veritabanı hariç).',
  backups: 'Okunan kayıtların değişmez kopyaları; en yeni 10 tanesi tutulur.',
  images: 'Oyundan çıkarılan yüz, arma, bayrak ve kupa görselleri.',
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024, unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`
}

export function StorageSettings() {
  const storage = useQuery({ queryKey: ['storage'], queryFn: () => get<StorageReport>('/api/settings/storage'), staleTime: 30_000 })
  // Beklenmeyen bir yanıt (eski API, sahte sunucu) ayarlar penceresini düşürmesin.
  const report = Array.isArray(storage.data?.items) ? storage.data : undefined
  return <section className="automation-folder" aria-labelledby="storage-title">
    <div className="flex items-center justify-between gap-3">
      <h3 id="storage-title" className="flex items-center gap-2 text-xs font-semibold text-gray-300"><HardDrive size={15} />VERİ VE DEPOLAMA</h3>
      <button className="btn" aria-label="Boyutları yenile" title="Boyutları yenile" disabled={storage.isFetching} onClick={() => void storage.refetch()}>
        <RefreshCw size={14} className={storage.isFetching ? 'animate-spin' : ''} /></button>
    </div>
    {(storage.isError || (storage.isSuccess && !report)) && <p className="mt-2 text-xs text-amber-300">Depolama bilgisi okunamadı.</p>}
    {!report && storage.isPending && <p role="status" className="mt-2 text-xs text-gray-400">Boyutlar hesaplanıyor…</p>}
    {report && <>
      <p className="mt-2 text-sm text-gray-200">Toplam <strong className="text-gray-100">{formatBytes(report.totalBytes)}</strong></p>
      <ul className="storage-list">
        {report.items.map(item => <li key={item.id}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-gray-100">{item.label}</span>
            <span className="shrink-0 font-mono text-xs text-gray-300">{item.exists ? formatBytes(item.bytes) : 'Yok'}
              {item.exists && item.files > 1 && <span className="text-gray-500"> · {item.files.toLocaleString('tr-TR')} dosya</span>}</span>
          </div>
          <div className="storage-bar" aria-hidden="true"><span style={{ width: `${report.totalBytes ? Math.max(item.bytes / report.totalBytes * 100, item.bytes ? 1 : 0) : 0}%` }} /></div>
          <p className="text-[11px] leading-relaxed text-gray-500">{HINTS[item.id]}</p>
          <code className="block break-all text-[11px] text-gray-400">{item.path}</code>
        </li>)}
      </ul>
    </>}
  </section>
}
