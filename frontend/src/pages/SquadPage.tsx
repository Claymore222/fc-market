import { Fragment, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LayoutGrid, LayoutList, ShieldAlert, Cross, ChevronDown } from 'lucide-react'
import { useCareer } from '../App'
import { useClub, usePlayerDetail } from '../api/client'
import { lineupDepth, slotPosition } from '../lib/lineupDepth'
import type { ClubView, SquadMember } from '../api/types'
import { PlayerDrawer } from '../components/PlayerDrawer'
import {
  Flag, FormArrow, FutCard, GROUP_TITLES, SET_PIECE_LABELS, PlayerAvatar, RatingChip, formationOf, ratingClass,
} from '../components/cmt'
import { dec1, gameDate, money } from '../lib/format'
import { useSelectedPlayer } from '../lib/selection'
import { LineupPitch } from '../components/LineupPitch'
import { TEMPERAMENT, moraleEvent, moraleTone } from '../lib/morale'

const GROUPS = ['GK', 'DEF', 'MID', 'ATT'] as const


/** Kadro: CMTracker Squad Hub. Liste/kart görünümü, ilk 11 sahası, duran toplar ve kulüp reytingleri; hepsi gerçek kariyer verisi. */
export function SquadPage() {
  const { key } = useCareer()
  const [params] = useSearchParams()
  const teamParam = Number(params.get('team'))
  const teamId = Number.isSafeInteger(teamParam) && teamParam > 0 ? teamParam : undefined
  const club = useClub(key, teamId)
  const [view, setView] = useState<'list' | 'cards'>('list')
  const [fullStats, setFullStats] = useState(false)
  const [flatList, setFlatList] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [selected, setSelected] = useSelectedPlayer()
  const onSort = (k: SortKey) => setSort(s => s?.key !== k ? { key: k, dir: -1 } : s.dir === -1 ? { key: k, dir: 1 } : null)
  const toggleFlatList = (next: boolean) => {
    setFlatList(next)
    if (next && !sort) setSort({ key: 'ovr', dir: -1 })
  }

  if (club.isPending) return <PageLoading title="Kadro yükleniyor…" />
  if (club.isError) return <PageState title="Kadro okunamadı" detail={(club.error as Error).message} retry={() => club.refetch()} />
  const d = club.data

  return (
    <div className="squad-workspace page-enter">
      {teamId !== undefined && teamId !== d.snapshot.userTeamId && (
        <div className="flex items-center justify-between rounded-lg border border-cmt-blurple/40 bg-cmt-blurple/10 px-4 py-2 text-xs text-gray-200">
          <span>Başka bir kulübün kadrosu: <b className="text-cmt-text">{d.club.name}</b> · {d.club.league ?? ''}</span>
          <span className="flex gap-3"><Link to={`/club-review?team=${teamId}`} className="font-semibold text-cmt-blurple hover:underline">Kulüp incelemesi</Link><Link to="/scout?view=teams" className="text-cmt-blurple hover:underline">Takımlar</Link><Link to="/squad" className="text-cmt-blurple hover:underline">Kendi kadrom</Link></span>
        </div>
      )}
      <SquadHeader d={d} view={view} setView={setView} fullStats={fullStats} setFullStats={setFullStats}
        flatList={flatList} setFlatList={toggleFlatList} sort={sort} onSort={onSort} />
      <div className="squad-layout">
        <div className="squad-roster">
          <div key={view} className="view-swap">{view === 'list'
            ? <SquadTables d={d} hovered={hovered} setHovered={setHovered} open={setSelected} fullStats={fullStats} flatList={flatList} sort={sort} onSort={onSort} />
            : <SquadCards d={d} hovered={hovered} setHovered={setHovered} open={setSelected} flatList={flatList} sort={sort} />}</div>
          <LoanedOut d={d} open={setSelected} />
        </div>
        <div className="squad-sidebar">
          <StartingXi d={d} hovered={hovered} setHovered={setHovered} open={setSelected} />
          <SetPieces d={d} open={setSelected} />
          <ClubRatings d={d} />
        </div>
      </div>
      {selected !== null && <PlayerDrawer playerId={selected} saveUid={key} onClose={() => setSelected(null)} />}
    </div>
  )
}

