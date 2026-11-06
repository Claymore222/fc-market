import type { SquadMember } from '../api/types'

const BASE: Record<string, string> = { RCB: 'CB', LCB: 'CB', SW: 'CB', RDM: 'CDM', LDM: 'CDM', RCM: 'CM', LCM: 'CM', RAM: 'CAM', LAM: 'CAM', RS: 'ST', LS: 'ST' }
export const slotPosition = (slot: string | null) => slot ? BASE[slot] ?? slot : null

/** Recorded position eligibility; no invented slot ratings or implicit midfield/wing conversion. */
export function lineupDepth(starter: SquadMember, squad: SquadMember[], limit = 4): SquadMember[] {
  const position = slotPosition(starter.slot) ?? starter.player.position
  if (!position) return []
  const seen = new Set<number>()
  return squad.filter(m => {
    if (!['Sub', 'Reserve'].includes(m.role) || m.player.id === starter.player.id || seen.has(m.player.id)) return false
    seen.add(m.player.id)
    return [...(m.player.positions ?? []), m.player.position, m.player.position2].includes(position)
  }).sort((a, b) => (b.player.overall ?? -1) - (a.player.overall ?? -1)
    || (b.player.potential ?? -1) - (a.player.potential ?? -1) || a.player.id - b.player.id).slice(0, limit)
}
