import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useClub, useHealth, useSaves, useSync } from './api/client'
import type { BranchInfo, SaveInfo } from './api/types'
import { AppHeader } from './components/layout/AppHeader'
import { HomePage } from './pages/HomePage'
import { SquadPage } from './pages/SquadPage'
import { SquadAnalysisPage } from './pages/SquadAnalysisPage'
import { MatchesPage } from './pages/MatchesPage'
import { ScoutPage } from './pages/ScoutPage'
import { YouthPage } from './pages/YouthPage'
import { FeedPage } from './pages/FeedPage'
import { ShortlistPage } from './pages/ShortlistPage'
import { TrophiesPage } from './pages/TrophiesPage'
import { ComparePage } from './pages/ComparePage'
import { TransferPage } from './pages/TransferPage'
import { RecruitmentHubPage } from './pages/RecruitmentHubPage'
import { LauncherPage } from './pages/LauncherPage'
import { GuidePage } from './pages/GuidePage'
import { isCareerEntered, onHostMessage, postHost } from './lib/host'
import { AlertTriangle } from 'lucide-react'
import { gameDate } from './lib/format'
import { ClubReviewPage } from './pages/ClubReviewPage'
import { AutomationSettings } from './components/AutomationSettings'
import { UpdateBanner } from './components/UpdateNotice'
import { hasOpenWarnings, ImportIssues, ImportWarnings } from './components/ImportIssues'
import { Toaster } from './components/Toaster'

// --- Kariyer seçimi -------------------------------------------------------
// Anahtar "save" (en son oynanan dalı izler) ya da "save@dal" (belirli bir dal). API saveUid parametresine aynen gider.
interface Career { key?: string; save?: SaveInfo; branch?: BranchInfo; openLauncher?: () => void }
const CareerContext = createContext<Career>({})
export const useCareer = () => useContext(CareerContext)
export const useSaveUid = () => useContext(CareerContext).key

function resolveCareer(list: SaveInfo[], key: string | undefined): Career {
  const at = key?.lastIndexOf('@') ?? -1
  const saveUid = key && at > 0 ? key.slice(0, at) : key
  const save = list.find((s) => s.saveUid === saveUid) ?? list[0]
  if (!save) return {}
  const picked = key && key !== save.saveUid ? save.branches.find((b) => b.careerKey === key) : undefined
  return { key: picked?.careerKey ?? save.saveUid, save, branch: picked ?? save.branches.find((b) => b.active) }
}

function readLocal(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeLocal(key: string, value: string | null) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value) } catch { /* yok say */ }
}

