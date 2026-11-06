import type { AnalysisOrigin } from './analysis'
import type { SnapshotInfo } from './types'

export interface RecruitmentCandidate {
  id: number; name: string; club: string | null; clubId: number | null; league: string | null; positions: string[]
  age: number | null; overall: number | null; potential: number | null; score: number; attributeScore: number
  qualityScore: number; developmentScore: number | null; bonus: number; knownAttributes: number; totalAttributes: number
  roleLevel: number | null; styles: string[]; stylesPlus: string[]; estimatedValue: number | null; currentWage: number | null
  recordedWageOnly: boolean; isFreeAgent: boolean
  cost: { feeLow: number | null; feeHigh: number | null; wageLow: number | null; wageHigh: number | null; status: string; referenceAmount?: number | null; referenceKind?: string | null; expectedWage?: number | null }
  lastTransfer?: { amount: number; date: string; fromTeamId: number | null; fromClub: string | null; toTeamId: number | null; toClub: string | null; snapshotId: string } | null
  tags?: string[]; leagueOverallDifference?: number | null; positionRating?: number | null
  comparedPlayerId: number | null; comparedPlayerName: string | null; overallGain: number | null; attributeGain: number | null
  strengths: { key: string; label: string; value: number; weight: number }[]
  weaknesses: { key: string; label: string; value: number; weight: number }[]; reasons: string[]
}
export interface RecruitmentResult {
  reportId: string; snapshot: SnapshotInfo; scopeKey: string; viewMode: string; configVersion: string; formation: string; slot: string
  target: { position: string; label: string; preferences: string[]; attributes: Record<string, number>; critical: string[]
    styles: number[]; roleId: number | null; preferredFoot: string | null; starterMinimum: number | null
    rotationMinimum: number | null; developmentMinimum: number | null; labels: Record<string, string> }
  poolSize: number; excluded: Record<string, number>
  internal: { id: number; name: string; overall: number | null; attributeScore: number | null; assignedSlot: string | null; note: string }[]
  groups: { key: string; label: string; minimumOverall: number | null; total: number; candidates: RecruitmentCandidate[]; overBudget?: RecruitmentCandidate[] | null; overBudgetTotal?: number }[]
  warnings: string[]
  sources?: Record<string, AnalysisOrigin | null>
  league?: { leagueId: number | null; name: string | null; starterReference: number | null; measuredClubs: number } | null
  wages?: { source: string; players: number } | null
}
