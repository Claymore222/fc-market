import { useCareer } from '../App'
import { useRegens } from '../api/client'
import { gameDate } from '../lib/format'
import { useSelectedPlayer } from '../lib/selection'
import { PlayerAvatar } from './cmt'
import { PlayerDrawer } from './PlayerDrawer'

/** Emekli olduğu görülen oyuncular ve regen izi taşıyan yeni oyuncular. EA'nın bağı kayıtta yok, sonuç olasılıktır. */
export function RegenList() {
  const { key } = useCareer()
  const regens = useRegens(key ?? undefined)
  const [selected, setSelected] = useSelectedPlayer()
  const report = regens.data
  return (
    <section className="space-y-3 pt-3" aria-label="Regen dedektörü">
      <p className="text-sm text-gray-400">Kaybolan yaşlı oyuncularla aynı ülke, doğum günü ve mevkiye sahip, POT'u yakın yeni oyuncular. EA bu bağı açık tutmuyor; adaylar olası eşleşmedir.</p>
      {regens.isPending && <p role="status" className="text-sm text-gray-400">Kariyer taranıyor…</p>}
      {regens.isError && <p role="alert" className="text-sm text-red-300">Regen listesi okunamadı.</p>}
      {report && report.matches.length === 0 && <p className="rounded-lg border border-cmt-line bg-cmt-card p-4 text-sm text-gray-300">
        {report.baselineDate ? `${gameDate(report.baselineDate)} tarihinden beri ${report.departed} oyuncu ayrıldı, regen adayı bulunamadı.` : 'Karşılaştırma için bu kariyerde en az iki kayıt ya da export gerekiyor.'}
      </p>}
      {report?.matches.map(m => (
        <article key={m.id} className="rounded-lg border border-cmt-line bg-cmt-card p-4">
          <h3 className="text-sm font-semibold text-cmt-text">{m.name}</h3>
          <p className="mt-0.5 text-xs text-gray-400">{[m.position, m.nation, m.birthDate && gameDate(m.birthDate)].filter(Boolean).join(' · ')} · OVR {m.overall ?? '–'} · POT {m.potential ?? '–'}</p>
          <ul className="mt-3 grid gap-2">
            {m.candidates.map(c => (
              <li key={c.id}>
                <button type="button" className="flex w-full items-center gap-3 rounded-lg border border-cmt-line bg-cmt-sub px-3 py-2 text-left text-sm text-gray-200" onClick={() => setSelected(c.id)}>
                  <PlayerAvatar id={c.id} name={c.name} size={32} />
                  <span className="min-w-0 flex-1 truncate"><strong>{c.name}</strong><span className="block truncate text-xs text-gray-400">{[c.position, c.age && `${c.age} yaş`, c.club].filter(Boolean).join(' · ')}</span></span>
                  <span className="font-mono text-xs text-gray-300">{c.overall ?? '–'} / {c.potential ?? '–'}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${c.confidence === 'Güçlü' ? 'border-emerald-500/40 text-emerald-300' : 'border-cmt-line text-gray-300'}`}>{c.confidence}</span>
                </button>
              </li>
            ))}
          </ul>
        </article>
      ))}
      {selected !== null && <PlayerDrawer playerId={selected} saveUid={key ?? undefined} onClose={() => setSelected(null)} />}
    </section>
  )
}
