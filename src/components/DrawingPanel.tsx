import { useState } from 'react'
import { DRAW_COLORS, type Drawing } from '../lib/drawings'

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
      <h2>그리기</h2>

      <div className="panel-group">
        <button
          type="button"
          className={`draw-toggle${drawMode ? ' active' : ''}`}
          onClick={onToggleMode}
        >
          {drawMode ? '✓ 수평선 그리는 중 — 차트 클릭' : '＋ 수평선 그리기'}
        </button>

        <div className="draw-opts">
          <div className="swatches">
            {DRAW_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${c === drawColor ? ' active' : ''}`}
                style={{ background: c }}
                title={c}
                onClick={() => onColorChange(c)}
              />
            ))}
          </div>
          <label className="field draw-alert-opt">
            <input
              type="checkbox"
              checked={drawAlert}
              onChange={(e) => onAlertChange(e.target.checked)}
            />
            선 통과 시 알림
          </label>
        </div>

        <form className="alert-form" onSubmit={submit}>
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

      <ul className="alert-list">
        {mine.map((d) => (
          <li key={d.id} className={d.fired ? 'fired' : undefined}>
            <span className="draw-dot" style={{ background: d.color }} />
            <span className="alert-price">{d.price}</span>
            <button
              type="button"
              className={`bell${d.alert ? ' on' : ''}`}
              title={d.alert ? '알림 켜짐 (눌러서 끄기)' : '알림 꺼짐 (눌러서 켜기)'}
              onClick={() => onUpdate(d.id, { alert: !d.alert, fired: false })}
            >
              {d.alert ? '🔔' : '🔕'}
            </button>
            {d.fired && <span className="alert-badge">발동됨</span>}
            <button type="button" className="remove" onClick={() => onRemove(d.id)}>
              ✕
            </button>
          </li>
        ))}
        {mine.length === 0 && <li className="empty">그린 선이 없습니다.</li>}
      </ul>

      {mine.length > 0 && (
        <button type="button" className="clear-all" onClick={onClear}>
          {symbol} 선 모두 지우기
        </button>
      )}
    </section>
  )
}
