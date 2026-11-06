import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Plus, X } from 'lucide-react'
import { ApiError, get, send, useClub } from '../api/client'
import type { RecruitmentBoard } from '../api/recruitmentBoard'
import type { RecruitmentCandidate } from '../api/recruitment'
import type { PlanAcquisition, PlanBudget, PlanDraft, PlanResult, PlanSource, PlanSuggestion, PlanSuggestions, PlanView } from '../api/transferPlan'
import { gameDate, money } from '../lib/format'
import { toast } from '../lib/toast'

interface LocalPlan { source: PlanSource; version: number; draft: PlanDraft; result: PlanResult | null; evaluatedDraft: string; dirty: boolean }
interface PackageState {
  local: LocalPlan | null; view?: PlanView; busy: boolean; stale: boolean; conflict: boolean; error: string | null
  board: RecruitmentBoard; saveUid?: string; open: boolean; setOpen: (open: boolean) => void
  loading: boolean; loadError: string | null
  add: (candidate: RecruitmentCandidate) => void; edit: (draft: PlanDraft) => void
  calculate: () => void; save: () => void; reload: () => void; retry: () => void
  suggestions: PlanSuggestions | null; suggesting: boolean; suggestError: string | null; suggest: () => void; apply: (suggestion: PlanSuggestion) => void
}
const Context = createContext<PackageState | null>(null)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const selected = (d: PlanDraft) => [...d.transfers, ...d.sales, ...d.promotions].map(p => p.playerId)