/** Shows the shape of what is coming instead of a sentence on an empty page. */
export function PageLoading({ title }: { title: string }) {
  return (
    <div className="page-loading" role="status">
      <p>{title}</p>
      <div aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
    </div>
  )
}

export function PageState({ title, detail, retry }: { title: string; detail?: string; retry?: () => void }) {
  return (
    <div className="career-empty" role="status">
      <h1>{title}</h1>
      {detail && <p>{detail}</p>}
      {retry && <button className="btn" onClick={retry}>Yeniden dene</button>}
    </div>
  )
}

function SquadHeader({ d, view, setView, fullStats, setFullStats, flatList, setFlatList, sort, onSort }: {
  d: ClubView; view: string; setView: (v: 'list' | 'cards') => void; fullStats: boolean; setFullStats: (v: boolean) => void
  flatList: boolean; setFlatList: (v: boolean) => void; sort: { key: SortKey; dir: 1 | -1 } | null; onSort: (k: SortKey) => void
}) {
  const s = d.summary
  const stats: [string, string][] = [
    ['OYUNCU', String(s.players)],
    ['ORT. YAŞ', dec1(s.averageAge)],
    ['KADRO DEĞERİ', money(s.squadValue)],
    ['MAAŞLAR', money(s.wages)],
  ]
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-tektur text-2xl font-black uppercase tracking-wider text-cmt-text">KADRO</h2>
        <div className="flex flex-wrap items-end gap-6">
          {stats.map(([label, value]) => (
            <div key={label} className="text-right">
              <div className="font-mono text-[11px] uppercase tracking-wider text-gray-400">{label}</div>
              <div className="font-tektur text-lg font-black text-cmt-text">{value}</div>
            </div>
          ))}
          <div className="flex items-center rounded-md border border-cmt-line bg-cmt-sub p-0.5" role="group" aria-label="Görünüm">
            {([['list', 'Liste', LayoutList], ['cards', 'Kartlar', LayoutGrid]] as const).map(([v, label, Icon]) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition ${view === v ? 'bg-cmt-blurple/25 font-bold text-cmt-text ring-1 ring-cmt-blurple' : 'text-gray-400 hover:text-gray-200'}`}>
                <Icon className="h-3.5 w-3.5" /><span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <button role="switch" aria-checked={flatList} onClick={() => setFlatList(!flatList)} className="flex items-center gap-2 text-gray-200">
          <span className={`relative h-5 w-9 rounded-full transition ${flatList ? 'bg-cmt-blurple' : 'bg-cmt-inner'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${flatList ? 'left-[18px]' : 'left-0.5'}`} />
          </span>
          Tüm oyuncular tek listede
        </button>
        {view === 'list' && (
          <button role="switch" aria-checked={fullStats} onClick={() => setFullStats(!fullStats)} className="flex items-center gap-2 text-gray-200">
            <span className={`relative h-5 w-9 rounded-full transition ${fullStats ? 'bg-cmt-blurple' : 'bg-cmt-inner'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${fullStats ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
            Tüm istatistikler
          </button>
        )}
        {view === 'cards' && flatList && (
          <div className="flex items-center gap-1" role="group" aria-label="Sıralama">
            {([['ovr', 'OVR'], ['pot', 'POT'], ['age', 'YAŞ'], ['value', 'DEĞER'], ['wage', 'MAAŞ']] as const).map(([k, label]) => {
              const active = sort?.key === k
              return (
                <button key={k} type="button" onClick={() => onSort(k)}
                  className={`rounded px-2 py-0.5 font-mono text-[11px] transition ${active ? 'bg-cmt-blurple/25 font-bold text-cmt-text ring-1 ring-cmt-blurple' : 'text-gray-400 hover:text-gray-200'}`}>
                  {label} {active ? (sort!.dir === -1 ? '▼' : '▲') : ''}
                </button>
              )
            })}
          </div>
        )}
        <span className="font-mono text-[11px] text-gray-500">Snapshot · {gameDate(d.snapshot.gameDate)} · değerler tahmini</span>
      </div>
    </div>
  )
}

export interface RowProps {
  d: ClubView
  hovered: number | null
  setHovered: (id: number | null) => void
  open: (id: number) => void
  fullStats?: boolean
  flatList?: boolean
  sort?: { key: SortKey; dir: 1 | -1 } | null
  onSort?: (k: SortKey) => void
}

function grouped(d: ClubView) {
  const inSquad = d.squad.filter(m => m.role !== 'LoanedOut')
  return GROUPS.map(g => {
    const members = inSquad.filter(m => (m.player.positionGroup ?? 'MID') === g)
    const ovr = members.map(m => m.player.overall).filter((v): v is number => v !== null)
    return {
      key: g, title: GROUP_TITLES[g], members,
      inXi: members.filter(m => m.role === 'XI').length,
      avg: ovr.length ? ovr.reduce((a, b) => a + b, 0) / ovr.length : null,
    }
  }).filter(g => g.members.length > 0)
}

function RoleBadge({ m }: { m: SquadMember }) {
  if (m.role === 'XI') return <span className="inline-block rounded bg-cmt-blurple px-2.5 py-0.5 font-tektur text-[11px] font-bold text-cmt-text shadow-sm" title={m.slot ? `İlk 11 · ${m.slot}` : 'İlk 11'}>XI</span>
  const label = m.role === 'Sub' ? 'Yedek' : m.role === 'Reserve' ? 'Rezerv' : '–'
  return <span className="text-[12px] text-gray-400">{label}</span>
}

function PlayerName({ m, captain }: { m: SquadMember; captain?: boolean }) {
  const p = m.player
  const also = [p.position2].filter(x => x && x !== p.position)
  return (
    <div className="flex items-center gap-3">
      <PlayerAvatar id={p.id} name={p.name} size={40} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[14px] font-semibold text-gray-100">
          <span className="truncate">{p.name}</span>
          {captain && <span className="rounded border border-gray-400 px-1 text-[11px] font-bold leading-4 text-gray-300" title="Kaptan">C</span>}
          {m.injured && <Cross className="h-3 w-3 shrink-0 text-[#ff6460]" aria-label="Sakat" />}
          {m.loanFromTeamId !== null && <span className="rounded bg-[#23cad0]/15 px-1 font-tektur text-[11px] font-bold text-[#23cad0]" title={m.loanEnd ? `Kiralık · ${gameDate(m.loanEnd)} tarihine kadar` : 'Kiralık'}>KİRALIK</span>}
        </div>
        {also.length > 0 && <div className="text-[11px] text-gray-400">Ayrıca {also.join(' · ')}</div>}
      </div>
    </div>
  )
}

type SortKey = 'age' | 'ovr' | 'pot' | 'morale' | 'value' | 'wage' | 'contract'
const SORT_VALUE: Record<SortKey, (m: SquadMember) => number | null> = {
  age: m => m.player.age, ovr: m => m.player.overall, pot: m => m.player.potential, morale: m => m.morale?.value ?? null,
  value: m => m.player.value, wage: m => m.player.wage, contract: m => m.player.contractEnd,
}

/** Moral: değer ve renk; ayrıntı (mizaç, bileşenler, olaylar) ipucunda. */
function MoraleCell({ m }: { m: SquadMember }) {
  const mo = m.morale
  if (!mo) return <span className="text-gray-600">–</span>
  const tone = moraleTone(mo.value)
  const tip = [`Mizaç: ${TEMPERAMENT[mo.temperament ?? -1] ?? '–'}`, `Takım performansı ${mo.teamPerformance ?? '–'}`,
    `Oyuncu performansı ${mo.playerPerformance ?? '–'}`, `Sözleşme ${mo.contract ?? '–'}`, `Oynama süresi ${mo.playingTime ?? '–'}`,
    ...mo.events.map(moraleEvent)].join('\n')
  return (
    <span title={tip} className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${tone.bg}`} />
      <span className={`font-tektur text-[14px] font-bold ${tone.text}`}>{mo.value}</span>
      {mo.events.length > 0 && <span className="text-[11px] text-[#ff860a]" aria-label={mo.events.map(moraleEvent).join(', ')}>!</span>}
    </span>
  )
}

/** Sıralanabilir sütun başlığı: ilk tık büyükten küçüğe, ikinci küçükten büyüğe, üçüncü varsayılan sıra. */
function SortTh({ k, label, sort, onSort, className = '' }: { k: SortKey; label: string; sort: { key: SortKey; dir: 1 | -1 } | null; onSort: (k: SortKey) => void; className?: string }) {
  const active = sort?.key === k
  return (
    <th className={className} aria-sort={active ? (sort!.dir === -1 ? 'descending' : 'ascending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-cmt-text ${active ? 'text-cmt-text' : ''}`}>
        {label}<span className={`text-[11px] ${active ? 'text-cmt-blurple' : 'text-gray-600'}`}>{active ? (sort!.dir === -1 ? '▼' : '▲') : '↕'}</span>
      </button>
    </th>
  )
}

function sortMembers(members: SquadMember[], sort: { key: SortKey; dir: 1 | -1 } | null | undefined) {
  if (!sort) return members
  const f = SORT_VALUE[sort.key]
  const tieKey: SortKey | null = sort.key === 'ovr' ? 'pot' : sort.key === 'pot' ? 'ovr' : null
  const tf = tieKey ? SORT_VALUE[tieKey] : null
  // Değeri olmayanlar her iki yönde de en sonda
  return [...members].sort((a, b) => {
    const x = f(a), y = f(b)
    if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1
    if (x !== y) return (x - y) * sort.dir
    if (tf) {
      const tx = tf(a), ty = tf(b)
      if (tx !== null && ty !== null && tx !== ty) return (tx - ty) * sort.dir
    }
    return 0
  })
}

export function SquadTables({ d, hovered, setHovered, open, fullStats, flatList, sort: externalSort, onSort: externalOnSort }: RowProps) {
  const season = d.snapshot.seasonEndYear
  const hasStats = fullStats === true
  const captainId = d.setPieces.find(x => x.role === 'captain')?.playerId
  const [localSort, setLocalSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)
  const sort = externalSort !== undefined ? externalSort : localSort
  const hasMorale = d.squad.some(m => m.morale)
  const onSort = externalOnSort ?? ((k: SortKey) => setLocalSort(s => s?.key !== k ? { key: k, dir: -1 } : s.dir === -1 ? { key: k, dir: 1 } : null))
  const ordered = (members: SquadMember[]) => sortMembers(members, sort)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const columns = 12 + (hasMorale ? 1 : 0) + (hasStats ? 4 : 0)
  const inSquad = d.squad.filter(m => m.role !== 'LoanedOut')
  const sections = flatList
    ? [{ key: 'ALL', title: 'TÜM OYUNCULAR', members: inSquad, inXi: inSquad.filter(m => m.role === 'XI').length, avg: null, hideHeader: true }]
    : grouped(d).map(sec => ({ ...sec, hideHeader: false }))
  return <div className="squad-table-wrap">
    <table className="squad-table">
      <thead><tr>
        <th>#</th><th>OYUNCU</th><th>POZ</th><th>ROL</th><th>ÜLKE</th>
        <SortTh k="age" label="YAŞ" sort={sort} onSort={onSort} />
        <SortTh k="ovr" label="OVR" sort={sort} onSort={onSort} />
        <SortTh k="pot" label="POT" sort={sort} onSort={onSort} />
        {hasMorale && <SortTh k="morale" label="MORAL" sort={sort} onSort={onSort} />}
        {hasStats && <><th>FORM</th><th>MAÇ</th><th>DK</th><th>ORT</th></>}
        <SortTh k="value" label="DEĞER" sort={sort} onSort={onSort} className="right" />
        <SortTh k="wage" label="MAAŞ" sort={sort} onSort={onSort} className="right" />
        <SortTh k="contract" label="SÖZLEŞME" sort={sort} onSort={onSort} className="right" /><th>İST.</th>
      </tr></thead>
      {sections.map(sec => <tbody key={sec.key}>
        {!sec.hideHeader && <tr className="squad-group"><th colSpan={columns} scope="rowgroup"><div><b>{sec.title}</b><span>{sec.members.length} oyuncu · {sec.inXi} ilk 11'de · ort. OVR {dec1(sec.avg)}</span></div></th></tr>}
        {ordered(sec.members).map(m => {
          const p = m.player
          const expiring = p.contractEnd !== null && p.contractEnd <= season
          return <Fragment key={p.id}>
            <tr tabIndex={0} onClick={() => open(p.id)} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) open(p.id) }}
              onMouseEnter={() => setHovered(p.id)} onMouseLeave={() => setHovered(null)}
              className={`squad-row ${hovered === p.id ? 'is-hovered' : ''} ${m.role === 'XI' ? 'is-starter' : ''}`}>
              <td className="squad-jersey">{m.jersey ?? '–'}</td>
              <td className="squad-player-name"><PlayerName m={m} captain={p.id === captainId} /></td>
              <td className="squad-pos">{p.position ?? '–'}</td><td><RoleBadge m={m} /></td>
              <td><Flag code={p.nationCode} name={p.nation} nationId={p.nationId} /></td>
              <td>{p.age ?? '–'}</td><td><RatingChip value={p.overall} /></td><td><RatingChip value={p.potential} /></td>
              {hasMorale && <td><MoraleCell m={m} /></td>}
              {hasStats && <><td><FormArrow value={m.form} /></td><td>{m.appearances ?? '–'}</td><td>{m.minutes ?? '–'}</td><td>{m.averageRating?.toFixed(2) ?? '–'}</td></>}
              <td className="right squad-value">{money(p.value)}</td><td className="right squad-wage">{money(p.wage)}</td>
              <td className={`right squad-contract ${expiring ? 'is-expiring' : ''}`}>{p.contractEnd ? `Haz ${p.contractEnd}` : '–'}</td>
              <td><button type="button" className="squad-expand" aria-label={`${p.name}: istatistikler`} aria-expanded={!!expanded[p.id]}
                onClick={e => { e.stopPropagation(); setExpanded(v => ({ ...v, [p.id]: !v[p.id] })) }}><ChevronDown size={16} className={expanded[p.id] ? 'rotate-180' : ''} /></button></td>
            </tr>
            {expanded[p.id] && <tr className="squad-stats-row"><td colSpan={columns}><SquadPlayerStats m={m} careerKey={d.snapshot.careerKey ?? d.snapshot.saveUid} /></td></tr>}
          </Fragment>
        })}
      </tbody>)}
    </table>
  </div>
}

