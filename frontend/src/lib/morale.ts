// Kariyer kaydındaki oyuncu morali: etiketler ve renkler (0–100).

export const TEMPERAMENT = ['Çok sakin', 'Sakin', 'Normal', 'Asabi', 'Çok asabi']

const EVENTS: Record<string, string> = {
  CM_Morale_Update_PlaytimeUnhappy: 'Oynama süresinden mutsuz',
}

/** Oyunun moral olayı adı → Türkçe; bilinmeyenlerde "CM_Morale_Update_" önekini atıp okunur hale getirir. */
export function moraleEvent(code: string): string {
  return EVENTS[code] ?? code.replace(/^CM_Morale_(Update_)?/, '').replace(/_/g, ' ')
}

/** CMTracker ölçeğine yakın eşikler: 70+ çok iyi, 55+ iyi, 40+ orta, altı mutsuz. */
export function moraleTone(v: number | null | undefined): { label: string; text: string; bg: string } {
  if (v === null || v === undefined) return { label: '–', text: 'text-gray-500', bg: 'bg-[#2a2a2a]' }
  if (v >= 70) return { label: 'Çok iyi', text: 'text-[#12eb83]', bg: 'bg-[#12eb83]' }
  if (v >= 55) return { label: 'İyi', text: 'text-[#14b341]', bg: 'bg-[#14b341]' }
  if (v >= 40) return { label: 'Orta', text: 'text-[#ffd200]', bg: 'bg-[#ffd200]' }
  return { label: 'Mutsuz', text: 'text-[#f84a46]', bg: 'bg-[#f84a46]' }
}
