import { useState } from 'react'
import { DRAW_COLORS, type Drawing } from '../lib/drawings'
import { Icon } from './Icon'

interface DrawingPanelProps {
  symbol: string
  drawings: Drawing[]
  drawMode: boolean
  drawColor: string
  drawAlert: boolean
  onToggleMode: () => void
  onColorChange: (color: string) => void
  onAlertChange: (alert: boolean) => void
  onAdd: (price: number) => void
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: Partial<Drawing>) => void
  onClear: () => void
}

export function DrawingPanel({
  symbol,
  drawings,
  drawMode,
  drawColor,
  drawAlert,
  onToggleMode,
  onColorChange,
  onAlertChange,
  onAdd,
  onRemove,
  onUpdate,
  onClear,
}: DrawingPanelProps) {
  const [price, setPrice] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = Number(price)
    if (!Number.isFinite(value) || value <= 0) return
    onAdd(value)
    setPrice('')
  }

  const mine = drawings.filter((d) => d.symbol === symbol)

  return (
    <section className="panel">
      <div className="panel-group">
        <button
          type="button"
          className={`cta draw-toggle${drawMode ? ' active' : ''}`}
          onClick={onToggleMode}
        >
          <Icon name={drawMode ? 'check' : 'plus'} size={16} />
          {drawMode ? '차트를 눌러 선을 놓으세요' : '수평선 그리기'}
        </button>

        <div className="draw-opts">
          <div className="swatches" role="group" aria-label="선 색상">
            {DRAW_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${c === drawColor ? ' active' : ''}`}
                style={{ '--swatch': c } as React.CSSProperties}
                title={c}
                aria-label={`선 색상 ${c}`}
                aria-pressed={c === drawColor}
                onClick={() => onColorChange(c)}
              />
            ))}
          </div>
          <label className="switch-row">
            <span>선을 지날 때 알림</span>
            <input
              type="checkbox"
              className="switch"
              checked={drawAlert}
              onChange={(e) => onAlertChange(e.target.checked)}
            />
          </label>
        </div>

        <form className="inline-form" onSubmit={submit}>
          <input
            type="number"
            step="any"
            min="0"
            placeholder="가격 직접 입력"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <button type="submit">추가</button>
        </form>
      </div>

      <ul className="row-list">
        {mine.map((d) => (
          <li key={d.id} className={d.fired ? 'fired' : undefined}>
            <span className="draw-dot" style={{ background: d.color }} />
            <span className="row-value">{d.price}</span>
            <button
              type="button"
              className={`icon-btn bell${d.alert ? ' on' : ''}`}
              title={d.alert ? '알림 켜짐 (눌러서 끄기)' : '알림 꺼짐 (눌러서 켜기)'}
              aria-label={d.alert ? '알림 끄기' : '알림 켜기'}
              onClick={() => onUpdate(d.id, { alert: !d.alert, fired: false })}
            >
              <Icon name={d.alert ? 'bell' : 'bellOff'} size={15} />
            </button>
            {d.fired && <span className="tag">발동됨</span>}
            <button
              type="button"
              className="icon-btn remove"
              aria-label="선 지우기"
              onClick={() => onRemove(d.id)}
            >
              <Icon name="close" size={15} />
            </button>
          </li>
        ))}
        {mine.length === 0 && <li className="empty">그린 선이 없습니다.</li>}
      </ul>

      {mine.length > 0 && (
        <button type="button" className="ghost-btn" onClick={onClear}>
          <Icon name="trash" size={15} />
          {symbol.replace('USDT', '')} 선 모두 지우기
        </button>
      )}
    </section>
  )
}