function SquadPlayerStats({ m, careerKey }: { m: SquadMember; careerKey: string }) {
  const detail = usePlayerDetail(m.player.id, careerKey)
  const stats = detail.data?.stats
  if (detail.isPending) return <p role="status">İstatistikler yükleniyor…</p>
  if (detail.isError) return <p role="alert">İstatistikler okunamadı. <button onClick={() => detail.refetch()}>Yeniden dene</button></p>
  return <table className="squad-season-stats"><thead><tr><th>YARIŞMA</th><th>MAÇ</th><th>GOL</th><th>ASİST</th><th>GOL YEMEME</th><th>SARI</th><th>KIRMIZI</th><th>DK</th><th>ORT</th></tr></thead>
    <tbody>{stats?.competitions?.length ? stats.competitions.map((c,i) => <tr key={i}><td>{c.competition ?? 'Yarışma bilgisi yok'}</td><td>{c.appearances ?? '–'}</td><td>{c.goals ?? '–'}</td><td>{c.assists ?? '–'}</td><td>{c.cleanSheets ?? '–'}</td><td>{c.yellow ?? '–'}</td><td>{c.red ?? '–'}</td><td>{c.minutes ?? '–'}</td><td>{c.averageRating?.toFixed(2) ?? '–'}</td></tr>) : <tr><td colSpan={9}>Bu oyuncu için kayıtlı yarışma istatistiği yok.</td></tr>}</tbody>
    {stats && stats.source !== 'save' && <caption>Kariyer öncesi · oyunun başlangıç verisi</caption>}
  </table>
}