/** app.db is authoritative; a scoped browser cache only preserves unsaved form edits across navigation/reload. */
export function TransferPackageProvider({ board, saveUid, unavailable, children }: { board: RecruitmentBoard; saveUid?: string; unavailable: boolean; children: ReactNode }) {
  const qc = useQueryClient(), c = board.view.context
  const token = `${c.scopeKey}|${c.viewMode}|${c.snapshot.snapshotId}|${c.snapshot.revision}|${c.configVersion}|${board.view.version}|${board.positions[0]?.recommendations.configVersion}`
  const queryKey = ['transferPlan', saveUid, token]
  const query = useQuery({ queryKey, queryFn: () => get<PlanView>('/api/recruitment/plan', { saveUid }), retry: 1, staleTime: 30_000 })
  const storageKey = `fcm.transferDraft:${c.scopeKey}:${c.viewMode}`
  const [local, setLocal] = useState<LocalPlan | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<PlanSuggestions | null>(null), [suggesting, setSuggesting] = useState(false), [suggestError, setSuggestError] = useState<string | null>(null)
  const sequence = useRef(0), suggestRun = useRef(0), currentToken = useRef(token)
  currentToken.current = token
  useEffect(() => () => { sequence.current++; suggestRun.current++ }, [])
  const fromServer = (view: PlanView): LocalPlan => ({ source: view.result?.source ?? view.currentSource, version: view.version,
    draft: view.draft ?? { formation: board.view.profile.formation!, transfers: [], sales: [], promotions: [] },
    result: view.result, evaluatedDraft: view.draft ? JSON.stringify(view.draft) : '', dirty: false })
  useEffect(() => {
    if (local || !query.data) return
    let cached: LocalPlan | null = null
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as LocalPlan | null
      if (value?.dirty && value.source.scopeKey === c.scopeKey && value.source.viewMode === c.viewMode &&
        Array.isArray(value.draft.transfers) && Array.isArray(value.draft.sales) && Array.isArray(value.draft.promotions)) cached = value
    } catch { /* damaged cache does not replace the saved package */ }
    setLocal(cached ?? fromServer(query.data))
  }, [query.data, local, storageKey])
  useEffect(() => {
    if (!local) return
    try { localStorage.setItem(storageKey, JSON.stringify(local)) } catch { /* the explicit app.db save still works */ }
  }, [local, storageKey])
  const view = query.data, conflict = !!local && !!view && local.version !== view.version
  const boardMatches = !view || view.currentSource.scopeKey === c.scopeKey && view.currentSource.viewMode === c.viewMode &&
    view.currentSource.snapshotId === c.snapshot.snapshotId && view.currentSource.revision === (c.snapshot.revision ?? 0) &&
    view.currentSource.configVersion === c.configVersion && view.currentSource.profileVersion === board.view.version &&
    view.currentSource.recruitmentVersion === board.positions[0]?.recommendations.configVersion
  useEffect(() => { if (!boardMatches) void qc.invalidateQueries({ queryKey: ['recruitmentBoard', saveUid], exact: true }) }, [boardMatches, qc, saveUid])
  const stale = !!local && (!view || !same(local.source, view.currentSource) || !boardMatches)
  const edit = (draft: PlanDraft) => { if (!busy && !unavailable) { sequence.current++; setLocal(p => p && ({ ...p, draft, dirty: true })); setError(null) } }
  const add = (candidate: RecruitmentCandidate) => {
    if (!local || busy || unavailable || stale || conflict) return
    if (selected(local.draft).includes(candidate.id)) return
    edit({ ...local.draft, transfers: [...local.draft.transfers, { playerId: candidate.id, fee: null, weeklyWage: null, signingFee: null }] })
    toast('Transfer paketine eklendi · henüz kaydedilmedi')
  }
  const execute = async (save: boolean) => {
    if (!local || !view || busy || unavailable || !boardMatches) return
    const source = save ? local.source : view.currentSource
    const operation = ++sequence.current, capturedToken = token, draft = local.draft
    setBusy(true); setError(null)
    try {
      const body = { source, expectedVersion: local.version, draft }
      if (save) {
        const response = (await send<PlanView>('PUT', '/api/recruitment/plan', { saveUid }, body))!
        if (operation !== sequence.current || currentToken.current !== capturedToken) return
        setLocal(fromServer(response)); qc.setQueryData(queryKey, response); toast('Transfer paketi kaydedildi')
      } else {
        const result = (await send<PlanResult>('POST', '/api/recruitment/plan/preview', { saveUid }, body))!
        if (operation !== sequence.current || currentToken.current !== capturedToken) return
        setLocal(p => p && ({ ...p, source: result.source, result, evaluatedDraft: JSON.stringify(draft), dirty: true }))
      }
    } catch (e) {
      if (operation !== sequence.current || currentToken.current !== capturedToken) return
      setError((e as Error).message)
      if (e instanceof ApiError && e.status === 409) void query.refetch()
    } finally { if (operation === sequence.current) setBusy(false) }
  }
  const reload = () => { if (view && !busy) { sequence.current++; setLocal(fromServer(view)); setError(null) } }
  const suggest = async () => {
    if (!local || !view || busy || suggesting || unavailable || !boardMatches) return
    const run = ++suggestRun.current, capturedToken = token
    setSuggesting(true); setSuggestError(null)
    try {
      const result = (await send<PlanSuggestions>('POST', '/api/recruitment/plan/suggestions', { saveUid }, { source: view.currentSource, formation: local.draft.formation }))!
      if (run === suggestRun.current && currentToken.current === capturedToken) setSuggestions(result)
    } catch (e) {
      if (run !== suggestRun.current || currentToken.current !== capturedToken) return
      setSuggestError((e as Error).message)
      if (e instanceof ApiError && e.status === 409) void query.refetch()
    } finally { if (run === suggestRun.current) setSuggesting(false) }
  }
  const apply = ({ draft, result }: PlanSuggestion) => {
    if (!draft || !result || busy || unavailable) return
    sequence.current++
    setLocal(p => p && ({ ...p, source: result.source, draft, result, evaluatedDraft: JSON.stringify(draft), dirty: true })); setError(null)
    toast('Paket taslağa alındı · henüz kaydedilmedi')
  }
  // Packages belong to one source and formation; anything older is hidden, never shown as current.
  const currentSuggestions = suggestions && view && local && same(suggestions.source, view.currentSource) && suggestions.formation === local.draft.formation ? suggestions : null
  return <Context.Provider value={{ local, view, busy: busy || unavailable || !boardMatches, stale, conflict, error, board, saveUid, open, setOpen, loading: query.isPending, loadError: query.error?.message ?? null,
    add, edit, calculate: () => { void execute(false) }, save: () => { void execute(true) }, reload, retry: () => { void query.refetch() },
    suggestions: currentSuggestions, suggesting, suggestError, suggest: () => { void suggest() }, apply }}>{children}</Context.Provider>
}

