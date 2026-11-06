import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight, CircleHelp, Layers, LoaderCircle } from 'lucide-react'
import { runSquadAnalysis, type AnalysisContext, type AnalysisProfileView, type DepthReport, type DepthSlot, type ManagerProfile } from '../api/analysis'
import { gameDate } from '../lib/format'

const priorityName = { urgent: 'Acil', window: 'Bu transfer dönemi', 'next-season': 'Gelecek sezon', sufficient: 'Yeterli', unknown: 'Veri yetersiz' }
const rank = { urgent: 0, window: 1, 'next-season': 2, unknown: 3, sufficient: 4 }
const signature = (view: AnalysisProfileView, profile: ManagerProfile) => JSON.stringify([
  view.context.scopeKey, view.context.viewMode, view.context.snapshot.snapshotId, view.context.snapshot.revision,
  view.context.configVersion, view.version, profile,
])
type Bundle = { report: DepthReport; context: AnalysisContext; signature: string }

export function DepthResults({ view, profile, saveUid, blocked }: {
  view: AnalysisProfileView; profile: ManagerProfile; saveUid?: string; blocked: boolean
}) {
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formation, setFormation] = useState('')
  const [selected, setSelected] = useState('')
  const [scenario, setScenario] = useState('structural')
  const alive = useRef(true)
  const resultTitle = useRef<HTMLHeadingElement>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const currentSignature = signature(view, profile)
  const stale = !!bundle && (blocked || bundle.signature !== currentSignature)
  const run = async () => {
    if (busy || blocked) return
    setBusy(true); setError(null)
    const submitted = structuredClone(profile), context = view.context, inputSignature = currentSignature
    try {
      const report = await runSquadAnalysis(saveUid, view, submitted)
      if (!alive.current) return
      if (report.scopeKey !== context.scopeKey || report.viewMode !== context.viewMode || report.snapshot.snapshotId !== context.snapshot.snapshotId ||
          report.snapshot.revision !== context.snapshot.revision || report.configVersion !== context.configVersion)
        throw new Error('Analiz yanıtı seçili kaynakla eşleşmedi. Güncel veriyi yükleyip tekrar dene.')
      setBundle({ report, context, signature: inputSignature }); setFormation(report.formations[0]?.formation ?? '')
      setSelected(''); setScenario('structural')
      requestAnimationFrame(() => resultTitle.current?.focus({ preventScroll: true }))
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Analiz tamamlanamadı.') }
    finally { if (alive.current) setBusy(false) }
  }
  const depth = bundle?.report.formations.find(f => f.formation === formation) ?? bundle?.report.formations[0]
  const ordered = depth ? [...depth.slots].sort((a, b) => rank[a.priority] - rank[b.priority] || (b.needScore ?? -1) - (a.needScore ?? -1)) : []
  const slot = depth?.slots.find(s => s.slot === selected) ?? ordered[0]
  const player = (id: number | null) => bundle?.context.players.find(p => p.id === id)
  const ids = (s: DepthSlot) => scenario === 'today' ? [s.readyStarterId, s.readyRotationId] : scenario === 'future'
    ? [s.nextSeasonStarterId, s.nextSeasonRotationId] : [s.starterId, s.rotationId]
  const pick = (s: DepthSlot) => setSelected(s.slot)
  return <section className="depth-section" aria-label="Kadro derinliği ve ihtiyaçlar">
    <div className="depth-intro"><div><span className="analysis-eyebrow">KADRO ANALİZİ</span><h2>Kadro derinliği ve ihtiyaçlar</h2><p>İlk 11, bağımsız rotasyon ve gelecek sezon açıklarını birlikte gör.</p></div>
      <button className="btn primary" type="button" disabled={busy || blocked} onClick={() => { void run() }}>{busy ? <LoaderCircle className="depth-spin" size={17} /> : <Activity size={17} />}{busy ? 'Hesaplanıyor…' : 'Kadroyu analiz et'}</button></div>
    <p className="analysis-help">Ekrandaki tercihlerle hesaplanır; planı kaydetmen şart değil. Rapor yalnız FC Market’te saklanır.</p>
    {blocked && <p className="analysis-help">Analiz için geçerli bir ana diziliş seç; veri veya profil değiştiyse önce güncel planı yükle.</p>}
    {error && <p className="analysis-notice" role="alert">{error} {bundle && 'Önceki rapor aşağıda korunuyor.'}</p>}
    {bundle && depth && slot && <div className={`depth-report ${stale ? 'is-stale' : ''}`} aria-busy={busy} data-testid="depth-report">
      <header className="depth-report-heading"><div><h3 ref={resultTitle} tabIndex={-1}>İhtiyaç raporu</h3><p>{bundle.report.snapshot.userTeamName} · {gameDate(bundle.report.snapshot.gameDate)} · {bundle.report.viewMode === 'saved' ? 'Oyun kaydı' : 'Export önizlemesi'} · Revizyon {bundle.report.snapshot.revision ?? 0}</p></div><span className="depth-label">{stale ? 'Önceki sonuç' : bundle.report.draft ? 'Kaydedilmemiş plan ile' : 'Kayıtlı plan ile'}</span></header>
      {stale && <p className="analysis-notice" role="status">Veri veya tercihler değişti. Bu rapor önceki girdilere ait; güncel sonuç için yeniden analiz et.</p>}
      <div className="depth-toolbar"><div role="group" aria-label="Analiz dizilişi">{bundle.report.formations.map(f => <button key={f.formation} type="button" aria-pressed={depth.formation === f.formation} onClick={() => { setFormation(f.formation); setSelected('') }}>{f.formation}{f.formation === bundle.report.profile.secondaryFormation && ' · alternatif'}</button>)}</div>
        <label>Derinlik görünümü<select value={scenario} onChange={e => setScenario(e.target.value)}><option value="structural">Yapısal kadro</option><option value="today">Bugünkü havuz · koşullu</option><option value="future">Gelecek sezon · yenilemesiz</option></select></label></div>
      <div className="depth-stats"><div><strong>{scenario === 'today' ? depth.readyStarters : scenario === 'future' ? depth.nextSeasonStarters : depth.filledStarters}<small>/11</small></strong><span>İlk seçenek</span></div><div><strong>{scenario === 'today' ? depth.readyRotation : scenario === 'future' ? depth.nextSeasonRotation : depth.filledRotation}<small>/11</small></strong><span>Bağımsız rotasyon</span></div><div><strong>{depth.teamReference ?? '—'}</strong><span>Takım OVR referansı</span></div><div><strong>{depth.slots.filter(s => s.temporaryGap).length}</strong><span>Geçici açık olan yer</span></div></div>
      <p className="depth-model-note"><CircleHelp size={14} />Renkler yapısal ihtiyacı gösterir. {scenario === 'today' ? 'Yalnız güncel dönüş tarihi olan sakatlar çıkarıldı; bilinmeyen uygunluk sağlıklı sayılmaz.' : scenario === 'future' ? 'Biten sözleşmeler yenilenmemiş varsayılır; kesin ayrılış değildir.' : 'Sakatlıklar kalıcı kadro açığı gibi sayılmaz. Her oyuncu bu dizilişte yalnız bir yere atanır.'}</p>
      <div className="depth-grid"><div className="depth-pitch" aria-label="Mevki ihtiyaç sahası">
        {[['ST', 'RW', 'LW'], ['CAM', 'RM', 'LM'], ['CM', 'CDM'], ['CB', 'RB', 'LB'], ['GK']].map((positions, row) => <div className="depth-pitch-line" key={row}>{depth.slots.filter(s => positions.includes(s.position)).map(s => <button type="button" key={s.slot} className={`depth-position is-${s.priority}`} aria-pressed={s.slot === slot.slot} aria-label={`${s.slot}: ${priorityName[s.priority]}${s.conditional ? ', koşullu' : ''}`} onClick={() => pick(s)}><b>{s.slot}</b><span>{player(ids(s)[0])?.name ?? 'Açık yer'}</span><small>{priorityName[s.priority]}{s.conditional && ' *'}</small>{s.temporaryGap && <i title="Geçici açık">!</i>}</button>)}</div>)}
      </div><div className="depth-priorities"><h4><Layers size={16} />Öncelik sırası</h4><p>Bir mevkiye tıklayarak gerekçesini incele.</p>{ordered.map(s => <button type="button" key={s.slot} aria-pressed={slot.slot === s.slot} onClick={() => pick(s)}><span className={`depth-dot is-${s.priority}`} /><b>{s.slot}</b><span>{priorityName[s.priority]}{s.conditional && ' · koşullu'}</span><small>{s.needScore ?? '—'}</small><ArrowRight size={13} /></button>)}</div></div>
      <section className="depth-detail" aria-label={`${slot.slot} ihtiyaç ayrıntısı`}><header><div><span className="analysis-eyebrow">{slot.position} · {depth.formation}</span><h4>{slot.slot} <span className={`depth-badge is-${slot.priority}`}>{priorityName[slot.priority]}{slot.conditional && ' · koşullu'}</span></h4></div><span className="depth-score">{slot.needScore ?? '—'}<small>/100 ihtiyaç endeksi</small></span></header>
        <div className={`depth-assignments ${scenario !== 'structural' ? 'is-two' : ''}`}>{(scenario === 'structural' ? [...ids(slot), slot.developmentId] : ids(slot)).map((id, i) => { const p = player(id); return <div key={i}><span>{i === 0 ? 'İlk seçenek' : i === 1 ? 'Bağımsız rotasyon' : 'Ek gelişim seçeneği'}</span><strong>{p?.name ?? (i === 2 ? 'Ek seçenek bulunamadı' : 'Atanamadı')}</strong><small>{p ? `OVR ${p.overall ?? '—'} · POT ${p.potential ?? '—'} · ${p.age === null ? 'Yaş bilinmiyor' : `${p.age} yaş`}` : 'Bu kapsamda bilinen uygun oyuncu yok'}</small></div> })}</div>
        {slot.preferredRoleId && <p className="analysis-help">İstediğin rol: {bundle.context.roles.find(r => r.id === slot.preferredRoleId)?.name ?? slot.preferredRoleId}. Oyuncu önerileri bu rolün özelliklerini ve aşinalık işaretlerini değerlendirir.</p>}
        <ul className="depth-reasons">{slot.reasons.map((r, i) => <li key={`${r.code}-${i}`}>{r.text}</li>)}</ul>
        {scenario !== 'structural' && <p className="analysis-help">Gerekçeler yapısal ihtiyacı açıklar. Ek gelişim seçeneği yapısal havuza aittir; burada ikinci kez hazır oyuncu sayılmaz.</p>}
        <p className="analysis-help">Kalite tabanları: ilk seçenek {depth.starterFloor ?? '—'}, rotasyon {depth.rotationFloor ?? '—'} OVR. Seçili dizilişin en iyi 11’inin mevki reytingi ortalamasına ve seçtiğin projeye göre hesaplanır.</p>
        <footer className="depth-detail-next"><Link className="btn" to={`/transfer?mevki=${slot.position}`}>{slot.position} önerilerini gör <ArrowRight size={14} /></Link>{bundle.report.draft && <small>Öneriler kayıtlı plana göre gelir. Bu değişiklikler için önce planı kaydet.</small>}</footer>
      </section>
      <details className="depth-method"><summary>Yöntem, eksik veriler ve rapor kimliği</summary><ul>{bundle.report.warnings.map(w => <li key={w}>{w}</li>)}</ul><p>Model puanı başarı olasılığı değildir. İhtiyaç endeksi ile oyuncu uyum puanı farklıdır.</p><p>Kurallar: {bundle.report.rulesVersion} · Yapılandırma: {bundle.report.configVersion}</p><p>Rapor: {bundle.report.id}</p></details>
    </div>}
  </section>
}
