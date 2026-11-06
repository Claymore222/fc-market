import { useQuery } from '@tanstack/react-query'
import { get } from './client'
import type { AnalysisProfileView, ContractPlan, LeagueStrength, LineBenchmark, XiReview } from './analysis'
import type { RecruitmentResult } from './recruitment'

export interface RecruitmentBoardPosition {
  position: string; inFormation: boolean; formation: string; slot: string; priority: string; needScore: number | null
  reasons: { code: string; text: string }[]; recommendations: RecruitmentResult
}
export interface RecruitmentBoard {
  view: AnalysisProfileView; formationSource: string; transferBudgetSource: string; wageBudgetSource: string
  positions: RecruitmentBoardPosition[]; warnings: string[]; teamReference: number | null
  league?: LeagueStrength | null; lines?: LineBenchmark[] | null; contracts?: ContractPlan | null; xi?: XiReview | null
}
export const useRecruitmentBoard = (saveUid?: string) => useQuery({
  queryKey: ['recruitmentBoard', saveUid], queryFn: () => get<RecruitmentBoard>('/api/recruitment/board', { saveUid }), staleTime: 30_000, retry: 1,
})
