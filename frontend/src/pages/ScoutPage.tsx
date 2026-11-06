import { useEffect, useLayoutEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Shield, Sparkles, User } from 'lucide-react'
import { useCareer } from '../App'
import { MarketPage } from './MarketPage'
import { TeamsTable } from './TeamsTable'
import { RegenList } from '../components/RegenList'
import { SearchBox } from '../components/FilterPanel'

const SAVED_FILTERS = 'fcm.scout.filters'

function filtersOf(params: URLSearchParams) {
  const filters = new URLSearchParams(params)
  filters.delete('player')
  return filters.toString()
}

function savedFilters(key: string) {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}

function saveFilters(key: string, filters: string) {
  try {
    if (filters) localStorage.setItem(key, filters)
    else localStorage.removeItem(key)
  } catch { /* filtreler yalnız URL'de kalır */ }
}

/** Filters live in the URL; a bare return to the page restores the last ones for this career. */
function restoredSearch(params: URLSearchParams, key: string) {
  const saved = savedFilters(key)
  if (filtersOf(params) || !saved) return null
  const next = new URLSearchParams(saved)
  const player = params.get('player')
  if (player) next.set('player', player)
  return next.toString()
}

/** One query/filter engine for both /scout and the legacy /market URL. */
export function ScoutPage() {
  const [params, setParams] = useSearchParams()
  const { key: career } = useCareer()
  const storageKey = `${SAVED_FILTERS}:${career ?? 'default'}`
  const [restore] = useState(() => restoredSearch(params, storageKey))
  const [ready, setReady] = useState(restore === null)
  const search = params.toString()
  useLayoutEffect(() => {
    if (ready) return
    if (search === restore) setReady(true)
    else setParams(new URLSearchParams(restore ?? ''), { replace: true })
  }, [ready, restore, search, setParams])
  useEffect(() => {
    if (ready) saveFilters(storageKey, filtersOf(params))
  }, [params, ready, storageKey])
  if (!ready) return null
  const view = params.get('view') === 'teams' ? 'teams' : params.get('view') === 'regens' ? 'regens' : 'players'
  return (
    <section className="scout-workspace page-enter" aria-label="Scout">
      <div className="scout-search-bar">
        <div className="scout-database-tabs" role="tablist" aria-label="Veritabanı">
          {([['players', 'Oyuncular', User], ['teams', 'Takımlar', Shield], ['regens', 'Regenler', Sparkles]] as const).map(([id, label, Icon]) => (
            <button key={label} role="tab" aria-selected={view === id} onClick={() => setParams(id === 'players' ? {} : { view: id })}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs ${view === id ? 'bg-cmt-blurple/20 font-bold text-cmt-text ring-1 ring-cmt-blurple' : 'text-gray-400 hover:text-gray-200'}`}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
        {view === 'players' && <SearchBox value={params.get('q') ?? ''} onChange={q => setParams(prev => { const next = new URLSearchParams(prev); q ? next.set('q',q) : next.delete('q'); return next }, { replace: true })} />}
      </div>
      {view === 'teams' ? <TeamsTable /> : view === 'regens' ? <RegenList /> : <MarketPage />}
    </section>
  )
}
