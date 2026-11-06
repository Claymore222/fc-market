import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ArrowUpRight, ChevronDown, RefreshCw, SlidersHorizontal, WandSparkles } from 'lucide-react'
import { useSaveUid } from '../App'
import { useRecruitmentBoard, type RecruitmentBoard, type RecruitmentBoardPosition } from '../api/recruitmentBoard'
import type { RecruitmentCandidate } from '../api/recruitment'
import { PlayerAvatar, RatingChip } from '../components/cmt'
import { StarButton } from '../components/StarButton'
import { PlayerDrawer } from '../components/PlayerDrawer'
import { RecruitmentPreferences } from '../components/RecruitmentPreferences'
import { TransferSubNav } from '../components/TransferMarketDrawer'
import { COMPARE_MAX, useCompare } from '../lib/compare'
import { RECORDED_WAGE_NOTE } from '../components/PlayerWage'
import { gameDate, money } from '../lib/format'
import { PageLoading, PageState } from './SquadPage'
import { toast } from '../lib/toast'
import { AddToPackage, TransferPackage, TransferPackageProvider } from '../components/TransferPackage'

export const POSITION_NAMES: Record<string, string> = { GK: 'Kaleci', RB: 'Sağ bek', CB: 'Stoper', LB: 'Sol bek', CDM: 'Ön libero', CM: 'Merkez orta saha', CAM: '10 numara', RM: 'Sağ orta saha', LM: 'Sol orta saha', RW: 'Sağ kanat', LW: 'Sol kanat', ST: 'Santrfor' }
const PRIORITY: Record<string, string> = { urgent: 'Acil', window: 'Bu dönem', 'next-season': 'Gelecek sezon', sufficient: 'Yeterli', unknown: 'Veri eksik' }
const rank: Record<string, number> = { urgent: 0, window: 1, 'next-season': 2, unknown: 3, sufficient: 4 }
const GROUPS = [{ label: 'Bu dönem', priorities: ['urgent', 'window'] }, { label: 'Gelecek sezon', priorities: ['next-season'] }, { label: 'Veri eksik', priorities: ['unknown'] }, { label: 'Yeterli', priorities: ['sufficient'] }]
const PURPOSES: Record<string, string> = { starter: 'İlk 11', rotation: 'Yedek', development: 'Genç yatırım' }
const BUDGET: Record<string, string> = { 'reference-within': 'Tahmini bütçe uyumu', 'reference-wage': 'Maaş alanı gerekir', 'reference-above': 'Tahmini bütçe üstü', unknown: 'Maliyet bilgisi eksik' }
const dec = (n: number | null | undefined) => n === null || n === undefined ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const byNeed = (a: RecruitmentBoardPosition, b: RecruitmentBoardPosition) => (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9) || (b.needScore ?? -1) - (a.needScore ?? -1)
const sign = (n: number | null | undefined) => n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`
export const nameOf = (p: RecruitmentBoardPosition) => POSITION_NAMES[p.position] ?? p.position
/** The most pressing real need in the current XI; none when the squad is covered. */
export const topNeed = (board: RecruitmentBoard) => board.positions.filter(p => p.inFormation && ['urgent', 'window', 'next-season'].includes(p.priority)).sort(byNeed)[0]

/** The page's one-line answer: where to look first. */
function verdict(board: RecruitmentBoard) {
  // Alternative formations are separate scenarios, never extra gaps in the current XI.
  const formation = board.positions.filter(p => p.inFormation).sort(byNeed)
  const now = formation.filter(p => ['urgent', 'window'].includes(p.priority)), future = formation.filter(p => p.priority === 'next-season')
  const unknown = formation.filter(p => p.priority === 'unknown' || p.reasons.some(r => ['conditional', 'quality-unknown', 'roster-unknown'].includes(r.code))).length
  const later = future.length ? ` Gelecek sezon: ${future.slice(0, 3).map(nameOf).join(', ')}.` : ''
  if (now.length) return `Öncelik: ${nameOf(now[0])}.${now.length > 1 ? ` Sonra ${now.slice(1, 3).map(nameOf).join(', ')}.` : ''}${later}`
  if (unknown) return `Kesin bir sıra çıkarılamadı; eksik bilgiler var.${later}`
  return `Bu dönem takviye gerekmiyor.${later}`
}

export const reasonOf = (p: RecruitmentBoardPosition) => {
  const codes = p.priority === 'next-season' ? ['contract', 'future-gap'] : ['starter-gap', 'starter-quality', 'league-starter', 'rotation-gap', 'league-rotation', 'rotation-quality']
  return codes.map(code => p.reasons.find(r => r.code === code)?.text).find(Boolean) ?? p.reasons[0]?.text ?? 'Bu mevkide kadron yeterli görünüyor.'
}

export function RecruitmentHubPage() {
  const saveUid = useSaveUid(), query = useRecruitmentBoard(saveUid), qc = useQueryClient(), [params] = useSearchParams()
  const [position, setPosition] = useState(() => params.get('mevki')), [purpose, setPurpose] = useState<string | null>(null)
  const [all, setAll] = useState(false), [limit, setLimit] = useState(5)
  const [editor, setEditor] = useState<RecruitmentBoard | null>(null)
  const [selected, setSelected] = useState<{ id: number; token: string } | null>(null)
  if (!query.data) return query.isPending ? <PageLoading title="Öneriler hazırlanıyor…" /> : <PageState title="Öneriler hazırlanamadı" detail={query.error?.message} retry={() => { void query.refetch() }} />
  const b = query.data, ctx = b.view.context, p = b.view.profile
  const token = `${ctx.scopeKey}|${ctx.viewMode}|${ctx.snapshot.snapshotId}|${ctx.snapshot.revision}|${ctx.configVersion}|${b.view.version}`
  const unavailable = query.isError || query.isFetching
  const positions = [...b.positions].filter(pos => pos.inFormation).sort(byNeed), others = b.positions.filter(pos => !pos.inFormation)
  const current = [...positions, ...others].find(pos => pos.position === position) ?? positions[0] ?? others[0]
  if (!current) return <PageState title="Bu kaynakta öneri mevkileri bulunamadı" retry={() => { void query.refetch() }} />
  const showAll = all || !current.inFormation
  const result = current.recommendations, defaultPurpose = current.reasons.some(r => ['starter-gap', 'starter-quality', 'league-starter'].includes(r.code)) ? 'starter' : p.horizon === 'develop' ? 'development' : 'rotation'
  const group = result.groups.find(g => g.key === (purpose ?? defaultPurpose)) ?? result.groups[0]
  const candidates = (group?.candidates ?? []).slice(0, limit), over = group?.overBudget ?? []
  const available = (group?.candidates ?? []).length
  const open = (id: number) => setSelected({ id, token })
  const choose = (pos: string) => { setPosition(pos); setPurpose(null); setLimit(5) }
  const line = (pos: RecruitmentBoardPosition) => b.lines?.find(l => l.position === pos.position)
  const row = (pos: RecruitmentBoardPosition) => <button type="button" key={pos.position} className={`hub-position ${pos.position === current.position ? 'is-selected' : ''}`} aria-pressed={pos.position === current.position} onClick={() => choose(pos.position)}><span><strong>{nameOf(pos)}</strong>{line(pos)?.starterRank && <small>Ligde {line(pos)?.starterRank}. sıra</small>}</span><i>{pos.position}</i></button>
  const usable = (v: number | null) => v === null ? 'Bilinmiyor' : money(v * (100 - p.reservePercent) / 100)
  return <TransferPackageProvider board={b} saveUid={saveUid} unavailable={unavailable} key={`${ctx.scopeKey}|${ctx.viewMode}`}><div className="recruitment-hub page-enter">
    <TransferSubNav />
    <header className="hub-header"><div><h1>Transfer</h1><p className="hub-verdict">{verdict(b)}</p></div><div className="hub-header-actions"><button className="hub-button" type="button" disabled={unavailable} onClick={() => setEditor(b)}><WandSparkles size={15} /> Tercihlerini kişiselleştir</button></div></header>
    <dl className="hub-facts" aria-label={`${ctx.snapshot.userTeamName} transfer özeti`}>
      <div><dt>Kullanılabilir bonservis bütçesi</dt><dd>{usable(p.transferBudget)}</dd></div>
      <div><dt>Kullanılabilir maaş alanı</dt><dd>{usable(p.weeklyWageBudget)}<small> / hafta</small></dd></div>
      {b.league && <div><dt>Takım gücü</dt><dd>{b.league.rank}. / {b.league.clubs}</dd></div>}
      {ctx.leagueObjective?.target != null && <div><dt>Yönetim hedefi</dt><dd>Seviye {ctx.leagueObjective.target}</dd></div>}
      <Link to="/transfer/plan#butce" aria-label="Bütçeyi düzenle" title="Bütçeyi düzenle"><SlidersHorizontal size={16} /></Link>
    </dl>
    <p className="hub-budget-note">Bütçeden %{p.reservePercent} güvenlik payı ayrıldı. Maliyet ön elemesi referans bedel ve maaş tahminine dayanır; oyuncunun talebi bilinmiyor.</p>
    {ctx.viewMode === 'preview' && <p className="hub-message">Export önizlemesi: bu ilerlemenin oyunda kaydedildiği doğrulanmadı.</p>}
    {query.isFetching && <p role="status" className="hub-message">Öneriler güncelleniyor.</p>}
    {query.isError && <p role="alert" className="hub-message is-error">{query.error.message} <button type="button" onClick={() => { void query.refetch() }}>Yeniden dene</button></p>}
    <TransferPackage />
    <TeamFirstSteps board={b} />
    <div className="hub-workspace">
      <aside className="hub-position-rail" aria-label="Transfer öncelikleri">
        {GROUPS.map(g => { const items = positions.filter(pos => g.priorities.includes(pos.priority)); return items.length > 0 && <div className="hub-rail-group" key={g.label}><h2 className={`is-${g.priorities[0]}`}>{g.label}</h2>{items.map(row)}</div> })}
        {others.length > 0 && <div className="hub-rail-group"><button type="button" className="hub-rail-toggle" aria-pressed={showAll} onClick={() => { setAll(!showAll); choose(current.inFormation ? current.position : positions[0]?.position ?? current.position) }}>{showAll ? 'Yalnız dizilişim' : 'Tüm mevkiler'}</button>{showAll && others.map(row)}</div>}
      </aside>
      <section className="hub-results" aria-label={`${nameOf(current)} önerileri`}>
        <header className="hub-results-heading"><h2>{nameOf(current)}</h2><span className={`hub-priority is-${current.inFormation ? current.priority : 'alternative'}`}>{current.inFormation ? PRIORITY[current.priority] : `${current.formation} alternatif senaryosu`}</span><p>{reasonOf(current)}</p></header>
        <div className="hub-purpose-tabs" role="group" aria-label="Oyuncu amacı">{result.groups.map(g => <button type="button" key={g.key} aria-pressed={group?.key === g.key} onClick={() => { setPurpose(g.key); setLimit(5) }}>{PURPOSES[g.key] ?? g.label}<span>{g.total - (g.overBudgetTotal ?? 0)}</span></button>)}</div>
        {candidates.length > 0 && <div className="hub-list-head" aria-hidden="true"><span>Oyuncu</span><span>Uyum / 100</span><span>OVR / POT</span><span>Maaş / hafta</span><span>Bütçe durumu</span><span>Kıyasla / İzle</span></div>}
        <fieldset key={`${current.position}-${group?.key}`} disabled={unavailable} className="hub-player-grid view-swap" aria-label="Transfer adayları">{candidates.map(candidate => <HubCandidate key={`${group?.key}-${candidate.id}`} candidate={candidate} position={current.position} onOpen={() => open(candidate.id)} />)}</fieldset>
        {available > limit && <button type="button" className="hub-more" onClick={() => setLimit(10)}>Daha fazla göster</button>}
        {candidates.length === 0 && <div className="hub-no-candidates"><h3>{over.length ? 'Bütçene uyan aday çıkmadı' : 'Bu ölçütlerde aday bulunamadı'}</h3><p>{over.length ? 'En yakın seçenekler aşağıda. Önce bütçe veya maaş alanı açman gerekir.' : 'Diğer amaç grubuna bakabilir, bütçe ve oyuncu tarzını değiştirebilirsin.'}</p><button className="hub-button" type="button" disabled={unavailable} onClick={() => setEditor(b)}>Tercihlere bak</button></div>}
        {over.length > 0 && <details className="hub-explanation" open={candidates.length === 0}><summary>Bütçe üstü seçenekler ({group?.overBudgetTotal ?? over.length}) <ChevronDown size={14} /></summary><fieldset disabled={unavailable} className="hub-player-grid" aria-label="Bütçe üstü adaylar">{over.slice(0, limit).map(candidate => <HubCandidate key={`over-${group?.key}-${candidate.id}`} candidate={candidate} position={current.position} onOpen={() => open(candidate.id)} />)}</fieldset></details>}
        <details className="hub-explanation"><summary>Bu mevki neden önemli? <ChevronDown size={14} /></summary><ul>{current.reasons.map((r, i) => <li key={i}>{r.text}</li>)}</ul><Link to="/transfer/plan">Takım planını aç <ArrowRight size={13} /></Link></details>
        <details className="hub-explanation"><summary>Nasıl hesaplanıyor? <ChevronDown size={14} /></summary><p>Aranan profil: {result.target.label}{result.target.preferences.length > 0 && ` · ${result.target.preferences.slice(-2).join(' · ')}`}. Sıra lig kıyası ve sözleşme riskinden gelir; {p.formation} dizilişi için {gameDate(ctx.snapshot.gameDate)} verisi kullanılır. Bütçeden %{p.reservePercent} güvenlik payı düşülür.</p><p>Beklenen maaş {result.wages?.source === 'league' ? 'ligdeki' : 'kulübündeki'} OVR-maaş düzeninden tahmindir, oyuncunun talebi değildir. İstenen bonservis bilinmiyorsa fiyat uydurulmaz; değer yalnız ön elemedir. Yönetim hedefi kayıttaki 0–17 seviyesidir, sıraya çevrilmedi.</p><ul>{b.warnings.map(w => <li key={w}>{w}</li>)}</ul><p>Kaynak: {ctx.snapshot.snapshotId} · revizyon {ctx.snapshot.revision ?? 0} · kurallar {result.configVersion}.</p><button type="button" className="hub-text-button" disabled={query.isFetching} onClick={() => { void query.refetch() }}><RefreshCw size={13} /> Yeniden hesapla</button></details>
      </section>
    </div>
    {editor && <RecruitmentPreferences board={editor} saveUid={saveUid} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); toast('Tercihler kaydedildi'); void qc.invalidateQueries({ queryKey: ['recruitmentBoard', saveUid], exact: true }); void qc.invalidateQueries({ queryKey: ['managerProfile', saveUid], exact: true }) }} />}
    {selected && selected.token === token && !unavailable && <PlayerDrawer playerId={selected.id} saveUid={saveUid} onClose={() => setSelected(null)} />}
  </div></TransferPackageProvider>
}

function TeamFirstSteps({ board }: { board: RecruitmentBoard }) {
  const xi = board.xi, plan = board.contracts
  if (!xi?.options.length && !plan) return null
  const share = plan?.wages !== null && plan?.wages !== undefined && plan.wageBill ? Math.round(plan.wages / plan.wageBill * 100) : null
  return <section className="hub-first-steps" aria-label="Transferden önce yapılacaklar">
    {!!xi?.options.length && <details><summary><strong>Kadro içi</strong><span>{xi.options.length} değişiklik 11'i güçlendirir, maliyeti yok</span><em>{dec(xi.savedAverage)} → {dec(xi.improvedAverage)}</em><ChevronDown size={14} /></summary><ul>{xi.options.map(o => <li key={o.slot}><span><strong>{o.betterName} {o.betterRating}</strong><small>{o.slot}: {o.currentName} {o.currentRating} yerine{o.note ? ` · ${o.note}` : ''}</small></span><em>{sign(o.gain)}</em></li>)}</ul></details>}
    {plan && <details><summary><strong>Sözleşmeler</strong><span>{plan.players} sözleşme {plan.endYear}'de bitiyor, ilk 11'den {plan.starters} oyuncu</span>{share !== null && <em>maaşların %{share}'i</em>}<ChevronDown size={14} /></summary><ul>{plan.items.map(i => <li key={i.playerId}><span><strong>{i.name}</strong><small>{i.age === null ? '' : `${i.age} yaş · `}{i.rating ?? '—'} · {i.weeklyWage === null ? 'maaş bilinmiyor' : `${money(i.weeklyWage)}/hafta`}</small></span><em>{i.action}</em></li>)}</ul></details>}
  </section>
}

function HubCandidate({ candidate: p, position, onOpen }: { candidate: RecruitmentCandidate; position: string; onOpen: () => void }) {
  const compare = useCompare(), navigate = useNavigate()
  const ids = [p.id, ...(p.comparedPlayerId == null ? [] : [p.comparedPlayerId])], full = new Set([...compare.ids, ...ids]).size > COMPARE_MAX
  const estimatedWage = p.cost.expectedWage != null
  const wage = p.cost.expectedWage ?? p.currentWage
  const tags = [...new Set(p.tags ?? [])].slice(0, 2)
  const strengths = p.strengths.slice(0, 2).map(a => `${a.label} ${a.value}`).join(' · ')
  const reference = p.cost.referenceKind === 'value-model' ? p.cost.referenceAmount : null
  return <article className="hub-player-card" aria-label={`${p.name} transfer adayı`}>
    <div className="hub-row">
      <button type="button" className="hub-player-identity" onClick={onOpen}><PlayerAvatar id={p.id} name={p.name} size={40} /><span><strong>{p.name}</strong><small>{p.age === null ? 'Yaş bilinmiyor' : `${p.age} yaş`} · {p.club ?? 'Kulüp bilinmiyor'}</small></span></button>
      <span className="hub-row-score" aria-label={`Uyum: ${dec(p.score)} / 100`} title="Seçili mevki ve oyuncu amacı için hesaplanan puan; transfer olasılığı değildir."><small>Uyum</small><strong>{dec(p.score)}</strong><small>/ 100</small></span>
      <span className="hub-row-ratings"><RatingChip value={p.overall} size="sm" title="Genel reyting" /><RatingChip value={p.potential} size="sm" title="Potansiyel" />{p.positionRating !== null && p.positionRating !== undefined && p.positionRating !== p.overall && <small>{position} {p.positionRating}</small>}</span>
      <span className="hub-row-wage" title={estimatedWage ? 'Haftalık maaş tahmini; oyuncunun talebi değildir.' : p.recordedWageOnly ? RECORDED_WAGE_NOTE : 'Oyuncunun mevcut haftalık maaşı; yeni sözleşme talebi değildir.'}><strong>{wage == null ? '—' : `${estimatedWage ? '~' : ''}${money(wage)}`}</strong><small>{wage == null ? 'maaş bilinmiyor' : estimatedWage ? 'tahmini' : p.recordedWageOnly ? 'kayıttaki' : 'mevcut'}</small></span>
      <span className="hub-row-cost"><span className={`hub-budget-reference is-${p.cost.status}`}>{BUDGET[p.cost.status] ?? BUDGET.unknown}</span><small>{p.isFreeAgent ? 'Serbest · ek ücretler bilinmiyor' : 'Bonservis bilinmiyor'}</small></span>
      <span className="hub-row-actions"><button className="hub-text-button" type="button" disabled={full} title={full ? `Karşılaştırma listesinde bu oyuncular için yer yok; en fazla ${COMPARE_MAX} oyuncu. Karşılaştır sayfasından listeyi düzenleyebilirsin.` : p.comparedPlayerName ? `${p.name} ve ${p.comparedPlayerName} ile karşılaştırmayı aç` : `${p.name} ile karşılaştırmayı aç`} onClick={() => { if (compare.addMany(ids)) navigate('/compare') }}>Kıyasla</button><StarButton playerId={p.id} /></span>
    </div>
    <div className="hub-candidate-profile">
      {tags.map(tag => <span className="hub-profile-tag" key={tag}>{tag}</span>)}
      {strengths && <span>{strengths}</span>}
      {p.comparedPlayerName && p.overallGain != null && <span className="hub-row-gain"><strong>{sign(p.overallGain)}</strong> tahmini mevki puanı · {p.comparedPlayerName} ile kıyas</span>}
      <AddToPackage candidate={p} />
    </div>
    <p className="hub-candidate-cost-note">{p.isFreeAgent ? 'Serbest oyuncu: bonservis varsayımı 0; imza ücreti ve yeni ücret talebi bilinmiyor.' : p.lastTransfer ? <>Son transfer: {money(p.lastTransfer.amount)} · {gameDate(p.lastTransfer.date)} · bugünkü satış fiyatı değil.</> : reference != null ? <>Değer tahmini: {money(reference)} · ön eleme referansı, satış fiyatı değil.</> : 'Bonservis için kullanılabilir fiyat referansı yok.'}</p>
    <details className="hub-player-reasons"><summary>Neden önerildi? <ChevronDown size={12} /></summary><ul>{p.reasons.slice(0, 4).map(r => <li key={r}>{r}</li>)}</ul><p>{p.lastTransfer ? <>Son transfer {money(p.lastTransfer.amount)}, {gameDate(p.lastTransfer.date)}, {p.lastTransfer.fromClub ?? 'Kulüp bilinmiyor'} → {p.lastTransfer.toClub ?? 'Kulüp bilinmiyor'}. Bugünkü satış fiyatı değildir.</> : <>Oyuncuya bağlı geçmiş transfer kaydı yok.</>} {p.recordedWageOnly ? 'Serbest oyuncunun kayıttaki maaşı' : 'Bugünkü maaşı'}: {p.currentWage === null ? 'bilinmiyor' : money(p.currentWage)} / hafta.{p.recordedWageOnly && <> Aktif sözleşme veya yeni ücret talebi değildir.</>}</p><p>Güçlü yönleri: {p.strengths.map(a => `${a.label} ${a.value}`).join(' · ') || 'bilinmiyor'}. Uyum {dec(p.score)} / 100; yalnız seçili mevki ve amaç içindeki adaylar için karşılaştırılabilir.</p><footer><button className="hub-text-button" type="button" onClick={onOpen}>İncele <ArrowUpRight size={14} /></button></footer></details>
  </article>
}