function SquadCards({ d, hovered, setHovered, open, flatList, sort }: RowProps) {
  if (flatList) {
    const members = sortMembers(d.squad.filter(m => m.role !== 'LoanedOut'), sort)
    return (
      <div className="grid grid-cols-2 gap-[14px] sm:grid-cols-3 lg:grid-cols-5">
        {members.map(m => (
          <FutCard key={m.player.id} p={m.player} jersey={m.jersey} loan={m.loanFromTeamId !== null}
            highlight={hovered === m.player.id} onClick={() => open(m.player.id)} onHover={on => setHovered(on ? m.player.id : null)} />
        ))}
      </div>
    )
  }
  return <>
    {grouped(d).map(sec => (
      <div key={sec.key} className="space-y-3">
        <div className="flex items-center gap-2 border-b border-cmt-line pb-2">
          <span className="font-tektur text-sm font-black uppercase tracking-wider text-cmt-text">{sec.title}</span>
          <span className="rounded bg-cmt-card px-1.5 font-mono text-[11px] text-gray-300">{sec.members.length}</span>
        </div>
        <div className="grid grid-cols-2 gap-[14px] sm:grid-cols-3 lg:grid-cols-5">
          {sortMembers(sec.members, sort).map(m => (
            <FutCard key={m.player.id} p={m.player} jersey={m.jersey} loan={m.loanFromTeamId !== null}
              highlight={hovered === m.player.id} onClick={() => open(m.player.id)} onHover={on => setHovered(on ? m.player.id : null)} />
          ))}
        </div>
      </div>
    ))}
  </>
}

