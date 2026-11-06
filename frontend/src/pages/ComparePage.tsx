import { useMemo, useState, type ReactNode } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'
import { useCareer } from '../App'
import { get, usePlayerPage } from '../api/client'
import type { HistoryPoint, PlayerDetail } from '../api/types'
import { Flag, PlayerAvatar, RatingChip } from '../components/cmt'
import { EmptyHint } from '../components/EmptyHint'
import { PlayerDrawer } from '../components/PlayerDrawer'
import { PlayStyleIcon } from '../components/PlayStyleIcon'
import { COMPARE_MAX, useCompare } from '../lib/compare'
import { dec2, money, num } from '../lib/format'
import { RECORDED_WAGE_NOTE, wageMoney } from '../components/PlayerWage'

/** Oyuncu başına renk (radar, gelişim çizgisi, başlık şeridi). */
const COLORS = ['var(--fc-accent)', '#32d59b', '#ffb020', '#ff6460']

type Row = { label: string; values: (number | null)[]; format?: (v: number | null) => ReactNode; lowerIsBetter?: boolean }

/**
 * 2–4 oyuncu yan yana: özet, kart değerleri, özellik profili (radar), tüm özellikler, roller/oyun stilleri, bu sezon ve
 * gelişim. Her satırda en iyi değer vurgulanır. Liste tarayıcıda saklanır (oyuncu panelindeki "Karşılaştır").
 */
export function ComparePage() {
  const { key } = useCareer()
  const compare = useCompare()
  const [selected, setSelected] = useState<number | null>(null)
  const details = useQueries({
    queries: compare.ids.map(id => ({ queryKey: ['player', key, id], queryFn: () => get<PlayerDetail>(`/api/players/${id}`, { saveUid: key }), staleTime: Infinity })),
  })
  const histories = useQueries({
    queries: compare.ids.map(id => ({ queryKey: ['history', key, id], queryFn: () => get<HistoryPoint[]>(`/api/players/${id}/history`, { saveUid: key }), staleTime: Infinity })),
  })
  const players = details.map(d => d.data).filter((d): d is PlayerDetail => !!d)
  const ready = players.length === compare.ids.length

  return (
    <div className="compare-workspace workspace-roomy space-y-6 pt-2 page-enter">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-tektur text-xl font-black uppercase tracking-wider text-cmt-text">Karşılaştır</h1>
          <p className="text-[12px] text-gray-500">En fazla {COMPARE_MAX} oyuncu. Oyuncu panelindeki "Karşılaştır" ya da aşağıdaki aramayla ekle.</p>
        </div>
        {compare.ids.length > 0 && <button onClick={compare.clear} className="text-[12px] text-gray-400 hover:text-cmt-text">Listeyi temizle</button>}
      </div>

      {!compare.full && <AddPlayer saveUid={key} exclude={compare.ids} onAdd={compare.toggle} />}

      {compare.ids.length === 0 ? (
        <EmptyHint text="Henüz oyuncu yok. Yukarıdan ara ya da oyuncu detayındaki Karşılaştır düğmesini kullan."><Link className="btn" to="/scout">Scout'ta ara</Link><Link className="btn" to="/shortlist">İzleme listem</Link></EmptyHint>
      ) : !ready ? (
        <p className="text-sm text-gray-400" role="status">Oyuncular yükleniyor…</p>
      ) : (
        <>
          <Header players={players} onRemove={compare.remove} onOpen={setSelected} />
          {players.length < 2 && <p className="text-[12px] text-gray-500">Karşılaştırma için en az bir oyuncu daha ekle.</p>}
          <Section title="Özet"><Table players={players} rows={summaryRows(players)} /></Section>
          {players.some(d => d.player.isFreeAgent && d.player.recordedWage != null) && <p className="text-xs text-amber-200/80">{RECORDED_WAGE_NOTE} Karşılaştırmadaki aktif haftalık maaşa dahil edilmez.</p>}
          <Section title="Kart değerleri (tahmini)"><Table players={players} rows={cardRows(players)} bars /></Section>
          <Section title="Özellik profili"><Radar players={players} /></Section>
          <Section title="Tüm özellikler"><Attributes players={players} /></Section>
          <Section title="Roller ve oyun stilleri"><Styles players={players} /></Section>
          <Section title="Bu sezon (kariyer kaydından)"><Table players={players} rows={seasonRows(players)} /></Section>
          <Section title="Gelişim (OVR)"><History players={players} histories={histories.map(h => h.data ?? [])} /></Section>
        </>
      )}
      {selected !== null && <PlayerDrawer playerId={selected} saveUid={key} onClose={() => setSelected(null)} />}
    </div>
  )
}

