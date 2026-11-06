import { useQuery } from '@tanstack/react-query'
import { get } from './client'
import type { SnapshotInfo } from './types'

export interface AnalysedMatch {
  id: number; date: string; competitionId: number; competition: string; isHome: boolean
  opponentId: number | null; opponent: string; goalsFor: number; goalsAgainst: number; result: 'W' | 'D' | 'L'
}
export interface MatchAnalysisView {
  snapshot: SnapshotInfo; fixtureSource: SnapshotInfo | null; limit: number; available: number
  matches: AnalysedMatch[]; summary: { played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; cleanSheets: number; scoredGames: number } | null
  competitions: { id: number; name: string }[]
}
export const useMatchAnalysis = (saveUid: string | undefined, limit: number, competitionId?: string) => useQuery({
  queryKey: ['matchAnalysis', saveUid, limit, competitionId],
  queryFn: () => get<MatchAnalysisView>('/api/matches', { saveUid, limit: String(limit), competitionId }), staleTime: 30_000,
})