function LoanedOut({ d, open }: { d: ClubView; open: (id: number) => void }) {
  const out = d.squad.filter(m => m.role === 'LoanedOut')
  if (out.length === 0) return null
  return (
    <div className="overflow-hidden rounded-xl border border-cmt-line bg-cmt-sub">
      <div className="flex items-center justify-between border-b border-cmt-line bg-cmt-black px-4 py-2.5">
        <span className="font-tektur text-sm font-black uppercase tracking-wider text-cmt-text">KİRALIKTA</span>
        <span className="font-mono text-[11px] text-gray-400">{out.length} oyuncu</span>
      </div>
      <ul className="divide-y divide-cmt-line text-xs">
        {out.map(m => (
          <li key={m.player.id}>
            <button className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-cmt-card" onClick={() => open(m.player.id)}>
              <span className="flex items-center gap-2.5"><PlayerAvatar id={m.player.id} name={m.player.name} />
                <span><span className="font-semibold text-gray-200">{m.player.name}</span>
                  <span className="block text-[11px] text-gray-400">{m.player.club ?? '–'}{m.loanEnd ? ` · ${gameDate(m.loanEnd)} tarihine kadar` : ''}</span></span>
              </span>
              <span className="flex items-center gap-2"><span className="font-mono text-gray-400">{m.player.position}</span><RatingChip value={m.player.overall} /><RatingChip value={m.player.potential} /></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StartingXi({ d, hovered, setHovered, open }: RowProps) {
  const xi = d.squad.filter(m => m.role === 'XI' && m.slot)
  const formation = formationOf(xi.map(m => m.slot!))
  const hoveredStarter = xi.find(m => m.player.id === hovered)
  const depth = useMemo(() => hoveredStarter ? lineupDepth(hoveredStarter, d.squad) : [], [d.squad, hoveredStarter])

  return (
    <div className="overflow-hidden rounded-xl border border-cmt-line bg-cmt-sub shadow-sm">
      <div className="flex items-center justify-between border-b border-cmt-line bg-cmt-black px-4 py-3">
        <span className="font-tektur text-xs font-black uppercase tracking-wider text-cmt-text">İLK 11</span>
        {formation && <span className="rounded border border-cmt-line bg-cmt-card px-2 py-0.5 font-mono text-[11px] font-bold text-gray-300">{formation}</span>}
      </div>
      {xi.length === 0 ? <p className="p-4 text-xs text-gray-400">Oyunun kadro tablosunda ilk 11 bilgisi yok.</p> : (
        <LineupPitch members={xi} squad={d.squad} open={open} hovered={hovered} onHover={setHovered} captainId={d.setPieces.find(s => s.role === 'captain')?.playerId} />
      )}
      <div className="border-t border-cmt-line bg-cmt-black p-3 text-xs">
        <div className="flex items-center justify-between text-gray-300">
          <span><span className="font-mono text-[11px] uppercase text-gray-400">İLK 11 ORT. </span><b className="text-cmt-text">{dec1(d.summary.bestXiAverage)}</b></span>
          {d.club.buildUpPlayLabel && <span><span className="font-mono text-[11px] uppercase text-gray-400">OYUN KURMA </span><b className="text-cmt-text">{d.club.buildUpPlayLabel}</b></span>}
          {d.club.defensiveDepth !== null && <span><span className="font-mono text-[11px] uppercase text-gray-400">SAV. DERİNLİĞİ </span><b className="text-cmt-text">{d.club.defensiveDepth}</b></span>}
        </div>
        {hoveredStarter ? (
          <div className="mt-2">
            <span className="font-mono text-[11px] uppercase text-gray-400">{slotPosition(hoveredStarter.slot)} derinliği: </span>
            {depth.length === 0 ? <span className="text-gray-500">yedek yok</span>
              : depth.map(m => <span key={m.player.id} className="mr-2 text-gray-200">{m.player.name} <b className="font-mono">{m.player.overall}</b></span>)}
          </div>
        ) : <p className="mt-1.5 text-[11px] italic text-gray-400">Bir oyuncunun üzerine gel: o mevkideki derinlik görünür. Yerler mevki uyumuna göre hesaplanır.</p>}
      </div>
    </div>
  )
}

function SetPieces({ d, open }: { d: ClubView; open: (id: number) => void }) {
  if (d.setPieces.length === 0) return null
  return (
    <div className="overflow-hidden rounded-xl border border-cmt-line bg-cmt-sub shadow-sm">
      <div className="border-b border-cmt-line bg-cmt-black px-4 py-2.5">
        <span className="font-tektur text-xs font-black uppercase tracking-wider text-cmt-text">KAPTAN VE DURAN TOPLAR</span>
      </div>
      <div className="divide-y divide-cmt-line p-2 text-xs">
        {d.setPieces.filter(s => s.role !== 'cornerSupport').map(s => (
          <button key={s.role} onClick={() => open(s.playerId)} className="flex w-full items-center justify-between rounded px-2 py-2 text-left transition hover:bg-cmt-card">
            <span className="font-mono text-[11px] font-bold uppercase text-gray-400">{SET_PIECE_LABELS[s.role] ?? s.role}</span>
            <span className="flex items-center gap-2">
              <PlayerAvatar id={s.playerId} name={s.name} size={24} />
              <span className="font-medium text-gray-200">{s.name}</span>
              <RatingChip value={s.overall} size="sm" />
            </span>
          </button>
        ))}
      </div>
      <CornerSupport d={d} open={open} />
    </div>
  )
}

/** Korner destek oyuncuları (teams.cksupport1..9). */
export function CornerSupport({ d, open }: { d: ClubView; open: (id: number) => void }) {
  const list = d.setPieces.filter(s => s.role === 'cornerSupport')
  if (list.length === 0) return null
  return (
    <div className="border-t border-cmt-line px-4 py-3 text-xs">
      <div className="mb-1.5 font-mono text-[11px] font-bold uppercase text-gray-400">KORNER DESTEK {list.length}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {list.map(s => <button key={s.playerId} onClick={() => open(s.playerId)} className="flex items-center gap-1.5 text-cmt-blurple hover:underline">
          <PlayerAvatar id={s.playerId} name={s.name} size={18} />{s.name}</button>)}
      </div>
    </div>
  )
}

function ClubRatings({ d }: { d: ClubView }) {
  const items: [string, number | null][] = [['GEN', d.club.overall], ['HÜC', d.club.attack], ['ORT', d.club.midfield], ['DEF', d.club.defense]]
  return (
    <div className="overflow-hidden rounded-xl border border-cmt-line bg-cmt-sub p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-tektur text-xs font-black uppercase tracking-wider text-cmt-text">KULÜP REYTİNGLERİ</span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-gray-400">GENEL <RatingChip value={d.club.overall} size="sm" /></span>
      </div>
      <div className="club-rating-bars">
        {items.map(([label, v]) => <div key={label}><span>{label}</span><i><i className={ratingClass(v)} style={{ width: `${v ?? 0}%` }} /></i><RatingChip value={v} size="sm" /></div>)}
      </div>
      <div className="club-prestige">
        {([['Yurt içi prestij', d.club.domesticPrestige], ['Uluslararası prestij', d.club.internationalPrestige]] as const).map(([label,value]) => <div key={label}><span>{label}</span><b aria-label={`${value ?? 'Bilinmiyor'} / 10`}>{value == null ? '–' : Array.from({length:10}, (_,i) => <i key={i} className={i < value ? 'filled' : ''} />)}</b></div>)}
      </div>
      {d.summary.expiringThisSeason > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[#ffb020]"><ShieldAlert className="h-3.5 w-3.5" />
          {d.summary.expiringThisSeason} oyuncunun sözleşmesi bu sezon sonunda bitiyor.</p>
      )}
    </div>
  )
}
