import { Hourglass, Play, Trophy } from 'lucide-react'
import { useCareer } from '../App'
import { useClub } from '../api/client'
import { gameDate } from '../lib/format'
import { PageState } from './SquadPage'
import { InfoTip } from '../components/InfoTip'
import { TrophyImage } from '../components/TrophyImage'

/**
 * Kupa müzesi: kayıttaki sezon arşivi, güncel fikstür ve kulübün sabit tarihi toplamları ayrı gösterilir.
 */
export function TrophiesPage() {
  const { key } = useCareer()
  const club = useClub(key)
  if (club.isPending) return <PageState title="Kupalar yükleniyor…" />
  if (club.isError) return <PageState title="Kulüp okunamadı" detail={(club.error as Error).message} retry={() => club.refetch()} />
  const d = club.data
  const c = d.club
  const won = d.career?.trophiesWon ?? []
  const fromArchive = d.career?.trophiesSource === 'archive'
  const titleSeasons = (d.managerCareer?.seasons ?? []).filter(x => x.teamId === c.id && ((x.leagueTitles ?? 0) + (x.domesticCups ?? 0) + (x.continentalCups ?? 0)) > 0)
  const completedSeasons = (d.managerCareer?.seasons ?? [])
    .filter(x => x.teamId === c.id && x.completed && x.seasonEndYear <= d.snapshot.seasonEndYear)
    .sort((a, b) => b.seasonEndYear - a.seasonEndYear)
  const season = `${String(d.snapshot.seasonEndYear - 1).slice(2)}/${String(d.snapshot.seasonEndYear).slice(2)}`
  // Kariyer yarışma kimliği ile leagues.leagueid farklıdır. Eşleme yoksa yarışmayı kupa diye varsayma.
  const leagueCompetition = d.leagueCompetitionId ?? d.objectives?.find(o => o.kind === 0)?.competitionId
  const cups = Object.values((d.fixtures ?? []).filter(f => f.competitionId !== null && f.competitionId !== leagueCompetition)
    .reduce<Record<number, typeof d.fixtures>>((acc, f) => { (acc[f.competitionId!] ??= []).push(f); return acc }, {}))
  const totals: [string, number | null][] = [['Lig şampiyonluğu', c.leagueTitles], ['Yerel kupa', c.domesticCups],
    ['Şampiyonlar Ligi', c.clWins], ['Avrupa Ligi', c.elWins], ['Konferans Ligi', c.eclWins]]

  const box = 'rounded-xl border border-cmt-line bg-cmt-card p-5'
  const h = 'mb-3 font-tektur text-sm font-black uppercase tracking-wider text-cmt-text'
  return (
    <div className="trophy-workspace page-enter">
      <section className="trophy-heading">
        <h2><Trophy size={20} />KUPA MÜZESİ<InfoTip title="Kupa müzesi">{fromArchive
          ? 'Bu kulüpte kazanılanlar, kayıttaki sezon arşivinden. Lig şampiyonlukları doğrulandı; yerel/Avrupa kupası alanları doğrulanmayı bekliyor.'
          : 'Sezon arşivi bu kayıtta yok. Oyunun kulüp sayaçları kariyerde güncellenmediği için kariyerde kazanılan kupalar bilinmiyor.'}</InfoTip></h2>
        <div className="trophy-summary">
          {([['Kazanılan kupa', won.reduce((n, w) => n + w.count, 0)], ['Farklı kupa', won.length], ['İzlenen sezon', d.career?.seasonsTracked ?? 1]] as const).map(([l, v]) => (
            <div key={l}><span>{l}</span><b>{v}</b></div>
          ))}
        </div>
      </section>

      <section className={box}>
        <h3 className={h}>KAZANILAN KUPALAR</h3>
        {won.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <Trophy className="mb-2 h-7 w-7 text-gray-500" />
            <b className="text-cmt-text">{fromArchive ? 'Bu kulüpte henüz kupa yok' : 'Kariyer kupaları bilinmiyor'}</b>
            <p className="mt-1 max-w-md text-[13px] text-gray-400">{fromArchive
              ? 'Kayıttaki sezon arşivinde bu kulüp için kazanılmış kupa görünmüyor.'
              : 'Bu kariyerin kayıt dosyası içe aktarıldığında sezon arşivinden okunur. Oyunun kulüp sayaçları kariyerde artmıyor.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {won.map(w => (
              <div key={w.trophy} className="trophy-won-card">
                <TrophyImage id={w.competitionId} name={w.trophy} size={56} /><div className="mt-2 font-tektur text-2xl font-black text-cmt-text">×{w.count}</div>
                <div className="text-[13px] text-gray-200">{w.trophy}</div>
              </div>
            ))}
            {titleSeasons.length > 0 && <p className="col-span-full text-[12px] text-gray-400">
              Sezonlar: {titleSeasons.map(x => `${x.seasonEndYear - 1}/${String(x.seasonEndYear).slice(2)}`).join(', ')}</p>}
          </div>
        )}
      </section>

      <section className={box} aria-label="Bu sezonki yarışmalar">
        <h3 className={h}>{leagueCompetition != null ? 'BU SEZONKİ KUPA YOLCULUKLARI' : 'BU SEZONKİ YARIŞMALAR'} <span className="ml-2 font-mono text-[11px] font-normal text-gray-500">Sezon {season}</span></h3>
        {cups.length === 0 ? (
          <p className="flex items-center gap-2 text-[13px] text-gray-400"><Hourglass className="h-4 w-4" />{leagueCompetition != null ? 'Bu kayıtta lig dışı yarışma fikstürü görünmüyor.' : 'Bu kayıtta yarışma fikstürü görünmüyor.'}</p>
        ) : cups.map(list => {
          const next = [...list!].sort((a, b) => a.date.localeCompare(b.date)).find(f => f.date >= d.snapshot.gameDate && (f.homeGoals == null || f.awayGoals == null))
          return (
            <div key={list![0].competitionId} className="flex flex-wrap items-center justify-between gap-2 border-b border-cmt-line py-3 last:border-0">
              <span className="flex items-center gap-2 text-cmt-text"><Play className="h-4 w-4 text-cmt-mint" />{list![0].competition ?? 'Adı çözümlenmemiş yarışma'}</span>
              <span className="text-[13px] text-gray-300">{next ? <>Sıradaki: <b>{(next.isHome ? next.awayTeam : next.homeTeam) || 'Rakip bilgisi yok'}</b> · {gameDate(next.date)} · {next.isHome ? 'İç saha' : 'Deplasman'}</> : 'Planlı maç yok'}</span>
            </div>
          )
        })}
      </section>

      <section className={box} aria-label="Sezonlara göre kupalar">
        <h3 className={h}>SEZONLARA GÖRE</h3>
        <div className="rounded-lg border border-cmt-line bg-cmt-sub p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><b className="font-tektur text-cmt-text">{season}</b><span className="rounded bg-cmt-blurple/20 px-2 py-0.5 text-[11px] font-bold text-cmt-blurple">GÜNCEL KAYIT</span></div>
          <p className="mt-1 text-[13px] text-gray-300">{c.name} · {c.league ?? '–'} · {gameDate(d.snapshot.gameDate)} tarihi itibarıyla</p>
        </div>
        {completedSeasons.length > 0 ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {completedSeasons.map(s => {
            const counts = [['Lig', s.leagueTitles], ['Yerel kupa', s.domesticCups], ['Kıtasal kupa', s.continentalCups]] as const
            const wins = counts.filter(([, count]) => count != null && count > 0)
            const incomplete = counts.some(([, count]) => count == null)
            return <article key={s.index} className="rounded-lg border border-cmt-line bg-cmt-sub p-4">
              <div className="flex flex-wrap justify-between gap-2"><b className="text-cmt-text">{s.seasonEndYear - 1}/{String(s.seasonEndYear).slice(2)}</b><span className="text-xs text-gray-400">Tamamlandı</span></div>
              <p className="mt-2 flex flex-wrap gap-3 text-sm text-cmt-text">{wins.length ? wins.map(([label, count]) => <span key={label} className="inline-flex items-center gap-1"><Trophy size={14} />{label} ×{count}</span>) : incomplete ? 'Kupa bilgisi eksik' : 'Arşivde kazanılmış kupa yok'}</p>
              {wins.length > 0 && incomplete && <p className="mt-1 text-xs text-gray-400">Bazı kupa türleri için bilgi eksik.</p>}
              <p className="mt-2 text-xs text-gray-400">{s.played} maç · {s.won} G / {s.drawn} B / {s.lost} M</p>
            </article>
          })}
        </div> : <p className="mt-3 text-[12px] text-gray-400">Bu kulüp için tamamlanmış sezon arşivi bu kayıtta yok.</p>}
        <p className="mt-2 text-[11px] text-gray-500">Kaynak: kariyer kaydındaki sezon arşivi. Yerel ve kıtasal kupa alanları doğrulanmayı bekliyor.</p>
      </section>

      <section className={box} aria-label="Kulübün oyundaki toplam kupaları">
        <h3 className={h}>KULÜBÜN OYUNDAKİ TOPLAM KUPALARI</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {totals.map(([label, v]) => (
            <div key={label} className={`rounded-lg border p-3 ${v ? 'border-[#ffd200]/30' : 'border-cmt-line'} bg-cmt-sub`}>
              <div className="font-tektur text-2xl font-black text-cmt-text">{v ?? '–'}</div><div className="text-[12px] text-gray-400">{label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
