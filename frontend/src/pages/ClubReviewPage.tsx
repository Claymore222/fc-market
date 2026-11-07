import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CircleHelp, Coins, Layers, Shield, Swords, Users } from 'lucide-react'
import { useCareer } from '../App'
import { useClub } from '../api/client'
import { useClubReview, type ReviewPriority, type ReviewSlot } from '../api/clubReview'
import type { ClubView } from '../api/types'
import { ClubCrest } from '../components/layout/CareerHeroCard'
import { RatingChip } from '../components/cmt'
import { dec1, money } from '../lib/format'
import { PageLoading, PageState } from './SquadPage'

const PRIORITY: Record<ReviewPriority, string> = { urgent: 'Acil', window: 'Bu transfer dönemi', 'next-season': 'Gelecek sezon', sufficient: 'Yeterli', unknown: 'Veri yetersiz' }
const ORDER: Record<ReviewPriority, number> = { urgent: 0, window: 1, 'next-season': 2, unknown: 3, sufficient: 4 }
// Sahada hat, mevki tipine göre değil dizilişteki yere göre: 3-4-2-1'de RM/LM orta saha hattında, RAM/LAM önünde.
const ROWS = [['RW', 'RF', 'RS', 'ST', 'CF', 'LS', 'LF', 'LW'], ['RAM', 'CAM', 'LAM'], ['RM', 'RCM', 'CM', 'LCM', 'LM'], ['RDM', 'CDM', 'LDM'], ['RWB', 'RB', 'RCB', 'CB', 'LCB', 'LB', 'LWB'], ['GK']]
const POSITION_TR: Record<string, string> = { GK: 'Kaleci', CB: 'Stoper', RB: 'Sağ bek', LB: 'Sol bek', CDM: 'Ön libero', CM: 'Merkez orta saha', CAM: 'Ofansif orta saha', RM: 'Sağ orta saha', LM: 'Sol orta saha', RW: 'Sağ kanat', LW: 'Sol kanat', ST: 'Forvet' }

