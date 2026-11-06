import { cloneElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, Database, Save, Shield, SlidersHorizontal, Wallet } from 'lucide-react'
import { useSaveUid } from '../App'
import { saveManagerProfile, useManagerProfile, type AnalysisContext, type AnalysisProfileView, type ManagerProfile } from '../api/analysis'
import { gameDate } from '../lib/format'
import { PageLoading, PageState } from './SquadPage'
import { DepthResults } from '../components/DepthResults'
import { TransferSubNav } from '../components/TransferMarketDrawer'

const token = (v: AnalysisProfileView) => `${v.context.scopeKey}|${v.context.viewMode}|${v.context.snapshot.snapshotId}|${v.context.snapshot.revision ?? 0}|${v.context.configVersion}|${v.version}`
const euros = (value: unknown) => typeof value === 'number' ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value) : 'Bilinmiyor'
const sourceName = (kind?: string) => ({ save: 'Oyun kaydı', export: 'Live Editor export', daily: 'Günlük export', snapshot: 'Snapshot bilgisi', inherited: 'Devralınmış veri', unknown: 'Kaynak belirtilmemiş' }[kind ?? 'unknown'] ?? kind)
const optionalNumber = (s: string) => s === '' ? null : Number(s)

export function SquadAnalysisPage() {
  const saveUid = useSaveUid()
  const query = useManagerProfile(saveUid)
  if (query.isPending) return <PageLoading title="Takım planı yükleniyor…" />
  if (!query.data) return <PageState title="Takım planı okunamadı" detail={query.error?.message} retry={query.isError ? () => { void query.refetch() } : undefined} />
  return <ProfileForm key={`${query.data.context.scopeKey}|${query.data.context.viewMode}`} latest={query.data} saveUid={saveUid}
    reload={() => query.refetch()} fetching={query.isFetching} unavailable={query.isError} />
}