export function AddToPackage({ candidate }: { candidate: RecruitmentCandidate }) {
  const state = useContext(Context)
  if (!state) return null
  const on = !!state.local && selected(state.local.draft).includes(candidate.id)
  return <button type="button" className="hub-package-add" aria-pressed={on} disabled={!state.local || state.busy || state.stale || state.conflict || on}
    title={state.stale ? 'Önce transfer paketini güncel verilerle hesapla.' : undefined} onClick={() => state.add(candidate)}><Plus size={12} />{on ? 'Pakette ✓' : 'Pakete ekle'}</button>
}

export function TransferPackage() {
  const s = useContext(Context)!
  const summary = useRef<HTMLElement>(null)
  const count = s.local ? selected(s.local.draft).length : 0
  return <details className="transfer-package" open={s.open} onToggle={e => s.setOpen(e.currentTarget.open)}>
    <summary ref={summary}><strong>Transfer paketim</strong><span>{count ? `${count} oyuncu` : 'Adayları birlikte planla'}</span>
      <small>{s.local?.dirty ? 'Kaydedilmedi' : s.stale ? 'Eski veri' : s.view?.version ? 'Kaydedildi' : ''}</small><ChevronDown size={14} /></summary>
    {s.open && (!s.view || !s.local ? <div className="package-body"><p role={s.loadError ? 'alert' : 'status'}>{s.loadError ? `Paket okunamadı: ${s.loadError}` : 'Paket yükleniyor…'}</p>{!s.loading && <button className="hub-button" onClick={s.retry}>Paketi yeniden yükle</button>}</div> : <PackageEditor onDone={() => { s.setOpen(false); requestAnimationFrame(() => summary.current?.focus()) }} />)}
  </details>
}

