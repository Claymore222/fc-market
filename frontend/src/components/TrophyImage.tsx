import { useState } from 'react'
import { Trophy } from 'lucide-react'

/**
 * Oyundan çıkarılan kupa görseli (fc_trophies.lua → tools/assets → /api/competitions/{id}/trophy). Görsel yoksa ya da
 * kimlik bilinmiyorsa kupa ikonu gösterilir; internetten hiçbir şey çekilmez.
 */
export function TrophyImage({ id, name, size = 32 }: { id?: number | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (id == null || failed) return <Trophy aria-hidden style={{ width: size * 0.6, height: size * 0.6 }} className="shrink-0 text-[#ffd200]" />
  return <img src={`/api/competitions/${id}/trophy`} alt={name} width={size} height={size} loading="lazy"
    className="shrink-0 object-contain" style={{ width: size, height: size }} onError={() => setFailed(true)} />
}
