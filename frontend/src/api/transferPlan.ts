import type { FormationDepth } from './analysis'
import type { SnapshotInfo } from './types'

export interface PlanSource {
  scopeKey: string; viewMode: string; snapshotId: string; revision: number; configVersion: string
  recruitmentVersion: string; planVersion: string; profileVersion: number
}
export interface PlanAcquisition { playerId: number; fee: number | null; weeklyWage: number | null; signingFee: number | null }
export interface PlanSale { playerId: number; proceeds: number | null }
export interface PlanDraft { formation: string; transfers: PlanAcquisition[]; sales: PlanSale[]; promotions: PlanAcquisition[] }
export interface PlanPlayer {
  playerId: number; name: string; positions: string[]; action: string; fee: number | null; feeSource: string
  weeklyWage: number | null; wageSource: string; signingFee: number | null
}
export interface PlanCostRange { feeLow: number; feeHigh: number; wageLow: number; wageHigh: number; highFitsBudget: boolean | null }
export interface PlanBudget {
  transferBudget: number | null; weeklyWageBudget: number | null; knownFees: number; unknownFees: number
  knownWeeklyWages: number; unknownWeeklyWages: number; knownSigningFees: number; unknownSigningFees: number
  knownSaleProceeds: number; unknownSaleProceeds: number; knownWageRelease: number; unknownWageRelease: number
  remainingWithoutSales: number | null; wageRemainingWithoutSales: number | null
  remainingWithSales: number | null; wageRemainingWithSales: number | null; status: string; range?: PlanCostRange | null
}
export interface PlanResult {
  source: PlanSource; snapshot: SnapshotInfo; createdAt: string; players: PlanPlayer[]; budget: PlanBudget
  before: FormationDepth; after: FormationDepth; warnings: { code: string; text: string }[]
}
export interface PlanView { currentSource: PlanSource; version: number; updatedAt: string | null; draft: PlanDraft | null; result: PlanResult | null; stale: boolean }
export interface PlanSuggestionPick { playerId: number; name: string; slot: string | null; role: string; ratingBefore: number | null; ratingAfter: number | null }
export interface PlanSuggestion {
  goal: string; draft: PlanDraft | null; result: PlanResult | null; picks: PlanSuggestionPick[]; openNeedsBefore: number; openNeedsAfter: number
  xiBefore: number | null; xiAfter: number | null; sameAs: string | null; empty?: string | null
}
export interface PlanSuggestions { source: PlanSource; formation: string; packages: PlanSuggestion[]; unknownCostSkipped: number; notes: { code: string; text: string }[] }
