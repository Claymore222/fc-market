import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Activity, Goal, ShieldCheck } from 'lucide-react'
import { useSaveUid } from '../App'
import { useMatchAnalysis } from '../api/matches'
import { gameDate } from '../lib/format'
import { PageLoading, PageState } from './SquadPage'

const results = { W: 'Galibiyet', D: 'Beraberlik', L: 'Mağlubiyet' }
export function MatchesPage() {
  const uid = useSaveUid()
  const [limit, setLimit] = useState(5)
  const [competition, setCompetition] = useState('')
  const query = useMatchAnalysis(uid, limit, competition || undefined)
  const data = query.data
  return <div className="matches-page page-enter">
    <Link className="analysis-back" to="/"><ArrowLeft size={15} /> Genel bakışa dön</Link>
    <header className="analysis-heading"><div><span className="analysis-eyebrow">MAÇ ARŞİVİ</span><h1>Son maçların analizi</h1><p>Sonuçlar, gol dengesi ve form. Yalnızca okunabilen maç verileri kullanılır.</p></div><Link className="btn" to="/squad/analysis">Teknik direktör profili →</Link></header>
    <div className="matches-controls"><div role="group" aria-label="Maç aralığı">{[5, 10, 20].map(n => <button key={n} type="button" aria-pressed={limit === n} onClick={() => setLimit(n)}>Son {n} maç</button>)}</div><label>Yarışma<select aria-label="Yarışma" value={competition} onChange={e => setCompetition(e.target.value)}><option value="">Tüm yarışmalar</option>{data?.competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
    {query.isPending ? <PageLoading title="Maçlar yükleniyor…" /> : query.isError ? <PageState title="Maç analizi okunamadı" detail={query.error.message} retry={() => { void query.refetch() }} /> : data && <>
      <div className="matches-source" data-testid="matches-source"><Activity size={17} /><div><strong>{data.snapshot.userTeamName}</strong><span>{data.fixtureSource ? `Fikstür kaynağı: ${gameDate(data.fixtureSource.gameDate)} · oyun kaydı` : 'İçe aktarılmış maç sonucu bulunamadı.'}</span></div><span>{data.available} oynanmış maç</span></div>
      {data.fixtureSource && data.fixtureSource.snapshotId !== data.snapshot.snapshotId && <p className="analysis-notice">Seçili görünüm {gameDate(data.snapshot.gameDate)} tarihli. Maç sonuçları {gameDate(data.fixtureSource.gameDate)} tarihli kayıt kopyasından; aradaki maçlar burada henüz görünmeyebilir.</p>}
      {data.summary ? <>
        <div className="matches-metrics">
          <Metric icon={<Activity size={19} />} label="FORM" value={`${data.summary.won}G · ${data.summary.drawn}B · ${data.summary.lost}M`} detail={`${data.summary.played} maç · seçili yarışmalarda`} />
          <Metric icon={<Goal size={19} />} label="GOL DENGESİ" value={`${data.summary.goalsFor} : ${data.summary.goalsAgainst}`} detail="Atılan / yenilen gol" />
          <Metric icon={<ShieldCheck size={19} />} label="GOL YEMEDEN" value={String(data.summary.cleanSheets)} detail={`${data.summary.played} maç içinde`} />
          <Metric icon={<Goal size={19} />} label="MAÇ BAŞINA GOL" value={(data.summary.goalsFor / data.summary.played).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} detail={`${data.summary.scoredGames} maçta gol bulundu`} />
        </div>
        <section className="analysis-card matches-results"><div className="matches-section-heading"><h2>Maç sonuçları</h2><span>En yeni maç üstte</span></div><p className="analysis-help">{data.matches.length < limit ? `Seçili kapsamda ${data.matches.length} oynanmış maç var. ` : ''}Hazırlık turnuvası, tüm yarışmalar seçiliyken dahildir. G/B/M skor üzerinden hesaplanır; penaltı galibi belirlenmez.</p>
          <ol>{data.matches.map((m, i) => <li key={`${m.competitionId}:${m.id}:${m.date}:${i}`}><span className={`matches-result is-${m.result}`} title={results[m.result]} aria-label={results[m.result]}>{m.result === 'W' ? 'G' : m.result === 'D' ? 'B' : 'M'}</span><div><strong>{m.opponent}</strong><span>{gameDate(m.date)} · {m.isHome ? 'İç saha' : 'Deplasman'} · {m.competition}</span></div><b aria-label={`Biz ${m.goalsFor}, rakip ${m.goalsAgainst}`}>{m.goalsFor} <span>–</span> {m.goalsAgainst}</b></li>)}</ol>
        </section>
      </> : <div className="career-empty" role="status"><h2>Bu kapsamda oynanmış maç bulunamadı</h2><p>{competition ? 'Diğer yarışmaları seçebilir veya yeni oyun kaydını içe aktarabilirsin.' : 'Skorları içeren bir kariyer kaydı geldiğinde form analizi burada görünecek.'}</p></div>}
      <section className="matches-missing"><h2>Ayrıntılı maç istatistikleri</h2><p>Topla oynama, pas yüzdesi, şutlar, xG ve maçın golcü/asist listesi için doğrulanmış maç bazlı veri henüz yok. Sezon toplamları tek bir maça atanmaz.</p><p>Bu alanlar için sayı veya oyun tarzı tahmini gösterilmiyor. Maç öncesi/sonrası doğrulamasından sonra kapsam genişletilecek.</p></section>
    </>}
  </div>
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <section className="matches-metric">{icon}<span>{label}</span><strong>{value}</strong><small>{detail}</small></section>
}
