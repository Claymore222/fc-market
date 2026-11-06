import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { SquadMember } from '../api/types'
import { PlayerAvatar, RatingChip, SLOT_XY, surname } from './cmt'
import { money } from '../lib/format'
import { lineupDepth, slotPosition } from '../lib/lineupDepth'
import { useHoverPanel } from '../lib/useHoverPanel'

interface Props {
  members: SquadMember[]; squad?: SquadMember[]; open: (id: number) => void; captainId?: number; potential?: boolean
  hovered?: number | null; onHover?: (id: number | null) => void
}

export function LineupPitch({ members, squad = members, ...props }: Props) {
  return <div className="lineup-pitch" aria-label="İlk 11 saha yerleşimi">
    <div className="lineup-grass" aria-hidden="true"><div className="lineup-markings">
      <span className="lineup-half" /><span className="lineup-circle" />
      <span className="lineup-area top" /><span className="lineup-area bottom" />
      <span className="lineup-six top" /><span className="lineup-six bottom" />
    </div></div>
    {members.map(m => <LineupMarker key={m.player.id} member={m} squad={squad} {...props} />)}
  </div>
}

function LineupMarker({ member: m, squad, open, captainId, potential = true, hovered, onHover }: Omit<Props, 'members'> & { member: SquadMember; squad: SquadMember[] }) {
  const h = useHoverPanel()
  const touch = useRef(false)
  const p = m.player
  const [x, y] = SLOT_XY[m.slot ?? ''] ?? [50, 50]
  const position = slotPosition(m.slot) ?? p.position
  const depth = lineupDepth(m, squad)
  useEffect(() => {
    if (!h.open) return
    onHover?.(p.id)
    return () => onHover?.(null)
  }, [h.open, onHover, p.id])
  const detail = (id: number) => { h.hide(); h.anchor.current?.focus({ preventScroll: true }); open(id) }
  return <div className={`lineup-player ${hovered === p.id || h.open ? 'is-highlighted' : ''}`}
    style={{ left: `${x}%`, top: `${10 + y * .82}%` }}>
    <button ref={h.anchor} type="button" className="lineup-player-button" aria-label={`${p.name} · ${m.slot ?? p.position}`}
      aria-haspopup="dialog" aria-expanded={h.open} aria-controls={h.open ? h.id : undefined}
      onPointerEnter={e => { if (e.pointerType !== 'touch') h.reset() }} onPointerLeave={h.leave}
      onPointerDown={e => { touch.current = e.pointerType === 'touch' }}
      onFocus={h.show} onBlur={h.blur}
      onClick={() => touch.current ? h.reset() : detail(p.id)}
      onKeyDown={e => {
        touch.current = false
        if (e.key === 'ArrowDown') {
          e.preventDefault(); h.reset()
          requestAnimationFrame(() => h.panel.current?.querySelector('button')?.focus())
        }
      }}>
      <span className="lineup-face"><PlayerAvatar id={p.id} name={p.name} size={38} ring="border-2 border-cmt-blurple" />
        <span className="lineup-rating left"><small>OVR</small><RatingChip value={p.overall} size="sm" /></span>
        {potential && <span className="lineup-rating right"><small>POT</small><RatingChip value={p.potential} size="sm" /></span>}
      </span>
      <span className="lineup-name">{surname(p.name)}{captainId === p.id ? ' (C)' : ''}</span>
    </button>
    {h.open && createPortal(<div ref={h.panel} id={h.id} role="dialog" aria-modal="false" aria-label={`${p.name} · ${position} yedekleri`}
      className="lineup-preview lineup-depth-preview" style={h.position} onPointerEnter={h.cancel} onPointerLeave={h.leave}
      onFocusCapture={h.cancel} onBlurCapture={h.blur}>
      <button className="lineup-preview-player" onClick={() => detail(p.id)} aria-label={`${p.name} detayını aç`}>
        <PlayerAvatar id={p.id} name={p.name} size={52} />
        <div><strong>{p.name}</strong><span>{p.position ?? '–'} · {p.age ?? '–'} yaş · {money(p.value)}</span>
          <div className="lineup-preview-ratings"><RatingChip value={p.overall} title="Genel reyting" /><RatingChip value={p.potential} title="Potansiyel" /></div></div>
      </button>
      <div className="lineup-depth-heading"><b>{position ?? 'Mevki'} ALTERNATİFLERİ</b><span>OVR / POT</span></div>
      {depth.length ? <ul className="lineup-depth-list">{depth.map(backup => <li key={backup.player.id}>
        <button onClick={() => detail(backup.player.id)} aria-label={`${backup.player.name} detayını aç`}>
          <PlayerAvatar id={backup.player.id} name={backup.player.name} size={28} />
          <span className="lineup-depth-name"><b>{backup.player.name}</b><small>{backup.player.position ?? '–'} · {backup.role === 'Sub' ? 'Yedek' : 'Rezerv'}{backup.injured ? ' · Sakatlık işareti' : ''}</small></span>
          <RatingChip value={backup.player.overall} size="sm" /><RatingChip value={backup.player.potential} size="sm" />
        </button>
      </li>)}</ul> : <p className="lineup-depth-empty">Bu mevkide kayıtlı yedek/rezerv yok.</p>}
      <p className="lineup-depth-note">Ana ve ek mevkiler · genel reytinge göre</p>
    </div>, document.body)}
  </div>
}
