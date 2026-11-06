import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { MarketPlayer } from '../api/types'
import type { SortSpec } from '../lib/filters'
import { t } from '../lib/i18n'
import type { Column } from './columns'
import { useStaggeredEntrance } from '../lib/useStaggeredEntrance'

export const ROW_HEIGHT = 58

interface Props {
  columns: Column[]
  total: number
  getRow: (index: number) => MarketPlayer | undefined
  sort: SortSpec[]
  onSort: (col: Column, additive: boolean) => void
  selectedId: number | null
  onSelect: (p: MarketPlayer, index: number) => void
  onRangeChange: (range: [number, number]) => void
  seasonEndYear?: number
  /** Değişince en başa kaydır (filtre/sıralama değişti). */
  resetKey: string
  /** Seçili satırı görünür tut (klavye ile gezinirken). */
  scrollToIndex: number | null
  loading: boolean
  error: string | null
}

export function PlayerTable(props: Props) {
  const { columns, total, getRow, sort, onSort, selectedId, onSelect, onRangeChange, seasonEndYear, resetKey, scrollToIndex } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const template = columns.map((c) => c.width).join(' ')

  const virtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollPaddingStart: 40, // yapışkan başlık yüksekliği
  })
  const items = virtualizer.getVirtualItems()
  const first = items[0]?.index ?? 0
  const last = items[items.length - 1]?.index ?? 0
  const contentKey = items.map(vi => getRow(vi.index)?.id ?? 'loading').join(',')
  useStaggeredEntrance(scrollRef, resetKey, !props.loading && !props.error, contentKey)

  useEffect(() => { onRangeChange([first, last]) }, [first, last, onRangeChange])
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0, left: 0 }) }, [resetKey])
  useEffect(() => {
    if (scrollToIndex !== null) virtualizer.scrollToIndex(scrollToIndex, { align: 'auto' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToIndex])

  return (
    <div className="player-grid" ref={scrollRef} role="table" aria-label="Oyuncular" aria-rowcount={total + 1}>
      <div className="grid-inner">
        <div className="thead" role="row" style={{ gridTemplateColumns: template }}>
          {columns.map((c) => {
            const idx = sort.findIndex((s) => s.key === c.sortKey)
            const spec = idx >= 0 ? sort[idx] : undefined
            return (
              <button
                key={c.id}
                role="columnheader"
                aria-sort={spec ? (spec.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                className={`th${c.sortKey ? ' sortable' : ''}${spec ? ' sorted' : ''}${c.align ? ` ${c.align}` : ''}`}
                onClick={(e) => c.sortKey && onSort(c, e.shiftKey)}
                title={c.sortKey ? t('table.sortHint') : undefined}
              >
                {t(c.label)}
                {spec && <span className="arrow">{spec.dir === 'asc' ? '▲' : '▼'}</span>}
                {spec && sort.length > 1 && <span className="order">{idx + 1}</span>}
              </button>
            )
          })}
        </div>

        {props.error ? (
          <div className="grid-empty error">{t('table.error', { error: props.error })}</div>
        ) : total === 0 ? (
          <div className="grid-empty">{props.loading ? t('table.loading') : t('table.empty')}</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {items.map((vi) => {
              const p = getRow(vi.index)
              return (
                <div
                  key={vi.key}
                  role="row"
                  aria-rowindex={vi.index + 2}
                  tabIndex={p ? 0 : -1}
                  aria-label={p?.name}
                  data-entrance-row={p ? p.id : undefined}
                  className={`tr${p && p.id === selectedId ? ' active' : ''}`}
                  style={{ top: vi.start, height: ROW_HEIGHT, gridTemplateColumns: template }}
                  onClick={() => p && onSelect(p, vi.index)}
                  onKeyDown={e => { if (e.target === e.currentTarget && p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(p, vi.index) } }}
                >
                  {columns.map((c) => (
                    <div key={c.id} role="cell" className={`td${c.id === 'name' ? ' name' : ''}${c.align ? ` ${c.align}` : ''}`}>
                      {p ? c.render(p, { seasonEndYear }) : <div className="skeleton" />}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