function PackageEditor({ onDone }: { onDone: () => void }) {
  const s = useContext(Context)!, { local, board } = s
  const draft = local!.draft, club = useClub(s.saveUid), ids = selected(draft)
  const allCandidates = board.positions.flatMap(p => p.recommendations.groups.flatMap(g => [...g.candidates, ...(g.overBudget ?? [])]))
  const names = new Map([...allCandidates.map(p => [p.id, p.name] as const), ...board.view.context.players.map(p => [p.id, p.name] as const),
    ...(club.data?.academy ?? []).map(p => [p.player.id, p.player.name] as const), ...(local!.result?.players ?? []).map(p => [p.playerId, p.name] as const)])
  const title = (id: number) => names.get(id) ?? `Oyuncu ${id} · güncel veride kontrol edilmeli`
  const remove = (id: number) => s.edit({ ...draft, transfers: draft.transfers.filter(p => p.playerId !== id), sales: draft.sales.filter(p => p.playerId !== id), promotions: draft.promotions.filter(p => p.playerId !== id) })
  const update = (kind: 'transfers' | 'promotions', id: number, key: 'fee' | 'weeklyWage' | 'signingFee', value: number | null) => s.edit({ ...draft, [kind]: draft[kind].map(p => p.playerId === id ? { ...p, [key]: value } : p) })
  const amount = (value: number | null, label: string, onChange: (value: number | null) => void, hint: string) => <label>{label}<input type="number" inputMode="numeric" min="0" step="1" value={value ?? ''} placeholder={hint} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} /></label>
  const computed = !!local!.result && same(local!.evaluatedDraft, JSON.stringify(draft)) && !s.stale
  const own = board.view.context.players.filter(p => !ids.includes(p.id) && !board.view.profile.protectedPlayerIds.includes(p.id))
  const academyFresh = club.data?.snapshot.snapshotId === board.view.context.snapshot.snapshotId && (club.data?.snapshot.revision ?? 0) === (board.view.context.snapshot.revision ?? 0)
  const academy = academyFresh ? (club.data?.academy ?? []).filter(p => !ids.includes(p.player.id) && !board.view.context.players.some(o => o.id === p.player.id)) : []
  const acquisition = (p: PlanAcquisition, kind: 'transfers' | 'promotions') => {
    const prior = local!.result?.players.find(x => x.playerId === p.playerId)
    const known = allCandidates.find(x => x.id === p.playerId)
    const fee = known?.cost.referenceAmount ?? (prior && ['last-transfer', 'value-model', 'free-agent'].includes(prior.feeSource) ? prior.fee : null)
    const wage = known?.cost.expectedWage ?? (prior?.wageSource === 'estimate' ? prior.weeklyWage : null)
    return <li key={p.playerId}><div className="package-player-title"><strong>{title(p.playerId)}</strong><span>{kind === 'promotions' ? 'Akademiden terfi' : 'Transfer'}</span><button type="button" aria-label={`${title(p.playerId)} paketinden çıkar`} onClick={() => remove(p.playerId)}><X size={14} /></button></div>
      <div className="package-inputs">{kind === 'transfers' && amount(p.fee, 'Bonservis senaryosu (€)', v => update(kind, p.playerId, 'fee', v), fee == null ? 'Referans bilinmiyor' : `Boş: referans ${money(fee)}`)}
        {amount(p.weeklyWage, 'Maaş senaryosu (€/hafta)', v => update(kind, p.playerId, 'weeklyWage', v), wage == null ? 'Maaş bilinmiyor' : `Boş: tahmini ${money(wage)}`)}
        {amount(p.signingFee, 'Ek ücret senaryosu (€)', v => update(kind, p.playerId, 'signingFee', v), 'Boş: bilinmiyor')}</div></li>
  }
  return <form className="package-body" onSubmit={e => { e.preventDefault(); s.calculate() }}>
    <p className="hub-muted">Oyunda işlem yapmaz. Aday satırından pakete ekle; boş tutarlarda varsa referans kullanılır. Girdiğin tutarlar teklif senaryosudur, kabul edilmiş fiyat değildir.</p>
    {(s.stale || s.conflict) && <p className="hub-message" role="status">{s.conflict ? 'Paket başka bir pencerede değişti. Yerel düzenlemelerin korunuyor.' : 'Kaynak veya takım planı değişti; önce güncel verilerle hesapla.'}</p>}
    {s.error && <p className="hub-error" role="alert">{s.error}</p>}
    <PackageSuggestions />
    <fieldset disabled={s.busy}>
      <label className="package-formation">Paket dizilişi<select aria-label="Paket dizilişi" value={draft.formation} onChange={e => s.edit({ ...draft, formation: e.target.value })}>{Object.keys(board.view.context.catalog.formations).map(f => <option key={f}>{f}</option>)}</select></label>
      <ul className="package-players">{draft.transfers.map(p => acquisition(p, 'transfers'))}{draft.promotions.map(p => acquisition(p, 'promotions'))}
        {draft.sales.map(p => <li key={p.playerId}><div className="package-player-title"><strong>{title(p.playerId)}</strong><span>Koşullu satış</span><button type="button" aria-label={`${title(p.playerId)} paketinden çıkar`} onClick={() => remove(p.playerId)}><X size={14} /></button></div>
          <div className="package-inputs">{amount(p.proceeds, 'Satış geliri senaryosu (€)', v => s.edit({ ...draft, sales: draft.sales.map(x => x.playerId === p.playerId ? { ...x, proceeds: v } : x) }), 'Boş: gelir bilinmiyor')}</div></li>)}
      </ul>
      <div className="package-selectors"><label>Satış senaryosuna ekle<select aria-label="Satış senaryosuna ekle" value="" onChange={e => { if (e.target.value) s.edit({ ...draft, sales: [...draft.sales, { playerId: Number(e.target.value), proceeds: null }] }) }}><option value="">Kadrodan oyuncu seç</option>{own.map(p => <option key={p.id} value={p.id}>{p.name} · {p.positions.join('/')} · {p.overall ?? '—'}</option>)}</select></label>
        <label>Akademiden terfi senaryosu<select aria-label="Akademiden terfi senaryosu" value="" disabled={!academyFresh || !academy.length} onChange={e => { if (e.target.value) s.edit({ ...draft, promotions: [...draft.promotions, { playerId: Number(e.target.value), fee: null, weeklyWage: null, signingFee: null }] }) }}><option value="">{academy.length ? 'Akademiden oyuncu seç' : 'Güncel akademi seçeneği yok'}</option>{academy.map(p => <option key={p.player.id} value={p.player.id}>{p.player.name} · {p.player.overall ?? '—'} / {p.player.potential ?? '—'}</option>)}</select></label></div>
      <div className="package-controls"><button className="hub-button" type="submit">{s.stale ? 'Güncel veriyle hesapla' : 'Paketi hesapla'}</button><button className="hub-button is-primary" type="button" disabled={!computed || s.conflict || !local!.dirty} onClick={s.save}>Paketi kaydet</button>
        {(s.conflict || local!.dirty) && <button className="hub-text-button" type="button" onClick={s.reload}>Kaydedilmiş paketi yükle</button>}
        <span className="hub-muted">{local!.dirty ? 'Değişiklikler henüz kaydedilmedi.' : s.view?.version ? `Kaydedildi · sürüm ${s.view.version}` : 'Henüz kaydedilmiş paket yok.'}</span></div>
    </fieldset>
    {local!.result && <PackageResult result={local!.result} outdated={!computed} />}
    <button className="hub-text-button" type="button" onClick={onDone}>Önerilere dön</button>
  </form>
}

