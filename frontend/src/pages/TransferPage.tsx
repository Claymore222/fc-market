import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PlayerWage } from '../components/PlayerWage'
import { useCareer } from '../App'
import { useClub, usePlayerPage } from '../api/client'
import type { MarketPlayer } from '../api/types'
import { Flag, PlayerAvatar, RatingChip } from '../components/cmt'
import { ClubCrest } from '../components/layout/CareerHeroCard'
import { PlayerDrawer } from '../components/PlayerDrawer'
import { StarButton } from '../components/StarButton'
import { TransferList, TransferSubNav } from '../components/TransferMarketDrawer'
import { useCompare } from '../lib/compare'
import { money } from '../lib/format'

type Tab = 'transfers' | 'free' | 'expiring' | 'budget'
const TABS: { id: Tab; label: string; info: string }[] = [
  { id: 'transfers', label: 'Transferler', info: "Snapshot'lar arasında kulübü değişen oyuncular. Bonservis bedeli verilerde yok." },
  { id: 'free', label: 'Serbest oyuncular', info: 'Kulübü olmayan oyuncular: bonservissiz imzalanabilir.' },
  { id: 'expiring', label: 'Sözleşmesi bitenler', info: 'Sözleşmesi bu sezon sonunda bitenler (serbest oyuncular hariç); ön sözleşme ya da ucuz transfer adayları.' },
  { id: 'budget', label: 'Bütçeme uygun', info: 'Tahmini değeri transfer bütçene sığan, seçtiğin mevki ve yaşta en iyi fırsatlar. Değer tahminidir.' },
]
const GROUPS = [['', 'Tümü'], ['GK', 'Kaleci'], ['DEF', 'Defans'], ['MID', 'Orta saha'], ['ATT', 'Forvet']] as const

/** Transfer merkezi: gözlenen transferler, serbest oyuncular, biten sözleşmeler ve bütçeye uygun oyuncular. */
export function TransferPage() {
  const { key } = useCareer()
  const club = useClub(key)
  const [params, setParams] = useSearchParams()
  const scopeParam = params.get('kapsam') === 'club' ? 'club' : 'world'
  const [tab, setTab] = useState<Tab>('transfers')
  const [selected, setSelected] = useState<number | null>(null)
  const d = club.data
  const setScope = (next: 'club' | 'world') => {
    setParams(prev => {
      const p = new URLSearchParams(prev)
      if (next === 'world') p.delete('kapsam')
      else p.set('kapsam', next)
      return p
    }, { replace: true })
  }
  return (
    <div className="transfer-workspace workspace-roomy space-y-5 page-enter">
      <TransferSubNav />
      <div>
        <h1 className="font-tektur text-xl font-black uppercase tracking-wider text-cmt-text">Transfer piyasası</h1>
        <p className="text-[12px] text-gray-500">{TABS.find(t => t.id === tab)!.info}</p>
      </div>
      <div role="tablist" aria-label="Transfer" className="inline-flex flex-wrap rounded-lg border border-cmt-line bg-cmt-sub p-1 text-[13px]">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`rounded px-3 py-1.5 ${tab === t.id ? 'bg-cmt-blurple font-bold text-cmt-text' : 'text-gray-400 hover:text-gray-200'}`}>{t.label}</button>
        ))}
      </div>
      <section className="overflow-hidden rounded-xl border border-cmt-line bg-cmt-sub">
        {tab === 'transfers' && (d
          ? <TransferList saveUid={key} clubId={d.club.id} clubName={d.club.name} initialScope={scopeParam} onScopeChange={setScope} onPlayer={setSelected} />
          : <p className="p-5 text-sm text-gray-400" role="status">Yükleniyor…</p>)}
        {tab === 'free' && <Players saveUid={key} params={{ freeAgent: 'true', sort: 'ovr,pot', dir: 'desc,desc' }} onOpen={setSelected} />}
        {tab === 'expiring' && d && <Players saveUid={key} onOpen={setSelected}
          params={{ contractEndsBy: String(d.snapshot.seasonEndYear), freeAgent: 'false', sort: 'ovr,pot', dir: 'desc,desc' }} />}
        {tab === 'budget' && d && <Budget saveUid={key} budget={d.snapshot.transferBudget ?? null} xi={d.summary.bestXiAverage ?? null} onOpen={setSelected} />}
      </section>
      {selected !== null && <PlayerDrawer playerId={selected} saveUid={key} onClose={() => setSelected(null)} />}
    </div>
  )
}

