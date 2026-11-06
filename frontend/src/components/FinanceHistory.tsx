import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ClubFinance } from '../api/types'
import { gameDate } from '../lib/format'
import { wageMoney } from './PlayerWage'
import { CareerIcon } from './CareerIcon'

/** Tam bilanço değil: yalnız seçili snapshot'ın içerdiği hareketler, toplulaştırma ve filtre. */
export function FinanceHistory({ finance, onClose }: { finance: ClubFinance; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [kind, setKind] = useState('all')
  const [direction, setDirection] = useState('all')
  const [month, setMonth] = useState('all')
  useEffect(() => {
    const el = ref.current!
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    el.showModal()
    return () => { el.close(); document.body.style.overflow = overflow; focused?.focus({ preventScroll: true }) }
  }, [])
  const source = finance.transactions
  const items = source.filter(t => (kind === 'all' || String(t.kind) === kind)
    && (month === 'all' || t.date.slice(0, 7) === month)
    && (direction === 'all' || (direction === 'income' ? t.amount >= 0 : t.amount < 0))).sort((a, b) => b.date.localeCompare(a.date))
  const income = items.reduce((n, t) => n + Math.max(0, t.amount), 0)
  const expense = items.reduce((n, t) => n + Math.max(0, -t.amount), 0)
  const kinds = [...new Map(source.map(t => [String(t.kind), t.label ?? `Tür ${t.kind ?? '?'}`])).entries()]
  const months = [...new Set(source.map(t => t.date.slice(0, 7)))].sort().reverse()
  const categories = finance.categories?.filter(c => c.income !== 0 || c.expense !== 0) ?? []
  return createPortal(<dialog ref={ref} className="season-calendar finance-history" aria-label="Kayıtlı finans hareketleri"
    onCancel={e => { e.preventDefault(); onClose() }} onClick={e => {
      if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose() }
    }}>
    <header className="season-calendar-header"><h2>KAYITLI FİNANS HAREKETLERİ</h2><button aria-label="Finans hareketlerini kapat" onClick={onClose}><CareerIcon name="close" /></button></header>
    <div className="season-calendar-body space-y-4">
      {categories.length > 0 && <section aria-label="Sezon finans toplamları" className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-300">SEZON TOPLAMLARI · KAYIT</h3>
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-cmt-line p-3 text-xs">
          {([['Gelir', categories.reduce((n, c) => n + c.income, 0)], ['Gider', categories.reduce((n, c) => n + c.expense, 0)],
            ['Net', categories.reduce((n, c) => n + c.income - c.expense, 0)]] as const).map(([name, value]) => <div key={name}><span className="text-gray-400">{name}</span><strong className="mt-1 block text-sm text-cmt-text">{wageMoney(value)}</strong></div>)}
        </div>
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-left text-gray-500"><tr><th className="p-2">Kategori</th><th className="p-2 text-right">Gelir</th><th className="p-2 text-right">Gider</th></tr></thead><tbody>
          {categories.map(c => <tr key={c.kind} className="border-t border-cmt-line"><td className="p-2">{c.label ?? `Tür ${c.kind}`}</td><td className="whitespace-nowrap p-2 text-right text-emerald-400">{wageMoney(c.income)}</td><td className="whitespace-nowrap p-2 text-right text-red-400">{wageMoney(c.expense)}</td></tr>)}
        </tbody></table></div>
        <p className="text-[11px] text-gray-500">Kayıttaki sezon kategori toplamları; alanlar DOĞRULANACAK. Adı çözülmeyen kategoriler tür koduyla gösterilir.</p>
      </section>}
      <h3 className="text-xs font-semibold text-gray-300">SON HAREKETLER</h3>
      <p className="text-xs leading-relaxed text-gray-400">Kayıtta bulunan {source.length} hareket. Aşağıdaki toplamlar yalnız bu sınırlı günlüğü kapsar.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-gray-400">Tür<select aria-label="Tür" className="field mt-1" value={kind} onChange={e => setKind(e.target.value)}><option value="all">Tüm türler</option>{kinds.map(([k, name]) => <option key={k} value={k}>{name}</option>)}</select></label>
        <label className="text-xs text-gray-400">Yön<select aria-label="Yön" className="field mt-1" value={direction} onChange={e => setDirection(e.target.value)}><option value="all">Gelir ve gider</option><option value="income">Gelir</option><option value="expense">Gider</option></select></label>
        <label className="text-xs text-gray-400">Ay<select aria-label="Ay" className="field mt-1" value={month} onChange={e => setMonth(e.target.value)}><option value="all">Tüm aylar</option>{months.map(m => <option key={m} value={m}>{m}</option>)}</select></label>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-cmt-line p-3 text-xs">
        {([['Gelir', income], ['Gider', expense], ['Net hareket', income - expense]] as const).map(([name, value]) => <div key={name}><span className="text-gray-400">{name}</span><strong className="mt-1 block break-words text-sm text-cmt-text">{wageMoney(value)}</strong></div>)}
      </div>
      <p className="text-xs text-gray-400">{items.length} hareket gösteriliyor</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Finans hareketleri</caption>
        <thead className="text-xs text-gray-500"><tr><th className="p-2">Tarih</th><th className="p-2">Tür</th><th className="p-2 text-right">Tutar (€)</th></tr></thead>
        <tbody>{items.map((t, i) => <tr key={i} className="border-t border-cmt-line"><td className="whitespace-nowrap p-2 text-gray-400">{gameDate(t.date)}</td><td className="p-2">{t.label ?? `Tür ${t.kind ?? '?'}`}</td><td className={`whitespace-nowrap p-2 text-right ${t.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{t.amount > 0 ? '+' : ''}{wageMoney(t.amount)}</td></tr>)}</tbody>
      </table></div>
      {!items.length && <p className="py-6 text-center text-sm text-gray-400">Bu filtrelerle kayıtlı hareket yok.</p>}
    </div>
  </dialog>, document.body)
}
