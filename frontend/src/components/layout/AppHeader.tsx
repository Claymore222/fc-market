import { Link } from 'react-router-dom'
import { BookOpen, Database, RefreshCw, Repeat, Settings2 } from 'lucide-react'
import type { BranchInfo, ClubView, SaveInfo } from '../../api/types'
import { gameDate } from '../../lib/format'
import { CareerTabs, ClubCrest } from './CareerHeroCard'

interface AppHeaderProps {
  career: { key?: string; save?: SaveInfo; branch?: BranchInfo }
  club?: ClubView
  onRefresh?: () => void
  isRefreshing?: boolean
  onSwitchCareer?: () => void
  onSettings?: () => void
}

/** The only top bar: who, where and the few global actions. Content starts right under it on every page. */
export function AppHeader({ career, club, onRefresh, isRefreshing = false, onSwitchCareer, onSettings }: AppHeaderProps) {
  const save = career.save
  const branched = (save?.branches.length ?? 0) > 1
  const date = club?.snapshot.gameDate ?? (branched ? career.branch?.lastGameDate : save?.latest.gameDate)
  const source = club?.snapshot.source ?? (branched ? undefined : save?.latest.source)
  const name = club?.club.name ?? save?.userTeamName
  return (
    <header className="app-bar">
      <div className="app-bar-inner">
        <Link to="/" className="app-bar-club" aria-label="FC Market ana sayfa">
          {name ? <ClubCrest name={name} color1={club?.club.color1} color2={club?.club.color2} teamId={club?.club.id} size={34} />
            : <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cmt-blurple"><Database size={16} /></span>}
          <span className="min-w-0">
            <h1 className="career-club-name">{name ?? 'FC MARKET'}</h1>
            {save && <span className="app-bar-meta">
              <span className="career-save-badge">{source === 'save' ? 'Kayıt' : source ? 'Export' : 'Veri'} · {gameDate(date)}</span>
              {branched && career.branch && <span className="career-branch" title={career.branch.reason ?? (career.branch.forkDate ? `${gameDate(career.branch.forkDate)} ayrıldı` : undefined)}>Dal {career.branch.branch}</span>}
            </span>}
          </span>
        </Link>
        {save && <CareerTabs />}
        <div className="app-bar-actions">
          <Link to="/guide" className="btn" aria-label="LE rehberi" title="Live Editor rehberi"><BookOpen size={15} /></Link>
          <button className="btn" onClick={onSettings} aria-label="Ayarlar" title="Ayarlar"><Settings2 size={15} /></button>
          <button onClick={onRefresh} disabled={isRefreshing} className="btn" title="İçe aktarılmış verileri yeniden yükle" aria-label="Yenile">
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          {onSwitchCareer && <button onClick={onSwitchCareer} className="btn" title="Kariyer seçimine dön" aria-label="Kariyer değiştir"><Repeat size={15} /></button>}
        </div>
      </div>
    </header>
  )
}