function AddPlayer({ saveUid, exclude, onAdd }: { saveUid?: string; exclude: number[]; onAdd: (id: number) => void }) {
  const [q, setQ] = useState('')
  const search = q.trim()
  const page = usePlayerPage({ q: search, sort: 'ovr', dir: 'desc', pageSize: '8' }, saveUid, search.length >= 2)
  const results = (page.data?.items ?? []).filter(p => !exclude.includes(p.id))
  return (
    <div className="relative max-w-md">
      <label className="flex items-center gap-2 rounded-lg border border-cmt-line bg-cmt-sub px-3 py-2">
        <Search className="h-4 w-4 text-gray-500" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Oyuncu ekle (en az 2 harf)…" aria-label="Karşılaştırmaya oyuncu ekle"
          className="w-full bg-transparent text-sm text-cmt-text outline-none placeholder:text-gray-600" />
      </label>
      {search.length >= 2 && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-cmt-line bg-cmt-sub shadow-xl">
          {results.map(p => (
            <li key={p.id}><button onClick={() => { onAdd(p.id); setQ('') }} aria-label={`${p.name} karşılaştırmaya ekle`} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-cmt-card">
              <PlayerAvatar id={p.id} name={p.name} size={26} />
              <span className="min-w-0 flex-1 truncate text-gray-100">{p.name}<span className="ml-2 text-[11px] text-gray-500">{p.position} · {p.club ?? '–'}</span></span>
              <RatingChip value={p.overall} size="sm" /><Plus className="h-4 w-4 text-gray-500" />
            </button></li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-cmt-line bg-cmt-sub">
      <h2 className="border-b border-cmt-line px-4 py-2.5 font-tektur text-xs font-black uppercase tracking-wider text-cmt-text">{title}</h2>
      <div className="overflow-x-auto">{children}</div>
    </section>
  )
}

function grid(n: number) { return { gridTemplateColumns: `minmax(130px, 180px) repeat(${n}, minmax(150px, 1fr))` } }

function Header({ players, onRemove, onOpen }: { players: PlayerDetail[]; onRemove: (id: number) => void; onOpen: (id: number) => void }) {
  return (
    <div className="grid gap-3" style={grid(players.length)}>
      <div />
      {players.map((d, i) => {
        const p = d.player
        return (
          <div key={p.id} className="relative overflow-hidden rounded-xl border border-cmt-line bg-cmt-sub p-3">
            <span className="absolute inset-x-0 top-0 h-1" style={{ background: COLORS[i] }} />
            <button onClick={() => onRemove(p.id)} className="absolute right-2 top-2 text-gray-500 hover:text-cmt-text" aria-label={`${p.name} çıkar`}><X className="h-4 w-4" /></button>
            <button onClick={() => onOpen(p.id)} className="flex w-full flex-col items-center gap-1.5 text-center">
              <PlayerAvatar id={p.id} name={p.name} size={64} />
              <span className="font-tektur text-sm font-black uppercase text-cmt-text">{p.name}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-gray-400"><Flag code={p.nationCode} name={p.nation} nationId={p.nationId} />{p.position} · {p.age ?? '–'} yaş</span>
              <span className="truncate text-[11px] text-gray-500">{p.club ?? '–'}</span>
              <span className="mt-1 flex gap-1.5"><RatingChip value={p.overall} title="OVR" /><RatingChip value={p.potential} title="POT" /></span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Satır: değerler. Değerler farklıysa en iyisi yeşil rozetle ve ikinciye farkıyla (+N) vurgulanır, en kötüsü sönük;
 * hepsi eşitse vurgu yok. bars: 0–99 çubuk.
 */
function Table({ players, rows, bars }: { players: PlayerDetail[]; rows: Row[]; bars?: boolean }) {
  return (
    <div className="divide-y divide-cmt-line text-[13px]">
      {rows.map(r => {
        const known = r.values.filter((v): v is number => v !== null)
        const better = (a: number, b: number) => r.lowerIsBetter ? a < b : a > b
        const sorted = [...new Set(known)].sort((a, b) => better(a, b) ? -1 : 1)
        const differ = known.length > 1 && sorted.length > 1
        const best = differ ? sorted[0] : null
        const worst = differ ? sorted[sorted.length - 1] : null
        const margin = differ ? Math.abs(sorted[0] - sorted[1]) : 0
        return (
          <div key={r.label} className={`grid items-center gap-3 px-4 py-2 ${differ ? '' : 'opacity-70'}`} style={grid(players.length)}>
            <span className="text-gray-400">{r.label}</span>
            {r.values.map((v, i) => {
              const top = v !== null && v === best
              const low = v !== null && v === worst && players.length > 1
              return (
                <span key={i} className={`flex items-center gap-2 font-mono ${top ? 'font-bold text-emerald-300' : low ? 'text-gray-500' : 'text-gray-300'}`}>
                  {bars && v !== null && <span className="h-1.5 flex-1 rounded bg-cmt-card"><span className={`block h-full rounded ${low ? 'opacity-40' : ''}`} style={{ width: `${Math.min(99, v)}%`, background: COLORS[i] }} /></span>}
                  <span className={`shrink-0 rounded px-1.5 py-0.5 ${top ? 'bg-emerald-500/15 ring-1 ring-emerald-500/50' : ''}`}>{r.format ? r.format(v) : num(v)}</span>
                  {top && margin > 0 && <span className="shrink-0 font-tektur text-[11px] text-emerald-400">{r.lowerIsBetter ? '−' : '+'}{r.format ? r.format(margin) : num(margin)}</span>}
                </span>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function summaryRows(players: PlayerDetail[]): Row[] {
  const v = (f: (d: PlayerDetail) => number | null) => players.map(f)
  return [
    { label: 'Genel (OVR)', values: v(d => d.player.overall) },
    { label: 'Potansiyel', values: v(d => d.player.potential) },
    { label: 'Gelişim payı', values: v(d => d.player.potential !== null && d.player.overall !== null ? d.player.potential - d.player.overall : null) },
    { label: 'Yaş', values: v(d => d.player.age), lowerIsBetter: true },
    { label: 'Tahmini değer', values: v(d => d.player.value), format: money, lowerIsBetter: true },
    { label: 'Haftalık maaş', values: v(d => d.player.wage), format: wageMoney, lowerIsBetter: true },
    ...(players.some(d => d.player.isFreeAgent && d.player.recordedWage != null)
      ? [{ label: 'Serbest oyuncu · kayıttaki maaş', values: v(d => d.player.isFreeAgent ? d.player.recordedWage ?? null : null), format: wageMoney }] : []),
    { label: 'Sözleşme (yıl)', values: v(d => d.player.contractYearsLeft) },
    { label: 'Fırsat skoru', values: v(d => d.player.opportunity) },
    { label: 'Zayıf ayak', values: v(d => d.player.weakFoot) },
    { label: 'Beceri hareketi', values: v(d => d.player.skillMoves) },
    { label: 'Boy (cm)', values: v(d => d.player.height) },
  ]
}

function cardRows(players: PlayerDetail[]): Row[] {
  return ([['Hız', 'pace'], ['Şut', 'shooting'], ['Pas', 'passing'], ['Top sürme', 'dribbling'], ['Savunma', 'defending'], ['Fizik', 'physical']] as const)
    .map(([label, k]) => ({ label, values: players.map(d => d.player[k]) }))
}

function seasonRows(players: PlayerDetail[]): Row[] {
  // Yalnız kariyer kaydındaki bu sezon; kariyer öncesi başlangıç verisi (prevcompetitionstats) burada karıştırılmaz.
  const t = (f: (s: NonNullable<PlayerDetail['stats']>['total']) => number | null | undefined) =>
    players.map(d => (d.stats?.source === 'save' ? f(d.stats.total) ?? null : null))
  return [
    { label: 'Maç', values: t(s => s.appearances) },
    { label: 'Dakika', values: t(s => s.minutes) },
    { label: 'Gol', values: t(s => s.goals) },
    { label: 'Asist', values: t(s => s.assists) },
    { label: 'Ortalama puan', values: t(s => s.averageRating), format: dec2 },
    { label: 'Gol yememe', values: t(s => s.cleanSheets) },
  ]
}

function Radar({ players }: { players: PlayerDetail[] }) {
  const groups = players[0]?.attributeGroups.map(g => g.name) ?? []
  if (groups.length < 3) return <p className="p-4 text-sm text-gray-500">Radar için yeterli özellik grubu yok.</p>
  const c = 160, r = 110
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / groups.length
    return [c + Math.cos(a) * v, c + Math.sin(a) * v]
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-6 p-4">
      <svg viewBox="0 0 320 320" className="h-80 w-80" role="img" aria-label="Özellik profilleri">
        {[.25, .5, .75, 1].map(s => <polygon key={s} points={groups.map((_, i) => pt(i, r * s).join(',')).join(' ')} fill="none" stroke="var(--fc-border)" />)}
        {groups.map((g, i) => { const [x, y] = pt(i, r + 22); return <text key={g} x={x} y={y} textAnchor="middle" fill="var(--fc-muted)" fontSize="11">{g}</text> })}
        {players.map((d, pi) => {
          const scores = groups.map(name => d.attributeGroups.find(g => g.name === name)?.score ?? 0)
          return <polygon key={d.player.id} points={scores.map((s, i) => pt(i, r * Math.min(99, s) / 99).join(',')).join(' ')}
            fill={COLORS[pi]} fillOpacity={0.12} stroke={COLORS[pi]} strokeWidth="2" />
        })}
      </svg>
      <ul className="space-y-1.5 text-[12px]">
        {players.map((d, i) => <li key={d.player.id} className="flex items-center gap-2 text-gray-200"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />{d.player.name}</li>)}
      </ul>
    </div>
  )
}

function Attributes({ players }: { players: PlayerDetail[] }) {
  const categories = players[0]?.attributeCategories ?? []
  return (
    <div className="divide-y divide-cmt-line">
      {categories.map(cat => (
        <div key={cat.name}>
          <div className="grid gap-3 bg-cmt-card px-4 py-1.5 font-mono text-[11px] uppercase text-gray-500" style={grid(players.length)}>
            <span>{cat.name}</span>
            {players.map(d => <span key={d.player.id}>{d.attributeCategories?.find(c => c.name === cat.name)?.score ?? '–'}</span>)}
          </div>
          <Table players={players} rows={cat.attributes.map(a => ({
            label: a.label,
            values: players.map(d => d.attributeCategories?.find(c => c.name === cat.name)?.attributes.find(x => x.key === a.key)?.value ?? null),
          }))} bars />
        </div>
      ))}
    </div>
  )
}

function Styles({ players }: { players: PlayerDetail[] }) {
  return (
    <div className="grid gap-3 p-4 text-[12px]" style={grid(players.length)}>
      <span className="text-gray-400">Roller<br />Oyun stilleri</span>
      {players.map(d => {
        const pr = d.profile
        return (
          <div key={d.player.id} className="space-y-2">
            <ul className="space-y-0.5">
              {(pr?.roles ?? []).map(r => <li key={r.code} className="text-gray-200">{r.position && <span className="mr-1 font-mono text-[11px] text-gray-500">{r.position}</span>}{r.name} <b className={r.level >= 2 ? 'text-cmt-mint' : 'text-gray-500'}>{r.level >= 2 ? '++' : '+'}</b></li>)}
              {!(pr?.roles?.length) && <li className="text-gray-600">Rol yok</li>}
            </ul>
            <div className="flex flex-wrap gap-1">
              {(pr?.playStylesPlus ?? []).map(s => <span key={s} className="inline-flex items-center gap-1 rounded border border-[#ffd200]/50 px-1.5 py-0.5 text-[11px] text-[#ffd200]"><PlayStyleIcon name={s} category={pr?.styleCategories?.[s]} plus size={15} />{s}+</span>)}
              {(pr?.playStyles ?? []).map(s => <span key={s} className="inline-flex items-center gap-1 rounded border border-cmt-line px-1.5 py-0.5 text-[11px] text-gray-300"><PlayStyleIcon name={s} category={pr?.styleCategories?.[s]} size={15} />{s}</span>)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function History({ players, histories }: { players: PlayerDetail[]; histories: HistoryPoint[][] }) {
  const series = useMemo(() => histories.map(h => h.filter(x => x.overall !== null).map(x => ({ t: Date.parse(x.gameDate), v: x.overall! }))), [histories])
  const all = series.flat()
  if (all.length < 2) return <p className="p-4 text-sm text-gray-500">Gelişim için en az iki gözlem gerekir (export/kayıt geldikçe dolar).</p>
  const W = 640, H = 200, pad = 28
  const [t0, t1] = [Math.min(...all.map(x => x.t)), Math.max(...all.map(x => x.t))]
  const [v0, v1] = [Math.min(...all.map(x => x.v)) - 2, Math.max(...all.map(x => x.v)) + 2]
  const x = (t: number) => pad + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (W - pad * 2)
  const y = (v: number) => H - pad - (v - v0) / Math.max(1, v1 - v0) * (H - pad * 2)
  return (
    <div className="p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label="OVR gelişimi">
        {[v0, Math.round((v0 + v1) / 2), v1].map(v => <g key={v}><line x1={pad} x2={W - pad} y1={y(v)} y2={y(v)} stroke="var(--fc-border)" /><text x={4} y={y(v) + 3} fill="var(--fc-muted)" fontSize="11">{Math.round(v)}</text></g>)}
        {series.map((s, i) => s.length > 0 && (
          <g key={players[i].player.id}>
            <polyline fill="none" stroke={COLORS[i]} strokeWidth="2" points={s.map(p => `${x(p.t)},${y(p.v)}`).join(' ')} />
            {s.map(p => <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r="2.5" fill={COLORS[i]} />)}
          </g>
        ))}
      </svg>
    </div>
  )
}
