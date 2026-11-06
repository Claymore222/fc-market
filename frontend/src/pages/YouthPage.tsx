import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid, LayoutList, Search, Sparkles } from 'lucide-react'
import { useCareer } from '../App'
import { useClub, usePlayerPage } from '../api/client'
import type { MarketPlayer } from '../api/types'
import { PlayerDrawer } from '../components/PlayerDrawer'
import { Flag, PlayerAvatar, RatingChip } from '../components/cmt'
import { dec1, money } from '../lib/format'
import { useSelectedPlayer } from '../lib/selection'
import { PageState, SquadTables } from './SquadPage'
import type { ClubView, SquadMember } from '../api/types'

const YOUTH_AGE = 21

/**
 * Gençler: CMTracker Youth. Gözlemci ağı ve akademi kadrosu (exporter 0.4.0); ek olarak kulübün 21 yaş altı oyuncuları
 * ve ligdeki en yüksek potansiyelli gençler.
 */
export function YouthPage() {
  const { key } = useCareer()
  const club = useClub(key)
  const leagueId = club.data?.club.leagueId
  const league = usePlayerPage({ league: leagueId?.toString(), ageMax: String(YOUTH_AGE), sort: 'pot,ovr', dir: 'desc,desc', pageSize: '12' },
    key, leagueId !== undefined && leagueId !== null)
  const [view, setView] = useState<'list' | 'cards'>('cards')
  const [selected, setSelected] = useSelectedPlayer()

  if (club.isPending) return <PageState title="Gençler yükleniyor…" />
  if (club.isError) return <PageState title="Kulüp okunamadı" detail={(club.error as Error).message} retry={() => club.refetch()} />
  const d = club.data
  const young = d.squad.filter(m => m.role !== 'LoanedOut' && (m.player.age ?? 99) <= YOUTH_AGE)
    .map(m => m.player).sort((a, b) => (b.potential ?? 0) - (a.potential ?? 0))
  const ages = young.map(p => p.age).filter((a): a is number => a !== null)
  const others = (league.data?.items ?? []).filter(p => p.clubId !== d.club.id).slice(0, 8)
  const stats: [string, string][] = [
    ['OYUNCU', String(young.length)],
    ['ORT. YAŞ', dec1(ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null)],
    ['DEĞER', money(young.reduce((n, p) => n + (p.value ?? 0), 0))],
    ['MAAŞLAR', money(young.reduce((n, p) => n + (p.wage ?? 0), 0))],
  ]

  return (
    <div className="youth-workspace space-y-6 page-enter">
      <section className="scouting-network">
        <h3 className="flex items-center gap-2 font-tektur text-sm font-black uppercase tracking-wider text-cmt-text"><Search className="h-4 w-4 text-gray-400" />GÖZLEMCİ AĞI</h3>
        {(d.scouts ?? []).length === 0
          ? <p className="mt-2 text-xs text-gray-400">Bu snapshot'ta gözlemci verisi yok (exporter 0.4.0 ile gelir).</p>
          : <div className="mt-3 flex flex-wrap gap-2">
              {d.scouts!.map(s => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-cmt-line bg-cmt-sub px-3 py-2 text-xs">
                  <Flag code={s.nationCode} name={s.nation} nationId={s.nationId} />
                  <span className="font-semibold text-cmt-text">{s.name}</span>
                  <span className="text-gray-500">DENEYİM <Stars n={s.experience} /></span>
                  <span className="text-gray-500">BİLGİ <Stars n={s.knowledge} /></span>
                </div>
              ))}
            </div>}
      </section>

      <AcademySection d={d} open={setSelected} />
      <details className="youth-extras"><summary>A TAKIM GENÇLERİ VE LİGİN YETENEKLERİ</summary>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-gray-400">{YOUTH_AGE} YAŞ VE ALTI</div>
          <h2 className="font-tektur text-xl font-black uppercase tracking-wider text-cmt-text">GENÇ KADRO</h2>
        </div>
        <div className="flex items-end gap-6 text-right">
          {stats.map(([l, v]) => <div key={l}><div className="font-mono text-[11px] uppercase text-gray-400">{l}</div><div className="font-tektur text-sm font-bold text-cmt-text">{v}</div></div>)}
          <div className="flex items-center rounded-md border border-cmt-line bg-cmt-sub p-0.5" role="group" aria-label="Görünüm">
            {([['list', 'Liste', LayoutList], ['cards', 'Kartlar', LayoutGrid]] as const).map(([v, label, Icon]) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                className={`flex items-center gap-1 rounded px-2.5 py-1 font-tektur text-xs ${view === v ? 'bg-cmt-blurple font-bold text-cmt-text' : 'text-gray-400 hover:text-gray-200'}`}>
                <Icon className="h-3.5 w-3.5" />{label}</button>
            ))}
          </div>
        </div>
      </div>

      {young.length === 0 ? <PageState title={`A takımda ${YOUTH_AGE} yaş altı oyuncu yok`} />
        : view === 'cards' ? <Cards players={young} open={setSelected} /> : <List players={young} open={setSelected} />}

      <div className="flex items-end justify-between pt-2">
        <h2 className="flex items-center gap-2 font-tektur text-lg font-black uppercase tracking-wider text-cmt-text"><Sparkles className="h-4 w-4 text-cmt-blurple" />LİGİN EN İYİ GENÇLERİ</h2>
        <Link to={`/scout?ageMax=${YOUTH_AGE}&potMin=85&sort=pot%2Covr&dir=desc%2Cdesc`} className="font-tektur text-[11px] font-bold text-cmt-blurple hover:underline">TÜM WONDERKIDS →</Link>
      </div>
      {league.isPending ? <p className="text-xs text-gray-500">Yükleniyor…</p> : <Cards players={others} open={setSelected} showClub />}
      </details>
      {selected !== null && <PlayerDrawer playerId={selected} saveUid={key} onClose={() => setSelected(null)} />}
    </div>
  )
}

