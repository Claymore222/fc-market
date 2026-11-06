import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeftRight, ArrowRight, ArrowDown, ArrowUp, Award, BadgeCheck, CloudCog, Diff, Globe, Plane, BarChart3, Briefcase, Building2, Calendar as CalendarIcon, ChevronRight, Cross, DollarSign,
  FileClock, Goal, GraduationCap, History, Hourglass, Info, ListOrdered, Search, Shield, ShieldAlert, Smile, Star, Target,
  Trophy, Users, Zap,
} from 'lucide-react'
import { useCareer, useSaveUid } from '../App'
import { useClub, useFeed } from '../api/client'
import { useRecruitmentBoard } from '../api/recruitmentBoard'
import type { ClubView, DisciplineRow, FeedItem, PlayerMorale, RecordMatch, SquadMember } from '../api/types'
import { PlayerDrawer } from '../components/PlayerDrawer'
import { Flag, PlayerAvatar, RatingChip, SET_PIECE_LABELS, formationOf, ratingClass } from '../components/cmt'
import { TrophyImage } from '../components/TrophyImage'
import { CareerSummary, ClubCrest } from '../components/layout/CareerHeroCard'
import { dec1, gameDate, money, num } from '../lib/format'
import { useSelectedPlayer } from '../lib/selection'
import { moraleEvent, moraleTone } from '../lib/morale'
import { CornerSupport, PageLoading, PageState } from './SquadPage'
import { nameOf, reasonOf, topNeed } from './RecruitmentHubPage'
import { InfoTip } from '../components/InfoTip'
import { LineupPitch } from '../components/LineupPitch'
import { CareerIcon } from '../components/CareerIcon'
import { SeasonCalendar } from '../components/SeasonCalendar'
import { FinanceHistory } from '../components/FinanceHistory'

type TileId = 'calendar' | 'nextMatch' | 'leaguePosition' | 'teamPower' | 'startingXi' | 'morale' | 'identity' | 'changes'
  | 'saveStatus' | 'squad' | 'wages' | 'stats' | 'tactic' | 'market' | 'clubTransfers' | 'expiring' | 'injuries'
  | 'suspensions' | 'goldenBoot' | 'silverware' | 'teamOfWeek' | 'finance' | 'club' | 'managerCv' | 'seasonHistory'
  | 'jobSecurity' | 'board' | 'youth' | 'academy' | 'awards' | 'scouts' | 'preSeason' | 'promoted' | 'aroundWorld'

/** Home bölümleri: aynı anda tek bölüm açılır, seçim adreste kalır (`?bolum=`). */
const SECTIONS: { id: string; label: string; tiles: TileId[] }[] = [
  { id: 'overview', label: 'GENEL BAKIŞ', tiles: ['calendar', 'nextMatch', 'leaguePosition', 'teamPower', 'startingXi', 'morale'] },
  { id: 'squad', label: 'KADRO', tiles: ['squad', 'stats', 'wages', 'tactic'] },
  { id: 'injuries', label: 'SAKATLIK VE CEZALAR', tiles: ['injuries', 'suspensions'] },
  { id: 'transfers', label: 'TRANSFER VE SÖZLEŞMELER', tiles: ['market', 'clubTransfers', 'expiring'] },
  { id: 'competitions', label: 'TURNUVALAR', tiles: ['goldenBoot', 'silverware', 'teamOfWeek'] },
  { id: 'finances', label: 'KULÜP VE FİNANS', tiles: ['club', 'finance'] },
  { id: 'board', label: 'MENAJER VE YÖNETİM', tiles: ['managerCv', 'jobSecurity', 'board', 'identity', 'changes', 'saveStatus', 'seasonHistory'] },
  { id: 'youth', label: 'ALTYAPI VE GÖZLEM', tiles: ['academy', 'awards', 'scouts'] },
  { id: 'world', label: 'DÜNYA', tiles: ['preSeason', 'promoted', 'aroundWorld'] },
]
const WIDE: TileId[] = ['tactic', 'seasonHistory']
const HALF: TileId[] = ['club', 'finance', 'injuries', 'suspensions']

/** Ana sayfa: üstte bugünün özeti, altta tek bölüm. Sayılar seçili kariyer dalının son snapshot'ından. */
export function HomePage() {
  const { key } = useCareer()
  const club = useClub(key)
  const feed = useFeed({ types: 'transfer,growth,potential,decline,contract,new', limit: '1500' }, key)
  const career = useCareer()
  const [params, setParams] = useSearchParams()
  const requested = params.get('bolum')
  const section = SECTIONS.find(s => s.id === requested) ?? SECTIONS[0]
  const active = section.id
  const navRef = useRef<HTMLElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useSelectedPlayer()
  const [waiting, setWaiting] = useState(0)
  const [showEmpty, setShowEmpty] = useState(false)

  // Kaynağı henüz olmayan kartlar gizlenir ama sayısı söylenir; isteyen açıp nedenini görür.
  useLayoutEffect(() => {
    setWaiting(gridRef.current?.querySelectorAll('.hub-placeholder').length ?? 0)
    setShowEmpty(false)
  }, [active, club.data])

  // Seçili sekme şeritte görünür kalsın (dar ekranda şerit yatay kayar).
  useEffect(() => {
    const nav = navRef.current
    const btn = nav?.querySelector<HTMLElement>(`[data-section="${active}"]`)
    if (!nav || !btn) return
    const left = btn.offsetLeft - nav.offsetLeft
    if (left < nav.scrollLeft || left + btn.offsetWidth > nav.scrollLeft + nav.clientWidth)
      nav.scrollTo({ left: left - (nav.clientWidth - btn.offsetWidth) / 2, behavior: 'smooth' })
  }, [active])

  if (club.isPending) return <PageLoading title="Kulüp yükleniyor…" />
  if (club.isError) return <PageState title="Kulüp okunamadı" detail={(club.error as Error).message} retry={() => club.refetch()} />
  const d = club.data
  const season = `${d.snapshot.seasonEndYear - 1}/${String(d.snapshot.seasonEndYear).slice(2)}`
  const transfers = (feed.data?.items ?? []).filter(t => t.type === 'transfer')

  const tile = (id: TileId): ReactNode => {
    switch (id) {
      case 'calendar': return <CalendarTile d={d} />
      case 'nextMatch': return <NextMatchTile d={d} />
      // CMTracker "League position": lig sırası; sezon başlamadan (maç yok) form ve fikstür.
      case 'leaguePosition': return d.standing?.position && (d.standing.played ?? 0) > 0 ? <LeagueTile d={d} /> : <FormFixturesTile d={d} />
      case 'teamPower': return <TeamPowerTile d={d} />
      case 'startingXi': return <StartingXiTile d={d} open={setSelected} />
      case 'morale': return d.squad.some(m => m.morale) ? <MoraleTile d={d} open={setSelected} />
        : <NoDataTile title="Kadro morali" icon={Smile} text="Moral kariyer kaydından okunur; bu kariyerin kaydı henüz içe aktarılmadı." />
      case 'identity': return <IdentityTile d={d} career={career} />
      case 'changes': return <ChangesTile d={d} items={feed.data?.items ?? []} open={setSelected} />
      case 'saveStatus': return <SaveStatusTile d={d} season={season} />
      case 'managerCv': return <ManagerAwardsTile d={d} />
      case 'preSeason': return <PreseasonTile d={d} />
      case 'promoted': return <PromotedTile d={d} />
      case 'aroundWorld': return <AroundWorldTile d={d} />
      case 'squad': return <SquadTile d={d} open={setSelected} />
      case 'wages': return <WagesTile d={d} open={setSelected} />
      case 'stats': return <SeasonStatsTile d={d} open={setSelected} />
      case 'tactic': return <TacticTile d={d} open={setSelected} />
      case 'market': return <MarketTile items={transfers} loading={feed.isPending} open={setSelected} />
      case 'clubTransfers': return <ClubTransfersTile items={transfers} d={d} open={setSelected} />
      case 'expiring': return <ExpiringTile d={d} open={setSelected} />
      case 'injuries': return <InjuriesTile d={d} open={setSelected} />
      case 'suspensions': return <DisciplineTile d={d} open={setSelected} />
      case 'goldenBoot': return <NoDataTile title="Gol krallığı" icon={Goal} text="Gol sayıları export'ta güvenilir değil; maçlar oynandıkça maç puanı geçmişinden gelecek." />
      case 'silverware': return <SilverwareTile d={d} />
      case 'teamOfWeek': return <TeamOfWeekTile d={d} open={setSelected} />
      case 'finance': return <FinanceTile d={d} />
      case 'club': return <ClubTile d={d} />
      case 'seasonHistory': return <SeasonHistoryTile d={d} season={season} />
      case 'jobSecurity': return <JobSecurityTile d={d} />
      case 'board': return <BoardObjectivesTile d={d} />
      case 'youth': return <YouthTile d={d} open={setSelected} />
      case 'academy': return <AcademyTile d={d} open={setSelected} />
      case 'awards': return <AwardRecordsTile d={d} title="Ödül yarışı" open={setSelected} />
      case 'scouts': return <ScoutsTile d={d} />
    }
  }

  const choose = (id: string) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      if (id === SECTIONS[0].id) next.delete('bolum'); else next.set('bolum', id)
      return next
    }, { replace: true })
    // Aşağıdan gelindiyse yeni bölüm sekmenin hemen altından başlasın.
    const nav = navRef.current
    if (nav && nav.getBoundingClientRect().top <= parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-bar-h')) + 1) scrollTo({ top: nav.offsetTop - 80 })
  }

  return (
    <div className="home-hub page-enter">
      <CareerSummary club={d} />
      <TodayPanel d={d} onSection={choose} />
      <nav ref={navRef} className="hub-section-tabs cmt-scroll-none" aria-label="Bölümler">
        {SECTIONS.map(s => (
          <button key={s.id} data-section={s.id} onClick={() => choose(s.id)} aria-current={active === s.id ? 'true' : undefined}
            className={`hub-section-tab ${active === s.id ? 'is-active' : ''}`}><span>{s.label}</span></button>
        ))}
      </nav>
      <section key={section.id} id={`home-${section.id}`} aria-label={section.label} className={`hub-section view-swap ${showEmpty ? 'show-empty' : ''}`}>
        <div ref={gridRef} className="hub-grid">
          {section.tiles.map(id => (
            <div key={id} data-tile={id} className={`hub-cell ${WIDE.includes(id) ? 'is-wide' : HALF.includes(id) ? 'is-half' : ''}`}>{tile(id)}</div>
          ))}
        </div>
        {waiting > 0 && <p className="hub-waiting">{waiting} kart veri bekliyor. <button type="button" aria-expanded={showEmpty} onClick={() => setShowEmpty(v => !v)}>{showEmpty ? 'Gizle' : 'Göster'}</button></p>}
      </section>
      {active === 'competitions' && <details className="youth-extras"><summary>Ek bilgiler · Sezon ödülleri takvimi</summary><SeasonAwardsTile d={d} season={season} open={setSelected} /></details>}
      {selected !== null && <PlayerDrawer playerId={selected} saveUid={key} onClose={() => setSelected(null)} />}
    </div>
  )
}

/** İlk bakışta dört karar noktası; her biri ilgili ekrana veya bölüme götürür. */
function TodayPanel({ d, onSection }: { d: ClubView; onSection: (id: string) => void }) {
  const board = useRecruitmentBoard(useSaveUid())
  const need = board.data ? topNeed(board.data) : undefined
  const next = (d.fixtures ?? []).find(f => f.date >= d.snapshot.gameDate && f.homeGoals == null)
  const opponent = next ? (next.isHome ? next.awayTeam : next.homeTeam) : null
  const expiring = squadOnly(d).filter(m => m.player.contractEnd !== null && m.player.contractEnd <= d.snapshot.seasonEndYear).length
  const fitness = squadOnly(d).filter(m => m.fitness)
  const injured = fitness.filter(m => m.fitness!.injured).length
  const bans = new Set((d.discipline ?? []).filter(r => r.ban > 0).map(r => r.playerId)).size
  return (
    <section className="today-panel" aria-label="Bugünün özeti">
      <Link to="/matches" className="today-card"><span>Sıradaki maç</span><strong>{opponent ?? 'Maç yok'}</strong><small>{next ? `${gameDate(next.date)} · ${next.isHome ? 'İç saha' : 'Deplasman'}` : 'Takvimde maç görünmüyor'}</small></Link>
      <Link to={need ? `/transfer?mevki=${need.position}` : '/transfer'} className="today-card"><span>Transfer önceliği</span><strong>{need ? nameOf(need) : board.isPending ? 'Hesaplanıyor…' : board.data ? 'Takviye gerekmiyor' : 'Transfer merkezi'}</strong><small>{need ? reasonOf(need) : board.isPending ? 'Kadro ve lig karşılaştırılıyor' : board.data ? 'Model bu dönem ihtiyaç görmüyor' : 'Önerileri aç'}</small></Link>
      <button type="button" className="today-card" onClick={() => onSection('transfers')}><span>Sözleşmeler</span><strong>{expiring === 0 ? 'Biten yok' : `${expiring} sözleşme`}</strong><small>{d.snapshot.seasonEndYear} sezon sonu</small></button>
      <button type="button" className="today-card" onClick={() => onSection('injuries')}><span>Kadro durumu</span><strong>{fitness.length === 0 ? 'Veri yok' : injured + bans === 0 ? 'Eksik yok' : [injured > 0 && `${injured} sakat`, bans > 0 && `${bans} cezalı`].filter(Boolean).join(' · ')}</strong><small>{fitness.length === 0 ? 'Kondisyon kayıttan okunur' : 'Sakatlık ve cezalar'}</small></button>
    </section>
  )
}

