import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'
import { useClub, usePlayerDetail, usePlayerHistory } from '../api/client'
import type { AttributeGroup, ClubView, HistoryPoint, OpportunityBreakdown, PlayerDetail, ValueBreakdown } from '../api/types'
import { dec1, dec2, gameDate, money, num, signed } from '../lib/format'
import { AttributeRadar } from './AttributeRadar'
import { t, type MessageKey } from '../lib/i18n'
import { HistoryChart } from './HistoryChart'
import { PitchMap } from './PitchMap'
import { PlayStyleIcon } from './PlayStyleIcon'
import { PLAY_STYLES, suggestPlayStyles } from '../lib/playstyles'
import { Link } from 'react-router-dom'
import { useCompare } from '../lib/compare'
import { StarButton } from './StarButton'
import { Flag, RatingChip, ratingClass, Silhouette } from './cmt'
import { ClubCrest } from './layout/CareerHeroCard'
import { InfoTip } from './InfoTip'
import { RoleTip } from './RoleTip'
import { PlayerWage, RECORDED_WAGE_NOTE } from './PlayerWage'

interface Props {
  playerId: number
  saveUid?: string
  onClose: () => void
}

const POSITION_NAMES: Record<string, string> = {
  GK: 'KALECİ', RB: 'SAĞ BEK', LB: 'SOL BEK', CB: 'STOPER', RWB: 'SAĞ KANAT BEK', LWB: 'SOL KANAT BEK', CDM: 'ÖN LİBERO',
  CM: 'MERKEZ ORTA SAHA', CAM: 'OFANSİF ORTA SAHA', RM: 'SAĞ ORTA SAHA', LM: 'SOL ORTA SAHA', RW: 'SAĞ KANAT', LW: 'SOL KANAT',
  ST: 'SANTRFOR',
}

const PLAYER_TABS = [['overview', 'Özet'], ['attributes', 'Özellikler'], ['positions', 'Mevkiler'], ['growth', 'Gelişim'], ['value', 'Değer']] as const

/** Oyuncu detayı: CMTracker oyuncu sayfası düzeni (kart + radar + mevki haritası | bilgi tablosu + özellik başlıkları). */
export function PlayerDrawer({ playerId, saveUid, onClose }: Props) {
  const detail = usePlayerDetail(playerId, saveUid)
  const history = usePlayerHistory(playerId, saveUid)
  const panel = useRef<HTMLDivElement>(null)
  const target = document.querySelector('.career-main') ?? document.body

  useEffect(() => {
    const previousScroll = window.scrollY
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus({ preventScroll: true })
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose() }
    addEventListener('keydown', close)
    panel.current?.scrollIntoView({ block: 'start' })
    return () => { removeEventListener('keydown', close); window.scrollTo({ top: previousScroll }); previousFocus?.focus({ preventScroll: true }) }
  }, [])

  const d = detail.data
  return createPortal(
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="false" className="player-detail-view" aria-label={d?.player.name ?? t('nav.player')}>
      <div className="player-detail-inner">
        <header className="player-detail-header">
          <div className="flex items-center gap-5">
            <button className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-cmt-text" onClick={onClose}><ArrowLeft className="h-4 w-4" />Geri</button>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-gray-500">OYUNCU</div>
              <h2 className="font-tektur text-sm font-bold uppercase text-cmt-text">{d?.player.name ?? '…'}</h2>
            </div>
          </div>
          <span className="flex items-center gap-2">
            <button className="rounded border border-cmt-line px-2 py-0.5 font-mono text-[11px] text-gray-400 hover:text-cmt-text" onClick={onClose} aria-label={t('drawer.close')}>Esc</button>
          </span>
        </header>
        <div className="player-detail-body">
          {detail.isError && <div role="alert" className="p-6"><p className="error">{t('drawer.error', { error: (detail.error as Error).message })}</p><button className="btn" onClick={() => detail.refetch()}>Yeniden dene</button></div>}
          {!d && !detail.isError && <div className="p-6 text-sm text-gray-400" role="status">Oyuncu yükleniyor…</div>}
          {d && <Body d={d} history={history.data} historyError={history.isError} retryHistory={() => history.refetch()} />}
        </div>
      </div>
    </div>, target,
  )
}

