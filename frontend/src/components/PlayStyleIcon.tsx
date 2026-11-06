import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { PLAY_STYLES } from '../lib/playstyles'

/** EA'nın PlayStyle rozeti: API ilk istekte EA'dan indirip (SHA-256 kontrollü) yerelde saklar. Kaynak: config/playstyle-assets.json. */
export function PlayStyleIcon({ plus = false, size = 16, name }: { category?: string; plus?: boolean; size?: number; name?: string }) {
  const english = name ? PLAY_STYLES[name]?.en : undefined
  const slug = english?.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const src = slug ? `/api/playstyles/${slug}${plus ? '-plus' : ''}` : undefined
  const [failed, setFailed] = useState<string>()
  return <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-hidden="true">
    {src && src !== failed ? <img src={src} width={size} height={size} alt="" draggable={false}
      className="h-full w-full object-contain" onError={() => setFailed(src)} />
      : <HelpCircle size={size} className={plus ? 'text-amber-300' : 'text-gray-400'} />}
  </span>
}