// --- Kart iskeleti ----------------------------------------------------------------------------------------------
const TILE_SYMBOLS: Record<string, string> = {
  'Takvim': 'calendar_month', 'Sıradaki maç': 'event', 'Lig sırası': 'format_list_numbered', 'Sonuçlar ve fikstür': 'format_list_numbered', 'Takım gücü': 'bolt', 'İlk 11': 'sports_soccer',
  'Kadro morali': 'mood', 'Kariyer kimliği': 'badge', 'Son yüklemeden bu yana değişenler': 'difference', 'Kayıt durumu': 'cloud_sync',
  'Kadro': 'groups', 'Sezon liderleri': 'emoji_events', 'Kadro rolleri ve maaşlar': 'payments', 'Taktik ve duran toplar': 'stadium',
  'Sakatlık odası': 'healing', 'Uygunluk': 'personal_injury', 'Transfer piyasası': 'public', 'Bu sezon transferler': 'swap_horiz',
  'Biten sözleşmeler': 'event_busy', 'Altın ayakkabı yarışı': 'sports_soccer', 'Kupalar': 'emoji_events', 'Haftanın takımı': 'star',
  'Kulüp': 'shield', 'Kulüp finansı': 'account_balance', 'Menajer karnesi': 'work', 'İş güvencesi': 'shield_person',
  'Yönetim hedefleri': 'flag', 'Sezon geçmişi': 'history_edu', 'Altyapı akademisi': 'school', 'Ödül yarışı': 'military_tech',
  'Gözlemciler': 'travel_explore', 'Hazırlık turnuvası': 'flight_takeoff', 'Yükselenler ve düşenler': 'swap_vert', 'Dünyadan': 'public',
}
function Tile({ title, icon: Icon, info, to, onMore, children }: {
  title: string; icon: typeof Info; info?: string; to?: string; onMore?: () => void; children: ReactNode
}) {
  return (
    <section className="hub-tile">
      <div className="hub-tile-heading">
        <div className="hub-tile-title"><h4>{TILE_SYMBOLS[title] ? <CareerIcon name={TILE_SYMBOLS[title]} /> : <Icon size={18} />}{title}</h4><InfoTip title={title}>{info ?? `${title}: seçili kariyerin son kaydındaki veriler.`}</InfoTip></div>
        {to && <Link to={to} className="text-gray-400 hover:text-cmt-text" aria-label={`${title}: tümü`}><ArrowRight className="h-4 w-4" /></Link>}
        {onMore && <button onClick={onMore} className="text-gray-400 hover:text-cmt-text" aria-label={`${title}: tümü`}><ArrowRight className="h-4 w-4" /></button>}
      </div>
      <div className="hub-tile-body">{children}</div>
    </section>
  )
}

function Empty({ icon: Icon, title, text }: { icon: typeof Info; title: string; text: string }) {
  return (
    <div className="hub-empty">
      <Icon size={26} /><b>{title}</b><p>{text}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return <div className="hub-kv-row"><span>{label}</span><b>{value}</b></div>
}

function PlayerLine({ m, right, sub, open }: { m: SquadMember; right?: ReactNode; sub?: ReactNode; open: (id: number) => void }) {
  return (
    <button onClick={() => open(m.player.id)} className="hub-player-row">
      <span className="flex min-w-0 items-center gap-2.5">
        <PlayerAvatar id={m.player.id} name={m.player.name} size={28} />
        <span className="min-w-0"><span className="block truncate text-[13px] text-gray-100">{m.player.name}</span>
          {sub && <span className="block truncate text-[11px] text-gray-400">{sub}</span>}</span>
      </span>
      {right ?? <RatingChip value={m.player.overall} size="sm" />}
    </button>
  )
}

function ShowAll({ to, label = 'TÜMÜ' }: { to: string; label?: string }) {
  return <Link to={to} className="hub-show-all">{label}<ChevronRight size={16} /></Link>
}

const squadOnly = (d: ClubView) => d.squad.filter(m => m.role !== 'LoanedOut')

// --- Kartlar ------------------------------------------------------------------------------------------------------
const iso = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`

function CalendarTile({ d }: { d: ClubView }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const [y, m, day] = d.snapshot.gameDate.split('-').map(Number)
  const days = Array.from({ length: 7 }, (_, i) => new Date(y, m - 1, day + i))
  const wd = new Intl.DateTimeFormat('tr-TR', { weekday: 'short' })
  const fixtures = d.fixtures ?? []
  const matchOn = (dt: Date) => fixtures.find(f => f.date === iso(dt))
  const upcoming = fixtures.filter(f => f.date >= d.snapshot.gameDate)
  const shown = selected ? fixtures.filter(f => f.date === selected) : upcoming.slice(0, 3)
  const opponent = (f: NonNullable<ClubView['fixtures']>[number]) => ({ id: f.isHome ? f.awayTeamId : f.homeTeamId, name: (f.isHome ? f.awayTeam : f.homeTeam) ?? '–' })
  return (
    <Tile title="Takvim" icon={CalendarIcon} info="Oyun tarihi ve sonraki 7 günün maçları. Bir güne tıklayarak o günün maçını, Tümü ile kayıtlı fikstürü açabilirsin.">
      <p className="calendar-today"><span>BUGÜN</span><b>{new Intl.DateTimeFormat('tr-TR', { dateStyle: 'full' }).format(days[0])}</b></p>
      <div className="calendar-strip" aria-label="Sonraki 7 gün">
        {days.map((dt, i) => (
          <button key={i} type="button" onClick={() => setSelected(v => v === iso(dt) ? null : iso(dt))}
            aria-label={`${gameDate(iso(dt))}${matchOn(dt) ? `, ${opponent(matchOn(dt)!).name}` : ', maç yok'}`}
            aria-pressed={selected === iso(dt)} aria-current={i === 0 ? 'date' : undefined}
            className={`calendar-day ${i === 0 ? 'is-today' : ''} ${selected === iso(dt) ? 'is-selected' : ''}`}>
            <small>{wd.format(dt)}</small><b>{dt.getDate()}</b>
            <span aria-label={matchOn(dt) ? 'Maç günü' : undefined}>{matchOn(dt) && <ClubCrest name={opponent(matchOn(dt)!).name} teamId={opponent(matchOn(dt)!).id} size={18} />}</span>
          </button>
        ))}
      </div>
      <div className="calendar-agenda" aria-live="polite">
        {shown.map((f, i) => <div key={`${f.id}-${f.date}`}>
          <h5>{new Intl.DateTimeFormat('tr-TR', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${f.date}T12:00:00`))}</h5>
          <div className={`calendar-fixture ${!selected && i === 0 ? 'is-next' : ''}`}>
            <b>{f.homeGoals != null && f.awayGoals != null ? `${f.homeGoals}–${f.awayGoals}` : f.time ?? '–'}</b>
            <div><strong><ClubCrest name={opponent(f).name} teamId={opponent(f).id} size={20} />{opponent(f).name}</strong>
              <small><CareerIcon name={f.isHome ? 'home' : 'north_east'} size={14} />{f.isHome ? 'İç saha' : 'Deplasman'} · {f.competition ?? 'Yarışma bilgisi yok'}</small>
              {!selected && i === 0 && <em>SIRADAKİ MAÇ</em>}
            </div>
          </div>
        </div>)}
        {shown.length === 0 && <p className="calendar-no-match">{selected ? 'Bu gün için kayıtlı maç yok.' : 'Bu kayıtta gelecek fikstür bulunmuyor.'}</p>}
      </div>
      {fixtures.length > 0 && <button type="button" className="hub-show-all" onClick={() => setAll(true)}>TÜMÜ<ChevronRight size={16} /></button>}
      {all && <SeasonCalendar d={d} onClose={() => setAll(false)} />}
    </Tile>
  )
}

function LeagueTile({ d }: { d: ClubView }) {
  const [full, setFull] = useState(false)
  const s = d.standing
  const around = useMemo(() => {
    const i = d.table.findIndex(r => r.isUser)
    if (i < 0) return []
    const start = Math.max(0, Math.min(i - 2, d.table.length - 5))
    return d.table.slice(start, start + 5)
  }, [d.table])
  return (
    <Tile title="Lig sırası" icon={ListOrdered} info={d.tableConsistent ? 'Oyundaki puan tablosundan.' : 'Sıra oyundaki tablodan. Puan/galibiyet sayıları bu kayıtta güncel tutulmuyor, gösterilmiyor.'}>
      <div className="mb-3 flex items-end gap-4">
        <div><div className="font-mono text-[11px] uppercase text-gray-500">SIRA</div><div className="font-tektur text-4xl font-black text-cmt-text">{s?.position ?? '–'}<span className="text-lg text-gray-500">.</span></div></div>
        <div className="pb-1 text-gray-400">{d.club.league ?? '–'}<br />
          <span className="text-[11px]">Geçen sezon {s?.previousPosition ? `${s.previousPosition}.` : '–'} · {s?.played ?? '–'} maç</span></div>
      </div>
      {full ? <FullTable d={d} /> : <ol className="divide-y divide-cmt-line overflow-hidden rounded-lg border border-cmt-line">
        {around.map(r => (
          <li key={r.teamId} className={`flex items-center justify-between px-3 py-1.5 ${r.isUser ? 'bg-cmt-blurple/15 font-bold text-cmt-text' : 'text-gray-300'}`}>
            <span><span className="mr-2 inline-block w-5 font-mono text-gray-500">{r.position}</span>{r.team}</span>
            {d.tableConsistent && <span className="font-mono">{r.points}</span>}
          </li>
        ))}
      </ol>}
      {d.table.length > 5 && <button onClick={() => setFull(f => !f)} className="mt-2 self-start text-[12px] text-cmt-blurple hover:underline">
        {full ? 'Kısa göster' : `Tüm tablo (${d.table.length} takım)`}</button>}
    </Tile>
  )
}

function SquadTile({ d, open }: { d: ClubView; open: (id: number) => void }) {
  const squad = squadOnly(d)
  const best = [...squad].sort((a, b) => (b.player.overall ?? 0) - (a.player.overall ?? 0))[0]
  const pot = [...squad].sort((a, b) => (b.player.potential ?? 0) - (a.player.potential ?? 0))[0]
  return (
    <Tile title="Kadro" icon={Users} to="/squad">
      <Row label="Oyuncu" value={d.summary.players} />
      <Row label="Ortalama yaş" value={dec1(d.summary.averageAge)} />
      <Row label="21 yaş ve altı" value={squad.filter(m => (m.player.age ?? 99) <= 21).length} />
      <Row label="Kiralıkta" value={d.squad.filter(m => m.role === 'LoanedOut').length} />
      <div className="mt-3 space-y-1 border-t border-cmt-line pt-2">
        {best && <PlayerLine m={best} open={open} sub="En iyi oyuncu" />}
        {pot && <PlayerLine m={pot} open={open} sub="En yüksek potansiyel" right={<RatingChip value={pot.player.potential} size="sm" />} />}
      </div>
    </Tile>
  )
}

function WagesTile({ d, open }: { d: ClubView; open: (id: number) => void }) {
  const top = squadOnly(d).filter(m => m.player.wage !== null).sort((a, b) => (b.player.wage ?? 0) - (a.player.wage ?? 0)).slice(0, 5)
  return (
    <Tile title="Kadro rolleri ve maaşlar" icon={DollarSign} info="Haftalık maaş varsayımı (oyunda doğrulanacak).">
      {top.length === 0 ? <Empty icon={DollarSign} title="Maaş verisi yok" text="Bu kayıtta oyuncu maaşları okunamadı." /> : <>
        {top.map(m => <PlayerLine key={m.player.id} m={m} open={open} sub={m.player.contractEnd ? `Sözleşme ${m.player.contractEnd}` : undefined}
          right={<span className="font-mono text-[13px] font-bold text-cmt-text">{money(m.player.wage)}</span>} />)}
        <div className="mt-2 flex justify-between border-t border-cmt-line pt-2 text-gray-400">Toplam / hafta <b className="font-mono text-cmt-text">{money(d.summary.wages)}</b></div>
      </>}
    </Tile>
  )
}

