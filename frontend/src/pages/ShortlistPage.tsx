import { useEffect, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useShortlist, useShortlistMutations } from '../api/client'
import type { ShortlistItem } from '../api/types'
import { useSaveUid } from '../App'
import { Delta, Position, Rating } from '../components/Badges'
import { EmptyHint } from '../components/EmptyHint'
import { PlayerDrawer } from '../components/PlayerDrawer'
import { StarButton } from '../components/StarButton'
import { gameDate, money, num } from '../lib/format'
import { t } from '../lib/i18n'
import { useSelectedPlayer } from '../lib/selection'

/** "12,5" → 12.500.000 €; boş → null; geçersiz → undefined. */
function parseMillions(s: string): number | null | undefined {
  const v = s.trim().replace(',', '.')
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1_000_000) : undefined
}
const millions = (v: number | null) => (v === null ? '' : String(v / 1_000_000).replace('.', ','))

export function ShortlistPage() {
  const saveUid = useSaveUid()
  const list = useShortlist(saveUid)
  const [selected, setSelected] = useSelectedPlayer()
  const view = list.data
  const budget = view?.snapshot.transferBudget ?? null
  const remaining = budget === null || !view ? null : budget - view.targetPriceTotal

  return (
    <div className="page shortlist-workspace workspace-roomy page-enter">
      <div className="toolbar">
        <span className="count num">{t('shortlist.count', { n: num(view?.count ?? 0) })}</span>
        <span className="spacer" />
        <div className="fact"><span className="label">{t('shortlist.targetTotal')}</span><b className="num">{money(view?.targetPriceTotal)}</b></div>
        <div className="fact"><span className="label">{t('shortlist.budget')}</span><b className="num">{money(budget)}</b></div>
        <div className="fact">
          <span className="label">{t('shortlist.remaining')}</span>
          <b className={`num${remaining !== null && remaining < 0 ? ' expiring' : ''}`}>{money(remaining)}</b>
        </div>
      </div>
      <div className="page-body">
        {list.isError ? (
          <p className="error pad">{t('table.error', { error: (list.error as Error).message })}</p>
        ) : !view ? (
          <p className="muted pad">{t('table.loading')}</p>
        ) : view.items.length === 0 ? (
          <EmptyHint text={t('shortlist.empty')}><Link className="btn" to="/scout">Scout'ta ara</Link><Link className="btn" to="/transfer">Transfer önerileri</Link></EmptyHint>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th />
                <th>{t('shortlist.col.player')}</th>
                <th>{t('col.pos')}</th>
                <th className="right">{t('col.age')}</th>
                <th className="center">{t('col.ovr')}</th>
                <th className="center">{t('col.pot')}</th>
                <th className="right">{t('col.value')}</th>
                <th className="right">{t('col.contract')}</th>
                <th>{t('shortlist.col.target')}</th>
                <th>{t('shortlist.col.tags')} <span className="muted">({t('shortlist.tagsHint')})</span></th>
                <th>{t('shortlist.col.note')}</th>
                <th className="right">{t('shortlist.col.added')}</th>
              </tr>
            </thead>
            <tbody>
              {view.items.map((item) => (
                <Row
                  key={item.playerId}
                  item={item}
                  seasonEndYear={view.snapshot.seasonEndYear}
                  active={item.playerId === selected}
                  onOpen={() => item.player && setSelected(item.playerId)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      {selected !== null && <PlayerDrawer playerId={selected} saveUid={saveUid} onClose={() => setSelected(null)} />}
    </div>
  )
}

interface RowProps {
  item: ShortlistItem
  seasonEndYear: number
  active: boolean
  onOpen: () => void
}

function Row({ item, seasonEndYear, active, onOpen }: RowProps) {
  const saveUid = useSaveUid()
  const { update } = useShortlistMutations(saveUid)
  const p = item.player
  const [target, setTarget] = useState(millions(item.targetPrice))
  const [tags, setTags] = useState(item.tags.join(', '))
  const [note, setNote] = useState(item.note ?? '')

  // Sunucudan yeni değer gelince alanları eşitle.
  const tagKey = item.tags.join('\u0000')
  useEffect(() => {
    setTarget(millions(item.targetPrice))
    setTags(item.tags.join(', '))
    setNote(item.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.targetPrice, tagKey, item.note])

  // Alandan çıkınca ya da Enter'da kaydet; değişiklik yoksa istek atma.
  const save = () => {
    const price = parseMillions(target)
    if (price === undefined) {
      setTarget(millions(item.targetPrice))
      return
    }
    const edit = { note: note.trim() || null, tags: tags.split(',').map((x) => x.trim()).filter(Boolean), targetPrice: price }
    if (edit.note === item.note && edit.targetPrice === item.targetPrice && edit.tags.join('\u0000') === tagKey) return
    update.mutate({ id: item.playerId, edit })
  }
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  const expiring = p?.contractEnd != null && p.contractEnd <= seasonEndYear
  return (
    <tr className={`${active ? 'active' : ''}${p ? '' : ' gone'}`}>
      <td className="center"><StarButton playerId={item.playerId} /></td>
      <td className="name">
        <button className="link-btn" onClick={onOpen} disabled={!p}><strong>{item.name}</strong></button>
        <small>
          {p ? [p.club, p.league].filter(Boolean).join(' · ') || '–' : t('shortlist.gone')}
          {item.clubChanged && (
            <span className="tag warn" title={t('shortlist.clubChanged', { club: item.addedClub ?? '–' })}>↔ {item.addedClub ?? '–'}</span>
          )}
        </small>
        {update.isError && <small className="error-inline">{t('shortlist.saveError', { error: (update.error as Error).message })}</small>}
      </td>
      <td>{p ? <Position label={p.position} group={p.positionGroup} /> : '–'}</td>
      <td className="right num">{num(p?.age)}</td>
      <td className="center">
        <span className="ovr-cell" title={t('shortlist.col.sinceAdded')}>
          <span className="delta" />
          <Rating value={p?.overall ?? item.addedOverall} />
          <Delta value={item.overallChange} />
        </span>
      </td>
      <td className="center"><Rating value={p?.potential ?? item.addedPotential} /></td>
      <td className="right num">{money(p?.value)}</td>
      <td className={`right num${expiring ? ' expiring' : ''}`}>{p?.isFreeAgent ? p.club : p?.contractEnd ?? '–'}</td>
      <td>
        <input className="field num narrow" inputMode="decimal" value={target}
          onChange={(e) => setTarget(e.target.value)} onBlur={save} onKeyDown={onEnter} />
      </td>
      <td><input className="field" value={tags} onChange={(e) => setTags(e.target.value)} onBlur={save} onKeyDown={onEnter} /></td>
      <td>
        <input className="field wide" value={note} maxLength={500}
          onChange={(e) => setNote(e.target.value)} onBlur={save} onKeyDown={onEnter} />
      </td>
      <td className="right muted">{item.addedGameDate ? gameDate(item.addedGameDate) : '–'}</td>
    </tr>
  )
}
