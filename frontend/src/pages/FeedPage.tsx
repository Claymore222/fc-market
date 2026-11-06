import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useFeed } from '../api/client'
import type { FeedItem, FeedType } from '../api/types'
import { useCareer, useSaveUid } from '../App'
import { EmptyHint } from '../components/EmptyHint'
import { PlayerDrawer } from '../components/PlayerDrawer'
import { gameDate, money, num, signed } from '../lib/format'
import { EVENT_LABELS, t, type MessageKey } from '../lib/i18n'
import { useSelectedPlayer } from '../lib/selection'

const TYPES: FeedType[] = ['transfer', 'growth', 'potential', 'contract', 'decline', 'new', 'retired', 'event']
/** Event'ler oyuncu bilgisi taşımadığı için varsayılan kapalı. */
const DEFAULT_TYPES = TYPES.filter((x) => x !== 'event')
const DEFAULT_KEY = DEFAULT_TYPES.join(',')

export function FeedPage() {
  const saveUid = useSaveUid()
  const career = useCareer()
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useSelectedPlayer()
  const types = params.get('types')
  const season = params.get('season')
  const watched = params.get('watched') === '1'
  const myLeague = params.get('myLeague') === '1'
  const active = new Set<FeedType>(types ? (types.split(',') as FeedType[]) : DEFAULT_TYPES)

  const feed = useFeed(
    {
      types: types ?? DEFAULT_KEY,
      season: season ?? undefined,
      watchedOnly: watched ? 'true' : undefined,
      myLeague: myLeague ? 'true' : undefined,
    },
    saveUid,
  )

  const set = (key: string, value: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === null) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })

  const toggleType = (type: FeedType) => {
    const next = new Set(active)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    const key = TYPES.filter((x) => next.has(x)).join(',')
    set('types', next.size === 0 || key === DEFAULT_KEY ? null : key)
  }

  // Oyun gününe göre grupla (API zaten tarihe göre azalan sırada).
  const days = useMemo(() => {
    const map = new Map<string, FeedItem[]>()
    for (const item of feed.data?.items ?? []) {
      const list = map.get(item.date) ?? []
      list.push(item)
      map.set(item.date, list)
    }
    return [...map.entries()]
  }, [feed.data])

  const data = feed.data
  const seasons = data?.seasons ?? []
  return (
    <div className="page feed-workspace workspace-roomy page-enter">
      <div className="toolbar wrap">
        <span className="count">{t('feed.title')}</span>
        <div className="chips">
          {TYPES.map((type) => (
            <button
              key={type}
              className={`chip${active.has(type) ? ' on' : ''}`}
              aria-pressed={active.has(type)}
              onClick={() => toggleType(type)}
            >
              {t(`feed.type.${type}` as MessageKey)}
            </button>
          ))}
        </div>
        {seasons.length > 0 && (
          <div className="chips" role="group" aria-label="Sezon seçimi">
            <button
              type="button"
              className={`chip${!season ? ' on' : ''}`}
              aria-pressed={!season}
              onClick={() => set('season', null)}
            >
              Tüm Sezonlar
            </button>
            {seasons.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip${season === s ? ' on' : ''}`}
                aria-pressed={season === s}
                onClick={() => set('season', season === s ? null : s)}
              >
                {s}{s === data?.currentSeason ? ' (Bu Sezon)' : ''}
              </button>
            ))}
          </div>
        )}
        <span className="spacer" />
        <label className="check">
          <input type="checkbox" checked={watched} onChange={(e) => set('watched', e.target.checked ? '1' : null)} /> {t('feed.watchedOnly')}
        </label>
        <label className="check">
          <input type="checkbox" checked={myLeague} onChange={(e) => set('myLeague', e.target.checked ? '1' : null)} /> {t('feed.myLeague')}
        </label>
      </div>
      <div className="page-body feed">
        {feed.isError ? (
          <p className="error pad">{t('table.error', { error: (feed.error as Error).message })}</p>
        ) : !data ? (
          <p className="muted pad">{t('table.loading')}</p>
        ) : data.snapshotCount < 2 && days.length === 0 ? (
          <EmptyHint text={t('feed.needTwo')}>
            <div className="flex w-full flex-col items-center gap-3">
              {career.save && career.save.branches.length > 1 && <div className="max-w-xl text-sm text-gray-400">
                <p>Seçili geçmiş: Dal {career.branch?.branch ?? '–'}. Bu kariyerin {career.save.branches.length} ayrı dalı var.</p>
                {career.branch?.parentBranch == null && <p>Önceki dal bağlantısı doğrulanmadığı için diğer dalların geçmişi buraya katılmıyor.</p>}
              </div>}
              <div className="flex flex-wrap justify-center gap-2">
                {career.openLauncher && <button type="button" className="btn" onClick={career.openLauncher}>Kayıt yuvalarını incele</button>}
                <Link className="btn" to="/guide">Rehberi aç</Link>
              </div>
            </div>
          </EmptyHint>
        ) : days.length === 0 ? (
          <EmptyHint text={t('feed.empty')}>{(types || season || watched || myLeague) && <button type="button" className="btn" onClick={() => setParams({}, { replace: true })}>Filtreleri sıfırla</button>}</EmptyHint>
        ) : (
          <>
            {data.snapshotCount < 2 && (
              <p className="muted pad small">
                Bu kariyerde henüz tek anlık görüntü (snapshot) bulunduğu için akışta kayıt dosyasından çözülen sezon içi transferler listeleniyor. OVR/potansiyel gelişimi, sözleşme yenileme ve düşüş haberleri kariyerde zaman ilerleyip yeni kayıt alındıkça eklenecek.
              </p>
            )}
            {data.total > data.items.length && (
              <p className="muted pad">{t('feed.more', { shown: num(data.items.length), total: num(data.total) })}</p>
            )}
            {days.map(([date, items]) => (
              <section key={date} className="feed-day">
                <h3 className="feed-date">{gameDate(date)}</h3>
                <ul>
                  {items.map((item, i) => (
                    <FeedRow key={`${item.type}-${item.playerId ?? item.event}-${i}`} item={item} onOpen={setSelected} />
                  ))}
                </ul>
              </section>
            ))}
            {active.has('event') && <p className="muted pad small">{t('feed.eventNote')}</p>}
          </>
        )}
      </div>
      {selected !== null && <PlayerDrawer playerId={selected} saveUid={saveUid} onClose={() => setSelected(null)} />}
    </div>
  )
}

function describe(item: FeedItem): string {
  const vars = { before: item.before ?? '–', after: item.after ?? '–', from: item.fromClub ?? '–', to: item.toClub ?? '–' }
  const change = item.before !== null && item.after !== null ? ` (${signed(item.after - item.before)})` : ''
  switch (item.type) {
    case 'transfer': return t('feed.transfer', vars)
    case 'growth':
    case 'decline': return t('feed.growth', vars) + change
    case 'potential': return t('feed.potential', vars) + change
    case 'contract': return t('feed.contract', vars)
    case 'new': return t('feed.new', vars)
    case 'retired': return t('feed.retired', vars)
    default: return ''
  }
}

function FeedRow({ item, onOpen }: { item: FeedItem; onOpen: (id: number) => void }) {
  // Ayrılan oyuncu son snapshot'ta yok, detayı açılamaz.
  const clickable = item.playerId !== null && item.type !== 'retired'
  const club = item.type === 'transfer' || item.type === 'retired' ? null : item.toClub
  return (
    <li className={`feed-item${item.shortlisted || item.userTeam ? ' watched' : ''}`}>
      <span className={`feed-type t-${item.type}`}>{t(`feed.type.${item.type}` as MessageKey)}</span>
      {item.type === 'event' ? (
        <span className="feed-text">
          {EVENT_LABELS[item.event ?? ''] ?? item.event}
          {item.count > 1 && <span className="muted"> ×{item.count}</span>}
        </span>
      ) : (
        <span className="feed-text">
          {clickable ? (
            <button className="link-btn" onClick={() => onOpen(item.playerId!)}><strong>{item.playerName}</strong></button>
          ) : (
            <strong>{item.playerName}</strong>
          )}
          {club && <span className="muted"> · {club}</span>}
          <span className="feed-what">{describe(item)}</span>
          {item.type === 'transfer' && item.fee != null && (
            <span className="muted"> · <strong>{item.fee > 0 ? money(item.fee) : 'Bedelsiz'}</strong>{item.wage != null && item.wage > 0 ? ` (${money(item.wage)}/hf)` : ''}</span>
          )}
          {item.league && item.type === 'transfer' && <span className="muted"> · {item.league}</span>}
        </span>
      )}
      {item.shortlisted && <span className="tag star-tag">★ {t('feed.shortlisted')}</span>}
      {item.userTeam && <span className="tag">{t('feed.userTeam')}</span>}
    </li>
  )
}