function NextMatchTile({ d }: { d: ClubView }) {
  const next = (d.fixtures ?? []).find(f => f.date >= d.snapshot.gameDate && f.homeGoals == null)
  return (
    <Tile title="Sıradaki maç" icon={CalendarIcon} info="Fikstür tablosundan; skorlar export'ta yok.">
      {!next ? <Empty icon={CalendarIcon} title="Fikstür yok" text="Bu snapshot'ta maç takvimi yok. Exporter 0.4.0 ile alınan export'larda görünür." /> : <>
        <p className="match-competition">{next.competition ?? 'Yarışma bilgisi yok'}</p>
        <div className="match-versus">
          <div className={`match-side ${next.isHome ? 'is-user' : ''}`}><ClubCrest name={next.homeTeam ?? '–'} teamId={next.homeTeamId} size={40} /><b>{next.homeTeam ?? '–'}</b></div>
          <div className="match-time"><b>{next.time ?? '–'}</b><small>{gameDate(next.date)}</small></div>
          <div className={`match-side ${!next.isHome ? 'is-user' : ''}`}><ClubCrest name={next.awayTeam ?? '–'} teamId={next.awayTeamId} size={40} /><b>{next.awayTeam ?? '–'}</b></div>
        </div>
        <p className="match-location"><CareerIcon name={next.isHome ? 'home' : 'north_east'} size={15} />{next.isHome ? 'İç saha' : 'Deplasman'}</p>
        {next.homeLeaguePosition != null && <Row label="Ev sahibi lig sırası" value={next.homeLeaguePosition} />}
        {next.awayLeaguePosition != null && <Row label="Deplasman lig sırası" value={next.awayLeaguePosition} />}
        {next.round != null && <Row label="Tur" value={next.round} />}
      </>}
    </Tile>
  )
}

function SeasonStatsTile({ d, open }: { d: ClubView; open: (id: number) => void }) {
  const played = squadOnly(d).filter(m => (m.appearances ?? 0) > 0)
  const top = [...played].sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0)).slice(0, 5)
  const most = [...played].sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0))[0]
  return (
    <Tile title="Sezon liderleri" icon={BarChart3} info="Oyuncu maç puanı geçmişinden (exporter 0.4.0): bu sezonki maç, dakika, ortalama puan.">
      {played.length === 0 ? <Empty icon={BarChart3} title="Bu kayıtta sezon istatistiği yok"
        text="Maç puanı geçmişi exporter 0.4.0 ile gelir; birkaç maç oynandıktan sonra görünür." /> : <>
        <Row label="Forma giyen oyuncu" value={played.length} />
        {most && <Row label="En çok süre" value={<span className="text-[13px]">{most.player.name} · {num(most.minutes)} dk</span>} />}
        <div className="mt-2 border-t border-cmt-line pt-2">
          {top.map(m => <PlayerLine key={m.player.id} m={m} open={open} sub={`${m.appearances} maç · ${num(m.minutes)} dk`}
            right={<span className="font-tektur text-sm font-bold text-cmt-text">{m.averageRating?.toFixed(2) ?? '–'}</span>} />)}
        </div>
      </>}
    </Tile>
  )
}

function TacticTile({ d, open }: { d: ClubView; open: (id: number) => void }) {
  const xi = d.squad.filter(m => m.role === 'XI' && m.slot)
  return (
    <Tile title="Taktik ve duran toplar" icon={Shield} to="/squad">
      <p className="mb-3 text-gray-400">{formationOf(xi.map(m => m.slot!)) ?? '–'} · {d.club.name} ilk 11</p>
      <div className="grid gap-5 md:grid-cols-[320px_1fr]">
        <LineupPitch members={xi} squad={d.squad} open={open} captainId={d.setPieces.find(s => s.role === 'captain')?.playerId} />
        <div className="divide-y divide-cmt-line self-start overflow-hidden rounded-lg border border-cmt-line">
          {d.setPieces.filter(s => s.role !== 'cornerSupport').map(s => (
            <button key={s.role} onClick={() => open(s.playerId)} className="flex w-full items-center justify-between bg-cmt-sub px-3 py-2.5 text-left hover:bg-cmt-card">
              <span className="font-tektur text-[11px] font-bold text-gray-400">{SET_PIECE_LABELS[s.role] ?? s.role}</span>
              <span className="flex flex-1 items-center gap-2 pl-6"><PlayerAvatar id={s.playerId} name={s.name} size={22} /><span className="text-[13px] text-cmt-blurple">{s.name}</span></span>
              <RatingChip value={s.overall} size="sm" />
            </button>
          ))}
          {d.setPieces.length === 0 && <p className="p-3 text-gray-500">Duran top sorumluları kayıtta yok.</p>}
          <CornerSupport d={d} open={open} />
          <div className="flex gap-6 bg-cmt-sub px-3 py-2.5 text-[12px] text-gray-400">
            <span>Sav. derinliği <b className="text-cmt-text">{d.club.defensiveDepth ?? '–'}</b></span>
            <span>Oyun kurma <b className="text-cmt-text">{d.club.buildUpPlayLabel ?? '–'}</b></span>
          </div>
        </div>
      </div>
    </Tile>
  )
}

const KIND: Record<NonNullable<FeedItem['kind']>, string> = {
  permanent: 'Bonservis', loan: 'Kiralık', loanReturn: 'Kiralıktan dönüş', free: 'Serbest imza', released: 'Serbest kaldı',
}

