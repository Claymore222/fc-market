import { useState } from 'react'
import { chooseTheme, currentTheme, THEMES } from '../lib/theme'

export function ThemePicker() {
  const [active, setActive] = useState(currentTheme())
  return <section className="theme-picker" aria-labelledby="theme-picker-title">
    <h3 id="theme-picker-title">Görünüm</h3>
    <div role="radiogroup" aria-labelledby="theme-picker-title">
      {THEMES.map(t => <label key={t.id} className={active === t.id ? 'is-active' : ''}>
        <input type="radio" name="fc-theme" value={t.id} checked={active === t.id} onChange={() => { setActive(t.id); void chooseTheme(t.id) }} />
        <span className="theme-swatch" aria-hidden="true" style={{ background: t.colors[0] }}><i style={{ background: t.colors[2] }} /><b style={{ background: t.colors[1] }} /></span>
        <strong>{t.name}</strong><small>{t.caption}</small>
      </label>)}
    </div>
  </section>
}
