import { useEffect, useMemo, useRef, useState } from 'react'
import type { FilterOptions, IdOption } from '../api/types'
import { activePreset, csv, PRESETS, type Filters } from '../lib/filters'
import { money } from '../lib/format'
import { t, type MessageKey } from '../lib/i18n'
import { CloseIcon, SearchIcon } from './Icons'

interface Props {
  filters: Filters
  options: FilterOptions | undefined
  onChange: (patch: Filters) => void
  onReplace: (next: Filters) => void
  /** Dar ekranda panel tablonun üstüne açılır; kapatma düğmesi buna bağlanır. */
  onClose: () => void
}

const VALUE_STEPS = [1, 2, 5, 10, 20, 35, 50, 75, 100].map((m) => m * 1_000_000)

export function FilterPanel({ filters, options, onChange, onReplace, onClose }: Props) {
  const season = options?.snapshot.seasonEndYear
  const preset = activePreset(filters, season)
  const hasFilters = Object.keys(filters).some((k) => k !== 'sort' && k !== 'dir')

  const leagueIds = csv(filters.league).map(Number)
  const clubs = useMemo(
    () => (options?.clubs ?? []).filter((c) => !leagueIds.length || (c.leagueId !== null && leagueIds.includes(c.leagueId))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options, filters.league],
  )

  return (
    <aside className="filters" aria-label={t('filters.title')}>
      <div className="filters-head">
        <span className="label">{t('filters.title')}</span>
        <div className="filters-actions">
          {hasFilters && (
            <button className="btn" onClick={() => onReplace({ sort: filters.sort, dir: filters.dir })}>
              {t('filters.reset')}
            </button>
          )}
          <button className="icon-btn filters-close" onClick={onClose} aria-label={t('filters.close')}>
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="fgroup">
        <span className="label">{t('filters.presets')}</span>
        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`preset${preset?.id === p.id ? ' on' : ''}`}
              disabled={season === undefined}
              onClick={() => onReplace(preset?.id === p.id ? {} : p.filters(season!))}
            >
              <strong>{t(p.label)}</strong>
              <small>{t(p.hint)}</small>
            </button>
          ))}
        </div>
        {filters.oppMin && !preset && (
          <div className="chips">
            <button className="chip on" onClick={() => onChange({ oppMin: undefined })}>
              {t('filters.oppMin', { n: filters.oppMin })} ×
            </button>
          </div>
        )}
      </div>

      <PositionFilter value={csv(filters.pos)} options={options} onChange={(pos) => onChange({ pos: pos.join(',') || undefined })} />
      <label className="flex items-center gap-2 text-xs text-gray-400">
        <input type="checkbox" checked={filters.includeSecondary === 'true'} onChange={e => onChange({ includeSecondary: e.target.checked ? 'true' : undefined })} />
        Ek mevkileri dahil et
      </label>

      <RangeFilter label="filters.age" min={filters.ageMin} max={filters.ageMax} bounds={options?.ranges.age}
        onChange={(a, b) => onChange({ ageMin: a, ageMax: b })} />
      <RangeFilter label="filters.overall" min={filters.ovrMin} max={filters.ovrMax} bounds={options?.ranges.overall}
        onChange={(a, b) => onChange({ ovrMin: a, ovrMax: b })} />
      <RangeFilter label="filters.potential" min={filters.potMin} max={filters.potMax} bounds={options?.ranges.potential}
        onChange={(a, b) => onChange({ potMin: a, potMax: b })} />

      <div className="fgroup">
        <label className="label" htmlFor="filter-free-agent">{t('filters.freeAgent')}</label>
        <select id="filter-free-agent" className="field" value={filters.freeAgent ?? ''} onChange={e => onChange({ freeAgent: e.target.value || undefined })}>
          <option value="">Hepsi</option><option value="true">Serbest oyuncular</option><option value="false">Kulübü olanlar</option>
        </select>
      </div>
      <RangeFilter label="filters.wage" min={filters.wageMin} max={filters.wageMax} bounds={undefined}
        onChange={(a, b) => onChange({ wageMin: a, wageMax: b })} />
      <p className="text-[11px] leading-relaxed text-gray-500">Serbest oyuncuda kayıttaki tutar kullanılır; aktif maaş veya maaş talebi değildir.</p>
      <RangeFilter label="filters.contractYears" min={filters.contractYearsMin} max={filters.contractYearsMax} bounds={undefined}
        onChange={(a, b) => onChange({ contractYearsMin: a, contractYearsMax: b })} />
      <p className="text-[11px] leading-relaxed text-gray-500">Sezon sonuna göre hesaplanır. Serbest oyuncu 0 yıl sayılır.</p>
      {(['weakFootMin', 'skillMovesMin'] as const).map((key, i) => <div className="fgroup" key={key}>
        <label className="label" htmlFor={`filter-${key}`}>{t(i === 0 ? 'filters.weakFoot' : 'filters.skillMoves')}</label>
        <select id={`filter-${key}`} className="field" value={filters[key] ?? ''} onChange={e => onChange({ [key]: e.target.value || undefined })}>
          <option value="">Hepsi</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} ★ ve üstü</option>)}
        </select>
      </div>)}
      <details className="fgroup advanced-scout-filters" open={!!(filters.role || filters.roleLevelMin || filters.playStyle || filters.playStylePlus)}>
        <summary className="label cursor-pointer">Roller ve oyun stilleri</summary>
        <div className="mt-3 space-y-4">
          <MultiSelect label="filters.roles" items={options?.roles ?? []} value={csv(filters.role)} onChange={v => onChange({ role: v.join(',') || undefined })} />
          <label className="flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" checked={filters.roleLevelMin === '2'} onChange={e => onChange({ roleLevelMin: e.target.checked ? '2' : undefined })} />Yalnız ++ roller</label>
          <MultiSelect label="filters.playStyles" items={options?.playStyles ?? []} value={csv(filters.playStyle)} onChange={v => onChange({ playStyle: v.join(',') || undefined })} />
          <MultiSelect label="filters.playStylesPlus" items={options?.playStylesPlus ?? []} value={csv(filters.playStylePlus)} onChange={v => onChange({ playStylePlus: v.join(',') || undefined })} />
          <p className="text-[11px] leading-relaxed text-gray-500">Aynı listede seçilenlerden biri yeterli; farklı filtreler birlikte uygulanır. Eksik veri eşleşme sayılmaz.</p>
        </div>
      </details>

      <MultiSelect label="filters.league" items={options?.leagues ?? []} value={csv(filters.league)}
        onChange={(v) => onChange({ league: v.join(',') || undefined, club: undefined })} />
      <MultiSelect label="filters.club" items={clubs} value={csv(filters.club)}
        onChange={(v) => onChange({ club: v.join(',') || undefined })} />
      <MultiSelect label="filters.nation" items={options?.nations ?? []} value={csv(filters.nation)}
        onChange={(v) => onChange({ nation: v.join(',') || undefined })} />

      <div className="fgroup">
        <span className="label">{t('filters.contract')}</span>
        <select className="field" value={filters.contractEndsBy ?? ''} onChange={(e) => onChange({ contractEndsBy: e.target.value || undefined })}>
          <option value="">{t('filters.any')}</option>
          {season !== undefined &&
            [0, 1, 2, 3].map((i) => (
              <option key={i} value={season + i}>{t('filters.contractBy', { year: season + i })}</option>
            ))}
        </select>
      </div>

      <div className="fgroup">
        <span className="label">{t('filters.valueMax')}</span>
        <select className="field" value={filters.valueMax ?? ''} onChange={(e) => onChange({ valueMax: e.target.value || undefined })}>
          <option value="">{t('filters.any')}</option>
          {VALUE_STEPS.map((v) => <option key={v} value={v}>≤ {money(v)}</option>)}
        </select>
      </div>

      <div className="fgroup">
        <span className="label">{t('filters.foot')}</span>
        <div className="chips">
          {(options?.feet ?? []).map((f) => {
            const on = filters.foot === f.label
            return (
              <button key={f.label} className={`chip${on ? ' on' : ''}`} onClick={() => onChange({ foot: on ? undefined : f.label })}>
                {f.label}
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

/** Yazarken URL'yi her tuşta değiştirmemek için gecikmeli gönderim. */
function useDebounced(value: string, onCommit: (v: string) => void, delay = 300) {
  const [local, setLocal] = useState(value)
  const committed = useRef(value)
  // Gecikme sırasında diğer filtreler değişebilir. Eski URL'yi yakalayan callback yeni seçimleri silmemeli.
  const commit = useRef(onCommit)
  commit.current = onCommit
  useEffect(() => {
    if (value !== committed.current) { committed.current = value; setLocal(value) }
  }, [value])
  useEffect(() => {
    if (local === committed.current) return
    const id = setTimeout(() => { committed.current = local; commit.current(local) }, delay)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local])
  return [local, setLocal] as const
}

export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useDebounced(value, onChange)
  return (
    <label className="search">
      <SearchIcon />
      <input type="search" placeholder={t('filters.search')} value={local} onChange={(e) => setLocal(e.target.value)} aria-label={t('filters.search')} />
    </label>
  )
}

function NumberBox({ value, placeholder, onChange }: { value?: string; placeholder: string; onChange: (v: string | undefined) => void }) {
  const [local, setLocal] = useDebounced(value ?? '', (v) => onChange(v || undefined), 450)
  return (
    <input className="field num" inputMode="numeric" placeholder={placeholder} value={local}
      aria-label={placeholder} onChange={(e) => setLocal(e.target.value.replace(/[^0-9]/g, ''))} />
  )
}

function RangeFilter(props: {
  label: MessageKey
  min?: string
  max?: string
  bounds: [number, number] | null | undefined
  onChange: (min: string | undefined, max: string | undefined) => void
}) {
  const { label, min, max, bounds, onChange } = props
  return (
    <div className="fgroup" role="group" aria-label={t(label)}>
      <div className="fgroup-head">
        <span className="label">{t(label)}</span>
        {(min || max) && <button className="clear" onClick={() => onChange(undefined, undefined)}>×</button>}
      </div>
      <div className="range">
        <NumberBox value={min} placeholder={bounds ? `${t('filters.min')} ${bounds[0]}` : t('filters.min')} onChange={(v) => onChange(v, max)} />
        <span>–</span>
        <NumberBox value={max} placeholder={bounds ? `${t('filters.max')} ${bounds[1]}` : t('filters.max')} onChange={(v) => onChange(min, v)} />
      </div>
    </div>
  )
}

// Laid out like the pitch, attack on top, so the buttons line up and need no reading.
const PITCH_POSITIONS = ['LW', 'ST', 'RW', 'LM', 'CAM', 'RM', 'CM', 'CDM', 'LB', 'CB', 'RB']
const GROUP_NAMES: Record<string, string> = { GK: 'Kaleci', DEF: 'Defans', MID: 'Orta', ATT: 'Hücum' }

function PositionFilter({ value, options, onChange }: { value: string[]; options: FilterOptions | undefined; onChange: (v: string[]) => void }) {
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k])
  const groups = options?.positionGroups ?? []
  const present = new Set(options?.positions.map((p) => p.label))
  const extra = (options?.positions ?? []).filter((p) => p.label !== 'GK' && !PITCH_POSITIONS.includes(p.label))
  const inGroup = (p: string) => groups.some((g) => value.includes(g.key) && g.positions.includes(p))
  const chip = (label: string, wide = false) => (
    <button key={label} type="button" aria-pressed={value.includes(label)} disabled={!present.has(label)}
      className={`chip${value.includes(label) || inGroup(label) ? ' on' : ''}${wide ? ' wide' : ''}`} onClick={() => toggle(label)}>{label}</button>
  )
  return (
    <div className="fgroup">
      <div className="fgroup-head">
        <span className="label">{t('filters.position')}</span>
        {value.length > 0 && <button className="clear" aria-label="Pozisyon filtresini temizle" onClick={() => onChange([])}>×</button>}
      </div>
      <div className="pos-groups">
        {groups.map((g) => <button key={g.key} type="button" aria-pressed={value.includes(g.key)} className={`chip${value.includes(g.key) ? ' on' : ''}`} onClick={() => toggle(g.key)}>{GROUP_NAMES[g.key] ?? g.key}</button>)}
      </div>
      <div className="pos-pitch">
        {PITCH_POSITIONS.map((p) => chip(p, p === 'CM' || p === 'CDM'))}
        {extra.map((p) => chip(p.label))}
      </div>
    </div>
  )
}

function MultiSelect({ label, items, value, onChange }: { label: MessageKey; items: IdOption[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const norm = (s: string) => s.toLocaleLowerCase('tr-TR')
  const shown = items.filter((i) => !q || norm(i.name).includes(norm(q)))
  const selected = items.filter((i) => value.includes(String(i.id)))
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])

  return (
    <div className="fgroup ms" ref={ref} role="group" aria-label={t(label)}>
      <span className="label">{t(label)}</span>
      <button className="field ms-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={t(label)}>
        <span className={selected.length ? '' : 'muted'}>
          {selected.length ? t('filters.selected', { n: selected.length }) : t('filters.any')}
        </span>
        <span className="muted">▾</span>
      </button>
      {selected.length > 0 && (
        <div className="ms-tags">
          {selected.map((s) => (
            <span className="ms-tag" key={s.id}>
              {s.name}
              <button onClick={() => toggle(String(s.id))} aria-label={`${s.name} kaldır`}>×</button>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="ms-pop">
          {items.length > 8 && (
            <input className="field" autoFocus placeholder={t('filters.selectSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
          )}
          <div className="ms-list">
            {shown.map((i) => (
              <label className="ms-item" key={i.id}>
                <input type="checkbox" aria-label={i.name} checked={value.includes(String(i.id))} onChange={() => toggle(String(i.id))} />
                {i.name}
                <span className="count num">{i.count}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
