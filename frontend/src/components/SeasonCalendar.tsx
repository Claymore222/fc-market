import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ClubView, FixtureRow } from '../api/types'
import { gameDate } from '../lib/format'
import { CareerIcon } from './CareerIcon'
import { ClubCrest } from './layout/CareerHeroCard'

const dateOf = (s: string) => new Date(`${s}T12:00:00`)
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const monthOf = (s: string) => s.slice(0, 7)
const fullDate = (s: string) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'full' }).format(dateOf(s))
const monthName = (s: string) => new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(dateOf(`${s}-01`))
const played = (f: FixtureRow) => f.homeGoals != null && f.awayGoals != null
const opponent = (f: FixtureRow) => ({ id: f.isHome ? f.awayTeamId : f.homeTeamId, name: (f.isHome ? f.awayTeam : f.homeTeam) ?? 'Bilinmeyen takım' })
const competition = (f: FixtureRow) => f.competition ?? 'Yarışma bilgisi yok'
const result = (f: FixtureRow) => !played(f) ? '' : f.homeGoals === f.awayGoals ? 'D' : ((f.homeGoals! > f.awayGoals!) === f.isHome ? 'W' : 'L')
const score = (f: FixtureRow) => played(f) ? `${f.homeGoals}–${f.awayGoals}` : f.time ?? '–'
const matchKey = (f: FixtureRow) => `${f.id}-${f.date}-${f.homeTeamId}-${f.awayTeamId}`