/** Kulüp incelemesi: başka bir takımın oyun tarzı, kadro ihtiyaçları, tahmini bütçesi ve senin kulübünle kıyası. */
export function ClubReviewPage() {
  const { key } = useCareer()
  const [params] = useSearchParams()
  const raw = Number(params.get('team'))
  const teamId = Number.isSafeInteger(raw) && raw > 0 ? raw : undefined
  const review = useClubReview(key, teamId)
  const club = useClub(key, teamId, teamId !== undefined)
  const own = useClub(key)

  if (teamId === undefined) return <PageState title="Takım seçilmedi" detail="Scout → Takımlar'dan bir kulüp seç." />
  if (review.isPending || club.isPending) return <PageLoading title="Kulüp inceleniyor…" />
  if (review.isError) return <PageState title="Kulüp incelenemedi" detail={(review.error as Error).message} retry={() => review.refetch()} />
  if (club.isError) return <PageState title="Kulüp okunamadı" detail={(club.error as Error).message} retry={() => club.refetch()} />
  const r = review.data, c = club.data, mine = own.data
  const t = r.tactics, needs = r.needs
  const ordered = needs ? [...needs.slots].sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || (b.needScore ?? -1) - (a.needScore ?? -1)) : []
  const open = ordered.filter(s => s.priority !== 'sufficient')
  const isOwn = teamId === r.snapshot.userTeamId

  return <div className="review-page page-enter">
    <nav className="review-nav"><Link to="/scout?view=teams"><ArrowLeft size={14} />Takımlar</Link><Link to={`/squad?team=${teamId}`}>Kadroyu gör</Link></nav>

    <header className="review-hero">
      <ClubCrest name={c.club.name} color1={c.club.color1} color2={c.club.color2} size={64} teamId={teamId} />
      <div className="min-w-0">
        <span className="analysis-eyebrow">KULÜP İNCELEMESİ</span>
        <h1>{c.club.name}</h1>
        <p>{c.club.league ?? '–'}{c.standing?.position ? ` · ligde ${c.standing.position}.` : ''}{c.standing?.points != null ? ` · ${c.standing.points} puan` : ''}</p>
      </div>
      <div className="review-hero-stats">
        <Stat label="Takım gücü" value={<RatingChip value={c.club.overall} />} />
        <Stat label="Kadro gücü sırası" value={needs?.league?.rank ? `${needs.league.rank}. / ${needs.league.clubs}` : '–'} hint="İlk 11 mevki reytinglerine göre, kendi liginde" />
        <Stat label="Tahmini bütçe" value={r.budget ? `${r.budget.outsideCalibration ? '≈ ' : ''}${money(r.budget.estimate)}` : '–'} hint={r.budget?.outsideCalibration ? 'Kalibrasyon aralığı dışında; kaba işaret' : 'Sezon başı transfer bütçesi, tahmini'} />
      </div>
    </header>
    {isOwn && <p className="analysis-notice" role="status">Bu senin kulübün; ayrıntılı plan için Transfer → Takım planı'na bak.</p>}

    <div className="review-grid">
      <section className="review-card" aria-labelledby="review-style">
        <h2 id="review-style"><Swords size={16} />Nasıl oynuyor</h2>
        <div className="review-formation"><strong>{t.formation ?? 'Bilinmiyor'}</strong>
          <span>{[t.defenders, t.midfielders, t.attackers].every(v => v != null) ? `${t.defenders} defans · ${t.midfielders} orta saha · ${t.attackers} hücum` : ''}</span></div>
        <dl className="review-facts">
          <div><dt>Diziliş karakteri</dt><dd>{t.offensiveLabel ?? '–'}</dd></div>
          <div><dt>Oyun kurma</dt><dd>{t.buildUpLabel ?? (t.buildUpPlay != null ? `Kod ${t.buildUpPlay}` : '–')}</dd></div>
          <div><dt>Savunma çizgisi</dt><dd>{t.defensiveLineLabel ?? '–'}{t.defensiveDepth != null && <small> · {t.defensiveDepth}{t.leagueDefensiveDepth != null && ` (lig ort. ${dec1(t.leagueDefensiveDepth)})`}</small>}</dd></div>
          <div><dt>Hatlar</dt><dd>Hücum {c.club.attack ?? '–'} · Orta saha {c.club.midfield ?? '–'} · Defans {c.club.defense ?? '–'}</dd></div>
        </dl>
        <p className="review-note"><CircleHelp size={13} />Oyunun bu takım için kayıtlı varsayılan taktiği. Maç içinde yapay zekâ farklı oynayabilir.</p>
      </section>

      <section className="review-card" aria-labelledby="review-budget">
        <h2 id="review-budget"><Coins size={16} />Bütçe ve kulüp</h2>
        {r.budget ? <>
          <div className="review-formation"><strong>{money(r.budget.low)} – {money(r.budget.high)}</strong><span>Sezon başı transfer bütçesi tahmini</span></div>
          {r.budget.outsideCalibration && <p className="analysis-notice" role="note">Bu kulüp, tahminin dayandığı kulüplerden çok daha {r.budget.clubWorth > 100_000 ? 'büyük' : 'küçük'}. Rakam yalnız kaba bir işaret; gerçek bütçe çok farklı olabilir.</p>}
          <p className="review-note"><CircleHelp size={13} />Oyun bu kulübün bütçesini kayıtta tutmuyor. Tahmin, kulüp değerinden ({r.budget.clubWorth.toLocaleString('tr-TR')}) senin {r.budget.calibrationPoints} gerçek sezon başı bütçene oturtulmuş eğriyle hesaplanır; o noktalarda hata %1 altında. Kulüp değeri sezon içinde değişirse bütçe de değişir.</p>
        </> : <p className="review-note">Kulüp değeri okunamadı; bütçe tahmin edilemedi.</p>}
        <dl className="review-facts">
          <div><dt>Kadro değeri</dt><dd>{money(c.summary.squadValue)}</dd></div>
          <div><dt>Haftalık maaşlar</dt><dd>{money(c.summary.wages)}</dd></div>
          <div><dt>Sözleşmesi bu sezon biten</dt><dd>{c.summary.expiringThisSeason} oyuncu</dd></div>
          <div><dt>Prestij (yurt içi / dış)</dt><dd>{c.club.domesticPrestige ?? '–'} / {c.club.internationalPrestige ?? '–'}</dd></div>
          <div><dt>Altyapı · Stadyum</dt><dd>{c.club.youthDevelopment ?? '–'} · {c.club.stadiumCapacity?.toLocaleString('tr-TR') ?? '–'} kişi</dd></div>
        </dl>
      </section>
    </div>

    {needs && <section className="review-card" aria-labelledby="review-needs">
      <h2 id="review-needs"><Layers size={16} />Kadro ve ihtiyaçlar <small>{needs.formation}{!needs.formationExact && ' · en yakın tanımlı diziliş'}</small></h2>
      <div className="review-needs">
        <div className="depth-pitch review-pitch" aria-label={`${needs.formation} ilk 11 ve yedekler`}>
          {ROWS.map((row, i) => <div className="depth-pitch-line" key={i}>{needs.slots.filter(s => row.includes(s.slot)).sort((a, b) => row.indexOf(a.slot) - row.indexOf(b.slot)).map(s =>
            <div key={s.slot} className={`depth-position is-${s.priority}`} title={s.reasons.map(x => x.text).join('\n')}>
              <b>{s.slot}</b><span>{s.starterName ?? 'Açık yer'}{s.starterRating != null && ` ${s.starterRating}`}</span>
              <small>{s.rotationName ? `Yedek: ${s.rotationName}${s.rotationRating != null ? ` ${s.rotationRating}` : ''}` : 'Yedek yok'}</small>
            </div>)}</div>)}
        </div>
        <div className="review-priorities">
          <h3>Gidersen ilk işin</h3>
          {open.length === 0 ? <p className="review-note">Belirgin bir açık görünmüyor; kadro bu dizilişte ligine göre yeterli.</p>
            : <ol>{open.map(s => <SlotNeed key={s.slot} s={s} />)}</ol>}
          {needs.league && <p className="review-note"><Users size={13} />Kadro gücü {dec1(needs.league.own)}, lig medyanı {dec1(needs.league.median)} · {needs.league.clubs} kulüp arasında {needs.league.rank}. sıra.</p>}
        </div>
      </div>
      {needs.lines.length > 0 && <table className="review-lines">
        <thead><tr><th>Mevki</th><th>İlk 11</th><th>Lig medyanı</th><th>Sıra</th><th>Yedek</th><th>Sıra</th></tr></thead>
        <tbody>{needs.lines.map(l => <tr key={l.position}>
          <td>{POSITION_TR[l.position] ?? l.position}</td><td>{dec1(l.starter)}</td><td>{dec1(l.starterMedian)}</td>
          <td className={rankTone(l.starterRank, l.clubs)}>{l.starterRank ?? '–'}</td><td>{dec1(l.rotation)}</td>
          <td className={rankTone(l.rotationRank, l.clubs)}>{l.rotationRank ?? '–'}</td></tr>)}</tbody>
      </table>}
    </section>}

    {mine && !isOwn && <Compare other={c} mine={mine} budget={r.budget?.estimate ?? null} />}
  </div>
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div title={hint}><span>{label}</span><strong>{value}</strong></div>
}

