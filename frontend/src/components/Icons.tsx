// Küçük çizgi ikonlar (harici kütüphane yok, uygulama tamamen çevrimdışı çalışır).
import type { SVGProps } from 'react'

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24' } as const
type P = SVGProps<SVGSVGElement>

export const PitchIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <line x1="12" y1="4" x2="12" y2="20" />
    <circle cx="12" cy="12" r="3" />
    <path d="M3 9h3v6H3M21 9h-3v6h3" />
  </svg>
)
export const SearchIcon = (p: P) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
)
export const SunIcon = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
)
export const MoonIcon = (p: P) => (
  <svg {...base} {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></svg>
)
export const AlertIcon = (p: P) => (
  <svg {...base} {...p}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17.5v.01" /></svg>
)
export const RefreshIcon = (p: P) => (
  <svg {...base} {...p}><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg>
)
export const ColumnsIcon = (p: P) => (
  <svg {...base} {...p}><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M9 4v16M15 4v16" /></svg>
)
export const FilterIcon = (p: P) => (
  <svg {...base} {...p}><path d="M3 5h18M6 12h12M10 19h4" /></svg>
)
export const CloseIcon = (p: P) => (
  <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
)
export const StarIcon = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base} {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
  </svg>
)
