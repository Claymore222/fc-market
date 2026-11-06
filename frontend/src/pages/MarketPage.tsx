import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useFilterOptions, usePlayerPage, usePlayerRows } from '../api/client'
import type { MarketPlayer } from '../api/types'
import { useSaveUid } from '../App'
import { useSelectedPlayer } from '../lib/selection'
import { COLUMNS, type Column } from '../components/columns'
import { FilterPanel } from '../components/FilterPanel'
import { ColumnsIcon, FilterIcon } from '../components/Icons'
import { PlayerDrawer } from '../components/PlayerDrawer'
import { FutCard } from '../components/cmt'
import { PlayerTable } from '../components/PlayerTable'
import { FILTER_KEYS, nextSort, readFilters, readSort, writeSort, type Filters } from '../lib/filters'
import { num } from '../lib/format'
import { t } from '../lib/i18n'
import { useStaggeredEntrance } from '../lib/useStaggeredEntrance'

const COLS_KEY = 'fcm.columns'

/** styles.css'teki tablet kırılımıyla aynı: bu genişliğin altında filtre paneli katman olarak açılır. */
const overlayMedia = window.matchMedia('(max-width: 1199px)')

const CARD_COLUMNS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy']
const GK_COLUMNS = ['gkDiving', 'gkHandling', 'gkKicking', 'gkReflexes', 'gkPositioning']

/**
 * Kayıtlı sütun seçimi { visible, known }. Kayıttan sonra eklenen varsayılan sütunlar (known'da olmayan) görünür gelir.
 * Eski kayıt düz dizi: kart değeri sütunlarından önceki sürüm.
 */
function loadColumns(): string[] {
  const defaults = COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id)
  try {
    const saved = JSON.parse(localStorage.getItem(COLS_KEY) ?? 'null')
    const visible: unknown = Array.isArray(saved) ? saved : saved?.visible
    const known: string[] = Array.isArray(saved) ? COLUMNS.map((c) => c.id).filter((id) => !CARD_COLUMNS.includes(id))
      : Array.isArray(saved?.known) ? saved.known : []
    if (Array.isArray(visible)) return [...visible, ...defaults.filter((id) => !known.includes(id) && !visible.includes(id))]
  } catch { /* yok say */ }
  return defaults
}