const GOALS: Record<string, { title: string; text: string }> = {
  low: { title: 'Düşük harcama', text: 'Bu dönemin açıklarını en az parayla kapatmaya çalışır.' },
  balanced: { title: 'Dengeli', text: 'Katkıyı ve maliyeti birlikte tartar.' },
  high: { title: 'Yüksek katkı', text: 'Bütçe içinde kadroya en çok katkıyı arar.' },
}
const ROLES: Record<string, string> = { starter: 'İlk 11', rotation: 'Rotasyon', development: 'Gelişim', squad: 'Kadro derinliği' }
const dec1 = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })
const EMPTY: Record<string, string> = { 'no-need': 'Bu dönem kapatılması gereken açık ihtiyaç yok.', 'no-fit': 'Bütçe ve maaş alanına sığıp ihtiyacı kapatan oyuncu bulunamadı.' }
const openNeeds = (slots: PlanResult['before']['slots']) => slots.filter(s => s.priority === 'urgent' || s.priority === 'window').length
const xiLevel = (slots: PlanResult['before']['slots']) => { const levels = slots.map(s => s.starterRating).filter((n): n is number => n != null); return levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : null }
const span = (low: number, high: number) => low === high ? money(low) : `${money(low)} – ${money(high)}`

function CostRange({ budget: { range } }: { budget: PlanBudget }) {
  if (!range) return null
  return <p className="package-range">Olası aralık (varsayım): {span(range.feeLow, range.feeHigh)} bonservis · {span(range.wageLow, range.wageHigh)} / hafta{range.highFitsBudget === false && <strong>Üst uçta bütçe aşılır</strong>}</p>
}

function PackageFigures({ budget: b, needs, xi }: { budget: PlanBudget; needs: [number, number]; xi: [number | null, number | null] }) {
  return <><dl><div><dt>Bonservis referansı</dt><dd>{money(b.knownFees)}</dd></div><div><dt>Tahmini maaş / hafta</dt><dd>{money(b.knownWeeklyWages)}</dd></div>
    <div><dt>Kalan bonservis</dt><dd>{money(b.remainingWithoutSales)}</dd></div><div><dt>Kalan maaş / hafta</dt><dd>{money(b.wageRemainingWithoutSales)}</dd></div>
    <div><dt>Açık ihtiyaç</dt><dd>{needs[0]} → {needs[1]}</dd></div><div><dt>İlk 11 ortalaması</dt><dd>{xi[0] == null || xi[1] == null ? '—' : `${dec1(xi[0])} → ${dec1(xi[1])}`}</dd></div></dl>
    <CostRange budget={b} /></>
}