function transferLine(t: FeedItem, open: (id: number) => void) {
  return (
    <button key={`${t.playerId}-${t.date}`} onClick={() => t.playerId && open(t.playerId)} className="flex w-full items-center gap-2.5 rounded px-1.5 py-1.5 text-left hover:bg-cmt-card">
      {t.playerId ? <PlayerAvatar id={t.playerId} name={t.playerName ?? 'Oyuncu'} size={26} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-gray-100">{t.playerName}</span>
        <span className="flex flex-wrap items-center gap-1 text-[11px] text-gray-400">
          <span className="inline-flex items-center gap-1">
            {t.fromClub ? <ClubCrest name={t.fromClub} teamId={t.fromClubId} size={15} /> : null}
            <span>{t.fromClub ?? 'Bilinmiyor'}</span>
          </span>
          <ArrowRight className="h-3 w-3 shrink-0" />
          <span className="inline-flex items-center gap-1 text-gray-200">
            {t.toClub ? <ClubCrest name={t.toClub} teamId={t.toClubId} size={15} /> : null}
            <span>{t.toClub ?? 'Bilinmiyor'}</span>
          </span>
          <span className="text-gray-500">· {t.kind ? `${KIND[t.kind]} · ` : ''}{gameDate(t.date)}</span>
        </span>
      </span>
      {t.fee != null && (
        <span className={`shrink-0 font-mono text-xs font-bold ${t.fee > 0 ? 'text-[#14b341]' : 'text-gray-400'}`}>
          {t.fee > 0 ? money(t.fee) : 'Bedelsiz'}
        </span>
      )}
    </button>
  )
}

function MarketTile({ items, loading, open }: { items: FeedItem[]; loading: boolean; open: (id: number) => void }) {
  const moves = items.filter(t => t.type === 'transfer').slice(0, 6)
  return (
    <Tile title="Transfer piyasası" icon={ArrowLeftRight} to="/transfer/market" info="Kayıt içi dünya transfer geçmişi, gerçek bonservis bedelleri ve sezon arşivi.">
      {loading ? <p className="text-gray-500">Yükleniyor…</p>
        : moves.length === 0 ? <Empty icon={ArrowLeftRight} title="Henüz kulüp değişimi yok" text="İki snapshot arasında kulübü değişen oyuncular burada görünür." />
        : <>{moves.map(t => transferLine(t, open))}<ShowAll to="/transfer/market" /></>}
    </Tile>
  )
}

function ClubTransfersTile({ items, d, open }: { items: FeedItem[]; d: ClubView; open: (id: number) => void }) {
  const mine = items.filter(t => t.type === 'transfer' && (t.toClubId === d.club.id || t.fromClubId === d.club.id))
  const ins = mine.filter(t => t.toClubId === d.club.id).length
  return (
    <Tile title="Kulübün transferleri" icon={ArrowLeftRight} to="/transfer/market?kapsam=club" info="Kayıt içi kulüp transfer geçmişi ve snapshot'lar arası gelen/giden oyuncular.">
      <Row label="Gelen" value={ins} />
      <Row label="Giden" value={mine.length - ins} />
      <div className="mt-2 border-t border-cmt-line pt-2">
        {mine.length === 0 ? <p className="text-gray-400">Bu dalda kulübün transferi görülmedi.</p> : mine.slice(0, 5).map(t => transferLine(t, open))}
      </div>
      <ShowAll to="/transfer/market?kapsam=club" />
    </Tile>
  )
}

function ExpiringTile({ d, open }: { d: ClubView; open: (id: number) => void }) {
  const year = d.snapshot.seasonEndYear
  const list = squadOnly(d).filter(m => m.player.contractEnd !== null && m.player.contractEnd <= year + 1)
    .sort((a, b) => (a.player.contractEnd! - b.player.contractEnd!) || (b.player.overall ?? 0) - (a.player.overall ?? 0))
  const thisSeason = list.filter(m => m.player.contractEnd! <= year).length
  return (
    <Tile title="Biten sözleşmeler" icon={FileClock} to="/squad">
      <div className="mb-2 flex items-end gap-3"><span className="font-tektur text-5xl font-black text-cmt-text">{thisSeason}</span>
        <span className="pb-1.5 text-gray-400">sözleşme {year} veya önce bitiyor</span></div>
      {list.slice(0, 5).map(m => <PlayerLine key={m.player.id} m={m} open={open} sub={`Sözleşme ${m.player.contractEnd}'te bitiyor`} />)}
      {list.length === 0 && <p className="text-gray-400">Önümüzdeki iki sezonda biten sözleşme yok.</p>}
    </Tile>
  )
}

const SEVERITY: Record<number, string> = { 3: 'Ağır' }
const PHASE: Record<number, string> = { 3: 'Fizyoterapi', 4: 'Spor salonu' }

/** Sakatlık odası (kariyer kaydı): kadro ortalama kondisyonu, sakatlar (şiddet, aşama, dönüş) ve düşük kondisyonlular. */
function InjuriesTile({ d, open }: { d: ClubView; open: (id: number) => void }) {
  const squad = squadOnly(d)
  const withFit = squad.filter(m => m.fitness)
  if (withFit.length > 0) {
    const avg = Math.round(withFit.reduce((a, m) => a + m.fitness!.value, 0) / withFit.length)
    const injured = withFit.filter(m => m.fitness!.injured)
    const low = withFit.filter(m => !m.fitness!.injured && m.fitness!.value < 90).sort((a, b) => a.fitness!.value - b.fitness!.value)
    const tone = (v: number) => v >= 85 ? 'text-[#14b341]' : v >= 70 ? 'text-[#ffd200]' : v >= 50 ? 'text-[#ff860a]' : 'text-[#f84a46]'
    return (
      <Tile title="Sakatlık odası" icon={Cross} info="Kariyer kaydından: kondisyon (0–100), sakatlık şiddeti, tedavi aşaması ve beklenen dönüş. Listede olmayan oyuncu tam kondisyonda.">
        <div className="mb-3 flex items-baseline gap-2">
          <span className={`font-tektur text-4xl font-black ${tone(avg)}`}>{avg}</span>
          <span className="font-mono text-[11px] uppercase text-gray-400">ortalama kadro kondisyonu</span>
        </div>
        {injured.map(m => {
          const f = m.fitness!
          const bits = [f.severity !== null ? SEVERITY[f.severity] ?? `Şiddet ${f.severity}` : null,
            f.phase !== null ? PHASE[f.phase] ?? `Aşama ${f.phase}` : null, f.expectedReturn ? `dönüş ${gameDate(f.expectedReturn)}` : null]
          return <PlayerLine key={m.player.id} m={m} open={open} sub={bits.filter(Boolean).join(' · ')}
            right={<span className="rounded bg-[#f84a46]/15 px-1.5 py-0.5 font-mono text-[11px] text-[#f84a46]">Sakat</span>} />
        })}
        {low.slice(0, 6 - Math.min(injured.length, 4)).map(m => (
          <PlayerLine key={m.player.id} m={m} open={open} sub={m.fitness!.daysToFit ? `tam kondisyona ${m.fitness!.daysToFit} gün` : 'düşük kondisyon'}
            right={<span className={`font-tektur text-sm font-bold ${tone(m.fitness!.value)}`}>{m.fitness!.value}</span>} />
        ))}
        {injured.length === 0 && low.length === 0 && <Empty icon={Cross} title="Herkes hazır" text="Sakat ya da kondisyonu düşük oyuncu yok." />}
      </Tile>
    )
  }
  const injured = squad.filter(m => m.injured)
  return (
    <Tile title="Sakatlık odası" icon={Cross} info="Kadro tablosundaki sakatlık işareti; dönüş tarihi export'ta yok.">
      {injured.length === 0 ? <Empty icon={Cross} title="Sakat oyuncu yok" text="Snapshot anında kadroda sakat olarak işaretli oyuncu bulunmuyor." />
        : injured.map(m => <PlayerLine key={m.player.id} m={m} open={open} sub={m.player.position ?? undefined} />)}
    </Tile>
  )
}

function FullTable({ d }: { d: ClubView }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="border-b border-cmt-line font-mono text-[11px] uppercase text-gray-500">
            <th className="py-2 pr-2">#</th><th className="py-2">TAKIM</th>
            {d.tableConsistent && <><th className="py-2 text-right">O</th><th className="py-2 text-right">G</th><th className="py-2 text-right">B</th>
              <th className="py-2 text-right">M</th><th className="py-2 text-right">AV</th><th className="py-2 text-right">P</th></>}
            <th className="py-2 text-right">GEÇEN SEZON</th></tr></thead>
          <tbody className="divide-y divide-cmt-line">
            {d.table.map(r => (
              <tr key={r.teamId} className={r.isUser ? 'bg-cmt-blurple/15 font-bold text-cmt-text' : 'text-gray-300'}>
                <td className="py-1.5 pr-2 font-mono text-gray-500">{r.position ?? '–'}</td><td className="py-1.5">{r.team}</td>
                {d.tableConsistent && <><td className="py-1.5 text-right font-mono">{r.played}</td><td className="py-1.5 text-right font-mono">{r.won}</td>
                  <td className="py-1.5 text-right font-mono">{r.drawn}</td><td className="py-1.5 text-right font-mono">{r.lost}</td>
                  <td className="py-1.5 text-right font-mono">{(r.goalsFor ?? 0) - (r.goalsAgainst ?? 0)}</td><td className="py-1.5 text-right font-mono font-bold">{r.points}</td></>}
                <td className="py-1.5 text-right font-mono text-gray-500">{r.previousPosition ? `${r.previousPosition}.` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!d.tableConsistent && <p className="mt-3 text-[11px] text-[#ffb020]">Puan, galibiyet ve gol sayıları oyunun bu kayıtta tuttuğu tabloda güncel değil; sıra gösteriliyor.</p>}
    </>
  )
}

function FinanceTile({ d }: { d: ClubView }) {
  const [open, setOpen] = useState(false)
  const f = d.finance
  if (f) {
    const used = f.transferBudgetStart !== null && f.transferBudget !== null ? f.transferBudgetStart - f.transferBudget : null
    const share = f.transferBudgetStart ? Math.max(0, Math.min(100, ((f.transferBudget ?? 0) / f.transferBudgetStart) * 100)) : 0
    const wageShare = f.wageBudget ? Math.max(0, Math.min(100, ((f.wageBudgetLeft ?? 0) / f.wageBudget) * 100)) : null
    const cats = f.categories ?? []
    const top = (pick: (c: (typeof cats)[number]) => number) => cats.filter(c => pick(c) > 0).sort((a, b) => pick(b) - pick(a)).slice(0, 3)
    const topIncome = top(c => c.income), topExpense = top(c => c.expense)
    return (
      <Tile title="Kulüp finansı" icon={DollarSign} info="Kariyer kaydından (EUR). Transfer bütçesi sezon başı ve kalan; maaş bütçesi sezonluk ve kalan; son hareketler oyunun finans kaydı.">
        <div className="font-mono text-[11px] uppercase text-gray-500">TRANSFER BÜTÇESİ</div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="font-tektur text-2xl font-black text-cmt-mint">{money(f.transferBudget)}</span>
          <span className="text-[12px] text-gray-400">sezon başı {money(f.transferBudgetStart)}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-cmt-card"><div className="h-full bg-cmt-mint" style={{ width: `${share}%` }} /></div>
        <div className="mt-1 text-[11px] text-gray-500">Harcanan {money(used)}</div>
        <div className="mt-3 border-t border-cmt-line pt-2">
          <Row label="Haftalık maaş toplamı" value={money(d.summary.wages)} />
          <Row label="Haftalık maaş boşluğu" value={money(f.wageHeadroom)} />
          <Row label="Sezon maaş bütçesi (kalan)" value={<>{money(f.wageBudgetLeft)} <span className="text-[11px] font-normal text-gray-500">/ {money(f.wageBudget)}</span></>} />
          {wageShare !== null && <div className="mt-1 h-1.5 overflow-hidden rounded bg-cmt-card" title={`Maaş bütçesinin %${Math.round(wageShare)} kaldı`}><div className="h-full bg-cmt-blurple" style={{ width: `${wageShare}%` }} /></div>}
        </div>
        {!!f.categories?.length && <div className="mt-3 border-t border-cmt-line pt-2">
          <Row label="Sezon geliri (kayıt)" value={money(f.categories.reduce((n, c) => n + c.income, 0))} />
          <Row label="Sezon gideri (kayıt)" value={money(f.categories.reduce((n, c) => n + c.expense, 0))} />
          <Row label="Sezon neti" value={money(f.categories.reduce((n, c) => n + c.income - c.expense, 0))} />
          {(topIncome.length > 0 || topExpense.length > 0) && <div className="mt-2 grid grid-cols-2 gap-3 text-[11px]" aria-label="En büyük finans kategorileri">
            {([['GELİR', topIncome, 'income', 'text-[#14b341]'], ['GİDER', topExpense, 'expense', 'text-[#f84a46]']] as const).map(([title, list, key, color]) => <div key={title}>
              <div className="mb-0.5 font-mono text-[11px] text-gray-500">{title}</div>
              {list.length === 0 ? <div className="text-gray-600">–</div> : list.map(c => <div key={c.kind} className="flex justify-between gap-2">
                <span className="truncate text-gray-300">{c.label ?? `Tür ${c.kind}`}</span><span className={`font-mono ${color}`}>{money(c[key])}</span></div>)}
            </div>)}
          </div>}
          {f.transactions.length === 0 && <button className="mt-2 text-xs text-indigo-300 hover:text-indigo-200" onClick={() => setOpen(true)}>Finans ayrıntısı →</button>}
        </div>}
        {f.transactions.length > 0 && (
          <div className="mt-3 border-t border-cmt-line pt-2">
            <div className="mb-1 font-mono text-[11px] uppercase text-gray-500">SON HAREKETLER</div>
            {f.transactions.slice(0, 5).map((t, i) => (
              <div key={i} className="flex items-center justify-between py-0.5 text-[12px]">
                <span className="truncate text-gray-300">{t.label ?? `Tür ${t.kind ?? '?'}`} <span className="text-gray-500">· {gameDate(t.date)}</span></span>
                <span className={`font-mono ${t.amount >= 0 ? 'text-[#14b341]' : 'text-[#f84a46]'}`}>{t.amount >= 0 ? '+' : '−'}{money(Math.abs(t.amount))}</span>
              </div>
            ))}
            <button className="mt-3 text-xs text-indigo-300 hover:text-indigo-200" onClick={() => setOpen(true)}>Tüm finans hareketleri ({f.transactions.length}) →</button>
          </div>
        )}
        {open && <FinanceHistory finance={f} onClose={() => setOpen(false)} />}
      </Tile>
    )
  }
  return (
    <Tile title="Kulüp finansı" icon={DollarSign} info="Transfer bütçesi bellekten okunur (oyunda doğrulandı); maaş toplamı kadrodaki oyunculardan.">
      <Row label="Transfer bütçesi" value={<span className="text-cmt-mint">{money(d.snapshot.transferBudget)}</span>} />
      <Row label="Maaş bütçesi" value={money(d.snapshot.wageBudget)} />
      <Row label="Haftalık maaş toplamı" value={money(d.summary.wages)} />
      <Row label="Kadro değeri (tahmini)" value={money(d.summary.squadValue)} />
      <Row label="Stadyum kapasitesi" value={num(d.club.stadiumCapacity)} />
    </Tile>
  )
}

function ClubTile({ d }: { d: ClubView }) {
  const c = d.club
  return (
    <Tile title="Kulüp" icon={Building2} to="/trophies">
      <Row label="Kulüp değeri" value={c.clubWorth !== null ? money(c.clubWorth * 1000) : '–'} />
      <Row label="Yurt içi prestij" value={c.domesticPrestige !== null ? `${c.domesticPrestige}/10` : '–'} />
      <Row label="Uluslararası prestij" value={c.internationalPrestige !== null ? `${c.internationalPrestige}/10` : '–'} />
      <Row label="Popülerlik" value={c.popularity !== null && c.popularity !== undefined ? `${c.popularity}/10` : '–'} />
      <Row label="Altyapı gelişimi" value={c.youthDevelopment !== null ? `${c.youthDevelopment}/10` : '–'} />
      <Row label="Ezeli rakip" value={c.rivalTeam ?? '–'} />
      <Row label="Lig şampiyonluğu" value={c.leagueTitles ?? '–'} />
      <Row label="Avrupa kupası" value={(c.clWins ?? 0) + (c.elWins ?? 0) + (c.eclWins ?? 0)} />
      <Row label="Yerel kupa" value={c.domesticCups ?? '–'} />
    </Tile>
  )
}

function YouthTile({ d, open }: { d: ClubView; open: (id: number) => void }) {
  const young = squadOnly(d).filter(m => (m.player.age ?? 99) <= 21).sort((a, b) => (b.player.potential ?? 0) - (a.player.potential ?? 0)).slice(0, 5)
  return (
    <Tile title="Gençler" icon={GraduationCap} to="/youth">
      {young.length === 0 ? <Empty icon={GraduationCap} title="21 yaş altı oyuncu yok" text="A takım kadrosunda 21 yaş ve altı oyuncu bulunmuyor." />
        : <>{young.map(m => <PlayerLine key={m.player.id} m={m} open={open} sub={`${m.player.age} yaş · ${m.player.position ?? '–'}`}
            right={<span className="flex gap-1"><RatingChip value={m.player.overall} size="sm" /><RatingChip value={m.player.potential} size="sm" /></span>} />)}
          <ShowAll to="/youth" /></>}
    </Tile>
  )
}

// --- CMTracker'daki ek kartlar ------------------------------------------------------------------------------------
/** Verisi export'ta olmayan kart: CMTracker'daki gibi kesik çizgili, kum saati ve açıklama. */
function NoDataTile({ title, icon: Icon, text }: { title: string; icon: typeof Info; text: string }) {
  return (
    <section className="hub-tile is-placeholder">
      <div className="hub-tile-heading"><div className="hub-tile-title"><h4><Icon size={18} />{title}</h4><InfoTip title={title}>{text}</InfoTip></div></div>
      <div className="hub-placeholder"><Hourglass size={26} /><p>Bu yüklemede veri yok: veri geldiğinde yeniden görünür.</p><small>{text}</small></div>
    </section>
  )
}

/** Kadro morali (kariyer kaydı): ortalama, oyunun moral bileşenleri ve en mutsuz oyuncular. */
function MoraleTile({ d, open }: { d: ClubView; open: (id: number) => void }) {
  const members = d.squad.filter(m => m.morale && m.role !== 'LoanedOut')
  const avg = (f: (m: PlayerMorale) => number | null) => {
    const v = members.map(m => f(m.morale!)).filter((n): n is number => n !== null)
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
  }
  const team = avg(m => m.value)
  const parts: [string, number | null][] = [['Takım performansı', avg(m => m.teamPerformance)], ['Oyuncu performansı', avg(m => m.playerPerformance)],
    ['Sözleşme', avg(m => m.contract)], ['Oynama süresi', avg(m => m.playingTime)]]
  const unhappy = [...members].sort((a, b) => a.morale!.value - b.morale!.value).slice(0, 3)
  return (
    <Tile title="Kadro morali" icon={Smile} to="/squad" info="Kariyer kaydındaki oyuncu morali ve oyunun hesapladığı bileşenler (0–100), kadro ortalaması.">
      <div className="flex items-center gap-5">
        <div>
          <div className={`font-tektur text-5xl font-black ${moraleTone(team).text}`}>{team ?? '–'}</div>
          <div className="mt-1 font-mono text-[11px] uppercase text-gray-400">KADRO ORT. · {moraleTone(team).label}</div>
        </div>
        <div className="flex-1 space-y-2">
          {parts.map(([label, v]) => (
            <div key={label} className="grid grid-cols-[1fr_70px_24px] items-center gap-2 text-[12px]">
              <span className="truncate text-gray-400">{label}</span>
              <span className="h-1.5 overflow-hidden rounded bg-cmt-card"><span className={`block h-full ${moraleTone(v).bg}`} style={{ width: `${v ?? 0}%` }} /></span>
              <span className="text-right font-mono text-gray-200">{v ?? '–'}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 border-t border-cmt-line pt-3">
        <div className="mb-1.5 font-mono text-[11px] uppercase text-gray-500">EN DÜŞÜK MORAL</div>
        {unhappy.map(m => (
          <button key={m.player.id} onClick={() => open(m.player.id)} className="flex w-full items-center justify-between py-1 text-left text-[13px] hover:text-cmt-text">
            <span className="truncate text-gray-200">{m.player.name}
              {m.morale!.events.length > 0 && <span className="ml-2 text-[11px] text-[#ff860a]">{m.morale!.events.map(moraleEvent).join(', ')}</span>}
            </span>
            <span className={`font-tektur font-bold ${moraleTone(m.morale!.value).text}`}>{m.morale!.value}</span>
          </button>
        ))}
      </div>
    </Tile>
  )
}

function TeamPowerTile({ d }: { d: ClubView }) {
  const xi = d.squad.filter(m => m.role === 'XI')
  const lineAvg = (groups: string[]) => {
    const v = xi.filter(m => groups.includes(m.player.positionGroup ?? '')).map(m => m.player.overall).filter((n): n is number => n !== null)
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
  }
  const best = d.summary.bestXiAverage === null ? null : Math.round(d.summary.bestXiAverage)
  const lines: [string, number | null][] = [['HÜC', lineAvg(['ATT'])], ['ORT', lineAvg(['MID'])], ['DEF', lineAvg(['DEF', 'GK'])]]
  const color = ratingClass
  return (
    <Tile title="Takım gücü" icon={Zap} to="/squad" info="En iyi 11 ve hat ortalamaları ilk 11'den; oyun içi reyting oyunun takım kartındaki değer.">
      <div className="flex items-center gap-6">
        <div><div className="font-tektur text-5xl font-black text-cmt-text">{best ?? '–'}</div><div className="mt-1 font-mono text-[11px] uppercase text-gray-400">EN İYİ 11 OVR</div></div>
        <div className="flex-1 space-y-3">
          {lines.map(([label, v]) => (
            <div key={label} className="grid grid-cols-[32px_1fr_30px] items-center gap-2">
              <span className="font-mono text-[11px] text-gray-400">{label}</span>
              <span className="h-2 overflow-hidden rounded bg-cmt-card"><span className={`block h-full ${color(v)}`} style={{ width: `${v ?? 0}%` }} /></span>
              <RatingChip value={v} size="sm" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 border-t border-cmt-line pt-3">
        <div className="font-mono text-[11px] uppercase text-gray-500">OYUN İÇİ REYTİNG</div>
        <div className="team-card-ratings">
          {([['GEN', d.club.overall], ['HÜC', d.club.attack], ['ORT', d.club.midfield], ['DEF', d.club.defense]] as const).map(([label, value]) => <span key={label}><small>{label}</small><RatingChip value={value} /></span>)}
        </div>
      </div>
    </Tile>
  )
}

function StartingXiTile({ d, open }: { d: ClubView; open: (id: number) => void }) {
  const xi = d.squad.filter(m => m.role === 'XI' && m.slot)
  return (
    <Tile title="İlk 11" icon={Shield} to="/squad">
      <p className="mb-2 text-gray-400">{formationOf(xi.map(m => m.slot!)) ?? '–'}</p>
      <LineupPitch members={xi} squad={d.squad} open={open} captainId={d.setPieces.find(s => s.role === 'captain')?.playerId} />
    </Tile>
  )
}

function FormFixturesTile({ d }: { d: ClubView }) {
  const fixtures = d.fixtures ?? []
  const past = fixtures.filter(f => f.date < d.snapshot.gameDate).reverse().slice(0, 5)
  const next = fixtures.filter(f => f.date >= d.snapshot.gameDate).slice(0, 5)
  const last = d.standing?.previousPosition
  if (fixtures.length === 0) return <NoDataTile title="Sonuçlar ve fikstür" icon={ListOrdered}
    text={`Bu kayıtta gösterilebilecek fikstür yok.${last ? ` Kayıttaki önceki lig sırası: ${last}.` : ''}`} />
  const line = (f: NonNullable<ClubView['fixtures']>[number]) => {
    const played = f.homeGoals != null && f.awayGoals != null
    const [us, them] = f.isHome ? [f.homeGoals ?? 0, f.awayGoals ?? 0] : [f.awayGoals ?? 0, f.homeGoals ?? 0]
    const res = !played ? null : us > them ? ['G', 'bg-[#14b341]'] : us === them ? ['B', 'bg-cmt-select'] : ['M', 'bg-[#f84a46]']
    return (
      <li key={`${f.id}-${f.date}`} className="flex items-center justify-between gap-2 py-1.5">
        <span className="shrink-0 text-gray-400">{gameDate(f.date)}</span>
        <span className="min-w-0 truncate text-gray-200">{f.isHome ? f.awayTeam : f.homeTeam} <span className="text-gray-500">({f.isHome ? 'İ' : 'D'})</span>
          {f.competition && <span className="ml-1 text-[11px] text-gray-500">{f.competition}</span>}</span>
        {res ? <span className="flex shrink-0 items-center gap-1.5 font-mono text-cmt-text">{f.homeGoals}-{f.awayGoals}
          <span className={`inline-flex h-4 w-4 items-center justify-center rounded text-[11px] font-bold ${res[1]}`}>{res[0]}</span></span>
          : <span className="shrink-0 font-mono text-gray-500">{f.time ?? ''}</span>}
      </li>
    )
  }
  return (
    <Tile title="Sonuçlar ve fikstür" icon={ListOrdered} info="Lig sırası gösterilemediği için son maçlar ve planlı fikstür gösteriliyor. Skorlar mevcutsa kariyer kaydından gelir.">
      <div className="font-mono text-[11px] uppercase text-gray-500">OYNANAN · SON OLAN ÖNCE</div>
      <ul className="mb-3 divide-y divide-cmt-line">{past.length ? past.map(line) : <li className="py-1.5 text-gray-500">Henüz maç yok.</li>}</ul>
      <div className="font-mono text-[11px] uppercase text-gray-500">SIRADAKİLER</div>
      <ul className="divide-y divide-cmt-line">{next.map(line)}</ul>
    </Tile>
  )
}

function SilverwareTile({ d }: { d: ClubView }) {
  const won = d.career?.trophiesWon ?? []
  const fromArchive = d.career?.trophiesSource === 'archive'
  const c = d.club
  return (
    <Tile title="Kupalar" icon={Trophy} to="/trophies" info="Bu kulüpte kazanılanlar kayıttaki sezon arşivinden; arşiv yoksa bilinmiyor (oyunun kulüp sayaçları kariyerde artmıyor).">
      <div className="font-mono text-[11px] uppercase text-gray-500">BU KARİYERDE KAZANILANLAR</div>
      {won.length === 0 ? <p className="mb-3 mt-1 text-gray-400">{fromArchive ? 'Henüz kupa yok.' : 'Bilinmiyor: kayıttaki sezon arşivi gerekli.'}</p>
        : <ul className="mb-3 mt-1">{won.map(w => <li key={w.trophy} className="flex items-center justify-between py-1 text-gray-200"><span className="flex items-center gap-2"><TrophyImage id={w.competitionId} name={w.trophy} size={24} />{w.trophy}</span><b className="font-tektur text-[#ffd200]">×{w.count}</b></li>)}</ul>}
      <div className="border-t border-cmt-line pt-2 font-mono text-[11px] uppercase text-gray-500">KULÜBÜN OYUNDAKİ TOPLAMI</div>
      <Row label="Lig" value={c.leagueTitles ?? '–'} />
      <Row label="Yerel kupa" value={c.domesticCups ?? '–'} />
      <Row label="Avrupa" value={(c.clWins ?? 0) + (c.elWins ?? 0) + (c.eclWins ?? 0)} />
    </Tile>
  )
}

/** Kariyer kimliği: kulüp, lig, save ve izlenen dönem. Menajer adı export'ta yok. */
function IdentityTile({ d, career }: { d: ClubView; career: ReturnType<typeof useCareer> }) {
  return (
    <Tile title="Kariyer kimliği" icon={BadgeCheck}>
      <div className="mb-3 flex items-center gap-3">
        <ClubCrest name={d.club.name} color1={d.club.color1} color2={d.club.color2} size={36} teamId={d.club.id} />
        <div><b className="font-tektur text-cmt-text">{d.club.name}</b><div className="text-[11px] text-gray-400">{d.club.league ?? '–'}</div></div>
      </div>
      <Row label="Kariyer başlangıcı (izlenen)" value={gameDate(d.career?.firstGameDate)} />
      <Row label="Save" value={<span className="font-mono text-[12px]">{d.snapshot.saveUid.slice(0, 8)}</span>} />
      <Row label="Dal" value={career.save && career.save.branches.length > 1 && career.branch ? `Dal ${career.branch.branch}` : 'Tek dal'} />
      <Row label="Oyun" value="FC 27 · Kariyer" />
    </Tile>
  )
}

/** Son yüklemeden beri: son iki snapshot arasındaki kulüp değişimleri, gelişimler ve sözleşmeler (haber akışından). */
function ChangesTile({ d, items, open }: { d: ClubView; items: FeedItem[]; open: (id: number) => void }) {
  const prev = d.career?.previousSnapshotDate
  if (!prev) return <NoDataTile title="Son yüklemeden beri" icon={Diff} text="Bu kariyerin ikinci export'undan sonra dolar." />
  const latest = items.filter(i => i.date === d.snapshot.gameDate)
  const mine = latest.filter(i => i.userTeam)
  const count = (t: string) => latest.filter(i => i.type === t).length
  const label: Record<string, string> = { transfer: 'kulüp değiştirdi', growth: 'OVR', decline: 'OVR', potential: 'POT', contract: 'sözleşme', new: 'yeni oyuncu' }
  return (
    <Tile title="Son yüklemeden beri" icon={Diff} to="/transfers" info={`${gameDate(prev)} → ${gameDate(d.snapshot.gameDate)} snapshot'ları arasında.`}>
      <div className="mb-2 grid grid-cols-3 gap-2 text-center">
        {([['Transfer', count('transfer')], ['Gelişim', count('growth')], ['POT', count('potential')]] as const).map(([l, n]) => (
          <div key={l} className="rounded-lg border border-cmt-line bg-cmt-sub py-2"><div className="font-tektur text-xl font-black text-cmt-text">{n}</div><div className="font-mono text-[11px] text-gray-500">{l}</div></div>
        ))}
      </div>
      <div className="font-mono text-[11px] uppercase text-gray-500">KULÜBÜN</div>
      {mine.length === 0 ? <p className="text-gray-400">Kulübünde değişiklik yok.</p> : mine.slice(0, 4).map((i, k) => (
        <button key={k} onClick={() => i.playerId && open(i.playerId)} className="flex w-full justify-between py-1 text-left text-[13px] hover:text-cmt-text">
          <span className="text-gray-200">{i.playerName}</span>
          <span className="text-gray-400">{label[i.type] ?? i.type} {i.before !== null && i.after !== null ? `${i.before} → ${i.after}` : i.toClub ?? ''}</span>
        </button>
      ))}
    </Tile>
  )
}

function SaveStatusTile({ d, season }: { d: ClubView; season: string }) {
  return (
    <Tile title="Kayıt durumu" icon={CloudCog}>
      <Row label="Oyun tarihi" value={gameDate(d.snapshot.gameDate)} />
      <Row label="Sezon" value={season} />
      <Row label="İzlenen sezon" value={d.career?.seasonsTracked ?? 1} />
      <Row label="Snapshot" value={d.career?.snapshots ?? 1} />
      <Row label="Senkron" value={<span className="text-[12px]">{d.snapshot.source === 'save' ? 'Kariyer kaydı + mevcut export verileri' : 'Live Editor export’u'}</span>} />
      <Row label="Son export" value={<span className="text-[12px]">{d.snapshot.exportedAt ? new Date(d.snapshot.exportedAt).toLocaleString('tr-TR') : '–'}</span>} />
    </Tile>
  )
}

function PromotedTile({ d }: { d: ClubView }) {
  const moves = d.world?.moves ?? []
  if (moves.length === 0) return <NoDataTile title="Yükselen ve düşen" icon={ArrowUp} text="Ülkendeki liglerde bu sezon lig değiştiren takım görünmüyor (oyunun önceki lig alanından)." />
  return (
    <Tile title="Yükselen ve düşen" icon={ArrowUp} info="Bu sezon lig değiştiren takımlar (leagueteamlinks.prevleagueid).">
      <ul className="divide-y divide-cmt-line">
        {moves.slice(0, 8).map(m => (
          <li key={m.teamId} className="flex items-center justify-between py-1.5 text-[13px]">
            <span className="flex items-center gap-2">{m.promoted ? <ArrowUp className="h-3.5 w-3.5 text-cmt-mint" /> : <ArrowDown className="h-3.5 w-3.5 text-[#ff6460]" />}<span className="text-gray-100">{m.team}</span></span>
            <span className="text-right text-[11px] text-gray-400">{m.fromLeague} → {m.league}</span>
          </li>
        ))}
      </ul>
    </Tile>
  )
}

function AroundWorldTile({ d }: { d: ClubView }) {
  const leaders = d.world?.leaders ?? []
  const last = d.world?.leadersFromLastSeason
  if (leaders.length === 0) return <NoDataTile title="Dünyadan" icon={Globe} text="Lig liderleri maçlar oynandıkça görünür." />
  return (
    <Tile title="Dünyadan" icon={Globe} info={last
      ? 'Birinci seviye liglerin geçen sezon şampiyonları (oyun bu sezonun tablosunu kayda yazmıyor).'
      : 'Birinci seviye liglerin liderleri (oyundaki tablo sırasından; belirsiz ligler atlanır).'}>
      <div className="mb-1 font-mono text-[11px] uppercase text-gray-500">{last ? 'GEÇEN SEZON ŞAMPİYONLARI' : 'LİG LİDERLERİ'}</div>
      <ul className="divide-y divide-cmt-line">
        {leaders.slice(0, 9).map(l => (
          <li key={l.leagueId} className="flex justify-between gap-2 py-1.5 text-[13px]"><span className="truncate text-gray-400">{l.league}</span><b className="truncate text-gray-100">{l.team}</b></li>
        ))}
      </ul>
    </Tile>
  )
}

function JobSecurityTile({ d }: { d: ClubView }) {
  const career = d.managerCareer
  const latest = career?.seasons[0]
  const score = latest?.teamId === d.club.id ? latest.jobSecurity : null
  if (score == null) return <NoDataTile title="İş güvencesi" icon={Briefcase} text="Bu kayıtta yönetim güveni henüz okunamadı." />
  const band = JOB_BANDS.find(b => score >= b.min)!
  const previous = career!.seasons.find(s => s.completed && s.teamId === d.club.id && s.jobSecurity != null)
  const delta = previous ? score - previous.jobSecurity! : null
  return <Tile title="İş güvencesi" icon={Briefcase} info="Kariyer kaydının güncel sezon satırındaki yönetim güveni (0–100); 17.07.2030'da 74 ve geçmiş sezonlar CMTracker'la eşleşti. Durum adı uygulamanın yorumudur, oyunun etiketi değil.">
    <div className="flex items-baseline gap-2"><strong className="text-5xl font-bold text-cmt-text">{score}</strong><span className="text-sm text-gray-500">/100</span>
      <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${band.tone}`}>{band.label}</span></div>
    <div role="meter" aria-label="Yönetim güveni" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} className="mt-4 h-2 overflow-hidden rounded-full bg-cmt-card"><div className={`h-full rounded-full ${band.bar}`} style={{ width: `${score}%` }} /></div>
    {previous && <p className="mt-3 text-xs text-gray-300" aria-label="Geçen sezona göre değişim">
      {previous.seasonEndYear - 1}/{String(previous.seasonEndYear).slice(2)} sonu {previous.jobSecurity} →{' '}
      <b className={delta! > 0 ? 'text-[#14b341]' : delta! < 0 ? 'text-[#f84a46]' : 'text-gray-300'}>{delta! > 0 ? '+' : delta! < 0 ? '−' : '±'}{Math.abs(delta!)}</b></p>}
    <p className="mt-2 text-xs text-gray-400">{gameDate(career!.asOf)} kaydındaki değer</p>
  </Tile>
}

/** Uygulamanın yorumu: oyun eşik ya da etiket yazmıyor. */
const JOB_BANDS = [
  { min: 70, label: 'Güvende', tone: 'bg-emerald-500/15 text-emerald-300', bar: 'bg-emerald-400' },
  { min: 45, label: 'Dengeli', tone: 'bg-indigo-500/15 text-indigo-300', bar: 'bg-indigo-400' },
  { min: 25, label: 'Baskı altında', tone: 'bg-amber-500/15 text-amber-300', bar: 'bg-amber-400' },
  { min: 0, label: 'Kritik', tone: 'bg-red-500/15 text-red-300', bar: 'bg-red-400' },
]

const OBJECTIVE_KIND = ['LİG', 'YEREL KUPA', 'KITASAL KUPA', 'DİĞER']
/** Basamak 17 = kazanmak; diğerleri oyunun 0–17 ölçeği (CMTracker da "Level N" gösteriyor). */
const level = (n: number | null, kind: number) => n == null ? '–' : n === 17 ? (kind === 0 ? 'Ligi kazan' : 'Kupayı kazan') : `Basamak ${n}`

function BoardObjectivesTile({ d }: { d: ClubView }) {
  const objectives = d.objectives ?? []
  if (objectives.length) return <Tile title="Yönetim hedefleri" icon={Target} info="Kariyer kaydındaki bu sezonun yönetim hedefleri: yarışma başına hedef, varsa üst hedef ve asgari basamak (0–17, 17 = kazan). Fenerbahçe 24.07.2030'da CMTracker'la birebir.">
    <ul className="space-y-2" aria-label="Yönetim hedefleri listesi">{objectives.map(o => <li key={o.competitionId} className="rounded-lg border border-cmt-line p-2.5">
      <div className="flex items-baseline justify-between gap-2"><b className="truncate text-[13px] text-cmt-text">{o.competition ?? `Yarışma ${o.competitionId}`}</b>
        <span className="font-mono text-[11px] text-gray-500">{OBJECTIVE_KIND[o.kind] ?? OBJECTIVE_KIND[3]}</span></div>
      <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
        <span className="text-gray-400">Hedef <b className="block text-[12px] text-gray-100">{level(o.target, o.kind)}{o.stretch != null ? ` · üst ${o.stretch}` : ''}</b></span>
        <span className="text-gray-400">Asgari <b className="block text-[12px] text-gray-100">{level(o.minimum, o.kind)}</b></span>
      </div>
    </li>)}</ul>
    <p className="mt-2 text-[11px] text-gray-500">Durum (sürüyor/karşılandı) yalnız lig için sezon arşivinde: {d.managerCareer?.seasons[0]?.objectiveStatus ?? '–'}</p>
  </Tile>
  const current = d.managerCareer?.seasons[0]
  if (!current?.objective || current.teamId !== d.club.id) return <NoDataTile title="Yönetim hedefleri" icon={Target} text="Bu kayıtta yönetim hedefi henüz okunamadı." />
  return <Tile title="Yönetim hedefleri" icon={Target} info="Sezon arşivindeki lig hedefi ve durum kodu. Alan DOĞRULANACAK; kupa hedefleri ve asgari başarı koşulları henüz çözülmedi.">
    <p className="text-[11px] text-gray-500">LİG HEDEFİ</p><p className="mt-2 text-lg font-semibold text-cmt-text">{current.objective}</p>
    <p className="mt-2 text-xs text-indigo-300">{current.objectiveStatus ?? 'Durum bilinmiyor'}</p>
    <p className="mt-2 text-[11px] text-gray-500">{gameDate(d.managerCareer!.asOf)} kaydı</p>
    <p className="mt-4 text-xs leading-relaxed text-gray-400">Kupa hedefleri ve asgari başarı koşulları henüz okunamıyor.</p>
  </Tile>
}

function SeasonHistoryTile({ d, season }: { d: ClubView; season: string }) {
  const s = d.standing
  const hasPositions = d.managerCareer?.seasons.some(h => h.position != null)
  if (d.managerCareer) return <Tile title="Sezon geçmişi" icon={History} info="Kariyer kaydındaki sezon arşivi. Maç sayıları tüm yarışmaları kapsar; puan kayıttaki değerdir. Alanlar DOĞRULANACAK.">
    <p className="mb-3 text-xs text-gray-400">{d.managerCareer.seasons.filter(s => s.completed).length} tamamlanan sezon · {gameDate(d.managerCareer.asOf)} kaydı</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-[11px] text-gray-500"><tr>
      {['SEZON', 'KULÜP', ...(hasPositions ? ['SIRA'] : []), 'HEDEF', 'KUPA', 'G-B-M', 'P', 'GOL'].map(l => <th key={l} className="px-2 py-2">{l}</th>)}
    </tr></thead><tbody>{d.managerCareer.seasons.map(h => <tr key={h.index} className="border-t border-cmt-line">
      <td className="whitespace-nowrap px-2 py-3 font-semibold text-cmt-text">{h.seasonEndYear - 1}/{String(h.seasonEndYear).slice(2)}<span className="block text-[11px] font-normal text-gray-500">{h.completed ? 'Tamamlandı' : 'Kayıt tarihi itibarıyla'}</span></td>
      <td className="px-2 py-3">{h.team ?? `Takım #${h.teamId}`}</td>{hasPositions && <td className="px-2 py-3">{h.position ?? '–'}</td>}
      <td className="px-2 py-3 text-gray-400">{h.objective ?? '–'}<small className="block text-[11px]">{h.objectiveStatus}</small></td>
      <td className="whitespace-nowrap px-2 py-3" title={[h.biggestBuy && `En pahalı alım: ${h.biggestBuy}${h.biggestBuyFee ? ` (${money(h.biggestBuyFee)})` : ''}`,
        h.biggestSale && `En pahalı satış: ${h.biggestSale}${h.biggestSaleFee ? ` (${money(h.biggestSaleFee)})` : ''}`].filter(Boolean).join('\n') || undefined}>
        {(h.leagueTitles ?? 0) > 0 && <span className="mr-1 text-[#ffd200]">🏆 Lig</span>}
        {(h.domesticCups ?? 0) > 0 && <span className="mr-1 text-[#ffd200]">🏆 Kupa</span>}
        {(h.continentalCups ?? 0) > 0 && <span className="text-[#ffd200]">🏆 Avrupa</span>}
        {!h.leagueTitles && !h.domesticCups && !h.continentalCups && <span className="text-gray-600">–</span>}
      </td>
      <td className="whitespace-nowrap px-2 py-3">{h.won}-{h.drawn}-{h.lost}<small className="block text-[11px] text-gray-500">{h.played} maç</small></td><td className="px-2 py-3">{h.points ?? '–'}</td>
      <td className="whitespace-nowrap px-2 py-3">{h.goalsFor}:{h.goalsAgainst}</td>
    </tr>)}</tbody></table></div>
  </Tile>
  const history = d.observedSeasons ?? []
  if (history.length) return <Tile title="Sezon geçmişi" icon={History} info="Aynı kariyer dalının her sezonundaki son kayıt. Rakamlar gözlem tarihine kadardır; eksik sezonlar tamamlanmaz.">
    <p className="mb-3 text-xs text-gray-400">Bu kulübün kayıtlarda gözlenen sezonları · hazırlık maçları dahil</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-[11px] text-gray-500"><tr>
      {['SEZON', 'SON GÖZLEM', 'O', 'G-B-M', 'GOL'].map(l => <th key={l} className="px-2 py-2">{l}</th>)}
    </tr></thead><tbody>{history.map(h => <tr key={h.seasonEndYear} className="border-t border-cmt-line" title={`Kaynak: ${h.snapshotId}`}>
      <td className="whitespace-nowrap px-2 py-3 font-semibold text-cmt-text">{h.seasonEndYear - 1}/{String(h.seasonEndYear).slice(2)}</td>
      <td className="whitespace-nowrap px-2 py-3 text-gray-400">{gameDate(h.asOf)}</td><td className="px-2 py-3">{h.record.played}</td>
      <td className="whitespace-nowrap px-2 py-3">{h.record.won}-{h.record.drawn}-{h.record.lost}</td><td className="whitespace-nowrap px-2 py-3">{h.record.goalsFor}:{h.record.goalsAgainst}</td>
    </tr>)}</tbody></table></div>
    <p className="mt-3 text-[11px] text-gray-500">Her satır kendi gözlem tarihindeki durumu gösterir. Sezon sonu ve toplam kariyer karnesi henüz doğrulanmadı.</p>
  </Tile>
  return (
    <Tile title="Sezon geçmişi" icon={History} info="Geçmiş sezonun kayıtlı maç bloğu bulunamadı; bu sezonun güncel lig tablosu gösteriliyor.">
      <p className="mb-3 text-gray-400">Geçmiş sezon verisi henüz yok · bu sezon şimdiye kadar</p>
      <div className="overflow-x-auto rounded-lg border border-cmt-line">
        <table className="w-full text-left text-[13px]">
          <thead><tr className="border-b border-cmt-line font-mono text-[11px] uppercase text-gray-500">
            <th className="px-3 py-2">SEZON</th><th className="px-3 py-2">KULÜP</th><th className="px-3 py-2">LİG</th><th className="px-3 py-2 text-right">SIRA</th>
            <th className="px-3 py-2 text-right">G-B-M</th><th className="px-3 py-2 text-right">P</th><th className="px-3 py-2 text-right">GOL</th></tr></thead>
          <tbody><tr>
            <td className="px-3 py-2.5"><b className="text-cmt-text">{season}</b><span className="block text-[11px] text-gray-500">Sürüyor</span></td>
            <td className="px-3 py-2.5"><span className="flex items-center gap-2"><ClubCrest name={d.club.name} color1={d.club.color1} color2={d.club.color2} size={18} teamId={d.club.id} />{d.club.name}</span></td>
            <td className="px-3 py-2.5 text-gray-300">{d.club.league ?? '–'}</td>
            <td className="px-3 py-2.5 text-right font-mono text-cmt-text">{s?.position ?? '–'}</td>
            <td className="px-3 py-2.5 text-right font-mono text-cmt-text">{d.tableConsistent && s ? `${s.won}-${s.drawn}-${s.lost}` : '–'}
              {s?.played ? <span className="block text-[11px] text-gray-500">{s.played} maç</span> : null}</td>
            <td className="px-3 py-2.5 text-right font-mono text-cmt-text">{d.tableConsistent ? s?.points ?? '–' : '–'}</td>
            <td className="px-3 py-2.5 text-right font-mono text-cmt-text">{d.tableConsistent && s ? `${s.goalsFor}-${s.goalsAgainst}` : '–'}</td>
          </tr></tbody>
        </table>
      </div>
      {!d.tableConsistent && <p className="mt-2 text-[11px] text-gray-500">Puan ve galibiyet sayıları bu kayıtta güncel değil.</p>}
    </Tile>
  )
}

function AcademyTile({ d, open }: { d: ClubView; open: (id: number) => void }) {
  const academy = d.academy ?? []
  if (academy.length === 0) return <NoDataTile title="Altyapı akademisi" icon={GraduationCap} text="Akademi oyuncuları exporter 0.4.0 ile gelir." />
  const best = Math.max(...academy.map(a => a.player.potential ?? 0))
  const longest = Math.max(...academy.map(a => a.monthsInSquad ?? 0))
  return (
    <Tile title="Altyapı akademisi" icon={GraduationCap} to="/youth" info="Kayıttaki akademi oyuncuları (career_youthplayers). Akademide geçen ay oyunun sayacı; POT ± oyunun potansiyel belirsizliği ve kademe kodu DOĞRULANACAK. Listede olmayan genç tahmin edilmez.">
      <div className="mb-2 flex items-end gap-3"><span className="font-tektur text-5xl font-black text-cmt-text">{academy.length}</span>
        <span className="pb-1.5 text-gray-400">genç · en iyi POT {best}{longest > 0 ? ` · en uzun ${longest} ay` : ''}</span></div>
      {academy.slice(0, 3).map(a => (
        <button key={a.player.id} onClick={() => open(a.player.id)} className="flex w-full items-center justify-between rounded px-1 py-1.5 text-left hover:bg-cmt-card">
          <span className="flex items-center gap-2.5"><PlayerAvatar id={a.player.id} name={a.player.name} size={28} />
            <span><span className="block text-[13px] text-gray-100">{a.player.name}</span><span className="text-[11px] text-gray-400">{a.player.position} · {a.player.age} y
              {a.monthsInSquad != null && <> · {a.monthsInSquad} ay</>}{a.potentialVariance ? <> · POT ±{a.potentialVariance}</> : null}{a.tier != null && <> · kademe {a.tier}</>}</span></span></span>
          <span className="flex gap-1"><RatingChip value={a.player.overall} size="sm" /><RatingChip value={a.player.potential} size="sm" /></span>
        </button>
      ))}
    </Tile>
  )
}

function ScoutsTile({ d }: { d: ClubView }) {
  const scouts = d.scouts ?? []
  const network = d.scoutNetwork
  if (scouts.length === 0 && !network) return <NoDataTile title="Gözlemciler" icon={Search} text="Gözlemci kadrosu exporter 0.4.0 ile gelir." />
  const stars = (n: number | null) => <span><span className="text-cmt-blurple">{'★'.repeat(Math.max(0, Math.min(5, n ?? 0)))}</span><span className="text-gray-600">{'★'.repeat(Math.max(0, 5 - (n ?? 0)))}</span></span>
  return (
    <Tile title="Gözlemciler" icon={Search} to="/youth" info="Ana takım gözlemcileri kariyer kaydındaki gözlemci ağından (kapsadığı ülke, deneyim, bilgi); altyapı gözlemcileri career_scouts tablosundan. Görev ayrıntıları kayıtta okunamıyor.">
      {network && <div className="mb-3" aria-label="Ana takım gözlemcileri">
        <p className="mb-1 font-mono text-[11px] uppercase text-gray-500">ANA TAKIM · {network.hired.length} işe alınmış · {network.available.length} alınabilir</p>
        {network.hired.map((s, i) => (
          <div key={i} className="flex items-center justify-between py-1">
            <span className="flex min-w-0 items-center gap-2"><Flag code={s.nationCode} name={s.nation} nationId={s.nationId} />
              <span className="min-w-0"><span className="block truncate text-[13px] text-gray-100">{s.name}</span>
                <span className="text-[11px] text-gray-500">{s.coverNation ? `${s.coverNation} gözlüyor` : 'Ülke bilinmiyor'}</span></span></span>
            <span className="text-right text-[11px] text-gray-500">Deneyim {stars(s.experience)}<br />Bilgi {stars(s.judgement)}</span>
          </div>
        ))}
        {network.newScoutsDate && <p className="mt-1 text-[11px] text-gray-500">Yeni gözlemciler {gameDate(network.newScoutsDate)}</p>}
      </div>}
      {scouts.length > 0 && <p className="mb-2 font-mono text-[11px] uppercase text-gray-500">ALTYAPI GÖZLEMCİLERİ · {scouts.length}</p>}
      {scouts.map(s => (
        <div key={s.id} className="flex items-center justify-between py-1.5">
          <span className="flex items-center gap-2"><Flag code={s.nationCode} name={s.nation} nationId={s.nationId} /><span className="text-[13px] text-gray-100">{s.name}</span></span>
          <span className="text-right text-[11px] text-gray-500">Deneyim {stars(s.experience)}<br />Bilgi {stars(s.knowledge)}</span>
        </div>
      ))}
      {!network && <p className="mt-2 border-t border-cmt-line pt-2 text-[11px] text-gray-500">Ana takım gözlemcileri için kariyer kaydını içe aktar.</p>}
    </Tile>
  )
}

function DisciplineTile({ d, open }: { d: ClubView; open: (id: number) => void }) {
  const rows = d.discipline
  if (rows == null) return <NoDataTile title="Uygunluk" icon={ShieldAlert} text="Kart ve cezalar kariyer kaydından okunur; bu snapshot'ta kayıt bloğu yok." />
  const byPlayer = Object.values(rows.reduce<Record<number, DisciplineRow[]>>((acc, r) => { (acc[r.playerId] ??= []).push(r); return acc }, {}))
  return <Tile title="Uygunluk" icon={ShieldAlert} info="Kariyer kaydındaki kart birikimi ve cezalar (Fenerbahçe 24.07.2030'da CMTracker'la birebir: Adeyemi ceza 1, Doku/Hendriks/Ngoy 2 sarı). Kartların hangi yarışmaya ait olduğu kodla gösterilir; yerel/kıtasal eşlemesi henüz doğrulanmadı.">
    {byPlayer.length === 0 ? <p className="text-gray-400">Cezalı ya da kart birikimi olan oyuncu yok.</p>
      : <ul className="divide-y divide-cmt-line" aria-label="Kart ve cezalar">{byPlayer.slice(0, 8).map(list => {
        const ban = Math.max(...list.map(r => r.ban))
        return <li key={list[0].playerId}><button onClick={() => open(list[0].playerId)} className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-[13px] hover:text-cmt-text">
          <span className="flex items-center gap-2"><PlayerAvatar id={list[0].playerId} name={list[0].name} size={24} /><span className="text-gray-100">{list[0].name}</span></span>
          <span className="text-right text-[11px]">{ban > 0 && <b className="mr-1 rounded bg-red-500/15 px-1.5 py-0.5 text-red-300">CEZALI · {ban} maç</b>}
            {list.filter(r => r.yellows > 0).map((r, i) => <span key={i} className="ml-1 text-[#ffd200]" title={`Kayıttaki yarışma kodu ${r.competitionKey}`}>{r.yellows} sarı{r.competitionKey ? ` (${r.competitionKey})` : ''}</span>)}</span>
        </button></li>
      })}</ul>}
  </Tile>
}

/** Oyunun hazırlık turnuvası anahtarları (cm_pst_*) → ad; bilinmeyen anahtar olduğu gibi gösterilir. */
const PRESEASON_LABELS: Record<string, string> = {
  cm_pst_eu_intl_cup: 'European International Cup', cm_pst_eu_shield: 'European Shield', cm_pst_champions_trophy: 'Champions Trophy',
}

function PreseasonTile({ d }: { d: ClubView }) {
  const p = d.preseason
  if (!p?.invites.length) return <NoDataTile title="Hazırlık turnuvası" icon={Plane} text="Bu kayıtta hazırlık turnuvası daveti yok (davetler sezon başında gelir)." />
  const decided = p.invites.some(i => i.entered)
  return <Tile title="Hazırlık turnuvası" icon={Plane} info="Kariyer kaydındaki hazırlık turnuvası davetleri; ödül EUR. Katılınan turnuvanın onay tarihi kayıttan.">
    <p className="mb-2 text-[11px] text-gray-400">{p.invites.length} davet{decided && p.confirmedDate ? ` · onay ${gameDate(p.confirmedDate)}` : ''}</p>
    <ul className="space-y-2" aria-label="Hazırlık turnuvası davetleri">{p.invites.map(i => <li key={i.competitionId} className="rounded-lg border border-cmt-line p-2.5">
      <div className="flex items-center justify-between gap-2">
        <b className="truncate text-[13px] text-cmt-text">{PRESEASON_LABELS[i.key] ?? i.key}</b>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${i.entered ? 'bg-emerald-500/15 text-emerald-300' : decided ? 'bg-cmt-card text-gray-400' : 'bg-indigo-500/15 text-indigo-300'}`}>
          {i.entered ? 'KATILDI' : decided ? 'REDDEDİLDİ' : 'BEKLİYOR'}</span>
      </div>
      <div className="mt-1 text-[11px] text-gray-400">{i.teams.length} takım · ödül {money(i.prize)}</div>
      {i.entered && <div className="mt-1 text-[11px] leading-relaxed text-gray-500">{i.teams.join(', ')}</div>}
    </li>)}</ul>
  </Tile>
}

/**
 * Sezon ödülleri (CMTracker "Season awards"): oyun ödülleri sabit tarihlerde verir. Kayıtta bu sezonun kazananları
 * varsa listelenir; yoksa sıradaki ödül penceresi ve tüm pencereler oyun tarihine göre gösterilir.
 */
function SeasonAwardsTile({ d, season, open }: { d: ClubView; season: string; open: (id: number) => void }) {
  const y = d.snapshot.seasonEndYear - 1
  const iso = (yy: number, m: number, day: number) => `${yy}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const windows = [
    { name: "Ballon d'Or", from: iso(y, 10, 25), to: iso(y, 11, 15), note: `Aday listesi ${gameDate(iso(y, 10, 25))} civarı, kazanan ${gameDate(iso(y, 11, 1))}.` },
    { name: 'UEFA Yılın Takımı', from: iso(y + 1, 1, 10), to: iso(y + 1, 1, 31), note: null },
    { name: 'Sezon ödülleri', from: iso(y + 1, 5, 20), to: iso(y + 1, 6, 15), note: 'Sezonun takımı, sezonun oyuncusu, Altın Ayakkabı, Altın Eldiven.' },
  ]
  const today = d.snapshot.gameDate
  const next = windows.find(w => w.to >= today)
  const won = d.records?.playerAwards ?? []
  const awards = ["Ballon d'Or", 'UEFA Yılın Takımı', 'Sezonun takımı', 'Sezonun oyuncusu', 'Altın Ayakkabı', 'Altın Eldiven']
  return (
    <Tile title="Sezon ödülleri" icon={Award} info="Ödül tarihleri oyunun takviminden; kazananlar kariyer kaydından (tür adları doğrulanacak).">
      <div className="font-mono text-[11px] uppercase text-gray-500">SEZON {season}</div>
      {next && <div className="mt-2 rounded-lg border border-cmt-line bg-cmt-sub p-3">
        <div className="text-[12px] text-cmt-text">Sıradaki: <b>{next.name}</b>{next.from <= today ? ' (pencere açık)' : ''}</div>
        <div className="mt-0.5 text-[11px] text-gray-400">{gameDate(next.from)} – {gameDate(next.to)} arasında kaydet{next.note ? `. ${next.note}` : ''}</div>
      </div>}
      {won.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {won.slice(0, 6).map((a, i) => <li key={`${a.playerId}-${i}`}><button onClick={() => open(a.playerId)} className="flex w-full items-center justify-between text-left text-[12px] text-gray-200 hover:text-cmt-text">
            <span className="flex items-center gap-2"><PlayerAvatar id={a.playerId} name={a.name} size={22} />{a.name}</span>
            <span className="text-gray-500">Sezon {a.season ?? '–'} · tür {a.type ?? '–'}</span></button></li>)}
        </ul>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
          {awards.map(a => <li key={a} className="flex items-center gap-1.5 text-gray-300"><Hourglass className="h-3.5 w-3.5 text-gray-500" />{a}</li>)}
        </ul>
      )}
      <div className="mt-auto space-y-0.5 border-t border-cmt-line pt-2 text-[11px] text-gray-500">
        {windows.map(w => <div key={w.name}>{w.name}: {gameDate(w.from)} – {gameDate(w.to)}</div>)}
      </div>
    </Tile>
  )
}

function TeamOfWeekTile({ d, open }: { d: ClubView; open: (id: number) => void }) {
  const records = d.records
  if (!records?.teamOfWeek.length) return <NoDataTile title="Haftanın takımı" icon={Star}
    text={records?.hasTeamOfWeek ? 'Bu oyun tarihinde kayıttaki haftanın takımı tablosu boş.' : 'Bu snapshot’ta haftanın takımı verisi yok; kariyer kaydını içe aktar.'} />
  return <Tile title="Haftanın takımı" icon={Star} info="Kayıttaki seçimler. Ay ve hafta kodlarının yorumu doğrulanmayı bekliyor.">
    <div className="max-h-72 overflow-y-auto">{records.teamOfWeek.map((p, i) => <button key={`${p.playerId}-${i}`} onClick={() => open(p.playerId)}
      className="flex w-full items-center justify-between border-b border-cmt-line py-2 text-left text-xs">
      <span className="flex items-center gap-2"><PlayerAvatar id={p.playerId} name={p.name} size={28} />{p.name}</span>
      <span className="text-gray-400">Ay {p.month ?? '–'} · Puan {p.rating ?? '–'}</span>
    </button>)}</div>
  </Tile>
}

function AwardRecordsTile({ d, title, open }: { d: ClubView; title: string; open: (id: number) => void }) {
  const records = d.records
  const live = d.tableConsistent ? d.table.filter(t => t.position != null && (t.played ?? 0) > 0).sort((a, b) => a.position! - b.position!).slice(0, 3) : []
  const last = live.length ? [] : d.table.filter(t => t.previousPosition != null).sort((a, b) => a.previousPosition! - b.previousPosition!).slice(0, 3)
  const race = live.length ? live.map(t => ({ ...t, rank: t.position!, note: `${t.points ?? '–'} P` })) : last.map(t => ({ ...t, rank: t.previousPosition!, note: '' }))
  const champion = d.world?.leadersFromLastSeason ? d.world.leaders.find(l => l.leagueId === d.club.leagueId) : undefined
  const players = records?.playerAwards ?? []
  if (!players.length && !race.length && !champion) return <NoDataTile title={title} icon={Award}
    text={records?.hasPlayerAwards ? 'Bu oyun tarihinde kayıttaki oyuncu ödülleri tablosu boş. Aday listesi henüz okunamıyor.' : 'Bu snapshot’ta oyuncu ödülleri yok; kariyer kaydını içe aktar.'} />
  return <Tile title={title} icon={Award} info="Kulüp yarışı lig tablosundan; maç oynanmadıysa ya da tablo güncel değilse geçen sezonun final sırasından (previousyeartableposition); oyuncu ödülleri kayıttaki kazananlardır, aday sıralaması değil. Ödül türlerinin adları doğrulanmayı bekliyor.">
    {(race.length > 0 || champion) && <div className="mb-3" aria-label="Kulüp yarışı">
      <p className="mb-1 font-mono text-[11px] uppercase text-gray-500">KULÜP YARIŞI · {live.length ? d.club.league ?? 'LİG' : 'GEÇEN SEZONUN İLK ÜÇÜ'}</p>
      {race.length > 0 ? race.map(t => <div key={t.teamId} className={`flex justify-between py-1 text-xs ${t.teamId === d.club.id ? 'font-semibold text-cmt-text' : 'text-gray-300'}`}>
        <span>{t.rank}. {t.team}</span><span className="font-mono">{t.note}</span></div>)
        : <p className="text-xs text-gray-300">Geçen sezon şampiyonu: <b className="text-cmt-text">{champion!.team}</b></p>}
    </div>}
    {players.length > 0 && <>
      <p className="mb-2 font-mono text-[11px] uppercase text-gray-500">OYUNCU ÖDÜLLERİ · kayıttaki kazananlar</p>
      <div className="max-h-72 overflow-y-auto">{players.map((p, i) => <button key={`${p.playerId}-${i}`} onClick={() => open(p.playerId)}
        className="flex w-full items-center justify-between border-b border-cmt-line py-2 text-left text-xs">
        <span>{p.name}<span className="block text-[11px] text-gray-500">Sezon {p.season ?? '–'} · Ödül türü {p.type ?? '–'}</span></span><b>×{p.count ?? '–'}</b>
      </button>)}</div>
    </>}
  </Tile>
}

/** Kayıttaki zorluk kodu (0–6); Fenerbahçe 6 = CMTracker "Ultimate". */
const DIFFICULTY: Record<number, string> = { 0: 'Başlangıç', 1: 'Amatör', 2: 'Yarı profesyonel', 3: 'Profesyonel', 4: 'Dünya klası', 5: 'Efsanevi', 6: 'Ultimate' }

/** career_managerawards.typeid → ad. 0: kayıt tarihleri hep ayın 1'i (ayın menajeri) — DOĞRULANACAK. */
const MANAGER_AWARD_LABELS: Record<number, string> = { 0: 'Ayın menajeri' }

function ManagerAwardsTile({ d }: { d: ClubView }) {
  const records = d.records
  const awards = records?.managerAwards.filter(a => a.teamId === d.club.id) ?? []
  const r = d.seasonRecord
  const career = d.managerCareer
  const history = d.observedSeasons ?? []
  const observed = history.reduce((sum, h) => ({ played: sum.played + h.record.played, won: sum.won + h.record.won,
    drawn: sum.drawn + h.record.drawn, lost: sum.lost + h.record.lost }), { played: 0, won: 0, drawn: 0, lost: 0 })
  if (!awards.length && !r && !career && !d.manager) return <NoDataTile title="Menajer karnesi" icon={Briefcase}
    text={records?.hasManagerAwards ? 'Bu sezon oynanmış maç ve bu kulüp için menajer ödülü yok.' : 'Menajer karnesi için kariyer kaydını içe aktar.'} />
  const seasons = career?.seasons ?? []
  const titles = seasons.reduce((n, s) => n + (s.leagueTitles ?? 0), 0)
  const best = (fee: (s: (typeof seasons)[number]) => number | null | undefined) => seasons.filter(s => (fee(s) ?? 0) > 0).sort((a, b) => fee(b)! - fee(a)!)[0]
  const recordBuy = best(s => s.biggestBuy ? s.biggestBuyFee : null), recordSale = best(s => s.biggestSale ? s.biggestSaleFee : null)
  const match = (m: RecordMatch | null) => m ? <>{m.for}-{m.against} · {m.opponent ?? '–'} <span className="text-gray-500">· {gameDate(m.date)}</span></> : '–'
  const m = d.manager
  return <Tile title="Menajer karnesi" icon={Briefcase} info="Toplam karne kaydın sezon arşivinden; maaş, kariyer kazancı, zorluk, devre süresi ve kariyerin en farklı maçları kayıttaki menajer karnesinden (Fenerbahçe 24.07.2030'da CMTracker'la birebir). Güncel sezon fikstürü ayrıca gösterilir.">
    {m && <div className="mb-3 space-y-1 text-[12px]" aria-label="Menajer bilgileri">
      <div className="flex justify-between gap-2"><span className="text-gray-400">Haftalık maaş</span><span className="text-gray-100">{money(m.wage)}</span></div>
      <div className="flex justify-between gap-2"><span className="text-gray-400">Kariyer kazancı</span><span className="text-gray-100">{money(m.earnings)}</span></div>
      <div className="flex justify-between gap-2"><span className="text-gray-400">Zorluk · devre</span><span className="text-gray-100">{m.difficulty != null ? DIFFICULTY[m.difficulty] ?? `Seviye ${m.difficulty}` : '–'} · {m.halfLength != null ? `${m.halfLength} dk` : '–'}</span></div>
      <div className="flex justify-between gap-2"><span className="text-gray-400">Kariyerin en farklı galibiyeti</span><span className="truncate text-right text-gray-200">{match(m.biggestWin)}</span></div>
      <div className="flex justify-between gap-2"><span className="text-gray-400">Kariyerin en farklı mağlubiyeti</span><span className="truncate text-right text-gray-200">{match(m.biggestLoss)}</span></div>
    </div>}
    {career && <div className="mb-4 rounded-lg border border-cmt-line p-3">
      <p className="text-[11px] text-gray-400">KAYITTAKİ KARİYER TOPLAMI · {gameDate(career.asOf)}</p>
      <p className="mt-2 text-lg font-bold text-cmt-text">{career.played} maç · {career.won} G / {career.drawn} B / {career.lost} M</p>
      <p className="mt-1 text-xs text-gray-400">{career.goalsFor}:{career.goalsAgainst} gol · {career.seasons.length} sezon
        {titles > 0 && <> · <span className="text-[#ffd200]">{titles} lig şampiyonluğu</span></>}</p>
      {(recordBuy || recordSale) && <div className="mt-2 space-y-0.5 text-[12px]" aria-label="Transfer rekorları">
        {recordBuy && <div className="flex justify-between gap-2"><span className="text-gray-400">En pahalı alım</span><span className="truncate text-right text-gray-200">{recordBuy.biggestBuy} · {money(recordBuy.biggestBuyFee)} <span className="text-gray-500">({recordBuy.seasonEndYear - 1}/{String(recordBuy.seasonEndYear).slice(2)})</span></span></div>}
        {recordSale && <div className="flex justify-between gap-2"><span className="text-gray-400">En pahalı satış</span><span className="truncate text-right text-gray-200">{recordSale.biggestSale} · {money(recordSale.biggestSaleFee)} <span className="text-gray-500">({recordSale.seasonEndYear - 1}/{String(recordSale.seasonEndYear).slice(2)})</span></span></div>}
      </div>}
      <p className="mt-1 text-[11px] text-gray-500">Sezon arşivinden toplam; aşağıdaki güncel sezon maçları ayrıca eklenmez.</p>
    </div>}
    <p className="mb-2 text-[11px] text-gray-400">BU SEZON · KAYITLI MAÇLAR</p>
    {r && <>
      <div className="grid grid-cols-6 gap-1 text-center">
        {([['O', r.played], ['G', r.won], ['B', r.drawn], ['M', r.lost], ['A', r.goalsFor], ['Y', r.goalsAgainst]] as const).map(([l, v]) => (
          <div key={l} className="rounded-md bg-cmt-sub py-1.5"><div className="font-tektur text-lg font-black text-cmt-text">{v}</div><div className="font-mono text-[11px] text-gray-500">{l}</div></div>
        ))}
      </div>
      <div className="mt-3 space-y-1 text-[12px]">
        <div className="flex justify-between gap-2"><span className="text-gray-400">En farklı galibiyet</span><span className="truncate text-right text-gray-200">{match(r.biggestWin)}</span></div>
        <div className="flex justify-between gap-2"><span className="text-gray-400">En farklı mağlubiyet</span><span className="truncate text-right text-gray-200">{match(r.biggestLoss)}</span></div>
      </div>
    </>}
    {!career && history.length > 1 && <div className="mt-3 rounded-lg border border-cmt-line p-3 text-xs">
      <p className="text-gray-400">Bu kulüpte gözlenen {history.length} sezon</p><p className="mt-1 font-semibold text-cmt-text">{observed.played} maç · {observed.won} G / {observed.drawn} B / {observed.lost} M</p>
      <p className="mt-1 text-[11px] text-gray-500">Yalnız kayıtların kapsadığı maçlar. Tam kariyer toplamı henüz doğrulanmadı.</p>
    </div>}
    {awards.length > 0 && <div className="mt-3 max-h-40 overflow-y-auto border-t border-cmt-line pt-2">{awards.map((a, i) => <div key={i} className="flex justify-between border-b border-cmt-line py-2 text-xs">
      <span>{MANAGER_AWARD_LABELS[a.type ?? -1] ?? `Ödül türü ${a.type ?? '–'}`}<span className="block text-[11px] text-gray-500">Sezon {a.season ?? '–'} · {gameDate(a.date)}</span></span><b>×{a.count ?? '–'}</b>
    </div>)}</div>}
  </Tile>
}