export function MarketPage() {
  const saveUid = useSaveUid()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => readFilters(params), [params])
  const sort = readSort(filters)
  const rawId = Number(params.get('player'))
  const selectedId = Number.isSafeInteger(rawId) && rawId > 0 ? rawId : null

  const options = useFilterOptions(saveUid)
  const [range, setRange] = useState<[number, number]>([0, 40])
  const rows = usePlayerRows(filters as Record<string, string>, saveUid, range)

  const [visibleIds, setVisibleIds] = useState(loadColumns)
  const goalkeeperView = filters.pos?.split(',').filter(Boolean).every(pos => pos === 'GK') === true
  const automaticIds = goalkeeperView ? GK_COLUMNS : []
  const columnPriority = goalkeeperView ? ['name', 'ovr', 'pot', ...GK_COLUMNS] : []
  const columns = COLUMNS.filter((c) => c.locked || visibleIds.includes(c.id) || automaticIds.includes(c.id))
    .sort((a, b) => (columnPriority.includes(a.id) ? columnPriority.indexOf(a.id) : 100) - (columnPriority.includes(b.id) ? columnPriority.indexOf(b.id) : 100))
  useEffect(() => {
    try { localStorage.setItem(COLS_KEY, JSON.stringify({ visible: visibleIds, known: COLUMNS.map((c) => c.id) })) } catch { /* yok say */ }
  }, [visibleIds])

  const [showFilters, setShowFilters] = useState(() => !overlayMedia.matches)

  // Dar ekranda panel tablonun üstünde durur: Esc ile kapanır.
  useEffect(() => {
    if (!showFilters) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && overlayMedia.matches && !document.querySelector('.drawer, .player-panel')) setShowFilters(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showFilters])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  /** URL'yi güncelle: filtreler birebir API parametresi, `player` drawer'ı açık tutar. */
  const update = useCallback(
    (patch: Filters, replaceAll = false) => {
      setParams((prev) => {
        const next = new URLSearchParams()
        const base: Filters = replaceAll ? {} : readFilters(prev)
        const merged = { ...base, ...patch }
        for (const k of FILTER_KEYS) if (merged[k]) next.set(k, merged[k]!)
        const player = prev.get('player')
        if (player) next.set('player', player)
        return next
      }, { replace: true })
    },
    [setParams],
  )

  const [, setSelectedPlayer] = useSelectedPlayer()
  const select = useCallback(
    (p: MarketPlayer | null, index: number | null) => {
      setSelectedIndex(index)
      setSelectedPlayer(p?.id ?? null, { swap: selectedId !== null })
    },
    [setSelectedPlayer, selectedId],
  )

  const onSort = (col: Column, additive: boolean) =>
    update(writeSort(nextSort(sort, col.sortKey!, col.defaultDir ?? 'desc', additive)))

  // ↑/↓ ile drawer açıkken önceki/sonraki oyuncu.
  const getRowRef = useRef(rows.getRow)
  getRowRef.current = rows.getRow
  useEffect(() => {
    if (selectedId === null || selectedIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if ((e.target as HTMLElement).closest('input, select, textarea')) return
      const i = selectedIndex + (e.key === 'ArrowDown' ? 1 : -1)
      const p = getRowRef.current(i)
      if (p) {
        e.preventDefault()
        select(p, i)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedId, selectedIndex, select])

  const grid = params.get('layout') === 'grid'
  const setLayout = (g: boolean) => setParams(prev => {
    const next = new URLSearchParams(prev)
    if (g) next.set('layout', 'grid'); else next.delete('layout')
    return next
  }, { replace: true })

  const filterKey = JSON.stringify(filters)
  useEffect(() => { setSelectedIndex(null); setRange([0, 40]) }, [filterKey, saveUid])
  const seasonEndYear = options.data?.snapshot.seasonEndYear ?? rows.snapshot?.seasonEndYear

  return (
    <div className={`market${showFilters ? '' : ' filters-hidden'}`}>
      <FilterPanel
        filters={filters}
        options={options.data}
        onChange={(p) => update(p)}
        onReplace={(f) => update(f, true)}
        onClose={() => setShowFilters(false)}
      />
      {showFilters && <div className="filters-scrim" onClick={() => setShowFilters(false)} aria-hidden="true" />}

      <section className="table-area">
        <div className="toolbar">
          <button className="icon-btn" onClick={() => setShowFilters(!showFilters)} aria-label={t('filters.title')} aria-pressed={showFilters}>
            <FilterIcon />
          </button>
          <span className="count num" aria-live="polite">{t('table.count', { n: num(rows.total) })}</span>
          <div className="sort-pills">
            {sort.map((s, i) => {
              const col = COLUMNS.find((c) => c.sortKey === s.key)
              return (
                <span className="sort-pill" key={s.key}>
                  {sort.length > 1 && <span className="muted">{i + 1}.</span>}
                  {col ? t(col.label) : s.key} {s.dir === 'asc' ? '▲' : '▼'}
                </span>
              )
            })}
          </div>
          <span className="spacer" />
          <div className="flex items-center rounded-md border border-cmt-line bg-cmt-sub p-0.5" role="group" aria-label="Görünüm">
            {([[false, 'Liste'], [true, 'Izgara']] as const).map(([g, label]) => (
              <button key={label} aria-pressed={grid === g} onClick={() => setLayout(g)}
                className={`rounded px-3 py-1 text-xs ${grid === g ? 'bg-cmt-blurple/25 font-bold text-cmt-text ring-1 ring-cmt-blurple' : 'text-gray-400 hover:text-gray-200'}`}>{label}</button>
            ))}
          </div>
          {!grid && <button className="btn" disabled={rows.isFetching} onClick={rows.refetch}>{rows.isFetching ? 'Yükleniyor…' : 'Yenile'}</button>}
          {!grid && <ColumnPicker visible={visibleIds} automatic={automaticIds} onChange={setVisibleIds} />}
        </div>

        {grid ? <PlayerGrid filters={filters as Record<string, string>} saveUid={saveUid} onSelect={p => select(p, null)} /> : <PlayerTable
          columns={columns}
          total={rows.total}
          getRow={rows.getRow}
          sort={sort}
          onSort={onSort}
          selectedId={selectedId}
          onSelect={(p, i) => (p.id === selectedId ? select(null, null) : select(p, i))}
          onRangeChange={setRange}
          seasonEndYear={seasonEndYear}
          resetKey={filterKey + (saveUid ?? '')}
          scrollToIndex={selectedIndex}
          loading={rows.isLoading || rows.isPlaceholderData}
          error={rows.error?.message ?? null}
        />}
      </section>

      {selectedId !== null && (
        <PlayerDrawer playerId={selectedId} saveUid={saveUid} onClose={() => select(null, null)} />
      )}
    </div>
  )
}

const GRID_PAGE = 24

/** Scout ızgarası: CMTracker Grid. Aynı filtre ve sıralama, sayfa sayfa FUT kartları. */
function PlayerGrid({ filters, saveUid, onSelect }: { filters: Record<string, string>; saveUid?: string; onSelect: (p: MarketPlayer) => void }) {
  const [page, setPage] = useState(1)
  const key = JSON.stringify(filters)
  useEffect(() => setPage(1), [key])
  const res = usePlayerPage({ ...filters, page: String(page), pageSize: String(GRID_PAGE) }, saveUid)
  const gridRef = useRef<HTMLDivElement>(null)
  useStaggeredEntrance(gridRef, `${saveUid}:${key}:${page}`, !res.isPending && !res.isError, res.data?.items.map(p => p.id).join(',') ?? '')
  const total = res.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / GRID_PAGE))
  const from = total === 0 ? 0 : (page - 1) * GRID_PAGE + 1
  if (res.isError) return <p className="p-4 text-[#ff6460]" role="alert">Liste yüklenemedi: {(res.error as Error).message}</p>
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-end gap-2 font-mono text-xs text-gray-300">
        <span>{num(from)}–{num(Math.min(page * GRID_PAGE, total))} / {num(total)}</span>
        <button className="btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Önceki sayfa">‹</button>
        <button className="btn" disabled={page >= pages} onClick={() => setPage(p => p + 1)} aria-label="Sonraki sayfa">›</button>
      </div>
      {res.isPending ? <p className="p-4 text-gray-400" role="status">Yükleniyor…</p>
        : <div ref={gridRef} className="scout-card-grid grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {res.data!.items.map(p => <div key={p.id} data-entrance-row={p.id}><FutCard p={p} onClick={() => onSelect(p)} /></div>)}
          </div>}
    </div>
  )
}

function ColumnPicker({ visible, automatic, onChange }: { visible: string[]; automatic: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="colpick" ref={ref}>
      <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ColumnsIcon /> {t('table.columns')}
      </button>
      {open && (
        <div className="ms-pop">
          <div className="ms-list">
            {COLUMNS.filter((c) => !c.locked).map((c) => (
              <label className="ms-item" key={c.id}>
                <input
                  type="checkbox"
                  checked={visible.includes(c.id) || automatic.includes(c.id)}
                  disabled={automatic.includes(c.id)}
                  onChange={() => onChange(visible.includes(c.id) ? visible.filter((x) => x !== c.id) : [...visible, c.id])}
                />
                {t(c.label)}{automatic.includes(c.id) && <small className="muted"> · GK</small>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