export function App() {
  const [, setParams] = useSearchParams()
  const [careerKey, setCareerKey] = useState<string | undefined>(() => readLocal('fcm.save') ?? undefined)
  const saves = useSaves()
  const qc = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)
  // Masaüstünde her açılış kariyer seçimiyle (küçük pencere) başlar; tarayıcıda veya kurtarma sonrasında kariyerle açılır.
  const [entered, setEntered] = useState(() => isCareerEntered())
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => onHostMessage(m => {
    if (m.type === 'resumeCareer') setEntered(true)
  }), [])

  const list = saves.data ?? []
  const career = resolveCareer(list, careerKey)
  const current = career.save
  const club = useClub(career.key, undefined, current !== undefined)

  // Kayıtlı save ya da dal artık yoksa varsayılana dön
  useEffect(() => {
    if (careerKey && saves.data && career.key !== careerKey) {
      setCareerKey(undefined)
      writeLocal('fcm.save', null)
    }
  }, [careerKey, saves.data, career.key])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try { await qc.invalidateQueries() }
    finally { setIsRefreshing(false) }
  }

  const selectCareer = (key: string) => {
    setCareerKey(key)
    writeLocal('fcm.save', key)
    setParams({}, { replace: true })
    setEntered(true)
    postHost('enterCareer')
  }

  const openLauncher = () => {
    setEntered(false)
    postHost('showLauncher')
  }

  if (!entered) {
    return <><LauncherPage saves={list} loading={saves.isPending} failed={saves.isError} current={career.key} onEnter={selectCareer} onSettings={() => setSettingsOpen(true)} />
      {settingsOpen && <AutomationSettings onClose={() => setSettingsOpen(false)} />}
      <UpdateBanner /></>
  }

  return (
    <CareerContext.Provider value={{ ...career, openLauncher }}>
      <div className="app-workspace min-h-screen bg-cmt-black text-gray-100 font-ubuntu antialiased selection:bg-cmt-blurple selection:text-cmt-accent-ink">
        {/* CMTracker Site Üst Barı */}
        <AppHeader
          career={career}
          club={club.data}
onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onSwitchCareer={openLauncher}
          onSettings={() => setSettingsOpen(true)}
        />

        {/* Sağlık & Uyarı Şeritleri */}
        <Banners onSelect={key => { selectCareer(key); writeLocal('fcm.save', key.split('@')[0]) }} />

        {/* CMTracker Merkez Konteyneri (1360px Max Width) */}
        <div className="career-container">
          {/* Sayfa Rotaları */}
          <main className="career-main" key={career.key ?? 'no-career'}>
            {!current ? (
              <div className="career-empty" role="status">
                <h1>{saves.isPending ? 'Kariyerler yükleniyor…' : 'Kariyer verisi kullanılamıyor'}</h1>
                <p>{saves.isError ? 'Yerel veri servisini ve export klasörünü kontrol et.' : 'Tamamlanmış bir export içe aktarıldığında oyuncular burada görünecek.'}</p>
                <button className="btn" onClick={() => saves.refetch()}>Yeniden dene</button>
              </div>
            ) : <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/squad" element={<SquadPage />} />
              <Route path="/squad/analysis" element={<Navigate to="/transfer/plan" replace />} />
              <Route path="/matches" element={<MatchesPage />} />
              <Route path="/scout" element={<ScoutPage />} />
              <Route path="/market" element={<ScoutPage />} />
              <Route path="/youth" element={<YouthPage />} />
              <Route path="/transfers" element={<FeedPage />} />
              <Route path="/shortlist" element={<ShortlistPage />} />
              <Route path="/trophies" element={<TrophiesPage />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/club-review" element={<ClubReviewPage />} />
              <Route path="/transfer" element={<RecruitmentHubPage />} />
              <Route path="/transfer/plan" element={<SquadAnalysisPage />} />
              <Route path="/transfer/market" element={<TransferPage />} />
              <Route path="/guide" element={<GuidePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>}
          </main>
        </div>
      </div>
      {settingsOpen && <AutomationSettings onClose={() => setSettingsOpen(false)} />}
      <UpdateBanner />
      <Toaster />
    </CareerContext.Provider>
  )
}

/** Sağlık uyarıları ve "yeni veri var" bildirimi */
function Banners({ onSelect }: { onSelect: (key: string) => void }) {
  const health = useHealth()
  const saveUid = useSaveUid()
  const qc = useQueryClient()
  const sync = useSync(saveUid)
  const seen = useRef<string>()
  const latest = sync.data?.current
  const token = latest ? `${saveUid}|${latest.snapshotId}|${latest.revision ?? 0}` : undefined
  const [updated, setUpdated] = useState<string | null>(null)
  useEffect(() => { seen.current = undefined; setUpdated(null) }, [saveUid])

  // Açık kariyere yeni kayıt/export gelince veriler kendiliğinden yenilenir; kısa bir bilgi şeridi gösterilir.
  useEffect(() => {
    if (!token || !latest) return
    const changed = seen.current !== undefined && seen.current !== token
    seen.current = token
    if (!changed) return
    setUpdated(latest.gameDate)
    // Sync itself has just refreshed. Refetch dependent data, including same-ID revision changes.
    qc.invalidateQueries({ predicate: q => q.queryKey[0] !== 'sync' && q.queryKey[0] !== 'health' })
    const t = setTimeout(() => setUpdated(null), 6000)
    return () => clearTimeout(t)
  }, [token, qc])

  if (health.isError) {
    return (
      <aside className="fc-strip is-bad px-4 py-2 text-xs font-mono">
        <div className="mx-auto flex max-w-[1280px] items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <span>Yerel veri sunucusuna ulaşılamıyor. Kariyer verisi gösterilemiyor; canlı oyun bağlantısı yok.</span>
        </div>
      </aside>
    )
  }

  const saved = sync.data?.saved
  const pending = sync.data?.pendingExport
  const archive = saved && latest && saved.snapshotId !== latest.snapshotId
  const preview = !!latest && (archive || !saved && latest.source !== 'save')
  const unmatched = !archive && !!saved && !!pending && pending.snapshotId !== latest?.snapshotId
  return <>
    <ImportIssues issues={sync.data?.issues} />
    {(preview || unmatched || updated || hasOpenWarnings(sync.data?.warnings)) && <aside role="status" className={`fc-strip fc-notice ${preview ? 'is-warn' : ''}`}>
      <div className="fc-notice-row">
        {preview && <><p>{latest.source === 'save' ? 'Arşivdeki oyun kaydı görüntüleniyor.' : 'Export önizlemesi: bu verilerin oyun kaydına yazıldığı doğrulanmadı.'}
          {saved && <> Son kayıt: <strong>{gameDate(saved.gameDate)}</strong>.</>}</p>
          {saved && <button className="fc-notice-action" onClick={() => onSelect(saved.saveUid)}>Kaydedilmiş kayda dön</button>}</>}
        {unmatched && <><p>{gameDate(pending.gameDate)} tarihli export henüz kayıtla eşleşmedi.</p>
          <button className="fc-notice-action" onClick={() => onSelect(pending.careerKey ?? pending.saveUid)}>Export’u incele</button></>}
        {updated && <p className="fc-notice-good">Yeni veri geldi, güncellendi: <strong>{gameDate(updated)}</strong></p>}
        <ImportWarnings warnings={sync.data?.warnings} />
      </div>
    </aside>}
  </>
}