/** Read-only season calendar. Only exported fixtures are represented as events. */
export function SeasonCalendar({ d, onClose }: { d: ClubView; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const monthId = useId()
  const today = d.snapshot.gameDate
  const [view, setView] = useState('month')
  const [month, setMonth] = useState(monthOf(today))
  const [selected, setSelected] = useState(today)
  const [comp, setComp] = useState('all')
  const [venue, setVenue] = useState('all')
  const [status, setStatus] = useState('all')
  const fixtures = useMemo(() => [...(d.fixtures ?? [])].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')), [d.fixtures])
  const competitions = [...new Set(fixtures.map(competition))]
  const filtered = fixtures.filter(f => (comp === 'all' || competition(f) === comp) && (venue === 'all' || f.isHome === (venue === 'home')) && (status === 'all' || played(f) === (status === 'played')))
  const next = fixtures.find(f => f.date >= today && !played(f))
  const isNext = (f: FixtureRow) => f === next
  const dates = [today, ...fixtures.map(f => f.date)]
  const firstMonth = monthOf([`${d.snapshot.seasonEndYear - 1}-07-01`, ...dates].sort()[0])
  const lastMonth = monthOf([`${d.snapshot.seasonEndYear}-06-30`, ...dates].sort().at(-1)!)
  const monthStart = dateOf(`${month}-01`)
  const length = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((monthStart.getDay() + length) / 7) * 7 }, (_, i) => {
    const day = i - monthStart.getDay() + 1
    return day > 0 && day <= length ? iso(new Date(monthStart.getFullYear(), monthStart.getMonth(), day)) : null
  })
  const onDay = (day: string) => filtered.filter(f => f.date === day)
  const listDays = [...new Set(filtered.map(f => f.date))]

  useEffect(() => {
    const el = dialog.current!
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    el.showModal()
    return () => { el.close(); document.body.style.overflow = overflow; focus?.focus({ preventScroll: true }) }
  }, [])

  const moveMonth = (delta: number) => setMonth(monthOf(iso(new Date(monthStart.getFullYear(), monthStart.getMonth() + delta, 1))))
  const jumpToday = () => {
    setMonth(monthOf(today)); setSelected(today)
    if (view === 'list') {
      const target = body.current?.querySelector<HTMLElement>(`[data-calendar-day="${today}"]`)
      if (target) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      else body.current?.scrollTo({ top: 0 })
    }
  }
  const dayKey = (e: React.KeyboardEvent<HTMLButtonElement>, day: string) => {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (!(e.key in offsets)) return
    e.preventDefault()
    const dt = dateOf(day); dt.setDate(dt.getDate() + offsets[e.key])
    const target = iso(dt)
    if (monthOf(target) < firstMonth || monthOf(target) > lastMonth) return
    setSelected(target); setMonth(monthOf(target))
    requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>(`[data-day="${target}"]`)?.focus())
  }

  const fixtureCard = (f: FixtureRow) => <div key={matchKey(f)} className={`season-match result-${result(f)} ${isNext(f) ? 'is-next' : ''}`}>
    <div className="season-match-score"><b>{score(f)}</b>{played(f) && <span className={`season-result result-${result(f)}`}>{result(f) === 'W' ? 'G' : result(f) === 'L' ? 'M' : 'B'}</span>}</div>
    <div className="season-match-main"><strong><ClubCrest name={opponent(f).name} teamId={opponent(f).id} size={22} />{opponent(f).name}</strong>
      <div><span><CareerIcon name={f.isHome ? 'home' : 'north_east'} size={14} />{f.isHome ? 'İç saha' : 'Deplasman'}</span><span>{competition(f)}</span></div>
      {isNext(f) && <small>SIRADAKİ MAÇ</small>}
    </div>
  </div>
  const dayDetail = (day: string) => <section key={day} data-calendar-day={day} className={`season-day-detail ${day === today ? 'is-today' : ''}`}>
    <h4>{fullDate(day)}{day === today && <small>BUGÜN</small>}</h4>
    {onDay(day).length ? onDay(day).map(fixtureCard) : <p>Bu gün için seçili filtrelere uyan kayıtlı maç yok.</p>}
  </section>

  return createPortal(<dialog ref={dialog} className="season-calendar" aria-label="Maç takvimi" aria-labelledby={titleId}
    onCancel={e => { e.preventDefault(); onClose() }}
    onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose() } }}>
    <header className="season-calendar-header"><h2 id={titleId}>SEZON TAKVİMİ</h2><button type="button" aria-label="Takvimi kapat" title="Kapat · Esc" onClick={onClose}><CareerIcon name="close" /></button></header>
    <div ref={body} className="season-calendar-body">
      <p className="season-calendar-meta"><CareerIcon name="calendar_month" size={16} />Sezon {d.snapshot.seasonEndYear - 1}/{String(d.snapshot.seasonEndYear).slice(2)}<span>İçe aktarılan kayıttaki fikstür</span></p>
      <div className="season-calendar-panel">
        <div className="season-calendar-bar"><CalendarSwitch label="Görünüm" value={view} onChange={setView} options={[[ 'month', 'Ay' ], [ 'list', 'Liste' ]]} /><button type="button" className="season-today-button" onClick={jumpToday}><CareerIcon name="today" size={16} />Bugüne git</button></div>
        <div className="season-calendar-filters">
          <CalendarSwitch label="Yarışma" value={comp} onChange={setComp} options={[[ 'all', 'Tümü' ], ...competitions.map(c => [c, c] as [string, string])]} />
          <CalendarSwitch label="Saha" value={venue} onChange={setVenue} options={[[ 'all', 'Tümü' ], [ 'home', 'İç saha' ], [ 'away', 'Deplasman' ]]} />
          <CalendarSwitch label="Durum" value={status} onChange={setStatus} options={[[ 'all', 'Tümü' ], [ 'played', 'Oynanan' ], [ 'upcoming', 'Gelecek' ]]} />
        </div>
        <p className="season-calendar-summary"><span>{filtered.length} maç</span>{next && <span>Sıradaki maç: {opponent(next).name} · {gameDate(next.date)}</span>}</p>
        {view === 'month' ? <>
          <div className="season-month-bar"><button type="button" aria-label="Önceki ay" disabled={month <= firstMonth} onClick={() => moveMonth(-1)}><CareerIcon name="chevron_left" /></button><h3 id={monthId} aria-live="polite">{monthName(month)}</h3><button type="button" aria-label="Sonraki ay" disabled={month >= lastMonth} onClick={() => moveMonth(1)}><CareerIcon name="chevron_right" /></button></div>
          <div key={month} className="season-month-grid" role="grid" aria-labelledby={monthId}>
            <div role="row" className="season-week">{[['Pazar','Paz'],['Pazartesi','Pzt'],['Salı','Sal'],['Çarşamba','Çar'],['Perşembe','Per'],['Cuma','Cum'],['Cumartesi','Cmt']].map(([day, short]) => <span key={day} role="columnheader" className="season-weekday"><abbr title={day}>{short}</abbr></span>)}</div>
            {Array.from({ length: cells.length / 7 }, (_, w) => <div key={w} role="row" className="season-week">{cells.slice(w * 7, w * 7 + 7).map((day, i) => day ? <div key={day} role="gridcell" aria-selected={selected === day}>
              <button type="button" data-day={day} tabIndex={selected === day || (monthOf(selected) !== month && day.endsWith('-01')) ? 0 : -1}
                aria-label={`${fullDate(day)}${day === today ? ', Bugün' : ''}${onDay(day).map(f => `, ${opponent(f).name} ${f.isHome ? 'İç saha' : 'Deplasman'} ${score(f)}`).join('')}`}
                onClick={() => setSelected(day)} onKeyDown={e => dayKey(e, day)} className={`season-month-cell ${day < today ? 'is-past' : ''} ${day === today ? 'is-today' : ''} ${selected === day ? 'is-selected' : ''} ${next?.date === day ? 'has-next' : ''}`}>
                <span className="season-cell-date"><b>{Number(day.slice(-2))}</b></span>
                {onDay(day).map(f => <span key={matchKey(f)} className={`season-cell-match result-${result(f)}`}><ClubCrest name={opponent(f).name} teamId={opponent(f).id} size={18} /><span><b>{score(f)}</b> <em>{f.isHome ? 'İ' : 'D'}</em><span>{opponent(f).name}</span></span></span>)}
              </button>
            </div> : <span key={`blank-${i}`} role="gridcell" className="season-month-blank" />)}</div>)}
          </div>
          <ul className="season-calendar-legend" aria-label="Açıklamalar"><li><CareerIcon name="today" size={14} />Bugün</li><li><CareerIcon name="event" size={14} />Sıradaki maç</li><li><i className="win" />Galibiyet</li><li><i className="draw" />Beraberlik</li><li><i className="loss" />Mağlubiyet</li></ul>
          {dayDetail(selected)}
        </> : <div className="season-calendar-list">{listDays.length ? listDays.map((day, i) => <div key={day}>{(i === 0 || monthOf(day) !== monthOf(listDays[i - 1])) && <h3>{monthName(monthOf(day))}</h3>}{dayDetail(day)}</div>) : <p className="season-calendar-empty">Seçili filtrelere uyan kayıtlı maç yok.</p>}</div>}
      </div>
    </div>
  </dialog>, document.body)
}

function CalendarSwitch({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <div role="radiogroup" aria-label={label} className="season-calendar-switch">{options.map(([key, text], i) => <button key={key} type="button" role="radio" aria-checked={value === key} tabIndex={value === key ? 0 : -1}
    onClick={() => onChange(key)} onKeyDown={e => { const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0; if (delta) { e.preventDefault(); const index = (i + delta + options.length) % options.length; onChange(options[index][0]); (e.currentTarget.parentElement?.children[index] as HTMLElement)?.focus() } }}>{text}</button>)}</div>
}
