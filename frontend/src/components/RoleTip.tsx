import type { PlayerRole } from '../api/types'
import guides from '../../../config/role-guides.json'
import { InfoTip } from './InfoTip'

interface Guide { description: string; focuses: { name: string; zones: string[] }[] }
const roles: Record<string, Guide> = guides.roles

export function RoleTip({ role }: { role: PlayerRole }) {
  const guide = roles[String(role.code % 100)]
  const level = role.level >= 2 ? '++' : '+'
  return <InfoTip title={`${role.name} ${role.position ?? ''} ${level}`.trim()} heading={`${role.name} ${level}`}
    triggerClassName="player-role-button" panelClassName="role-popover" placement="right" trigger={<>
      <span className="role-name">{role.name}</span><span className={`role-level ${role.level >= 2 ? 'is-expert' : ''}`}>{level}</span>
      <span className="role-focuses">{[role.position, guide?.focuses.map(f => f.name).join(' · ')].filter(Boolean).join(' · ')}</span>
    </>}>
    <p className="role-popover-position">{role.position ?? 'Mevki bilinmiyor'} · {role.level >= 2 ? 'Üst düzey rol aşinalığı' : 'Gelişmiş rol aşinalığı'}</p>
    <p className="role-description">{guide?.description ?? 'Bu rol kodunun ayrıntılı açıklaması henüz eşlenmedi.'}</p>
    {!!guide?.focuses.length && <>
      <div className="role-pitches">{guide.focuses.map(f => <figure key={f.name} aria-label={`Odak: ${f.name}`}>
        <svg viewBox="0 0 160 216" aria-hidden="true">
          <rect x="0" y="0" width="160" height="216" rx="4" fill="var(--fc-inset)" />
          {f.zones.flatMap((row, y) => [...row].map((level, x) => <rect key={`${y}-${x}`} x={x * 32 + 1.5} y={y * 43.2 + 1.5} width="29" height="40.2" rx="2"
            fill={['var(--fc-inset)', 'var(--fc-hover)', 'var(--fc-border-strong)', 'var(--fc-accent)'][Number(level)]} />))}
          <g fill="none" stroke="var(--fc-border-strong)" strokeOpacity=".35"><rect x="1" y="1" width="158" height="214" rx="3" />
            <path d="M1 108h158M40 1v30h80V1M62 1v11h36V1M40 215v-30h80v30M62 215v-11h36v11" /><circle cx="80" cy="108" r="18" /></g>
        </svg><figcaption>Odak: {f.name}</figcaption>
      </figure>)}</div>
      <div className="role-zone-legend"><span><i />Ana bölge</span><span><i />İkincil bölge</span></div>
      <p className="role-map-note">Şematik rol bölgeleri; seçili taktik veya oyuncunun gerçek ısı haritası değildir.</p>
    </>}
    <p className="role-familiarity">{level} {role.level >= 2 ? 'Bu rolde en yüksek aşinalık seviyesi.' : 'Oyuncunun iyi tanıdığı bir rol.'} Rol aşinalığı, genel reyting ve mevki uyumundan ayrıdır.</p>
  </InfoTip>
}
