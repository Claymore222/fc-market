import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { ArrowDown, ArrowRight, ArrowUp, Calendar, Globe, Search, X } from 'lucide-react'
import { useFeed } from '../api/client'
import type { FeedItem } from '../api/types'
import { PlayerAvatar } from './cmt'
import { ClubCrest } from './layout/CareerHeroCard'
import { gameDate, money } from '../lib/format'

type Kind = NonNullable<FeedItem['kind']>
const KIND_LABEL: Record<Kind, string> = {
  permanent: 'Bonservis', loan: 'Kiralık', loanReturn: 'Kiralıktan dönüş', free: 'Serbest imza', released: 'Serbest kaldı',
}
const KIND_TONE: Record<Kind, string> = {
  permanent: 'border-cmt-blurple/40 bg-cmt-blurple/15 text-cmt-text',
  loan: 'border-[#23cad0]/40 bg-[#23cad0]/15 text-[#23cad0]',
  loanReturn: 'border-gray-500/40 bg-gray-500/15 text-gray-300',
  free: 'border-[#14b341]/40 bg-[#14b341]/15 text-[#14b341]',
  released: 'border-[#ff6460]/40 bg-[#ff6460]/15 text-[#ff6460]',
}
const FILTERS: { id: 'all' | 'permanent' | 'loan' | 'free'; label: string; kinds?: Kind[] }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'permanent', label: 'Bonservis', kinds: ['permanent'] },
  { id: 'loan', label: 'Kiralık', kinds: ['loan', 'loanReturn'] },
  { id: 'free', label: 'Serbest', kinds: ['free', 'released'] },
]
type SortKey = 'date' | 'player' | 'from' | 'to' | 'fee' | 'wage'

const TRANSFER_SECTIONS = [
  { id: 'hub', path: '/transfer', label: 'ÖNERİLER VE PAKET' },
  { id: 'market', path: '/transfer/market', label: 'TRANSFER PİYASASI' },
  { id: 'plan', path: '/transfer/plan', label: 'TAKIM PLANI' },
] as const

