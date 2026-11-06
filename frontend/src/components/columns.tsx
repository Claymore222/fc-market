import type { ReactNode } from 'react'
import type { MarketPlayer } from '../api/types'
import type { SortDir } from '../lib/filters'
import { money, num, signed } from '../lib/format'
import { t, type MessageKey } from '../lib/i18n'
import { Delta, OpportunityBar, Position, Rating } from './Badges'
import { StarButton } from './StarButton'
import { Flag, PlayerAvatar, RatingChip } from './cmt'
import { PlayerWage } from './PlayerWage'

/** Kart değeri sütunu (PAC..PHY): CMTracker tablosundaki renkli rozet. Değerler tahmini. */
const card = (id: string, label: MessageKey, sortKey: string, get: (p: MarketPlayer) => number | null): Column => ({
  id, label, sortKey, width: '52px', align: 'center', defaultVisible: true,
  render: (p) => <RatingChip value={get(p)} size="sm" title="Tahmini kart değeri" />,
})

export interface Column {
  id: string
  label: MessageKey
  /** /api/players sort anahtarı */
  sortKey?: string
  /** ilk tıklamadaki yön: metinler A→Z, sayılar büyükten küçüğe */
  defaultDir?: SortDir
  width: string
  align?: 'right' | 'center'
  defaultVisible: boolean
  locked?: boolean
  render: (p: MarketPlayer, ctx: { seasonEndYear?: number }) => ReactNode
}

const AVAILABLE_COLUMNS: Column[] = [
  {
    id: 'name', label: 'col.name', sortKey: 'name', defaultDir: 'asc', width: 'minmax(300px, 1fr)', defaultVisible: true, locked: true,
    render: (p) => (
      <div className="scout-player-identity"><PlayerAvatar id={p.id} name={p.name} size={36} />
        <div><strong>{p.name}</strong><small><Flag code={p.nationCode} name={p.nation} nationId={p.nationId} /> {p.position} · {p.club ?? '–'}</small></div>
        <StarButton playerId={p.id} />
      </div>
    ),
  },
  { id: 'pos', label: 'col.pos', sortKey: 'pos', defaultDir: 'asc', width: '64px', defaultVisible: true,
    render: (p) => <Position label={p.position} group={p.positionGroup} /> },
  { id: 'age', label: 'col.age', sortKey: 'age', defaultDir: 'asc', width: '56px', align: 'right', defaultVisible: true,
    render: (p) => <span className="num">{num(p.age)}</span> },
  { id: 'ovr', label: 'col.ovr', sortKey: 'ovr', width: '84px', align: 'center', defaultVisible: true,
    render: (p) => <span className="ovr-cell"><span className="delta" /><Rating value={p.overall} /><Delta value={p.ovrDelta} /></span> },
  { id: 'pot', label: 'col.pot', sortKey: 'pot', width: '64px', align: 'center', defaultVisible: true,
    render: (p) => <Rating value={p.potential} /> },
  card('pac', 'col.pac', 'pac', p => p.pace),
  card('sho', 'col.sho', 'sho', p => p.shooting),
  card('pas', 'col.pas', 'pas', p => p.passing),
  card('dri', 'col.dri', 'dri', p => p.dribbling),
  card('def', 'col.def', 'def', p => p.defending),
  card('phy', 'col.phy', 'phy', p => p.physical),
  ...(['gkDiving', 'gkHandling', 'gkKicking', 'gkReflexes', 'gkPositioning'] as const).map(id => ({
    id, label: `col.${id}` as MessageKey, sortKey: id, width: '70px', align: 'center' as const, defaultVisible: false,
    render: (p: MarketPlayer) => <RatingChip value={p[id] ?? null} size="sm" title="Kayıttaki kaleci özelliği" />,
  })),
  { id: 'growth', label: 'col.growth', sortKey: 'growth', width: '92px', align: 'right', defaultVisible: true,
    render: (p) => (
      <span className={`num ${p.growthPerMonth && p.growthPerMonth > 0 ? 'delta up' : p.growthPerMonth && p.growthPerMonth < 0 ? 'delta down' : 'muted'}`} style={{ width: 'auto' }}>
        {p.growthPerMonth === null ? '–' : signed(p.growthPerMonth, 2)}
      </span>
    ) },
  { id: 'value', label: 'col.value', sortKey: 'value', width: '112px', align: 'right', defaultVisible: true,
    render: (p) => <span className="num">{money(p.value)}</span> },
  { id: 'opportunity', label: 'col.opportunity', sortKey: 'opportunity', width: '120px', defaultVisible: true,
    render: (p) => <OpportunityBar value={p.opportunity} /> },
  { id: 'contract', label: 'col.contract', sortKey: 'contract', defaultDir: 'asc', width: '86px', align: 'right', defaultVisible: true,
    render: (p, { seasonEndYear }) => (
      <span className={`num${seasonEndYear !== undefined && p.contractEnd !== null && p.contractEnd <= seasonEndYear ? ' expiring' : ''}`}>
        {p.contractEnd ?? '–'}
      </span>
    ) },
  { id: 'wage', label: 'col.wage', sortKey: 'wage', width: '96px', align: 'right', defaultVisible: false,
    render: (p) => <PlayerWage player={p} /> },
  { id: 'nation', label: 'col.nation', sortKey: 'nation', defaultDir: 'asc', width: 'minmax(100px, 1fr)', defaultVisible: true,
    render: (p) => p.nation ?? <span className="muted">–</span> },
  { id: 'club', label: 'col.club', sortKey: 'club', defaultDir: 'asc', width: 'minmax(120px, 1fr)', defaultVisible: false,
    render: (p) => p.club ?? <span className="muted">–</span> },
  { id: 'league', label: 'col.league', sortKey: 'league', defaultDir: 'asc', width: 'minmax(120px, 1fr)', defaultVisible: false,
    render: (p) => p.league ?? <span className="muted">–</span> },
  { id: 'foot', label: 'col.foot', sortKey: 'foot', defaultDir: 'asc', width: '60px', defaultVisible: false,
    render: (p) => p.foot ?? <span className="muted">–</span> },
  { id: 'height', label: 'col.height', sortKey: 'height', width: '64px', align: 'right', defaultVisible: false,
    render: (p) => <span className="num">{p.height ? `${p.height}` : '–'}</span> },
]

const PRIMARY_COLUMNS = ['name', 'ovr', 'pot', 'age', 'value', 'wage']
export const COLUMNS = AVAILABLE_COLUMNS.map(c => ({ ...c, defaultVisible: PRIMARY_COLUMNS.includes(c.id) }))
  .sort((a,b) => { const x = PRIMARY_COLUMNS.indexOf(a.id), y = PRIMARY_COLUMNS.indexOf(b.id); return (x < 0 ? 100 : x) - (y < 0 ? 100 : y) })

export const columnLabel = (c: Column) => t(c.label)