/** Altyapı akademisi kadrosu: CMTracker'daki gibi Kadro tablosuyla aynı gruplu liste (exporter 0.4.0 verisi). */
function AcademySection({ d, open }: { d: ClubView; open: (id: number) => void }) {
  const academy = d.academy ?? []
  const [hovered, setHovered] = useState<number | null>(null)
  const players = academy.map(a => a.player)
  const ages = players.map(p => p.age).filter((a): a is number => a !== null)
  const members: SquadMember[] = academy.map(a => ({ player: a.player, jersey: null, role: 'Unknown', slot: null, slotRating: null,
    form: null, injured: false, loanFromTeamId: null, loanEnd: null }))
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="font-mono text-[11px] uppercase tracking-wider text-gray-400">ALTYAPI AKADEMİSİ</div>
          <h2 className="font-tektur text-2xl font-black uppercase tracking-wider text-cmt-text">KADRO</h2></div>
        <div className="flex items-end gap-6 text-right">
          {([['OYUNCU', String(players.length)], ['ORT. YAŞ', dec1(ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null)],
            ['KADRO DEĞERİ', money(players.reduce((n, p) => n + (p.value ?? 0), 0))], ['MAAŞLAR', money(players.reduce((n, p) => n + (p.wage ?? 0), 0))]] as const)
            .map(([l, v]) => <div key={l}><div className="font-mono text-[11px] uppercase text-gray-400">{l}</div><div className="font-tektur text-lg font-black text-cmt-text">{v}</div></div>)}
        </div>
      </div>
      {academy.length === 0
        ? <div className="rounded-xl border border-dashed border-cmt-line bg-cmt-sub p-6 text-center text-[13px] text-gray-400">Bu snapshot'ta akademi verisi yok; exporter 0.4.0 ile alınan export'ta görünür.</div>
        : <SquadTables d={{ ...d, squad: members }} hovered={hovered} setHovered={setHovered} open={open} />}
    </section>
  )
}

function Stars({ n }: { n: number | null }) {
  if (n === null) return <span>–</span>
  return <span><span className="text-cmt-blurple">{'★'.repeat(Math.max(0, Math.min(5, n)))}</span><span className="text-gray-600">{'★'.repeat(Math.max(0, 5 - n))}</span></span>
}

function Cards({ players, open, showClub }: { players: MarketPlayer[]; open: (id: number) => void; showClub?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {players.map(p => (
        <button key={p.id} onClick={() => open(p.id)} className="rounded-xl border border-cmt-line bg-cmt-sub p-3 text-left transition hover:border-cmt-blurple">
          <div className="flex items-center justify-between">
            <span className="rounded border border-cmt-line bg-black/50 px-2 py-0.5 font-mono text-xs font-bold text-gray-300">{p.position ?? '–'}</span>
            <span className="flex items-center gap-1"><RatingChip value={p.overall} size="sm" /><RatingChip value={p.potential} size="sm" title="Potansiyel" /></span>
          </div>
          <div className="my-3 flex items-center gap-3">
            <PlayerAvatar id={p.id} name={p.name} size={44} />
            <div className="min-w-0">
              <div className="truncate font-tektur text-sm font-bold text-cmt-text">{p.name}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400"><Flag code={p.nationCode} name={p.nation} nationId={p.nationId} />{p.age} yaş{showClub && p.club ? ` · ${p.club}` : ''}</div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-cmt-line pt-2 text-[11px]">
            <span className="text-gray-400">Gelişim payı <b className="font-mono text-cmt-mint">+{Math.max(0, (p.potential ?? 0) - (p.overall ?? 0))}</b></span>
            <span className="font-mono text-gray-300">{money(p.value)}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

function List({ players, open }: { players: MarketPlayer[]; open: (id: number) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-cmt-line bg-cmt-sub">
      <table className="w-full text-left text-xs">
        <thead><tr className="border-b border-cmt-line bg-cmt-sub font-mono text-[11px] uppercase text-gray-400">
          <th className="px-4 py-2">OYUNCU</th><th className="px-2 py-2">POZ</th><th className="px-2 py-2">YAŞ</th><th className="px-2 py-2">OVR</th>
          <th className="px-2 py-2">POT</th><th className="px-3 py-2 text-right">DEĞER</th><th className="px-4 py-2 text-right">SÖZLEŞME</th></tr></thead>
        <tbody className="divide-y divide-cmt-line">
          {players.map(p => (
            <tr key={p.id} onClick={() => open(p.id)} className="cursor-pointer hover:bg-cmt-card">
              <td className="px-4 py-2"><span className="flex items-center gap-2"><PlayerAvatar id={p.id} name={p.name} size={28} /><span className="text-gray-200">{p.name}</span><Flag code={p.nationCode} name={p.nation} nationId={p.nationId} /></span></td>
              <td className="px-2 py-2 font-mono font-bold text-gray-300">{p.position}</td><td className="px-2 py-2 font-mono text-gray-300">{p.age}</td>
              <td className="px-2 py-2"><RatingChip value={p.overall} /></td><td className="px-2 py-2"><RatingChip value={p.potential} /></td>
              <td className="px-3 py-2 text-right font-mono text-gray-200">{money(p.value)}</td><td className="px-4 py-2 text-right font-mono text-gray-400">{p.contractEnd ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