function Budget({ saveUid, budget, xi, onOpen }: { saveUid?: string; budget: number | null; xi: number | null; onOpen: (id: number) => void }) {
  const [group, setGroup] = useState('')
  const [ageMax, setAgeMax] = useState(27)
  const [ovrMin, setOvrMin] = useState(Math.max(50, Math.round((xi ?? 70) - 3)))
  if (budget === null) return <p className="p-5 text-sm text-gray-400">Transfer bütçesi bu kayıtta yok (Live Editor export'u gerekir).</p>
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-cmt-line px-5 py-3 text-[12px] text-gray-300">
        <span>Bütçe <b className="text-cmt-text">{money(budget)}</b></span>
        <label className="flex items-center gap-1.5">Mevki
          <select value={group} onChange={e => setGroup(e.target.value)} className="rounded border border-cmt-line bg-cmt-sub px-2 py-1">
            {GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></label>
        <label className="flex items-center gap-1.5">Yaş ≤
          <input type="number" min={16} max={40} value={ageMax} onChange={e => setAgeMax(Number(e.target.value) || 27)} className="w-16 rounded border border-cmt-line bg-cmt-sub px-2 py-1" /></label>
        <label className="flex items-center gap-1.5">OVR ≥
          <input type="number" min={40} max={99} value={ovrMin} onChange={e => setOvrMin(Number(e.target.value) || 60)} className="w-16 rounded border border-cmt-line bg-cmt-sub px-2 py-1" /></label>
        <span className="text-gray-500">Sıra: fırsat skoru</span>
      </div>
      <Players saveUid={saveUid} onOpen={onOpen} params={{ valueMax: String(budget), ageMax: String(ageMax), ovrMin: String(ovrMin), freeAgent: 'false',
        ...(group ? { pos: group } : {}), sort: 'opportunity,pot', dir: 'desc,desc' }} />
    </>
  )
}

function Players({ saveUid, params, onOpen }: { saveUid?: string; params: Record<string, string>; onOpen: (id: number) => void }) {
  const page = usePlayerPage({ ...params, pageSize: '50' }, saveUid)
  const compare = useCompare()
  if (page.isPending) return <p className="p-5 text-sm text-gray-400" role="status">Yükleniyor…</p>
  if (page.isError) return <p className="p-5 text-sm text-[#ff6460]" role="alert">Oyuncular okunamadı.</p>
  const items = page.data.items
  if (items.length === 0) return <p className="p-5 text-sm text-gray-400">Bu ölçütlere uyan oyuncu yok.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead><tr className="border-b border-cmt-line font-mono text-[11px] uppercase text-gray-500">
          <th className="px-5 py-2">Oyuncu</th><th className="py-2">Mevki</th><th className="py-2 text-right">Yaş</th><th className="py-2 text-center">OVR</th>
          <th className="py-2 text-center">POT</th><th className="py-2">Kulüp</th><th className="py-2 text-right">Değer</th><th className="py-2 text-right">Maaş</th>
          <th className="py-2 text-right">Sözleşme</th><th className="px-5 py-2 text-right" /></tr></thead>
        <tbody className="divide-y divide-cmt-line">
          {items.map((p: MarketPlayer) => (
            <tr key={p.id} className="hover:bg-cmt-card">
              <td className="px-5 py-2"><button onClick={() => onOpen(p.id)} className="flex items-center gap-2 text-left font-semibold text-cmt-text hover:text-cmt-blurple">
                <PlayerAvatar id={p.id} name={p.name} size={28} /><span>{p.name}</span><Flag code={p.nationCode} name={p.nation} nationId={p.nationId} /></button></td>
              <td className="py-2 text-gray-300">{p.position ?? '–'}</td>
              <td className="py-2 text-right font-mono text-gray-300">{p.age ?? '–'}</td>
              <td className="py-2 text-center"><RatingChip value={p.overall} size="sm" /></td>
              <td className="py-2 text-center"><RatingChip value={p.potential} size="sm" /></td>
              <td className="max-w-[180px] truncate py-2 text-gray-300">
                <span className="inline-flex items-center gap-1.5">
                  {p.club ? <ClubCrest name={p.club} teamId={p.clubId} size={18} /> : null}
                  <span className="truncate">{p.club ?? '–'}</span>
                </span>
              </td>
              <td className="py-2 text-right font-mono text-gray-200">{money(p.value)}</td>
              <td className="py-2 text-right font-mono text-gray-400"><PlayerWage player={p} /></td>
              <td className="py-2 text-right font-mono text-gray-400">{p.isFreeAgent ? 'Serbest' : p.contractEnd ?? '–'}</td>
              <td className="px-5 py-2 text-right"><span className="inline-flex items-center gap-2">
                <button onClick={() => compare.toggle(p.id)} disabled={!compare.has(p.id) && compare.full} aria-pressed={compare.has(p.id)}
                  aria-label={`${p.name} karşılaştırmaya ${compare.has(p.id) ? 'eklendi' : 'ekle'}`}
                  className={`rounded border px-1.5 py-0.5 text-[11px] ${compare.has(p.id) ? 'border-cmt-blurple text-cmt-text' : 'border-cmt-line text-gray-400 hover:text-cmt-text'} disabled:opacity-40`}>
                  {compare.has(p.id) ? '✓ Kıyas' : '+ Kıyas'}</button>
                <StarButton playerId={p.id} /></span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-cmt-line px-5 py-2 font-mono text-[11px] text-gray-500">{page.data.total} oyuncudan ilk {items.length}</p>
    </div>
  )
}
