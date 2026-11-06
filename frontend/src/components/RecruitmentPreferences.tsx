import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, X, Zap, WandSparkles, Goal, SlidersHorizontal } from 'lucide-react'
import { saveManagerProfile } from '../api/analysis'
import type { RecruitmentBoard } from '../api/recruitmentBoard'

const steps = [
  { title: 'Beklerinden ne bekliyorsun?', subtitle: 'İki kanattaki bekler için.', positions: ['RB', 'LB'], options: [
    { id: 'quick-back', title: 'Hızlı', description: 'Çizgide sürat, geri dönüş ve dayanıklılık.', icon: Zap },
    { id: 'technical-back', title: 'Teknik', description: 'Top kontrolü, pas ve baskıdan çıkış.', icon: WandSparkles },
    { id: 'balanced-back', title: 'Dengeli', description: 'Savunma ve hücumu birlikte götürsün.', icon: SlidersHorizontal }] },
  { title: 'Kanat oyuncun nasıl oynasın?', subtitle: 'Sağ/sol kanat ve geniş orta saha için.', positions: ['RW', 'LW', 'RM', 'LM'], options: [
    { id: 'quick-wing', title: 'Hızla geçsin', description: 'Patlayıcı ilk adım ve sürat.', icon: Zap },
    { id: 'technical-wing', title: 'Topla çözsün', description: 'Dripling, top kontrolü ve çeviklik.', icon: WandSparkles },
    { id: 'inside-wing', title: 'İçe kat etsin', description: 'Gol tehdidi, ceza sahasına koşular.', icon: Goal }] },
  { title: 'Santrforda ne arıyorsun?', subtitle: 'Boyu bilinmeyen oyuncular boy şartı olan tercihte elenir.', positions: ['ST'], options: [
    { id: 'target-striker', title: 'Uzun pivot', description: '185 cm ve üstü; güç ve hava topları.', icon: Goal },
    { id: 'mobile-striker', title: 'Kısa ve çabuk', description: '183 cm ve altı; hızlanma ve çeviklik.', icon: Zap },
    { id: 'clinical-striker', title: 'Bitirici', description: 'Boy şartı yok; pozisyon ve son vuruş.', icon: Goal }] },
  { title: '10 numaranın önceliği ne olsun?', subtitle: 'Ofansif orta saha adaylarını kişiselleştirir.', positions: ['CAM'], options: [
    { id: 'technical-ten', title: 'Oyunu kursun', description: 'Vizyon, kısa pas ve top kontrolü.', icon: WandSparkles },
    { id: 'scoring-ten', title: 'Skora gitsin', description: 'Bitiricilik ve ceza sahasına koşu.', icon: Goal }] },
]

export function RecruitmentPreferences({ board, saveUid, onClose, onSaved }: {
  board: RecruitmentBoard; saveUid?: string; onClose: () => void; onSaved: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null), alive = useRef(true)
  const [profile, setProfile] = useState(() => structuredClone(board.view.profile))
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  useEffect(() => {
    alive.current = true
    const el = dialog.current!, focus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; el.showModal()
    return () => { alive.current = false; el.close(); document.body.style.overflow = overflow; focus?.focus({ preventScroll: true }) }
  }, [])
  const question = steps[step], prefs = profile.playerPreferences ?? {}
  const select = (id: string) => setProfile(p => ({ ...p, playerPreferences: { ...p.playerPreferences, ...Object.fromEntries(question.positions.map(pos => [pos, id])) } }))
  const skip = () => {
    setProfile(p => {
      const next = { ...p.playerPreferences }
      for (const pos of question.positions) {
        const original = board.view.profile.playerPreferences?.[pos]
        if (original) next[pos] = original; else delete next[pos]
      }
      return { ...p, playerPreferences: next }
    }); setStep(n => n + 1)
  }
  const save = async () => {
    setBusy(true); setError(null)
    try { await saveManagerProfile(saveUid, board.view, profile); if (alive.current) onSaved() }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Tercihler kaydedilemedi.') }
    finally { if (alive.current) setBusy(false) }
  }
  const choice = question?.options.find(o => question.positions.every(pos => prefs[pos] === o.id))
  return <dialog ref={dialog} className="recruitment-dialog" aria-label={question?.title ?? 'Planın hazır'} onCancel={e => { e.preventDefault(); if (!busy) onClose() }} onClick={e => { if (e.target === dialog.current && !busy) onClose() }}>
    <div className="recruitment-dialog-inner"><header><span className="hub-eyebrow">SENİN FUTBOLUN</span><button type="button" aria-label="Tercihleri kapat" disabled={busy} onClick={onClose}><X size={20} /></button></header>
      {step < steps.length ? <><div className="hub-step"><span>{step + 1} / {steps.length}</span><div>{steps.map((_, i) => <i key={i} className={i <= step ? 'is-active' : ''} />)}</div></div><h2 id="recruitment-preference-title">{question.title}</h2><p className="hub-muted">{question.subtitle}</p><div className="hub-answer-cards">{question.options.map(o => <button type="button" key={o.id} disabled={busy} aria-pressed={choice?.id === o.id} onClick={() => select(o.id)}><o.icon size={24} /><strong>{o.title}</strong><span>{o.description}</span>{choice?.id === o.id && <Check className="hub-answer-check" size={17} />}</button>)}</div></>
        : <><h2 id="recruitment-preference-title">Planın hazır</h2><p className="hub-muted">Seçimlerin adayların özellik ağırlıklarına uygulanacak. Öneriler yeni tercihlerle tekrar hesaplanır.</p><ul className="hub-answer-review">{steps.map(s => { const id = prefs[s.positions[0]]; return <li key={s.title}><span>{s.positions[0] === 'RB' ? 'Bekler' : s.positions[0] === 'RW' ? 'Kanatlar' : s.positions[0] === 'ST' ? 'Santrfor' : '10 numara'}</span><strong>{s.options.find(o => o.id === id)?.title ?? 'Mevcut / dengeli tercih'}</strong></li> })}</ul></>}
      <p className="hub-dialog-note">Yalnız FC Market planına kaydedilir; oyundaki taktiği veya kayıtları değiştirmez.</p>
      {error && <p role="alert" className="hub-error">{error} Seçimlerin korunuyor; kaydetmek için güncel kariyer verisi gerekir.</p>}
      <footer>{step > 0 && <button className="hub-button" type="button" disabled={busy} onClick={() => setStep(s => s - 1)}><ArrowLeft size={15} /> Geri</button>}{step < steps.length ? <><button className="hub-text-button" type="button" disabled={busy} onClick={skip}>Bu tercihi değiştirme</button><button className="hub-button is-primary" type="button" disabled={busy || !choice} onClick={() => setStep(s => s + 1)}>Devam <ArrowRight size={15} /></button></> : <button className="hub-button is-primary" type="button" disabled={busy} onClick={() => { void save() }}>{busy ? 'Kaydediliyor…' : 'Tercihleri uygula'}</button>}</footer>
    </div>
  </dialog>
}