function Body({ d, history, historyError, retryHistory }: { d: PlayerDetail; history?: HistoryPoint[]; historyError: boolean; retryHistory: () => void }) {
  const p = d.player
  const [tab, setTab] = useState<(typeof PLAYER_TABS)[number][0]>('overview')
  // Değer karşılaştırması için oyuncunun kulübünün kadrosu (aynı kariyer anahtarıyla; serbest oyuncuda yok).
  const club = useClub(d.snapshot.careerKey ?? d.snapshot.saveUid, p.clubId ?? undefined, p.clubId !== null && !p.isFreeAgent)
  const profile = d.profile
  const secondaryPositions = [...new Set(p.positions ?? [p.position, p.position2])].filter((pos): pos is string => !!pos && pos !== p.position)
  const equipment = profile?.equipment
  const equipmentCode = (code: number | null | undefined) => code == null ? 'Veri yok' : `Kod #${code}`
  const stars = (n: number | null | undefined) => n === null || n === undefined ? null
    : <span className="ml-1 text-[11px] tracking-tight"><span className="text-cmt-text">{'★'.repeat(Math.max(0, Math.min(5, n)))}</span><span className="text-gray-600">{'★'.repeat(Math.max(0, 5 - n))}</span></span>
  const isKeeper = p.positionGroup === 'GK' || p.position === 'GK'
  const categories = [...(d.attributeCategories ?? [])].sort((a, b) => isKeeper ? Number(b.name === 'Kaleci') - Number(a.name === 'Kaleci') : 0)
  const keeperGroup = isKeeper ? categories.find(c => c.name === 'Kaleci') : undefined
  const radar = keeperGroup ? keeperGroup.attributes.map(a => ({ name: a.label, score: a.value, attributes: [a] })) : d.attributeGroups
  const total = categories.flatMap(c => c.attributes).reduce((n, a) => n + (a.value ?? 0), 0)
  const best = categories.filter(c => c.name !== 'Kaleci' || p.positionGroup === 'GK')
    .reduce<AttributeGroup | null>((b, c) => (c.score !== null && (b === null || (b.score ?? -1) < c.score) ? c : b), null)

  const facts: [string, ReactNode][] = [
    ['DEĞER', money(p.value)],
    [p.isFreeAgent ? 'KAYITTAKİ MAAŞ' : 'MAAŞ', <><PlayerWage player={p} /> <small className="text-[11px] font-normal text-gray-400">/hf</small></>],
    ['SERBEST KALMA', profile?.releaseClause ? money(profile.releaseClause) : 'Yok'],
    ['SÖZLEŞME', p.contractEnd ?? '–'],
    ['KATILIŞ', profile?.joinDate ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${profile.joinDate}T12:00:00`)) : '–'],
    ...(profile?.lastTransfer ? [['SON TRANSFER', <>{profile.lastTransfer.amount > 0 ? money(profile.lastTransfer.amount) : 'Bedelsiz'} <small className="text-[11px] font-normal text-gray-400">({profile.lastTransfer.fromClub ?? `#${profile.lastTransfer.fromTeamId}`})</small></>] as [string, ReactNode]] : []),
    ['ULUSL. ÜN', <>{profile?.internationalRep ?? '–'}{stars(profile?.internationalRep)}</>],
    ['YAŞ', <>{p.age ?? '–'} {p.birthDate && <small className="text-[11px] font-normal text-gray-400">{gameDate(p.birthDate)}</small>}</>],
    ['BOY', p.height ? <>{p.height} <small className="text-[11px] font-normal text-gray-400">cm</small></> : '–'],
    ['KİLO', p.weight ? <>{p.weight} <small className="text-[11px] font-normal text-gray-400">kg</small></> : '–'],
    ['AYAK', p.foot ?? '–'],
    ['ZAYIF AYAK', <>{p.weakFoot ?? '–'}{stars(p.weakFoot)}</>],
    ['BECERİ', <>{p.skillMoves ?? '–'}{stars(p.skillMoves)}</>],
    ['HIZLANMA TİPİ', profile?.accelerationType ? <span title="Boy, çeviklik ve güçten tahmin">{profile.accelerationType}</span> : '–'],
    ['BÜYÜME PROFİLİ', profile?.growthProfile ?? '–'],
    ['VÜCUT TİPİ', profile?.bodyType ?? '–'],
    ['YÜZ', d.hasFace ? 'Var' : 'Yok'],
    ['EMEKLİLİK', profile?.retiring === undefined || profile.retiring === null ? '–' : profile.retiring ? 'Sezon sonu' : 'Hayır'],
    ['DUYGU DURUMU', profile?.emotion ?? '–'],
  ]

  return (
    <div className="player-profile-grid">
      {/* Sol: kart ve radar */}
      <div className="player-sidebar">
        <div className="player-identity">
          <div className="player-identity-top">
            <div className={`flex flex-col items-center justify-center py-3 ${ratingClass(p.overall)}`}>
              <span className="font-tektur text-5xl font-black leading-none">{p.overall ?? '–'}</span><span className="mt-1 font-mono text-[11px]">OVR</span>
            </div>
            <Face id={p.id} name={p.name} hasFace={d.hasFace} />
            <div className="flex flex-col items-center justify-center bg-cmt-card py-3 text-cmt-text">
              <span className="font-tektur text-4xl font-black leading-none">{p.potential ?? '–'}</span><span className="mt-1 font-mono text-[11px] text-gray-400">POT</span>
              <span className={`mt-1.5 h-1 w-8 rounded ${ratingClass(p.potential)}`} />
            </div>
          </div>
          <p className="player-identity-name" aria-hidden="true">{p.name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <Flag code={p.nationCode} name={p.nation} nationId={p.nationId} />
            {p.clubId && <ClubCrest name={p.club ?? ''} teamId={p.clubId} size={18} />}
            {p.position && <span className="rounded bg-cmt-blurple px-1.5 py-0.5 font-tektur font-bold text-cmt-text">{p.position}</span>}
            {secondaryPositions.map(pos => <span key={pos} className="rounded border border-cmt-line px-1.5 py-0.5 font-tektur text-gray-300">{pos}</span>)}
            {p.age !== null && <span className="rounded border border-cmt-line px-1.5 py-0.5 font-mono text-gray-300">YAŞ <b className="text-cmt-text">{p.age}</b></span>}
          </div>
          <AttributeRadar groups={radar} compact />
        </div>
      </div>

      {/* Sağ: başlık ve sekmeler */}
      <div className="player-main-column">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-gray-400">
            {POSITION_NAMES[p.position ?? ''] ?? p.position ?? '–'}{profile?.jersey ? ` · #${profile.jersey}` : ''} · FC 27 · ID {p.id}
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-cmt-text">{p.clubId && <ClubCrest name={p.club ?? ''} teamId={p.clubId} size={18} />}{p.club ?? '–'}{p.league && <span className="ml-2 text-xs font-normal text-gray-400">{p.league}</span>}</div>
          {profile?.lastTransfer && (
            <div className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded border border-cmt-line bg-cmt-sub px-2.5 py-1 text-xs text-gray-300">
              <span>{new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${profile.lastTransfer.date}T12:00:00`))} tarihinde</span>
              {profile.lastTransfer.fromClub && <ClubCrest name={profile.lastTransfer.fromClub} teamId={profile.lastTransfer.fromTeamId} size={15} />}
              <strong className="text-cmt-text">{profile.lastTransfer.fromClub ?? `Kulüp #${profile.lastTransfer.fromTeamId}`}</strong>
              <span>kulübünden</span>
              <strong className={profile.lastTransfer.amount > 0 ? 'font-mono text-[#14b341]' : 'font-mono text-gray-200'}>
                {profile.lastTransfer.amount > 0 ? `${money(profile.lastTransfer.amount)} bonservisle` : 'bedelsiz'}
              </strong>
              <span>geldi</span>
            </div>
          )}
        </div>
        <div className="player-profile-actions"><CompareButton playerId={p.id} /><StarButton playerId={p.id} large /></div>
        <div className="player-tabs" role="group" aria-label="Oyuncu bilgileri">{PLAYER_TABS.filter(([id]) => id !== 'attributes' || categories.length > 0).map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
        <div key={tab} className="player-tab-panel view-swap">
          {tab === 'overview' && <>
              {keeperGroup && <section className="player-gk-summary" aria-label="Kaleci özellikleri">
                <h3>KALECİ ÖZELLİKLERİ</h3><div>{keeperGroup.attributes.map(a => <div key={a.key}><span>{a.label}</span><RatingChip value={a.value} /></div>)}</div>
              </section>}
              <div className="player-facts">
                {facts.map(([label, value]) => (
                  <div key={label}>
                    <div className="font-mono text-[11px] uppercase tracking-wider text-gray-500">{label}</div>
                    <div className="mt-1 font-tektur text-base font-bold text-cmt-text">{value}</div>
                  </div>
                ))}
              </div>

              {p.isFreeAgent && p.recordedWage != null && <p className="text-xs leading-relaxed text-amber-200/80">{RECORDED_WAGE_NOTE}</p>}
              <RolesAndStyles d={d} mode="styles" />
              <section className="player-section" aria-label="Ekipman">
                <h3>EKİPMAN</h3>
                <div className="grid gap-4 px-4 py-3 sm:grid-cols-2 text-sm">
                  <div><span className="text-xs text-gray-400">Krampon</span><p className="mt-1 font-semibold text-gray-200">{equipmentCode(equipment?.bootType)}</p>
                    {equipment?.bootType != null && <p className="mt-1 text-xs text-gray-500">Tasarım: {equipmentCode(equipment.bootDesign)} · Renkler: {equipmentCode(equipment.bootColor1)} / {equipmentCode(equipment.bootColor2)}</p>}</div>
                  <div><span className="text-xs text-gray-400">Kaleci eldiveni</span><p className="mt-1 font-semibold text-gray-200">{equipmentCode(equipment?.gloveType)}</p></div>
                </div>
                <p className="px-4 pb-3 text-xs leading-relaxed text-gray-400">Kayıttaki ekipman kodları. Ürün ve renk adları henüz eşlenmedi; eldiven kodu saha oyuncularında da bulunabilir.</p>
              </section>
          </>}
          {tab === 'attributes' && <>
              {categories.length > 0 && (
                <div className={`player-attributes${isKeeper ? ' is-goalkeeper' : ''}`}>
                  <header><h3>ÖZELLİKLER</h3><span>{categories.reduce((n,c) => n + c.attributes.length, 0)} özellik · toplam <b>{num(total)}</b></span></header>
                  {/* Kategori sayısı tekse özet son hücreye üst üste girer (iki sütunlu ızgarada boş kare kalmasın); çiftse altta şerit. */}
                  <div className="player-attribute-grid">
                    {categories.map((c, i) => <div key={c.name} style={{ gridColumn: i < Math.ceil(categories.length / 2) ? 1 : 2, gridRow: i % Math.ceil(categories.length / 2) + 1 }}><Category c={c} /></div>)}
                    {categories.length % 2 === 1 && (
                      <div style={{ gridColumn: 2, gridRow: Math.ceil(categories.length / 2) }} className="hidden flex-col divide-y divide-cmt-line md:flex">
                        <SummaryCell label="TOPLAM ÖZELLİK" value={num(total)} />
                        <SummaryCell label="EN İYİ BAŞLIK" value={best ? best.name : '–'} score={best?.score} />
                      </div>
                    )}
                  </div>
                  <div className={`grid grid-cols-2 border-t border-cmt-line ${categories.length % 2 === 1 ? 'md:hidden' : ''}`}>
                    <div className="px-4 py-3"><div className="font-mono text-[11px] uppercase text-gray-500">TOPLAM ÖZELLİK</div><div className="font-tektur text-lg font-black text-cmt-text">{num(total)}</div></div>
                    <div className="border-l border-cmt-line px-4 py-3"><div className="font-mono text-[11px] uppercase text-gray-500">EN İYİ BAŞLIK</div><div className="font-tektur text-lg font-black text-cmt-text">{best ? `${best.name} ${best.score}` : '–'}</div></div>
                  </div>
                </div>
              )}
          </>}
          {tab === 'positions' && <div className="grid gap-4 xl:grid-cols-2">
            <div className="player-section player-position-map">
              <h3>{t('drawer.positions')}</h3>
              <PitchMap ratings={d.positionRatings} primary={p.position} secondary={p.position2} secondaryPositions={secondaryPositions} overall={p.overall} />
            </div>
            <RolesAndStyles d={d} mode="roles" />
          </div>}
          {tab === 'growth' && <>
            <Season d={d} history={history} historyError={historyError} retryHistory={retryHistory} />
            <Projection d={d} />
            <CareerStats d={d} club={club.data} />
          </>}
          {tab === 'value' && <>
            <VsSquad d={d} club={club.data} />
            <div className="grid gap-4 xl:grid-cols-2">
              <ValueSection v={d.value} gap={p.potential !== null && p.overall !== null ? Math.max(0, p.potential - p.overall) : null} />
              <OpportunitySection o={d.opportunity} />
            </div>
          </>}
        </div>
      </div>
    </div>
  )
}

/**
 * Yaşa göre tahmini genel (CMTracker "Projected overall by age"): bugünkü OVR'dan POT'a, POT'a 27 yaşında ulaşır,
 * 30'dan sonra yılda 1 düşer varsayımı. Açıkça tahmin; snapshot geçmişi ayrı grafikte.
 */
function Projection({ d }: { d: PlayerDetail }) {
  const { age, overall: ovr, potential: pot } = d.player
  if (age === null || ovr === null || pot === null) return null
  const peakAge = Math.max(age + 1, 27)
  const pts: [number, number][] = []
  for (let a = age; a <= Math.max(peakAge + 3, 33); a++) {
    const v = a <= peakAge ? ovr + (Math.max(pot, ovr) - ovr) * (a - age) / Math.max(1, peakAge - age)
      : Math.max(pot, ovr) - Math.max(0, a - 30)
    pts.push([a, Math.round(v)])
  }
  const W = 320, H = 130, pad = 22
  const lo = Math.min(...pts.map(x => x[1])) - 3, hi = Math.max(...pts.map(x => x[1])) + 3
  const x = (a: number) => pad + (a - pts[0][0]) / (pts[pts.length - 1][0] - pts[0][0]) * (W - pad * 2)
  const y = (v: number) => H - pad - (v - lo) / Math.max(1, hi - lo) * (H - pad * 2)
  const peak = pts.reduce((b, q) => (q[1] > b[1] ? q : b), pts[0])
  return (
    <section className="rounded-xl border border-cmt-line bg-cmt-sub p-4">
      <h3 className="font-mono text-[11px] uppercase tracking-wider text-gray-500">YAŞA GÖRE TAHMİNİ GENEL</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 max-h-44 w-full" role="img" aria-label={`Tahmin: ${peak[0]} yaşında yaklaşık ${peak[1]}`}>
        <polyline fill="none" stroke="var(--fc-accent)" strokeWidth="2" strokeDasharray="4 4" points={pts.map(([a, v]) => `${x(a)},${y(v)}`).join(' ')} />
        <circle cx={x(pts[0][0])} cy={y(pts[0][1])} r="4" fill="var(--fc-accent)" />
        <text x={x(pts[0][0])} y={y(pts[0][1]) - 8} fill="var(--fc-text)" fontSize="11" textAnchor="middle">{pts[0][1]}</text>
        <rect x={x(peak[0]) - 4} y={y(peak[1]) - 4} width="8" height="8" transform={`rotate(45 ${x(peak[0])} ${y(peak[1])})`} fill="none" stroke="var(--fc-accent)" strokeWidth="1.5" />
        <text x={x(peak[0])} y={y(peak[1]) - 9} fill="var(--fc-text)" fontSize="11" fontWeight="700" textAnchor="middle">{peak[1]}</text>
        {pts.filter((_, i) => i % 2 === 0).map(([a]) => <text key={a} x={x(a)} y={H - 6} fill="var(--fc-muted)" fontSize="11" textAnchor="middle">{a}</text>)}
      </svg>
      <p className="text-[12px] text-gray-300">Zirve yaklaşık {peak[1]}, {peak[0]} yaşında</p>
      <p className="mt-1 text-[11px] text-gray-500">Tipik gelişim varsayımıyla yaklaşık projeksiyon (POT'a 27 yaşında, 30'dan sonra düşüş); garanti değildir.</p>
    </section>
  )
}

/** "Neden bu değer" kısa hali: oyuncunun yaş, POT, OVR, maaş ve sözleşmesi kulüp kadrosu ortalamasına göre. */
function VsSquad({ d, club }: { d: PlayerDetail; club?: ClubView }) {
  const p = d.player
  const squad = (club?.squad ?? []).filter(m => m.role !== 'LoanedOut').map(m => m.player)
  const avg = (get: (x: typeof p) => number | null) => {
    const v = squad.map(get).filter((n): n is number => n !== null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const rows: [string, number | null, number | null, boolean][] = [
    ['Yaş', p.age, avg(x => x.age), true],
    ['Potansiyel', p.potential, avg(x => x.potential), false],
    ['Genel', p.overall, avg(x => x.overall), false],
    ['Maaş', p.wage, avg(x => x.wage), true],
    ['Sözleşme süresi', p.contractYearsLeft, avg(x => x.contractYearsLeft), false],
  ]
  return (
    <section className="rounded-xl border border-cmt-line bg-cmt-sub p-4">
      <h3 className="font-mono text-[11px] uppercase tracking-wider text-gray-500">KADRO ORTALAMASINA GÖRE</h3>
      {squad.length === 0 ? <p className="mt-3 text-[12px] text-gray-500">{p.isFreeAgent ? 'Serbest oyuncu: karşılaştırılacak kadro yok.' : 'Kadro yükleniyor…'}</p> : (
        <ul className="mt-3 space-y-2 text-[13px]">
          {rows.map(([label, v, a, lowerIsBetter]) => {
            if (v === null || a === null || a === 0) return <li key={label} className="text-gray-500">{label} –</li>
            const pct = Math.round((v / a - 1) * 100)
            const good = lowerIsBetter ? pct < 0 : pct > 0
            return <li key={label} className="text-gray-200">{label} <b className={pct === 0 ? 'text-gray-400' : good ? 'text-cmt-mint' : 'text-[#ff6460]'}>{pct > 0 ? '+' : pct < 0 ? '−' : '±'}%{Math.abs(pct)}</b> <span className="text-gray-500">kadro ortalamasına göre</span></li>
          })}
        </ul>
      )}
      {club && <p className="mt-2 text-[11px] text-gray-500">{club.club.name} kadrosu ({squad.length} oyuncu)</p>}
    </section>
  )
}

/** CMTracker "Roles" ve "PlayStyles": rol + mevki ve seviye (+ / ++), oyun stilleri ve oyun stili+. */
function styleTip(name: string) {
  const info = PLAY_STYLES[name]
  return info ? `${info.en}: ${info.desc}` : name
}

/** LE ile eklenebilecek oyun stilleri (tahmini eşikler; uygulama oyuna yazmaz). */
function StyleSuggestions({ d, owned, plus }: { d: PlayerDetail; owned: string[]; plus: string[] }) {
  const attrs: Record<string, number | null> = {}
  for (const c of d.attributeCategories ?? []) for (const a of c.attributes) attrs[a.key] = a.value
  const list = suggestPlayStyles(attrs, owned, plus, d.player.position === 'GK', d.player.skillMoves)
  if (list.length === 0) return null
  return (
    <details className="player-style-suggestions">
      <summary>LE İLE EKLENEBİLİR (ÖNERİ)</summary>
      <ul className="mt-1.5 space-y-1.5">
        {list.map(s => (
          <li key={s.name} className="flex items-start gap-2 text-[12px]" title={styleTip(s.name)}>
            <PlayStyleIcon name={s.name} plus={s.plus} size={18} />
            <span className="min-w-0">
              <span className={s.plus ? 'font-semibold text-[#ffd200]' : 'text-gray-100'}>{s.name}{s.plus ? '+' : ''}</span>
              <span className="ml-1.5 text-gray-500">{s.info.needs.map(([k, min]) => `${ATTR_SHORT[k] ?? k} ${attrs[k] ?? '–'}/${min}`).join(' · ')}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-gray-500">F8 → Oyuncu Editörü → Oyun Stilleri. Eşikler tahminidir; uygulama oyuna yazmaz.</p>
    </details>
  )
}

const ATTR_SHORT: Record<string, string> = {
  finishing: 'Bitiricilik', curve: 'Falso', composure: 'Soğukkanlılık', shotpower: 'Şut gücü', longshots: 'Uzaktan şut',
  freekickaccuracy: 'Serbest vuruş', headingaccuracy: 'Kafa', jumping: 'Zıplama', agility: 'Çeviklik', volleys: 'Vole',
  vision: 'Vizyon', shortpassing: 'Kısa pas', longpassing: 'Uzun pas', crossing: 'Orta', ballcontrol: 'Top kontrolü',
  defensiveawareness: 'Savunma bilinci', standingtackle: 'Ayakta müd.', slidingtackle: 'Kayarak müd.', interceptions: 'Top kesme',
  strength: 'Güç', dribbling: 'Dripling', sprintspeed: 'Sprint', acceleration: 'Hızlanma', stamina: 'Dayanıklılık',
  aggression: 'Agresiflik', balance: 'Denge', reactions: 'Reaksiyon', gkdiving: 'Atlama', gkhandling: 'Top tutma',
  gkkicking: 'Degaj', gkreflexes: 'Refleks', gkpositioning: 'Kaleci poz.',
}

function RolesAndStyles({ d, mode = 'both' }: { d: PlayerDetail; mode?: 'roles' | 'styles' | 'both' }) {
  const roles = d.profile?.roles ?? []
  const plus = d.profile?.playStylesPlus ?? []
  const styles = d.profile?.playStyles ?? []
  if (roles.length === 0 && plus.length === 0 && styles.length === 0 && !d.attributeCategories?.length) return null
  return (
    <div className={`player-roles-styles ${mode}`}>
      {mode !== 'styles' && <section className="player-section player-roles">
        <h3 className="font-tektur text-sm font-black uppercase tracking-wider text-cmt-text">ROLLER</h3>
        {roles.length === 0 ? <p className="mt-3 text-[12px] text-gray-500">Rol kaydı yok.</p> : (
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {roles.map(r => (
              <li key={r.code} className="player-role-row">
                <RoleTip role={r} />
              </li>
            ))}
          </ul>
        )}
      </section>}
      {mode !== 'roles' && <section className="player-section player-styles">
        <h3 className="font-tektur text-sm font-black uppercase tracking-wider text-cmt-text">OYUN STİLLERİ</h3>
        {plus.length > 0 && (
          <div className="player-plus-styles">
            <div className="mt-3 font-mono text-[11px] uppercase tracking-wider text-gray-500">OYUN STİLİ+</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {plus.map(s => <InfoTip key={s} title={`${s}+`} trigger={<><PlayStyleIcon name={s} category={d.profile?.styleCategories?.[s]} plus size={34} /><span>{s}</span></>}>{styleTip(s)}</InfoTip>)}
            </div>
          </div>
        )}
        <div className="player-normal-styles"><div className="mt-3 font-mono text-[11px] uppercase tracking-wider text-gray-500">OYUN STİLLERİ</div>
        {styles.length === 0 ? <p className="mt-1.5 text-[12px] text-gray-500">Yok</p> : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {styles.map(s => <InfoTip key={s} title={s} trigger={<><PlayStyleIcon name={s} category={d.profile?.styleCategories?.[s]} size={34} /><span>{s}</span></>}>{styleTip(s)}</InfoTip>)}
          </div>
        )}
        </div><StyleSuggestions d={d} owned={styles} plus={plus} />
      </section>}
    </div>
  )
}

/**
 * Kariyer istatistikleri (CMTracker "Career stats"): bu sezon maç puanı geçmişinden (maç, dakika, ortalama),
 * kariyer öncesi satırlar oyunun prevcompetitionstats tablosundan: oyunun başlangıç verisindeki gerçek hayat sezonu
 * (2025/26; kariyerde güncellenmiyor, 17.07.2030 kaydında doğrulandı).
 */
function CareerStats({ d, club }: { d: PlayerDetail; club?: ClubView }) {
  const s = d.stats
  const now = club?.squad.find(m => m.player.id === d.player.id)
  const fromSave = d.stats?.source === 'save'
  const hasNow = !fromSave && (now?.appearances ?? 0) > 0
  const season = `${d.snapshot.seasonEndYear - 1}/${String(d.snapshot.seasonEndYear).slice(2)}`
  const cell = 'px-2 py-2 text-right font-mono'
  const row = (key: string, label: ReactNode, l: { appearances?: number | null; goals?: number | null; assists?: number | null;
    cleanSheets?: number | null; yellow?: number | null; red?: number | null; minutes?: number | null; averageRating?: number | null }, bold = false) => (
    <tr key={key} className={bold ? 'font-bold text-cmt-text' : 'text-gray-200'}>
      <td className="px-3 py-2">{label}</td>
      <td className={cell}>{num(l.appearances ?? null)}</td><td className={cell}>{num(l.goals ?? null)}</td>
      <td className={cell}>{num(l.assists ?? null)}</td><td className={cell}>{num(l.cleanSheets ?? null)}</td>
      <td className={cell}>{num(l.yellow ?? null)}</td><td className={cell}>{num(l.red ?? null)}</td>
      <td className={cell}>{num(l.minutes ?? null)}</td><td className={cell}>{dec2(l.averageRating ?? null)}</td>
    </tr>
  )
  return (
    <section className="overflow-hidden rounded-xl border border-cmt-line bg-cmt-sub">
      <h3 className="border-b border-cmt-line px-4 py-3 font-tektur text-sm font-black uppercase tracking-wider text-cmt-text">KARİYER İSTATİSTİKLERİ</h3>
      {!s && !hasNow ? (
        <div className="flex items-center justify-center p-8"><span className="rounded-lg border border-cmt-line bg-cmt-card px-4 py-2 text-sm font-semibold text-cmt-text">Bu oyuncu için istatistik yok</span></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[12px]">
            <thead><tr className="border-b border-cmt-line font-mono text-[11px] uppercase text-gray-500">
              <th className="px-3 py-2 text-left">SEZON / YARIŞMA</th><th className="px-2 py-2 text-right">MAÇ</th><th className="px-2 py-2 text-right">GOL</th>
              <th className="px-2 py-2 text-right">ASİST</th><th className="px-2 py-2 text-right">GOL YEMEME</th><th className="px-2 py-2 text-right">SARI</th>
              <th className="px-2 py-2 text-right">KIRMIZI</th><th className="px-2 py-2 text-right">DAKİKA</th><th className="px-2 py-2 text-right">ORTALAMA</th>
            </tr></thead>
            <tbody className="divide-y divide-cmt-line">
              {hasNow && row('now', <>Bu sezon <span className="text-gray-500">(maç puanları)</span></>, now!)}
              {s && <tr><td colSpan={9} className="bg-cmt-card px-3 py-1.5 font-mono text-[11px] uppercase text-gray-500">
                {fromSave ? `SEZON ${season} · KARİYER KAYDINDAN` : 'KARİYER ÖNCESİ · OYUNUN BAŞLANGIÇ VERİSİ (2025/26)'}</td></tr>}
              {s && s.competitions.map((c, i) => row(`c${i}`, c.competition ?? `Yarışma #${c.competitionId ?? '?'}`, c))}
              {s && s.competitions.length > 1 && row('total', 'Toplam', s.total, true)}
            </tbody>
          </table>
          {!!s?.recent?.length && <div className="border-t border-cmt-line px-4 py-3">
            <h4 className="mb-2 font-mono text-[11px] uppercase text-gray-500">SON MAÇLAR</h4>
            <ul className="grid gap-1.5 text-[12px] text-gray-200">
              {s.recent.map(m => <li key={`${m.date}-${m.competition}`} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-gray-400">{gameDate(m.date)}</span>
                <span className="min-w-0 flex-1 truncate">{m.competition ?? 'Yarışma'}</span>
                <span className="font-mono text-gray-400">{m.minutes}'</span>
                <span className="w-10 text-right font-mono font-bold">{dec1(m.rating)}</span>
              </li>)}
            </ul>
          </div>}
          {s && <p className="border-t border-cmt-line px-4 py-2 text-[11px] text-gray-500">{fromSave
            ? 'Kariyer kaydındaki sezon istatistikleri (yarışma başına). Kart alanları doğrulanmayı bekliyor.'
            : "Kariyer öncesi satırlar oyunun başlangıç verisinden (oyuncunun o zamanki kulübü). Bu sezonun istatistikleri için kariyer kaydını içe aktar."}</p>}
        </div>
      )}
    </section>
  )
}

function SummaryCell({ label, value, score }: { label: string; value: string; score?: number | null }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-2 px-5 py-4">
      <div className="font-mono text-[11px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="flex items-center gap-3">
        <span className="font-tektur text-3xl font-black text-cmt-text">{value}</span>
        {score !== undefined && score !== null && <span className={`rounded px-2 py-0.5 font-tektur text-lg ${ratingClass(score)}`}>{score}</span>}
      </div>
    </div>
  )
}

function Category({ c }: { c: AttributeGroup }) {
  const bar = ratingClass
  return (
    <section className="bg-cmt-sub p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-tektur text-sm font-black uppercase tracking-wider text-cmt-text">{c.name}</h3>
        <span className={`rounded px-1.5 font-tektur text-sm ${ratingClass(c.score)}`}>{c.score ?? '–'}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded bg-cmt-card"><div className={`h-full ${bar(c.score)}`} style={{ width: `${c.score ?? 0}%` }} /></div>
      <ul className="mt-3 space-y-1.5">
        {c.attributes.map(a => (
          <li key={a.key} className="grid grid-cols-[1fr_96px_32px] items-center gap-2 text-[13px]">
            <span className="truncate text-gray-300">{a.label}</span>
            <span className="h-1 overflow-hidden rounded bg-cmt-card"><span className={`block h-full ${bar(a.value)}`} style={{ width: `${a.value ?? 0}%` }} /></span>
            <span className={`rounded text-center font-tektur text-xs ${ratingClass(a.value)}`}>{a.value ?? '–'}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Sezon bölümü: sezon başından bu yana OVR değişimi (gerçek snapshot'lar) ve gelişim grafiği. */
function Season({ d, history, historyError, retryHistory }: { d: PlayerDetail; history?: HistoryPoint[]; historyError: boolean; retryHistory: () => void }) {
  const end = d.snapshot.seasonEndYear
  const seasonStart = `${end - 1}-07-01`
  const inSeason = (history ?? []).filter(h => h.gameDate >= seasonStart && h.overall !== null)
  const first = inSeason[0]
  const last = inSeason[inSeason.length - 1]
  return (
    <section className="rounded-xl border border-cmt-line bg-cmt-sub p-4">
      <h3 className="font-tektur text-sm font-black uppercase tracking-wider text-cmt-text">SEZON {String(end - 1).slice(2)}/{String(end).slice(2)}</h3>
      <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
        <span className="text-gray-400">Sözleşme {d.contract.endYear ?? '–'} sonunda bitiyor{d.contract.yearsLeft !== null ? ` · ${d.contract.yearsLeft} yıl` : ''}</span>
        {first && last && first !== last
          ? <span className="text-gray-400">Sezon başından beri: OVR <b className="text-cmt-text">{first.overall} → {last.overall}</b>
              <b className={`ml-1 ${(last.overall! - first.overall!) >= 0 ? 'text-cmt-mint' : 'text-[#ff6460]'}`}>{signed(last.overall! - first.overall!)}</b></span>
          : <span className="text-gray-500">Bu sezonda karşılaştırılacak ikinci snapshot yok.</span>}
        {d.player.growthPerMonth !== null && <span className="text-gray-400">Aylık gelişim <b className="text-cmt-text">{dec2(d.player.growthPerMonth)}</b></span>}
      </div>
      <div className="mt-4">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-gray-500">{t('drawer.history')}</div>
        <p className="mb-2 text-[11px] text-gray-500">Kaydedilmiş snapshot’lar · Gelecek tahmini içermez</p>
        {historyError ? <p role="alert" className="text-xs text-[#ff6460]">Geçmiş yüklenemedi. <button className="btn" onClick={retryHistory}>Yeniden dene</button></p>
          : history ? <HistoryChart points={history} /> : <p role="status" className="text-xs text-gray-500">Geçmiş yükleniyor…</p>}
      </div>
      {d.seasonReference?.overall != null && d.seasonReference.currentOverall != null && (
        <div className="mt-4 border-t border-cmt-line pt-3" aria-label="Kayıttaki sezon gelişimi">
          <div className="text-xs text-gray-300">Kayıttaki sezon referansı: <b>{d.seasonReference.overall}</b> → Güncel: <b>{d.seasonReference.currentOverall}</b></div>
          <svg viewBox="0 0 320 90" role="img" aria-label={`Sezon referansı ${d.seasonReference.overall}, güncel ${d.seasonReference.currentOverall}`} className="h-24 w-full">
            <line x1="35" y1={80 - d.seasonReference.overall * .6} x2="285" y2={80 - d.seasonReference.currentOverall * .6} stroke="#32d59b" strokeWidth="3" />
            <circle cx="35" cy={80 - d.seasonReference.overall * .6} r="5" fill="var(--fc-accent)" />
            <circle cx="285" cy={80 - d.seasonReference.currentOverall * .6} r="5" fill="#32d59b" />
            <text x="35" y="86" textAnchor="middle" fill="var(--fc-muted)" fontSize="11">Referans</text>
            <text x="285" y="86" textAnchor="middle" fill="var(--fc-muted)" fontSize="11">Güncel</text>
          </svg>
          <p className="text-[11px] text-gray-500">Referansın kesin tarihi kayıtta yok; tarih grafiğine eklenmez.</p>
        </div>
      )}
      {!!d.matchRatings?.length && !d.stats?.recent?.length && (
        <div className="mt-4 border-t border-cmt-line pt-3">
          <h4 className="text-xs text-gray-300">Kayıttaki maç puanları</h4>
          <table className="mt-2 w-full text-left text-xs"><thead><tr><th>Tarih</th><th>Dakika</th><th>Puan</th></tr></thead>
            <tbody>{d.matchRatings.slice(0, 20).map((m, i) => <tr key={`${m.date}-${i}`}><td className="py-1">{gameDate(m.date)}</td><td>{m.minutes ?? '–'}</td><td>{m.rating ?? '–'}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** "Neden bu değer": temel değer × yaş × sözleşme × pozisyon, her terimin gerekçesiyle. */
function ValueSection({ v, gap }: { v: ValueBreakdown; gap: number | null }) {
  const ageWhy =
    v.ageRule === 'young'
      ? t('drawer.age.young', { max: v.youngMaxAge, f: dec2(v.youngPotentialFactor), gap: gap ?? '–', cap: dec1(v.youngMaxMultiplier) })
      : v.ageRule === 'curve'
        ? `Zirve yaşı ${v.peakAge}: altında yıl başına +%${Math.round((v.youthPremiumPerYear ?? 0) * 100)}, üstünde −%${Math.round((v.ageDeclinePerYear ?? 0) * 100)} (bileşik)`
      : v.ageRule === 'band'
        ? v.ageBandMax === null ? t('drawer.age.bandOpen', { min: v.ageBandMin ?? '' }) : t('drawer.age.band', { min: v.ageBandMin ?? '', max: v.ageBandMax })
        : t('drawer.age.unknown')
  const contractWhy =
    v.contractYearsLeft === null || v.contractYearsLeft === undefined ? t('drawer.contract.unknown')
      : v.contractYearsLeft === 0 ? t('drawer.contract.ending')
        : t('drawer.contract.years', { n: v.contractYearsLeft })
  const posWhy = v.position ? t('drawer.pos.why', { pos: v.position }) : t('drawer.pos.unknown')
  const pct = (m: number) => {
    const x = Math.round((m - 1) * 100)
    return <b className={`font-mono ${x > 0 ? 'text-cmt-mint' : x < 0 ? 'text-[#ff6460]' : 'text-gray-500'}`}>{x > 0 ? `+%${x}` : x < 0 ? `−%${-x}` : '±%0'}</b>
  }
  return (
    <section className="rounded-xl border border-cmt-line bg-cmt-sub p-4">
      <h3 className="font-tektur text-sm font-black uppercase tracking-wider text-cmt-text">NEDEN BU DEĞER</h3>
      <div className="mt-1 font-tektur text-2xl font-black text-cmt-text">{money(v.value)}</div>
      <ul className="mt-3 space-y-2 text-[13px]" aria-label={t('drawer.valueWhy')}>
        <li className="flex justify-between gap-3"><span className="text-gray-300">{t('drawer.base')} <small className="block text-[11px] text-gray-500">{v.overall === null ? '–' : t('drawer.base.why', { ovr: v.overall, base: money(v.baseValue), k: dec2(v.exponent), b0: v.baseOverall })}</small></span><b className="font-mono text-cmt-text">{money(v.base)}</b></li>
        <li className="flex justify-between gap-3"><span className="text-gray-300">{t('drawer.ageMult')} <small className="block text-[11px] text-gray-500">{ageWhy}</small></span>{pct(v.ageMultiplier)}</li>
        <li className="flex justify-between gap-3"><span className="text-gray-300">{t('drawer.contractMult')} <small className="block text-[11px] text-gray-500">{contractWhy}</small></span>{pct(v.contractMultiplier)}</li>
        {v.wageMultiplier !== undefined && <li className="flex justify-between gap-3"><span className="text-gray-300">Maaş <small className="block text-[11px] text-gray-500">{v.wage ? `Haftalık ${money(v.wage)}; referans ${money(v.referenceWage)}, esneklik ${v.wageElasticity}` : 'Maaş bilinmiyor, nötr'}</small></span>{pct(v.wageMultiplier)}</li>}
        {v.positionMultiplier !== 1 && <li className="flex justify-between gap-3"><span className="text-gray-300">{t('drawer.posMult')} <small className="block text-[11px] text-gray-500">{posWhy}</small></span>{pct(v.positionMultiplier)}</li>}
      </ul>
      <p className="mt-3 text-[11px] text-gray-500">Tahmini piyasa değeri (CMTracker değerlerine göre kalibre: OVR, yaş, maaş, sözleşme); gerçekleşecek bonservis değildir.</p>
    </section>
  )
}

const OPP_LABEL: Record<string, MessageKey> = {
  growthRoom: 'drawer.opp.growthRoom', growthRate: 'drawer.opp.growthRate', contract: 'drawer.opp.contract', age: 'drawer.opp.age',
}
const OPP_RAW: Record<string, MessageKey> = {
  growthRoom: 'drawer.opp.raw.growthRoom', growthRate: 'drawer.opp.raw.growthRate', contract: 'drawer.opp.raw.contract', age: 'drawer.opp.raw.age',
}

function OpportunitySection({ o }: { o: OpportunityBreakdown }) {
  return (
    <section className="rounded-xl border border-cmt-line bg-cmt-sub p-4">
      <h3 className="flex items-baseline justify-between font-tektur text-sm font-black uppercase tracking-wider text-cmt-text">
        {t('drawer.opportunity')}<span className="font-tektur text-2xl">{o.score ?? '–'}<small className="text-sm text-gray-500"> / 100</small></span>
      </h3>
      <ul className="mt-3 space-y-2.5">
        {o.components.map(c => (
          <li key={c.key} className="grid grid-cols-[1fr_90px_32px] items-center gap-2 text-[13px]">
            <span className="text-gray-300">{t(OPP_LABEL[c.key])}
              <small className="block text-[11px] text-gray-500">
                {c.raw === null ? t('drawer.opp.unknown') : t(OPP_RAW[c.key], { v: c.key === 'growthRate' ? dec2(c.raw) : num(c.raw) })}
                {' · '}{t('drawer.opp.weight', { w: `%${Math.round(c.weight * 100)}` })}
              </small></span>
            <span className="h-1.5 overflow-hidden rounded bg-cmt-card"><span className="block h-full bg-cmt-blurple" style={{ width: `${(c.score ?? 0) * 100}%` }} /></span>
            <b className="text-right font-mono text-cmt-text">{c.score === null ? '–' : Math.round(c.score * 100)}</b>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Yerel yüz görseli varsa onu, yoksa siluet ve baş harfler. */
function Face({ id, name, hasFace }: { id: number; name: string; hasFace: boolean }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [id])
  return (
    <div className="relative flex items-end justify-center overflow-hidden bg-gradient-to-b from-cmt-inner to-cmt-sub">
      {hasFace && !failed
        ? <img src={`/api/players/${id}/face`} alt={t('drawer.face', { name })} className="h-28 w-full object-cover object-top" onError={() => setFailed(true)} />
        : <Silhouette className="h-28 w-28" />}
    </div>
  )
}

/** Karşılaştırma listesine ekle/çıkar (en fazla 4); listede 2+ oyuncu varsa sayfaya bağlantı. */
function CompareButton({ playerId }: { playerId: number }) {
  const compare = useCompare()
  const inList = compare.has(playerId)
  return (
    <span className="flex items-center gap-1.5">
      <button onClick={() => compare.toggle(playerId)} disabled={!inList && compare.full} aria-pressed={inList}
        title={!inList && compare.full ? 'Karşılaştırma listesi dolu (4)' : undefined}
        className={`rounded border px-2 py-0.5 text-[12px] ${inList ? 'border-cmt-blurple bg-cmt-blurple/20 text-cmt-text' : 'border-cmt-line text-gray-300 hover:text-cmt-text'} disabled:opacity-40`}>
        {inList ? 'Karşılaştırmada ✓' : '+ Karşılaştır'}
      </button>
      {compare.ids.length >= 2 && <Link to="/compare" className="text-[12px] text-cmt-blurple hover:underline">Aç ({compare.ids.length})</Link>}
    </span>
  )
}
