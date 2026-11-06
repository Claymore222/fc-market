import type { ReactNode } from 'react'
import { BookOpen, CheckCircle2, Clock, FileCode2, FolderOpen, Gamepad2, Info, LifeBuoy, PlayCircle, Timer, Zap } from 'lucide-react'
import { useCareer } from '../App'
import { SCHEDULES } from '../components/AutomationSettings'
import { gameDate } from '../lib/format'

interface Script { file: string; when: string; how: 'autorun' | 'manual' | 'rare'; what: string; note?: string }

/** Live Editor script'leri: ne zaman, nasıl çalıştırılır (docs/save-import.md, docs/career-mods.md ve LE 27.1.x notlarına göre). */
const SCRIPTS: Script[] = [
  { file: 'fc_export.lua', how: 'autorun', when: 'Anahtar açıksa kendi çalışır',
    what: 'Oyuncu isimlerini ve kariyer verilerini FC Market\'e aktarır.' },
  { file: 'fc_export_manual.lua', how: 'manual', when: 'Otomatik senkron kapalıysa, veri almak istediğinde',
    what: 'Yalnız çalıştırdığın anda bir tam export alır, sonra kendiliğinden bir daha çalışmaz.',
    note: 'Otomatik senkronla birlikte kullanma.' },
  { file: 'fc_assets.lua', how: 'manual', when: 'İlk kurulumda, sonra yeni sezonda',
    what: 'Oyuncu yüzlerini, armaları ve bayrakları oyundan çıkarır. FC Market onları kendisi alır.' },
  { file: 'fc_minifaces.lua', how: 'rare', when: 'Yüzü eksik oyuncu kalırsa',
    what: 'Yüzü olmayan oyuncuları C:\\FCExport\\minifaces_report.txt dosyasına yazar. Varsayılan ayarda yüz üretmez, yalnız liste çıkarır.',
    note: 'Ayarlardan kurulmaz. Uygulama klasöründeki exporter\\lua içinden Live Editor\'ün lua\\scripts klasörüne kopyala.' },
]

const BADGE: Record<Script['how'], [string, string]> = {
  autorun: ['OTOMATİK', 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'],
  manual: ['ELLE', 'border-cmt-blurple/50 bg-cmt-blurple/15 text-indigo-200'],
  rare: ['GEREKİRSE', 'border-cmt-line bg-cmt-card text-gray-300'],
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2 text-sm text-gray-300">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cmt-blurple font-tektur text-[11px] font-black text-cmt-text">{i + 1}</span><span>{t}</span></li>
      ))}
    </ol>
  )
}

