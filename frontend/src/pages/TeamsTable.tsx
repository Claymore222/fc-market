import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Search } from 'lucide-react'
import { useSaveUid } from '../App'
import { useTeams } from '../api/client'
import type { TeamRow } from '../api/types'
import { RatingChip } from '../components/cmt'
import { ClubCrest } from '../components/layout/CareerHeroCard'
import { dec1, money } from '../lib/format'
import { useStaggeredEntrance } from '../lib/useStaggeredEntrance'

type Key = 'name' | 'league' | 'overall' | 'attack' | 'midfield' | 'defense' | 'bestXi' | 'players' | 'averageAge' | 'squadValue'
const COLS: { key: Key; label: string; num?: boolean }[] = [
  { key: 'name', label: 'TAKIM' }, { key: 'league', label: 'LİG' }, { key: 'overall', label: 'GEN', num: true },
  { key: 'attack', label: 'HÜC', num: true }, { key: 'midfield', label: 'ORT', num: true }, { key: 'defense', label: 'DEF', num: true },
  { key: 'bestXi', label: 'EN İYİ 11', num: true }, { key: 'players', label: 'OYUNCU', num: true },
  { key: 'averageAge', label: 'ORT. YAŞ', num: true }, { key: 'squadValue', label: 'KADRO DEĞERİ', num: true },
]

/** Scout → Takımlar: CMTracker takım veritabanı. Satıra tıklayınca o kulübün kadrosu açılır. */
export function TeamsTable() {
  const saveUid = useSaveUid()
  const teams = useTeams(saveUid)
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: 'overall', desc: true })

  const rows = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('tr-TR')
    const list = (teams.data?.teams ?? []).filter(t => !term || t.name.toLocaleLowerCase('tr-TR').includes(term)
      || (t.league ?? '').toLocaleLowerCase('tr-TR').includes(term))
    const v = (t: TeamRow) => t[sort.key]
    return [...list].sort((a, b) => {
      const x = v(a), y = v(b)
      if (x === null || x === undefined) return 1
      if (y === null || y === undefined) return -1
      const c = typeof x === 'string' ? x.localeCompare(String(y), 'tr') : (x as number) - (y as number)
      return sort.desc ? -c : c
    })
  }, [teams.data, q, sort])

  const tableRef = useRef<HTMLDivElement>(null)
  useStaggeredEntrance(tableRef, `${saveUid}:${q}:${sort.key}:${sort.desc}`, !teams.isPending && !teams.isError, rows.map(t => t.id).join(','))

  if (teams.isPending) return <p className="p-4 text-sm text-gray-400" role="status">Takımlar yükleniyor…</p>
  if (teams.isError) return <p className="p-4 text-sm text-[#ff6460]" role="alert">Takımlar okunamadı. <button className="btn" onClick={() => teams.refetch()}>Yeniden dene</button></p>

  return (
    <div className="teams-workspace workspace-roomy overflow-hidden rounded-xl border border-cmt-line bg-cmt-sub">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cmt-line px-4 py-3">
        <span className="font-tektur text-lg font-black text-cmt-text">{rows.length.toLocaleString('tr-TR')} <span className="text-sm font-normal text-gray-400">takım</span></span>
        <label className="flex min-w-[260px] items-center gap-2 rounded-md border border-cmt-line bg-cmt-sub px-3 py-1.5 text-xs">
          <Search className="h-3.5 w-3.5 text-gray-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Takım ya da lig ara" className="w-full bg-transparent text-gray-200 outline-none" />
        </label>
      </div>
      <div ref={tableRef} className="max-h-[70vh] overflow-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 z-10 bg-cmt-sub">
            <tr className="border-b border-cmt-line">
              {COLS.map(c => (
                <th key={c.key} className={`px-3 py-2 ${c.num ? 'text-right' : ''}`}>
                  <button onClick={() => setSort(s => ({ key: c.key, desc: s.key === c.key ? !s.desc : c.num === true }))}
                    className={`inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider ${sort.key === c.key ? 'text-cmt-blurple' : 'text-gray-400 hover:text-gray-200'}`}>
                    {c.label}{sort.key === c.key && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-gray-400">EN İYİ OYUNCU</th>
              <th className="px-3 py-2"><span className="sr-only">Kulüp incelemesi</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cmt-line">
            {rows.map(t => (
              <tr key={t.id} data-entrance-row={t.id} tabIndex={0} onClick={() => navigate(`/squad?team=${t.id}`)} onKeyDown={e => e.key === 'Enter' && navigate(`/squad?team=${t.id}`)}
                className={`cursor-pointer hover:bg-cmt-card ${t.isUser ? 'bg-cmt-blurple/10' : ''}`}>
                <td className="px-3 py-2"><span className="flex items-center gap-2.5"><ClubCrest name={t.name} color1={t.color1} color2={t.color2} size={22} teamId={t.id} /><b className="text-cmt-text">{t.name}</b></span></td>
                <td className="px-3 py-2 text-gray-400">{t.league ?? '–'}</td>
                <td className="px-3 py-2 text-right"><RatingChip value={t.overall} size="sm" /></td>
                <td className="px-3 py-2 text-right font-mono text-gray-300">{t.attack ?? '–'}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-300">{t.midfield ?? '–'}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-300">{t.defense ?? '–'}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-200">{dec1(t.bestXi)}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-300">{t.players}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-300">{dec1(t.averageAge)}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-200">{money(t.squadValue)}</td>
                <td className="px-3 py-2 text-gray-300">{t.bestPlayer} <span className="font-mono text-gray-500">{t.bestPlayerOverall ?? ''}</span></td>
                <td className="px-3 py-2 text-right">{!t.isUser && <button type="button" className="btn" aria-label={`${t.name} kulüp incelemesi`}
                  onClick={e => { e.stopPropagation(); navigate(`/club-review?team=${t.id}`) }} onKeyDown={e => e.stopPropagation()}>İncele</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
