import { useQuery } from '@tanstack/react-query'
import { get, send } from './client'
import type { SnapshotInfo } from './types'

export interface ManagerProfile {
  formation: string | null; secondaryFormation: string | null
  attack: string[]; defense: string; tempo: string; defensiveLine: number | null
  horizon: string; matchMode: string; transferBudget: number | null; weeklyWageBudget: number | null
  reservePercent: number; targetTransfers: number; minAge: number | null; maxAge: number | null
  preferredLeagueIds: number[]; protectedPlayerIds: number[]; departurePlayerIds: number[]
  rolePreferences: Record<string, Record<string, number>>
  playerPreferences?: Record<string, string>
}
export interface AnalysisOrigin { snapshotId: string; gameDate: string | null; kind: string }
export interface AnalysisValue { value: unknown; state: string; origin: AnalysisOrigin | null; note: string | null }
export interface AnalysisPlayer {
  id: number; name: string; age: number | null; overall: number | null; potential: number | null
  positions: string[]; slot: string | null; weeklyWage: number | null; contractEnd: number | null
  fitness: number | null; roles: number[] | null; playStyles: number[] | null; playStylesPlus: number[] | null
  attributes: Record<string, number | null>; availability: Record<string, AnalysisValue>; loan: AnalysisValue
  squadSlot?: number | null; form?: number | null; foot?: string | null; positionRatings?: Record<string, number> | null
}
export interface AnalysisContext {
  snapshot: SnapshotInfo; scopeKey: string; viewMode: 'saved' | 'preview'; configVersion: string
  suggestedFormation: string | null; players: AnalysisPlayer[]; inputs: Record<string, AnalysisValue>
  coverage: { key: string; label: string; known: number; total: number; state: string; origin: AnalysisOrigin | null; note: string | null }[]
  catalog: { version: string; formations: Record<string, string[]>; slotAliases: Record<string, string>; choices: Record<string, Record<string, string>>; playerPreferenceChoices?: Record<string, Record<string, string>> }
  roles: { id: number; name: string; position: string }[]; leagues: { id: number; name: string }[]
  leagueObjective?: { target: number | null; stretch: number | null; minimum: number | null } | null
}
export interface AnalysisProfileView {
  context: AnalysisContext; profile: ManagerProfile; version: number; updatedAt: string | null
  savedSnapshotId: string | null; savedSnapshotRevision: number | null
  savedConfigVersion?: string | null
}
export const useManagerProfile = (saveUid?: string) => useQuery({
  queryKey: ['managerProfile', saveUid], queryFn: () => get<AnalysisProfileView>('/api/analysis/profile', { saveUid }),
  staleTime: 30_000,
})
export async function saveManagerProfile(saveUid: string | undefined, view: AnalysisProfileView, profile: ManagerProfile) {
  return (await send<AnalysisProfileView>('PUT', '/api/analysis/profile', { saveUid }, {
    snapshotId: view.context.snapshot.snapshotId, snapshotRevision: view.context.snapshot.revision ?? 0,
    configVersion: view.context.configVersion, expectedVersion: view.version, profile,
  }))!
}

export interface DepthSlot {
  slot: string; position: string; starterId: number | null; rotationId: number | null
  readyStarterId: number | null; readyRotationId: number | null
  nextSeasonStarterId: number | null; nextSeasonRotationId: number | null; developmentId: number | null
  preferredRoleId: number | null; priority: 'urgent' | 'window' | 'next-season' | 'sufficient' | 'unknown'
  needScore: number | null; conditional: boolean; temporaryGap: boolean; reasons: { code: string; text: string }[]
  starterRating?: number | null; rotationRating?: number | null
}
export interface LineBenchmark {
  position: string; starter: number | null; starterMedian: number | null; starterRank: number | null
  rotation: number | null; rotationMedian: number | null; rotationRank: number | null; clubs: number
}
export interface LeagueStrength { own: number | null; median: number | null; rank: number | null; clubs: number }
export interface ContractPlanItem { playerId: number; name: string; age: number | null; rating: number | null; slot: string | null; role: string; weeklyWage: number | null; action: string }
export interface ContractPlan { endYear: number; players: number; squad: number; starters: number; wages: number | null; wageBill: number | null; items: ContractPlanItem[] }
export interface XiOption { slot: string; position: string; currentId: number; currentName: string; currentRating: number | null; betterId: number; betterName: string; betterRating: number | null; gain: number; note: string | null }
export interface XiReview { savedAverage: number | null; improvedAverage: number | null; options: XiOption[] }
export interface FormationDepth {
  formation: string; teamReference: number | null; starterFloor: number | null; rotationFloor: number | null
  filledStarters: number; filledRotation: number; readyStarters: number; readyRotation: number
  nextSeasonStarters: number; nextSeasonRotation: number; slots: DepthSlot[]
  lines?: LineBenchmark[] | null; league?: LeagueStrength | null; contracts?: ContractPlan | null; xi?: XiReview | null
}
export interface DepthReport {
  id: string; createdAt: string; snapshot: SnapshotInfo; scopeKey: string; viewMode: string
  configVersion: string; rulesVersion: string; profileHash: string; profile: ManagerProfile; draft: boolean
  formations: FormationDepth[]; warnings: string[]
  profileVersion?: number
}
export async function runSquadAnalysis(saveUid: string | undefined, view: AnalysisProfileView, profile: ManagerProfile) {
  return (await send<DepthReport>('POST', '/api/analysis/run', { saveUid }, {
    snapshotId: view.context.snapshot.snapshotId, snapshotRevision: view.context.snapshot.revision ?? 0,
    configVersion: view.context.configVersion, expectedVersion: view.version, profile,
  }))!
}