function ProfileForm({ latest, saveUid, reload, fetching, unavailable }: {
  latest: AnalysisProfileView; saveUid?: string; reload: () => Promise<unknown>; fetching: boolean; unavailable: boolean
}) {
  const [base, setBase] = useState(latest)
  const [profile, setProfile] = useState<ManagerProfile>(() => structuredClone(latest.profile))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const qc = useQueryClient()
  const { hash } = useLocation()
  const alive = useRef(true)
  const current = useRef(latest)
  current.current = latest
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (hash === '#butce') document.getElementById('butce')?.scrollIntoView() }, [hash])
  const changed = token(base) !== token(latest)
  const dirty = JSON.stringify(profile) !== JSON.stringify(base.profile)
  const ctx = base.context
  const validFormation = (f: string | null) => f && ctx.catalog.formations[f] ? f : null
  const main = validFormation(profile.formation)
  const secondary = validFormation(profile.secondaryFormation) !== main ? validFormation(profile.secondaryFormation) : null
  const cleaned: ManagerProfile = { ...profile, formation: main, secondaryFormation: secondary,
    attack: profile.attack.filter(a => a in ctx.catalog.choices.attack),
    preferredLeagueIds: profile.preferredLeagueIds.filter(id => ctx.leagues.some(l => l.id === id)),
    protectedPlayerIds: profile.protectedPlayerIds.filter(id => ctx.players.some(p => p.id === id)),
    departurePlayerIds: profile.departurePlayerIds.filter(id => ctx.players.some(p => p.id === id)),
    rolePreferences: Object.fromEntries(Object.entries(profile.rolePreferences).filter(([f]) => [main, secondary].includes(f)).map(([f, slots]) => [f,
      Object.fromEntries(Object.entries(slots).filter(([slot, code]) => ctx.catalog.formations[f].includes(slot) && ctx.roles.some(r => r.id === code && r.position === (ctx.catalog.slotAliases[slot] ?? slot))))])),
  }
  if (!cleaned.attack.length) cleaned.attack = [Object.keys(ctx.catalog.choices.attack)[0]]
  for (const key of ['defense', 'tempo', 'horizon', 'matchMode'] as const)
    if (!(cleaned[key] in ctx.catalog.choices[key])) cleaned[key] = Object.keys(ctx.catalog.choices[key])[0]
  const invalidPreferences = JSON.stringify(cleaned) !== JSON.stringify(profile)
  const selectedFormations = [profile.formation, profile.secondaryFormation].filter((f): f is string => !!f)
  const set = <K extends keyof ManagerProfile>(key: K, value: ManagerProfile[K]) => { setProfile(p => ({ ...p, [key]: value })); setMessage(null); setError(null) }
  const formation = (key: 'formation' | 'secondaryFormation', value: string | null) => {
    const next = { ...profile, [key]: value }
    const selected = [next.formation, next.secondaryFormation]
    next.rolePreferences = Object.fromEntries(Object.entries(next.rolePreferences).filter(([f]) => selected.includes(f)))
    setProfile(next); setMessage(null); setError(null)
  }
  const playerDecision = (id: number, decision: string) => {
    setProfile(old => ({ ...old, protectedPlayerIds: [...old.protectedPlayerIds.filter(x => x !== id), ...(decision === 'keep' ? [id] : [])],
      departurePlayerIds: [...old.departurePlayerIds.filter(x => x !== id), ...(decision === 'leave' ? [id] : [])] }))
    setMessage(null); setError(null)
  }
  const reloadProfile = async () => {
    // Explicit reload is the only operation that replaces unsaved form edits.
    setError(null)
    const result = await reload() as { data?: AnalysisProfileView; isError?: boolean }
    if (!alive.current) return
    if (result.isError || !result.data) { setError('Güncel plan yüklenemedi. Seçimlerin korunuyor.'); return }
    setBase(result.data); setProfile(structuredClone(result.data.profile)); setConflict(false); setMessage(null)
  }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (changed || busy || unavailable || conflict) return
    setBusy(true); setError(null); setMessage(null)
    const submitted = base
    try {
      const result = await saveManagerProfile(saveUid, submitted, profile)
      if (!alive.current) return
      if (token(current.current) !== token(submitted)) {
        setConflict(true); setError('Plan önceki veri görünümüne kaydedildi. Yeni veriyi yükleyerek devam et.')
      } else {
        qc.setQueryData<AnalysisProfileView>(['managerProfile', saveUid], old => old && token(old) === token(submitted) ? result : old)
        setBase(result); setProfile(structuredClone(result.profile)); setMessage('Plan kaydedildi.'); setConflict(false)
      }
      void qc.invalidateQueries({ queryKey: ['managerProfile', saveUid], exact: true })
      void qc.invalidateQueries({ queryKey: ['recruitmentBoard', saveUid], exact: true })
    } catch (e) {
      if (!alive.current) return
      setError(e instanceof Error ? e.message : 'Plan kaydedilemedi.')
      if (e && typeof e === 'object' && 'status' in e && e.status === 409) setConflict(true)
    } finally { if (alive.current) setBusy(false) }
  }
  const choice = (key: 'defense' | 'tempo' | 'horizon' | 'matchMode', label: string) => <Field label={label}>
    <select value={profile[key]} onChange={e => set(key, e.target.value)}>{Object.entries(ctx.catalog.choices[key]).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
  </Field>

  return <div className="analysis-page page-enter">
    <TransferSubNav />
    <header className="analysis-heading"><div><span className="analysis-eyebrow">TRANSFER</span><h1>Takım planı</h1><p>Oyun planını ve bütçeni belirle, kadronun nerede takviyeye ihtiyacı olduğunu gör.</p></div></header>
    <div className={`analysis-source ${ctx.viewMode === 'preview' ? 'is-preview' : ''}`} data-testid="analysis-source">
      <Database size={18} /><div><strong>{ctx.snapshot.userTeamName} · {gameDate(ctx.snapshot.gameDate)}</strong><span>{sourceName(ctx.snapshot.source)} · {ctx.scopeKey} · {ctx.viewMode === 'saved' ? 'Kayıtlı kariyer planı' : 'Ayrı export önizleme planı'}</span></div>
      <span>{ctx.players.length} oyuncu</span>
    </div>
    {ctx.viewMode === 'preview' && <p className="analysis-notice">Bu export’un oyun kaydına yazıldığı doğrulanmadı. Buradaki tercihler kayıtlı kariyer profilinden ayrı tutulur.</p>}
    {invalidPreferences && <div className="analysis-notice" role="alert"><p>Bazı tercihler artık mevcut kadroda veya seçenekler arasında yok. Kaydetmeden önce geçersiz tercihleri temizle ve seçimlerini kontrol et.</p><button className="btn" type="button" disabled={busy} onClick={() => { setProfile(cleaned); setMessage(null); setError(null) }}>Geçersiz tercihleri temizle</button></div>}
    {base.savedConfigVersion && base.savedConfigVersion !== ctx.configVersion && <p className="analysis-notice">Plan seçenekleri güncellenmiş. Önceki tercihler korundu; kontrol edip yeniden kaydedebilirsin.</p>}
    {(changed || conflict || unavailable) && <div className="analysis-notice" role="alert"><p>{unavailable ? 'Veri servisine ulaşılamıyor. Seçimlerin korunuyor; kaydetmeden önce bağlantıyı yenile.' : changed ? 'Kariyer verisi veya kayıtlı plan değişti. Seçimlerin korunuyor; devam etmek için güncel planı yükle.' : 'Kayıt çakışması var. Güncel planı yükleyip seçimlerini kontrol et.'}</p><button type="button" className="btn" disabled={busy || fetching} onClick={() => { void reloadProfile() }}>Güncel planı yükle</button><small>Bu işlem formdaki kaydedilmemiş seçimleri değiştirir.</small></div>}
    <DepthResults view={base} profile={profile} saveUid={saveUid} blocked={changed || conflict || unavailable || invalidPreferences || !profile.formation || busy} />
    <div className="analysis-layout">
      <form className="analysis-form" onSubmit={save}>
        <fieldset disabled={busy} className="analysis-fields">
          <section className="analysis-card"><SectionTitle icon={<SlidersHorizontal size={19} />} title="Oyun planın" detail="Oyundaki taktik alanları doğrulanmış tercih sayılmaz. Burada kendi planını seç." />
            <div className="analysis-grid"><Field label="Ana diziliş"><select required value={profile.formation ?? ''} onChange={e => formation('formation', e.target.value || null)}><option value="">Diziliş seç</option>{Object.keys(ctx.catalog.formations).filter(f => f !== profile.secondaryFormation).map(f => <option key={f}>{f}</option>)}</select></Field>
              <Field label="Alternatif diziliş"><select value={profile.secondaryFormation ?? ''} onChange={e => formation('secondaryFormation', e.target.value || null)}><option value="">Kullanmıyorum</option>{Object.keys(ctx.catalog.formations).filter(f => f !== profile.formation).map(f => <option key={f}>{f}</option>)}</select></Field></div>
            {ctx.suggestedFormation && <p className="analysis-help">Kayıttaki ilk 11 yerleri {ctx.suggestedFormation} ile eşleşiyor. İstediğin dizilişi seçebilirsin.</p>}
            <fieldset className="analysis-attack"><legend>Hücum yaklaşımı <span>Birlikte kullanabilirsin</span></legend><div>{Object.entries(ctx.catalog.choices.attack).map(([id, label]) => <label key={id} className={profile.attack.includes(id) ? 'is-selected' : ''}><input type="checkbox" checked={profile.attack.includes(id)} onChange={e => set('attack', e.target.checked ? [...profile.attack, id] : profile.attack.filter(x => x !== id))} />{label}</label>)}</div></fieldset>
            <div className="analysis-grid">{choice('defense', 'Savunma yaklaşımı')}{choice('tempo', 'Tempo')}<Field label="Savunma çizgisi" hint="0–100 · boş bırakabilirsin"><input type="number" min="0" max="100" step="1" value={profile.defensiveLine ?? ''} placeholder="Belirtilmedi" onChange={e => set('defensiveLine', optionalNumber(e.target.value))} /></Field>{choice('matchMode', 'Maçları nasıl oynuyorsun?')}</div>
          </section>
          <section className="analysis-card"><SectionTitle icon={<Shield size={19} />} title="Mevkilere istediğin roller" detail="Tercihlerindir; oyuncuya görev atamaz veya oyunu değiştirmez." />
            {selectedFormations.length === 0 && <p className="analysis-help">Rolleri belirlemek için önce bir diziliş seç.</p>}
            {selectedFormations.map(f => <details key={f} className="analysis-roles" open={f === profile.formation}><summary>{f}<span>{Object.keys(profile.rolePreferences[f] ?? {}).length} rol tercihi</span></summary><div className="analysis-role-grid">{ctx.catalog.formations[f]?.map(slot => {
              const position = ctx.catalog.slotAliases[slot] ?? slot
              return <Field key={slot} label={`${f} · ${slot}`}><select value={profile.rolePreferences[f]?.[slot] ?? ''} onChange={e => {
                const roles = { ...profile.rolePreferences[f] }
                if (e.target.value) roles[slot] = Number(e.target.value); else delete roles[slot]
                set('rolePreferences', { ...profile.rolePreferences, [f]: roles })
              }}><option value="">Tercih yok</option>{ctx.roles.filter(r => r.position === position).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
            })}</div></details>)}
          </section>
          <section className="analysis-card" id="butce"><SectionTitle icon={<Wallet size={19} />} title="Hedef ve transfer bütçesi" detail="Buraya bu transfer dönemi için ayırdığın tutarı gir. Boş alan bilinmiyor olarak kalır." />
            <div className="analysis-grid">{choice('horizon', 'Takım projesi')}<Field label="Hedef transfer sayısı"><input type="number" required min="0" max="11" value={profile.targetTransfers} onChange={e => set('targetTransfers', Number(e.target.value))} /></Field>
              <Field label="Ayırdığın bonservis bütçesi" hint="EUR"><input type="number" min="0" max="1000000000000" step="1" value={profile.transferBudget ?? ''} placeholder="Belirtilmedi" onChange={e => set('transferBudget', optionalNumber(e.target.value))} /></Field>
              <Field label="Ayırdığın maaş bütçesi" hint="EUR / hafta · yeni transferlerin toplamı"><input type="number" min="0" max="1000000000" step="1" value={profile.weeklyWageBudget ?? ''} placeholder="Belirtilmedi" onChange={e => set('weeklyWageBudget', optionalNumber(e.target.value))} /></Field>
              <Field label="Bütçe güvenlik payı" hint="% · beklenmedik masraflar için"><input type="number" required min="0" max="90" value={profile.reservePercent} onChange={e => set('reservePercent', Number(e.target.value))} /></Field></div>
            <div className="analysis-finance">{([['transferBudget', 'Kayıttaki transfer bütçesi', 'transferBudget'], ['weeklyWageHeadroom', 'Kayıttaki maaş boşluğu', 'weeklyWageBudget']] as const).map(([key, label, target]) => <div key={key}><span>{label}</span><strong>{euros(ctx.inputs[key]?.value)}{target === 'weeklyWageBudget' && ' / hafta'}</strong>{typeof ctx.inputs[key]?.value === 'number' && <button type="button" onClick={() => set(target, ctx.inputs[key].value as number)}>Bu tutarı kullan</button>}<small>{sourceName(ctx.inputs[key]?.origin?.kind)}</small></div>)}</div>
          </section>
          <details className="analysis-card analysis-optional"><summary>Ek transfer tercihleri <span>Yaş, ligler ve kadro kararları</span></summary><div className="analysis-grid"><Field label="En düşük yaş"><input type="number" min="14" max="60" value={profile.minAge ?? ''} placeholder="Sınır yok" onChange={e => set('minAge', optionalNumber(e.target.value))} /></Field><Field label="En yüksek yaş"><input type="number" min={profile.minAge ?? 14} max="60" value={profile.maxAge ?? ''} placeholder="Sınır yok" onChange={e => set('maxAge', optionalNumber(e.target.value))} /></Field></div>
            <Field label="Tercih edilen ligler" hint="En fazla 20 · çoklu seçim için Ctrl / Cmd"><select multiple size={Math.min(6, Math.max(2, ctx.leagues.length))} value={profile.preferredLeagueIds.map(String)} onChange={e => set('preferredLeagueIds', Array.from(e.target.selectedOptions, o => Number(o.value)))}>{ctx.leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            {ctx.leagues.length === 0 && <p className="analysis-help">Bu snapshot’ta lig bilgisi bulunamadı.</p>}
            <div className="analysis-players"><h3>Kadro kararları</h3><p className="analysis-help">İşlem veya transfer yapmaz. Analiz için tercihlerini saklar.</p>{ctx.players.map(p => <label key={p.id}><span><strong>{p.name}</strong><small>{p.positions.join(' / ') || 'Mevki bilinmiyor'} · {p.age === null ? 'Yaş bilinmiyor' : `${p.age} yaş`} · OVR {p.overall ?? '—'}</small></span><select aria-label={`${p.name} kadro kararı`} value={profile.protectedPlayerIds.includes(p.id) ? 'keep' : profile.departurePlayerIds.includes(p.id) ? 'leave' : ''} onChange={e => playerDecision(p.id, e.target.value)}><option value="">Karar yok</option><option value="keep">Vazgeçilmez</option><option value="leave">Ayrılabilir</option></select></label>)}</div>
          </details>
        </fieldset>
        <footer className="analysis-save"><div aria-live="polite">{error ? <p role="alert" className="analysis-error">{error}</p> : message ? <p className="analysis-success"><Check size={16} />{message}</p> : <p>{dirty ? 'Kaydedilmemiş değişiklikler var.' : base.version > 0 ? 'Kayıtlı plan' : 'Henüz kaydedilmedi'}<small>Tercihler yalnızca FC Market’te saklanır.</small></p>}</div>{message && <Link className="btn" to="/transfer">Önerilere dön <ArrowRight size={15} /></Link>}<button className="btn primary" type="submit" disabled={busy || changed || conflict || unavailable || invalidPreferences || !profile.formation}><Save size={16} />{busy ? 'Kaydediliyor…' : 'Planı kaydet'}</button></footer>
      </form>
      <Coverage context={ctx} />
    </div>
  </div>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId()
  return <div className="analysis-field"><label htmlFor={id}>{label}</label>{cloneElement(children as ReactElement<{ id: string; 'aria-describedby'?: string }>, { id, 'aria-describedby': hint ? `${id}-hint` : undefined })}{hint && <small id={`${id}-hint`}>{hint}</small>}</div>
}
function SectionTitle({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="analysis-section-title">{icon}<div><h2>{title}</h2><p>{detail}</p></div></div>
}
function Coverage({ context: ctx }: { context: AnalysisContext }) {
  const incomplete = ctx.coverage.filter(c => c.state !== 'known').length
  return <aside className="analysis-coverage"><section className="analysis-card"><SectionTitle icon={<Database size={19} />} title="Veri durumu" detail="Yalnızca seçili snapshot okunur. Eksikler eski veya ileri tarihli verilerle doldurulmaz." /><div className="analysis-coverage-count"><strong>{ctx.players.length}</strong><span>kadro oyuncusu<br />{incomplete ? `${incomplete} alanda eksik bilgi` : 'Tüm alanlar okunmuş'}</span></div>
    <div className="analysis-coverage-list">{ctx.coverage.map(c => <details key={c.key}><summary><span>{c.label}</span><b className={`is-${c.state}`}>{c.known}/{c.total}</b></summary><div><span className="analysis-meter"><i style={{ width: `${c.total ? c.known / c.total * 100 : 0}%` }} /></span><p>{c.state === 'known' ? 'Alanlar okunmuş' : c.state === 'partial' ? 'Kısmen okunmuş' : 'Veri bulunamadı'} · {sourceName(c.origin?.kind)}</p>{c.origin && <p>{c.origin.gameDate ? gameDate(c.origin.gameDate) : 'Kaynak günü bilinmiyor'} · {c.origin.snapshotId}</p>}{c.note && <p>{c.note}</p>}</div></details>)}</div>
    <p className="analysis-help">0 geçerli bir değer olabilir. Eksik maaş 0, eksik kondisyon 100 kabul edilmez. Kaynak türü belirtilmemişse verinin kaynağı doğrulanmamıştır.</p>
    <details className="analysis-provenance"><summary>Kaynak kimliği</summary><p>Snapshot: {ctx.snapshot.snapshotId}</p><p>Revizyon: {ctx.snapshot.revision ?? 0}</p><p>Yapılandırma: {ctx.configVersion}</p></details>
  </section></aside>
}