function SlotNeed({ s }: { s: ReviewSlot }) {
  return <li><span className={`depth-badge is-${s.priority}`}>{PRIORITY[s.priority]}{s.conditional && ' · koşullu'}</span>
    <b>{s.slot}</b> <span className="text-gray-400">{POSITION_TR[s.position] ?? s.position}</span>
    <p>{s.reasons.map(x => x.text).join(' ')}</p></li>
}

const rankTone = (rank: number | null, clubs: number) => rank == null ? '' : rank <= Math.ceil(clubs / 3) ? 'is-good' : rank > clubs - Math.ceil(clubs / 3) ? 'is-bad' : ''

function Compare({ other, mine, budget }: { other: ClubView; mine: ClubView; budget: number | null }) {
  const ownBudget = mine.snapshot.transferBudget
  const rows: [string, ReactNode, ReactNode][] = [
    ['Lig', other.club.league ?? '–', mine.club.league ?? '–'],
    ['Lig sırası', other.standing?.position ? `${other.standing.position}.` : '–', mine.standing?.position ? `${mine.standing.position}.` : '–'],
    ['Takım gücü', other.club.overall ?? '–', mine.club.overall ?? '–'],
    ['En iyi 11 ortalaması', dec1(other.summary.bestXiAverage), dec1(mine.summary.bestXiAverage)],
    ['Transfer bütçesi', budget != null ? `~${money(budget)} (tahmini, sezon başı)` : '–', ownBudget != null ? `${money(ownBudget)} (şu an kalan)` : '–'],
    ['Kadro değeri', money(other.summary.squadValue), money(mine.summary.squadValue)],
    ['Haftalık maaşlar', money(other.summary.wages), money(mine.summary.wages)],
    ['Ortalama yaş', dec1(other.summary.averageAge), dec1(mine.summary.averageAge)],
    ['Oyuncu sayısı', other.summary.players, mine.summary.players],
    ['Prestij (yurt içi)', other.club.domesticPrestige ?? '–', mine.club.domesticPrestige ?? '–'],
  ]
  return <section className="review-card" aria-labelledby="review-compare">
    <h2 id="review-compare"><Shield size={16} />Senin kulübünle kıyas</h2>
    <table className="review-compare"><thead><tr><th /><th>{other.club.name}</th><th>{mine.club.name}</th></tr></thead>
      <tbody>{rows.map(([label, a, b]) => <tr key={label}><th scope="row">{label}</th><td>{a}</td><td>{b}</td></tr>)}</tbody></table>
  </section>
}