function PackageSuggestions() {
  const s = useContext(Context)!, list = s.suggestions, filled = selected(s.local!.draft).length > 0
  const [pending, setPending] = useState<string | null>(null)
  const take = (p: PlanSuggestion) => { if (filled && pending !== p.goal) setPending(p.goal); else { setPending(null); s.apply(p) } }
  const current = s.local!.result
  const compared = filled && !!current && !s.stale && s.local!.evaluatedDraft === JSON.stringify(s.local!.draft)
  return <section className="package-suggestions" aria-label="Otomatik paketler">
    <header><div><h3>Otomatik paketler</h3><p className="hub-muted">Bütçene ve açık mevkilere göre üç seçenek hazırlar. Sen seçmeden taslak değişmez.</p></div>
      <button type="button" className="hub-button" disabled={s.busy || s.suggesting || s.conflict} onClick={s.suggest}>{s.suggesting ? 'Hazırlanıyor…' : list ? 'Yeniden öner' : 'Paket öner'}</button></header>
    {s.suggestError && <p className="hub-error" role="alert">{s.suggestError}</p>}
    {list && (list.packages.length === 0 ? <p className="hub-message" role="status">{list.notes[0]?.text}</p> : <>
      <div className="package-options view-swap">{compared && <article className="package-option is-draft" aria-label="Mevcut taslağın">
        <h4>Mevcut taslağın</h4><ul>{current.players.map(x => <li key={x.playerId}><strong>{x.name}</strong><small>{x.action === 'sale' ? 'Koşullu satış' : x.action === 'promotion' ? 'Akademiden terfi' : 'Transfer'}</small></li>)}</ul>
        <PackageFigures budget={current.budget} needs={[openNeeds(current.before.slots), openNeeds(current.after.slots)]} xi={[xiLevel(current.before.slots), xiLevel(current.after.slots)]} /></article>}
        {list.packages.map(p => <PackageOption key={p.goal} option={p} pending={pending === p.goal} onTake={() => take(p)} onCancel={() => setPending(null)} />)}</div>
      <details className="hub-explanation"><summary>Paketler nasıl hazırlandı? <ChevronDown size={14} /></summary><ul>{list.notes.map(n => <li key={n.code}>{n.text}</li>)}</ul></details>
    </>)}
  </section>
}

function PackageOption({ option: p, pending, onTake, onCancel }: { option: PlanSuggestion; pending: boolean; onTake: () => void; onCancel: () => void }) {
  const s = useContext(Context)!, goal = GOALS[p.goal] ?? { title: p.goal, text: '' }, b = p.result?.budget
  return <article className="package-option" aria-label={`${goal.title} paketi`}>
    <h4>{goal.title}</h4><p className="hub-muted">{goal.text}</p>
    {!p.draft ? <p className="package-option-empty">{EMPTY[p.empty ?? 'no-fit'] ?? EMPTY['no-fit']}</p>
      : p.sameAs ? <p className="package-option-empty">{GOALS[p.sameAs]?.title ?? p.sameAs} paketiyle aynı oyuncular çıktı.</p>
      : <>
        <ul>{p.picks.map(x => <li key={x.playerId}><strong>{x.name}</strong><small>{[x.slot, ROLES[x.role] ?? x.role, x.ratingAfter == null ? null : x.ratingBefore == null || x.ratingBefore === x.ratingAfter ? String(x.ratingAfter) : `${x.ratingBefore} → ${x.ratingAfter}`].filter(Boolean).join(' · ')}</small></li>)}</ul>
        <PackageFigures budget={b!} needs={[p.openNeedsBefore, p.openNeedsAfter]} xi={[p.xiBefore, p.xiAfter]} />
        {pending ? <div className="package-option-confirm" role="group" aria-label="Taslak değişikliğini onayla"><span>Mevcut taslağın bu paketle değişecek.</span><button type="button" className="hub-button is-primary" disabled={s.busy} onClick={onTake}>Evet, değiştir</button><button type="button" className="hub-text-button" onClick={onCancel}>Vazgeç</button></div>
          : <button type="button" className="hub-button" disabled={s.busy} onClick={onTake}>Bu paketi taslağa al</button>}
      </>}
  </article>
}

