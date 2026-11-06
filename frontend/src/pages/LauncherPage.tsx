import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Database, FilePlus2, Loader2, Settings2 } from 'lucide-react'
import type { SaveInfo } from '../api/types'
import { ClubCrest } from '../components/layout/CareerHeroCard'
import { gameDate } from '../lib/format'
import { isDesktop, onHostMessage, postHost } from '../lib/host'
import { useSync } from '../api/client'
import { ImportIssues } from '../components/ImportIssues'

interface Props {
  saves: SaveInfo[]
  loading: boolean
  failed: boolean
  current?: string
  onEnter: (key: string) => void
  onSettings?: () => void
}

const season = (endYear: number) => `${String(endYear - 1).slice(2)}/${String(endYear).slice(2)}`

/**
 * Açılış ekranı (masaüstünde küçük dikey pencere): kariyer seçimi. Oyunun kayıt klasöründeki kariyerler kendiliğinden
 * gelir; başka yerdeki bir kayıt "Kayıt dosyası ekle" ile seçilir, uygulama çözer ve sonraki açılışlarda da izler.
 */
export function LauncherPage({ saves, loading, failed, current, onEnter, onSettings }: Props) {
  const qc = useQueryClient()
  const sync = useSync()
  const [adding, setAdding] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const desktop = isDesktop()

  useEffect(() => onHostMessage(m => {
    if (m.type === 'saveAdding') { setAdding(m.file); setNotice(null) }
    if (m.type === 'saveAdded') {
      setAdding(null)
      if (m.cancelled) return
      setNotice(m.ok ? { ok: true, text: `${m.file} eklendi.` } : { ok: false, text: m.message ?? 'Kayıt okunamadı.' })
      if (m.ok) qc.invalidateQueries()
    }
  }), [qc])

  return (
    <div className="launcher-workspace flex min-h-screen flex-col bg-cmt-black px-5 py-6 font-ubuntu text-gray-100">
      <header className="mb-6 flex flex-col items-center gap-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-cmt-blurple shadow-[0_0_24px_color-mix(in_srgb,var(--fc-accent)_20%,transparent)]"><Database size={24} /></span>
        <h1 className="font-tektur text-xl font-black tracking-wider text-cmt-text">FC MARKET</h1>
        <p className="text-xs text-gray-400">Kariyerini seç</p>
      </header>

      <main className="flex flex-1 flex-col gap-2" aria-label="Kariyerler">
        {loading && <p className="py-8 text-center text-sm text-gray-400">Kariyerler yükleniyor…</p>}
        {failed && <p className="py-8 text-center text-sm text-red-300">Yerel veri servisine ulaşılamıyor.</p>}
        {!loading && !failed && saves.length === 0 && (
          <p className="rounded-lg border border-cmt-line bg-cmt-card px-4 py-6 text-center text-sm text-gray-400">
            Kariyer bulunamadı. Oyunda kariyerini kaydet ya da aşağıdan kayıt dosyası ekle.
          </p>
        )}
        {saves.map(s => (
          <section key={s.saveUid} className={`overflow-hidden rounded-xl border bg-cmt-card ${current?.split('@')[0] === s.saveUid ? 'border-cmt-blurple' : 'border-cmt-line'}`}>
            <button type="button" onClick={() => onEnter(s.saveUid)} aria-label={`${s.userTeamName ?? 'İsimsiz kariyer'} kariyerini aç`}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-cmt-sub`}>
              <ClubCrest name={s.userTeamName ?? '?'} teamId={s.userTeamId} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-tektur text-sm font-bold uppercase tracking-wide text-cmt-text">{s.userTeamName ?? 'İsimsiz kariyer'}</span>
                <span className="block text-[11px] text-gray-400">{gameDate(s.latest.gameDate)} · Sezon {season(s.latest.seasonEndYear)}</span>
                {s.branches.length > 1 && <span className="mt-1 block text-[11px] text-cmt-blurple">Son okunan kayıt · Dal {s.latest.branch}</span>}
              </span>
              <ChevronRight size={16} className="shrink-0 text-gray-500" />
            </button>
            {s.branches.length > 1 && (
              <details className="border-t border-cmt-line px-4 py-3">
                <summary className="cursor-pointer text-xs text-gray-300">Kayıt yuvaları ve arşivler ({s.branches.length})</summary>
                <div className="mt-3 flex flex-col gap-2">
                <p className="text-[11px] text-gray-400">Kulüp kartı son okunan oyun kaydını açar. Aşağıdaki seçimler ilgili dalın arşivini açar.</p>
                {s.branches.map(b => (
                  <button key={b.careerKey} type="button" onClick={() => onEnter(b.careerKey)}
                    aria-label={`Dal ${b.branch} · ${gameDate(b.lastGameDate)} arşivini aç`}
                    className="rounded-lg border border-cmt-line bg-cmt-sub px-3 py-2 text-left text-[11px] text-gray-300 hover:border-cmt-blurple/60 hover:text-cmt-text">
                    <span className="flex flex-wrap items-center justify-between gap-1 font-semibold text-cmt-text">
                      <span>Dal {b.branch} · {gameDate(b.lastGameDate)}</span>
                      {b.active && <span className="text-cmt-blurple">Son kaydın dalı</span>}
                    </span>
                    <span className="mt-1 block break-words">{b.slots?.length
                      ? b.slots.map(slot => slot.title || slot.fileName).join(' · ')
                      : 'Kayıt yuvası eşleşmedi · arşiv'}</span>
                    {b.slots?.map(slot => <span key={slot.fileName} className="block break-all text-gray-400">{slot.fileName}{slot.gameDate && ` · Yuva: ${gameDate(slot.gameDate)}`}</span>)}
                    <span className="mt-1 block text-gray-400">{b.snapshotCount} görüntü · {gameDate(b.firstGameDate)} – {gameDate(b.lastGameDate)}</span>
                    <span className="block text-gray-400">{b.parentBranch != null
                      ? `Dal ${b.parentBranch}'den${b.forkDate ? ` ${gameDate(b.forkDate)} tarihinde` : ''} ayrıldı`
                      : 'Önceki dal bağlantısı doğrulanmadı'}</span>
                  </button>
                ))}
                </div>
              </details>
            )}
          </section>
        ))}
      </main>

      <footer className="mt-5 flex flex-col gap-2">
        <ImportIssues issues={sync.data?.issues} warnings={sync.data?.warnings} />
        <button className="btn justify-center" onClick={onSettings}><Settings2 size={15} />Ayarlar</button>
        {notice && <p role="status" className={`text-center text-xs ${notice.ok ? 'text-emerald-400' : 'text-red-300'}`}>{notice.text}</p>}
        <button type="button" className="btn justify-center" disabled={!desktop || adding !== null} onClick={() => postHost('addSave')}>
          {adding ? <Loader2 size={15} className="animate-spin" /> : <FilePlus2 size={15} />}
          <span>{adding ? `${adding} çözülüyor…` : 'Kayıt dosyası ekle'}</span>
        </button>
        <p className="text-center text-[11px] leading-snug text-gray-500">
          {desktop ? 'Oyunun kayıt klasöründeki kariyerler kendiliğinden gelir. Başka yerdeki bir FC 27 kariyer kaydını (CmMgrC…) buradan ekle.'
            : 'Kayıt dosyası eklemek masaüstü uygulamasında çalışır.'}
        </p>
      </footer>
    </div>
  )
}