export function GuidePage() {
  const { save } = useCareer()
  const latest = save?.latest
  const box = 'rounded-xl border border-cmt-line bg-cmt-card p-5'
  const h = 'mb-3 flex items-center gap-2 font-tektur text-sm font-black uppercase tracking-wider text-cmt-text'
  return (
    <div className="guide-workspace workspace-roomy space-y-6 pt-2 page-enter">
      <section className={box}>
        <h2 className="mb-2 flex items-center gap-2 font-tektur text-lg font-black uppercase tracking-wider text-cmt-text"><BookOpen className="h-5 w-5 text-cmt-blurple" />LIVE EDITOR REHBERİ</h2>
        <p className="text-sm text-gray-400">FC Market oyunun kayıtlarını kendisi okur. Live Editor script'leri isimleri, yüzleri ve daha sık veriyi ekler.</p>
        {latest && (
          <p className="mt-3 flex items-center gap-2 text-xs text-gray-400">
            <Clock className="h-3.5 w-3.5" />Bu kariyerin son verisi: <strong className="text-gray-200">{gameDate(latest.gameDate)}</strong>
            · kaynak <strong className="text-gray-200">{latest.source === 'save' ? 'oyun kaydı' : 'Live Editor export\'u'}</strong>
          </p>
        )}
      </section>

      <section className={box}>
        <h3 className={h}><Zap className="h-4 w-4 text-[#ffd200]" />İLK KURULUM</h3>
        <Steps items={[
          'Oyun kapalıyken FC Market\'in üst çubuğundaki Ayarlar düğmesine bas.',
          'Klasör seç ile oyunu açtığın Live Editor klasörünü göster.',
          'Otomatik kariyer senkronu anahtarını aç. Altında "Açık" yazmalı.',
          'Export sıklığını seç. Oyunun takılıyorsa Aylık ya da 3 aylık seç.',
          'Görsel script\'i anahtarını aç.',
        ]} />
      </section>

      <section className={box}>
        <h3 className={h}><Gamepad2 className="h-4 w-4 text-cmt-blurple" />OYUNU AÇINCA NE OLUR</h3>
        <Steps items={[
          'Oyunu Live Editor ile aç. Script kendi başlar, senin çalıştırman gerekmez.',
          'Ana menüde bir şey yapmaz, kariyerinin yüklenmesini bekler.',
          'Kariyerde ilk gün geçince bir tam export alır. Oyun birkaç saniye takılabilir.',
          'Sonraki export\'lar seçtiğin sıklıkta gelir.',
          'Oyunu kaydet. FC Market açıksa kaydı ve export\'u kendisi alır.',
        ]} />
        <p className="mt-3 flex gap-1.5 text-xs text-gray-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Oyun kapalıyken hiçbir şey çalışmaz. Anahtarı oyun açıkken değiştirirsen oyunu yeniden başlat. Sıklık değişikliği bir sonraki oyun gününde geçerli olur.</p>
      </section>

      <section className={box}>
        <h3 className={h}><Timer className="h-4 w-4 text-cmt-blurple" />EXPORT SIKLIĞI</h3>
        <p className="mb-3 text-sm text-gray-400">Tam export bütün oyuncuları alır, biraz takılabilir. Hafif export yalnız kadronu, ligini ve izleme listeni alır.</p>
        <dl className="divide-y divide-cmt-line text-sm">
          {SCHEDULES.map(s => <div key={s.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:gap-4"><dt className="w-20 shrink-0 font-semibold text-gray-200">{s.label}</dt><dd className="text-gray-400">{s.detail}</dd></div>)}
        </dl>
      </section>

      <section className={box}>
        <h3 className={h}><FileCode2 className="h-4 w-4 text-cmt-blurple" />SCRIPT'LER</h3>
        <p className="mb-3 text-sm text-gray-400">Elle çalıştırmak için kariyer açıkken F8 → Features → Lua Engine yolunu izle ve script'i seç.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {SCRIPTS.map(s => (
            <article key={s.file} className="rounded-lg border border-cmt-line bg-cmt-sub p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <code className="font-mono text-sm font-bold text-cmt-text">{s.file}</code>
                <span className={`rounded-full border px-2 py-0.5 font-tektur text-[11px] font-bold tracking-wider ${BADGE[s.how][1]}`}>{BADGE[s.how][0]}</span>
              </div>
              <p className="mb-1 flex items-center gap-1.5 text-xs text-gray-400"><PlayCircle className="h-3.5 w-3.5" />{s.when}</p>
              <p className="text-sm text-gray-300">{s.what}</p>
              {s.note && <p className="mt-2 flex gap-1.5 text-xs text-gray-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{s.note}</p>}
            </article>
          ))}
        </div>
      </section>

      <section className={box}>
        <h3 className={h}><LifeBuoy className="h-4 w-4 text-cmt-blurple" />BİR ŞEY GELMEZSE</h3>
        <ul className="space-y-2 text-sm text-gray-300">
          <li><strong className="text-gray-100">Export gelmiyor:</strong> Ayarlar'da doğru Live Editor klasörü seçili mi bak ve oyunu yeniden başlat. Yine gelmezse fc_export_manual.lua'yı bir kez çalıştır.</li>
          <li><strong className="text-gray-100">Yüzler eksik:</strong> Kariyer açıkken fc_assets.lua'yı çalıştır ve biraz bekle.</li>
          <li><strong className="text-gray-100">Veri eski görünüyor:</strong> Oyunda kaydet. FC Market açık olmalı.</li>
        </ul>
      </section>

      <section className={box}>
        <h3 className={h}><CheckCircle2 className="h-4 w-4 text-emerald-400" />NE NEREDEN GELİR</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-gray-500"><tr><th className="py-1.5 pr-4">Veri</th><th className="py-1.5 pr-4">Yalnız kayıt</th><th className="py-1.5">Live Editor ile</th></tr></thead>
            <tbody className="divide-y divide-cmt-line text-gray-300">
              {[
                ['Kadro, özellikler, sözleşmeler', 'Var', 'Var'],
                ['Fikstür, sonuçlar, lig tablosu, sezon istatistikleri', 'Var', 'Var'],
                ['Transfer bütçesi', 'Var', 'Var'],
                ['Oyuncu isimleri', 'Daha önce alınmış export\'tan', 'Tam'],
                ['Yüz, arma, bayrak', 'Daha önce çıkarılanlar', 'Tam'],
                ['Günlük oyuncu değişimleri', 'Yok', 'Günlük ya da haftalık seçilirse'],
              ].map(([a, b, c]) => <tr key={a}><td className="py-2 pr-4">{a}</td><td className="py-2 pr-4 text-gray-400">{b}</td><td className="py-2 text-gray-400">{c}</td></tr>)}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500"><FolderOpen className="h-3.5 w-3.5" />Export klasörü: C:\FCExport · Oyun kayıtların değiştirilmez, yalnız kopyası okunur.</p>
      </section>
    </div>
  )
}
