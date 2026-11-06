import type { MarketPlayer } from '../api/types'

export const displayedWage = (p: MarketPlayer) => p.wage ?? p.recordedWage ?? null
const wageNumber = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
export const wageMoney = (v: number | null | undefined) => v == null ? '–' : `${wageNumber.format(v)} €`
export const RECORDED_WAGE_NOTE = 'Serbest oyuncunun kayıtta tutulan haftalık maaşıdır. Aktif sözleşme veya istediği maaş anlamına gelmez.'

export function PlayerWage({ player: p }: { player: MarketPlayer }) {
  const recorded = p.isFreeAgent && p.wage === null && p.recordedWage != null
  return <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1" title={recorded ? RECORDED_WAGE_NOTE : 'Haftalık maaş'}>
    <span className="num whitespace-nowrap">{wageMoney(displayedWage(p))}</span>
    {recorded && <small className="text-[11px] font-normal text-amber-300">kayıt</small>}
  </span>
}