const STATUS: Record<string, string> = { above: 'Senaryo bütçe dışında', unknown: 'Maliyet verisi yetersiz', conditional: 'Koşullu bütçe uyumu', within: 'Girdiğin senaryo bütçesine sığıyor' }
function PackageResult({ result: r, outdated }: { result: PlanResult; outdated: boolean }) {
  const b = r.budget
  return <section className={`package-result${outdated ? ' is-outdated' : ''}`} aria-label="Transfer paketi hesabı">
    <header><h3>{outdated ? 'Önceki hesap · yeniden hesapla' : STATUS[b.status] ?? 'Bütçe durumu bilinmiyor'}</h3><span>{gameDate(r.snapshot.gameDate)} · {r.after.formation}</span></header>
    <dl className="package-totals"><div><dt>Bilinen bonservis referansı</dt><dd>{money(b.knownFees)}{b.unknownFees > 0 && <small> + {b.unknownFees} bilinmeyen</small>}</dd></div><div><dt>Haftalık maaş senaryosu</dt><dd>{money(b.knownWeeklyWages)}{b.unknownWeeklyWages > 0 && <small> + {b.unknownWeeklyWages} bilinmeyen</small>}</dd></div>
      <div><dt>Ek ücret senaryosu</dt><dd>{money(b.knownSigningFees)}{b.unknownSigningFees > 0 && <small> + {b.unknownSigningFees} bilinmeyen</small>}</dd></div>
      <div><dt>Satış olmadan kalan bonservis</dt><dd>{money(b.remainingWithoutSales)}</dd></div><div><dt>Satış olmadan kalan maaş / hafta</dt><dd>{money(b.wageRemainingWithoutSales)}</dd></div></dl>
    {r.players.some(p => p.action === 'sale') && <dl className="package-totals is-conditional"><div><dt>Satışlar gerçekleşirse kalan bonservis</dt><dd>{money(b.remainingWithSales)}</dd></div><div><dt>Satışlar gerçekleşirse kalan maaş / hafta</dt><dd>{money(b.wageRemainingWithSales)}</dd></div></dl>}
    <CostRange budget={b} />
    <p className="hub-muted">Bilinmeyen ek ücretler hariç referans hesabı. “—” eksik maliyet veya bütçedir; sıfır değildir.</p>
    <div className="package-depth"><h4>Kadro etkisi · önce → sonra</h4><p>Bağımsız ilk 11: {r.before.filledStarters} → {r.after.filledStarters} · Bağımsız rotasyon: {r.before.filledRotation} → {r.after.filledRotation}</p>
      {r.warnings.filter(w => ['unassigned', 'depth-loss'].includes(w.code)).map(w => <p className="hub-message" key={w.text}>{w.text}</p>)}
      <details className="hub-explanation"><summary>Mevki etkilerini gör <ChevronDown size={14} /></summary><ul>{r.after.slots.map(slot => { const before = r.before.slots.find(s => s.slot === slot.slot); return <li key={slot.slot}><strong>{slot.slot}</strong><span>İlk seçenek: {before?.starterRating ?? '—'} → {slot.starterRating ?? '—'}</span><span>Yedek: {before?.rotationRating ?? '—'} → {slot.rotationRating ?? '—'}</span></li> })}</ul></details></div>
    <details className="hub-explanation"><summary>Varsayımlar ve veri sınırları <ChevronDown size={14} /></summary><ul>{r.warnings.map((w, i) => <li key={`${w.code}-${i}`}>{w.text}</li>)}</ul></details>
  </section>
}