/** Transfer ekranlarının ortak ikinci üst şeridi (Home bölüm şeridiyle aynı görsel dilde). */
export function TransferSubNav() {
  const { pathname } = useLocation()
  return (
    <nav className="hub-section-tabs cmt-scroll-none" aria-label="Transfer bölümleri">
      {TRANSFER_SECTIONS.map(s => {
        const active = s.path === '/transfer' ? pathname === '/transfer' : pathname.startsWith(s.path)
        return (
          <Link key={s.id} to={s.path} aria-current={active ? 'page' : undefined}
            className={`hub-section-tab ${active ? 'is-active' : ''}`}>
            {s.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** CMTracker "Transfer Market" çekmecesi (eski pop-up kabuğu, geriye dönük uyumluluk için). */
export function TransferMarketDrawer({ saveUid, clubId, clubName, initialScope = 'world', onClose, onPlayer }: {
  saveUid?: string; clubId: number; clubName: string; initialScope?: 'club' | 'world'; onClose: () => void; onPlayer: (id: number) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = dialog.current!
    el.showModal()
    return () => el.close()
  }, [])
  return createPortal(
    <dialog ref={dialog} className="transfer-drawer" aria-label="Transfer piyasası" onCancel={e => { e.preventDefault(); onClose() }}
      onClick={e => { if (e.target === dialog.current) onClose() }}>
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-cmt-line px-5 py-4">
          <h2 className="font-tektur text-lg font-black uppercase tracking-wider text-cmt-text">TRANSFER PİYASASI</h2>
          <button onClick={onClose} aria-label="Kapat" className="text-gray-400 hover:text-cmt-text"><X className="h-5 w-5" /></button>
        </header>
        <TransferList saveUid={saveUid} clubId={clubId} clubName={clubName} initialScope={initialScope} onPlayer={onPlayer} scroll />
      </div>
    </dialog>, document.body,
  )
}

/**
 * Kayıt içi transfer geçmişi ve sezon arşivi: sezon seçici, bonservis bedeli, haftalık maaş ve kulüp hareketleri.
 */
export function TransferList({ saveUid, clubId, clubName, initialScope = 'world', onScopeChange, onPlayer, scroll }: {
  saveUid?: string; clubId: number; clubName: string; initialScope?: 'club' | 'world'
  onScopeChange?: (scope: 'club' | 'world') => void; onPlayer: (id: number) => void; scroll?: boolean
}) {
  const [season, setSeason] = useState<string>('current')
  const feed = useFeed({ types: 'transfer', limit: '3000', season: season === 'current' || season === 'all' ? undefined : season }, saveUid)
  const [scope, setScope] = useState<'club' | 'world'>(initialScope)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true })

  useEffect(() => {
    setScope(initialScope)
  }, [initialScope])

  const changeScope = (next: 'club' | 'world') => {
    setScope(next)
    onScopeChange?.(next)
  }

  const seasons = feed.data?.seasons ?? []
  const currentSeason = feed.data?.currentSeason ?? null
  const activeSeason = season === 'current' ? currentSeason : season === 'all' ? null : season

  const rows = useMemo(() => {
    const kinds = FILTERS.find(f => f.id === filter)?.kinds
    const term = q.trim().toLocaleLowerCase('tr-TR')
    const list = (feed.data?.items ?? []).filter(t => t.type === 'transfer'
      && (!activeSeason || !t.season || t.season === activeSeason)
      && (scope === 'world' || t.fromClubId === clubId || t.toClubId === clubId)
      && (!kinds || (t.kind && kinds.includes(t.kind)))
      && (!term || [t.playerName, t.fromClub, t.toClub].some(x => x?.toLocaleLowerCase('tr-TR').includes(term))))
    return list.sort((a, b) => {
      if (sort.key === 'fee' || sort.key === 'wage') {
        const av = (sort.key === 'fee' ? a.fee : a.wage) ?? -1
        const bv = (sort.key === 'fee' ? b.fee : b.wage) ?? -1
        return (sort.desc ? -1 : 1) * (av - bv)
      }
      const val = (t: FeedItem) => sort.key === 'date' ? t.date : sort.key === 'player' ? t.playerName ?? '' : sort.key === 'from' ? t.fromClub ?? '' : t.toClub ?? ''
      return (sort.desc ? -1 : 1) * val(a).localeCompare(val(b), 'tr')
    })
  }, [feed.data, activeSeason, scope, filter, q, sort, clubId])

  const totalVolume = useMemo(
    () => rows.reduce((sum, t) => sum + (t.fee && t.fee > 0 ? t.fee : 0), 0),
    [rows],
  )

  const head = (key: SortKey, label: string, alignRight = false) => (
    <th className={`py-2.5 ${alignRight ? 'pl-3 text-right' : 'pr-3'}`}>
      <button className={`inline-flex items-center gap-1 font-tektur text-[11px] font-bold uppercase ${alignRight ? 'ml-auto' : ''} ${sort.key === key ? 'text-cmt-blurple' : 'text-gray-400 hover:text-gray-200'}`}
        onClick={() => setSort(s => ({ key, desc: s.key === key ? !s.desc : key === 'date' || key === 'fee' || key === 'wage' }))}>
        {label}{sort.key === key && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </th>
  )

  return (
    <>
      <div className="space-y-3 border-b border-cmt-line px-5 py-3 text-xs">
        <p className="flex items-center gap-2 text-gray-400">
          <Globe className="h-4 w-4 shrink-0" />
          <span>Kayıt içi transfer geçmişi ve sezon arşivi · gerçek bonservis bedeli, haftalık maaş ve kulüp hareketleri</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-cmt-line bg-cmt-sub p-1" role="group" aria-label="Transfer kapsamı">
            {(['club', 'world'] as const).map(s => (
              <button key={s} type="button" onClick={() => changeScope(s)} aria-pressed={scope === s}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1 ${scope === s ? 'bg-cmt-blurple font-bold text-cmt-text' : 'text-gray-400 hover:text-gray-200'}`}>
                {s === 'club' ? <><ClubCrest name={clubName} teamId={clubId} size={16} /><span>{clubName}</span></> : 'Dünya'}
              </button>
            ))}
          </div>
          {seasons.length > 0 && (
            <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-cmt-line bg-cmt-sub p-1" role="group" aria-label="Sezon seçimi">
              <Calendar className="ml-1.5 mr-0.5 h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
              {seasons.map(s => {
                const isSelected = activeSeason === s
                const isCurrent = s === currentSeason
                return (
                  <button key={s} type="button" onClick={() => setSeason(isCurrent ? 'current' : s)} aria-pressed={isSelected}
                    className={`rounded px-2.5 py-1 font-mono text-[11px] ${isSelected ? 'bg-cmt-blurple font-bold text-cmt-text' : 'text-gray-400 hover:text-gray-200'}`}>
                    {s}{isCurrent ? ' (Bu Sezon)' : ''}
                  </button>
                )
              })}
              {seasons.length > 1 && (
                <button type="button" onClick={() => setSeason('all')} aria-pressed={season === 'all'}
                  className={`rounded px-2.5 py-1 text-[11px] ${season === 'all' ? 'bg-cmt-blurple font-bold text-cmt-text' : 'text-gray-400 hover:text-gray-200'}`}>
                  Tüm Sezonlar
                </button>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map(f => (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
                className={`rounded-md border px-3 py-1.5 ${filter === f.id ? 'border-cmt-blurple bg-cmt-blurple/20 font-bold text-cmt-text' : 'border-cmt-line bg-cmt-sub text-gray-300 hover:border-cmt-line'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <label className="ml-auto flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-cmt-line bg-cmt-sub px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-gray-500" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Oyuncu ya da kulüp ara" className="w-full bg-transparent text-gray-200 outline-none" />
          </label>
        </div>
      </div>
      <div tabIndex={0} role="region" aria-label="Transfer tablosu" className={scroll ? 'flex-1 overflow-y-auto px-5' : 'overflow-x-auto px-5'}>
        {feed.isPending ? <p className="py-6 text-gray-500" role="status">Yükleniyor…</p>
          : feed.isError ? <p className="py-6 text-[#ff6460]" role="alert">Transferler okunamadı.</p>
          : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              <p className="font-semibold text-gray-200">
                {scope === 'club' ? `${clubName} için bu filtrede kayıtlı transfer hareketi görülmedi.` : 'Bu filtrede transfer yok.'}
              </p>
              <p className="mt-1 text-xs text-gray-500">İstersen üstten farklı bir sezon seçebilir veya Dünya kapsamına geçebilirsin.</p>
            </div>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 z-10 bg-cmt-sub"><tr className="border-b border-cmt-line">
                {head('date', 'Tarih')}{head('player', 'Oyuncu')}{head('from', 'Nereden')}{head('to', 'Nereye')}
                {head('fee', 'Bonservis', true)}{head('wage', 'Maaş', true)}
                <th className="py-2.5 pl-3 text-right font-tektur text-[11px] font-bold uppercase text-gray-400">Tür</th>
              </tr></thead>
              <tbody className="divide-y divide-cmt-line">
                {rows.map((t, idx) => {
                  const isOut = t.fromClubId === clubId
                  const isIn = t.toClubId === clubId
                  return (
                    <tr key={`${t.playerId}-${t.date}-${t.fromClubId}-${t.toClubId}-${idx}`} className={`${t.userTeam || isOut || isIn ? 'bg-cmt-blurple/10' : ''} hover:bg-cmt-card`}>
                      <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs text-gray-400">
                        <span>{gameDate(t.date)}</span>
                        {season === 'all' && t.season && (
                          <span className="ml-1.5 rounded border border-cmt-line bg-cmt-sub px-1.5 py-0.5 text-[10px] text-gray-300">{t.season}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <button type="button" className="flex items-center gap-2.5 text-left font-semibold text-cmt-text hover:text-cmt-blurple"
                          onClick={() => t.playerId && onPlayer(t.playerId)}>
                          {t.playerId ? <PlayerAvatar id={t.playerId} name={t.playerName ?? 'Oyuncu'} size={28} /> : null}
                          <span className="truncate">{t.playerName ?? '–'}</span>
                        </button>
                      </td>
                      <td className="py-2 pr-3 text-gray-300">
                        <span className="inline-flex items-center gap-2">
                          {t.fromClub ? <ClubCrest name={t.fromClub} teamId={t.fromClubId} size={20} /> : null}
                          <span className={isOut ? 'font-semibold text-cmt-text' : ''}>{t.fromClub ?? '–'}</span>
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-gray-200">
                        <span className="inline-flex items-center gap-2">
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
                          {t.toClub ? <ClubCrest name={t.toClub} teamId={t.toClubId} size={20} /> : null}
                          <span className={isIn ? 'font-semibold text-cmt-text' : ''}>{t.toClub ?? '–'}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right font-mono text-xs">
                        {t.fee != null && t.fee > 0 ? (
                          <div>
                            <span className="font-bold text-[#14b341]">{money(t.fee)}</span>
                            {t.releaseClause != null && t.releaseClause > 0 && (
                              <span className="block text-[10px] text-gray-500" title="Serbest kalma bedeli">SK: {money(t.releaseClause)}</span>
                            )}
                          </div>
                        ) : t.fee === 0 ? (
                          <span className="text-gray-400">Bedelsiz</span>
                        ) : (
                          <span className="text-gray-500">–</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right font-mono text-xs text-gray-300">
                        {t.wage != null && t.wage > 0 ? (
                          <span>{money(t.wage)}<small className="text-[10px] text-gray-500">/hf</small></span>
                        ) : (
                          <span className="text-gray-500">–</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2 pl-3 text-right">
                        {t.kind ? (
                          <span className={`inline-block rounded border px-2 py-0.5 font-mono text-[11px] ${KIND_TONE[t.kind]}`}>
                            {KIND_LABEL[t.kind]}
                          </span>
                        ) : <span className="text-gray-500">–</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
      </div>
      <footer className="flex flex-wrap items-center justify-between border-t border-cmt-line px-5 py-2 font-mono text-[11px] text-gray-400">
        <span>{rows.length} transfer{activeSeason ? ` · ${activeSeason} sezonu` : seasons.length > 1 ? ' · tüm sezonlar' : ''}</span>
        {totalVolume > 0 && <span>Toplam bonservis hacmi: <b className="text-cmt-text">{money(totalVolume)}</b></span>}
      </footer>
    </>
  )
}
