import { useQuery } from '@tanstack/react-query'
import { get } from './client'
import type { LeagueStrength, LineBenchmark } from './analysis'
import type { SnapshotInfo } from './types'

export type ReviewPriority = 'urgent' | 'window' | 'next-season' | 'sufficient' | 'unknown'

export interface ClubTactics {
  formation: string | null
  /** Dizilişin hücum ağırlığı 0–4 (5-4-1=0 … 3-4-3=4). */
  offensiveRating: number | null
  offensiveLabel: string | null
  defenders: number | null
  midfielders: number | null
  attackers: number | null
  /** Kayıtlı dizilişin 11 yeri (GK, RCB, …). */
  positions: string[]
  buildUpPlay: number | null
  buildUpLabel: string | null
  /** Savunma çizgisi yüksekliği (25–95). */
  defensiveDepth: number | null
  defensiveLineLabel: string | null
  leagueDefensiveDepth: number | null
}

export interface ReviewSlot {
  slot: string; position: string; priority: ReviewPriority; needScore: number | null
  starterId: number | null; starterName: string | null; starterRating: number | null
  rotationId: number | null; rotationName: string | null; rotationRating: number | null
  conditional: boolean; reasons: { code: string; text: string }[]
}

export interface ClubReview {
  /** Kullanıcının kendi kariyer başlığı (karşılaştırma için). */
  snapshot: SnapshotInfo
  teamId: number
  teamName: string
  tactics: ClubTactics
  /** Sezon başı transfer bütçesi tahmini; kulüp değerinden, kullanıcının kendi kulüplerine kalibre. */
  budget: { clubWorth: number; estimate: number; low: number; high: number; calibrationPoints: number; outsideCalibration: boolean } | null
  needs: { formation: string; formationExact: boolean; teamReference: number | null; league: LeagueStrength | null; lines: LineBenchmark[]; slots: ReviewSlot[] } | null
  players: number
}

export const useClubReview = (saveUid: string | undefined, teamId: number | undefined) => useQuery({
  enabled: teamId !== undefined,
  queryKey: ['clubReview', saveUid, teamId],
  queryFn: () => get<ClubReview>('/api/club/review', { saveUid, teamId: teamId?.toString() }),
  staleTime: 60_000,
})
