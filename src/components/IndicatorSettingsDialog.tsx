import { Dialog } from './ui/Dialog'
import { INDICATOR_DEFS, type IndicatorInstance } from '../lib/indicatorConfig'
import './indicators.css'

interface IndicatorSettingsDialogProps {
  instance: IndicatorInstance
  onChange: (next: IndicatorInstance) => void
  onClose: () => void
}

/** 지표 파라미터·색·표시 여부를 편집한다(⚙ 버튼에서 열림). */
export function IndicatorSettingsDialog({ instance, onChange, onClose }: IndicatorSettingsDialogProps) {
  const def = INDICATOR_DEFS[instance.kind]

  const setParam = (key: string, raw: number, min: number, max: number) => {
    if (!Number.isFinite(raw)) return
    const clamped = Math.min(max, Math.max(min, raw))
    onChange({ ...instance, params: { ...instance.params, [key]: clamped } })
  }

  const setColor = (idx: number, color: string) => {
    const colors = [...instance.colors]
    colors[idx] = color
    onChange({ ...instance, colors })
  }

  return (
    <Dialog open onClose={onClose} title={`${def.name} 설정`} width={360}>
      <div className="ind-settings">
        {def.params.map((param) => {
          const value = instance.params[param.key] ?? param.default
          return (
            <label className="tv-field" key={param.key}>
              <span className="tv-field-label">{param.label}</span>
              {param.kind === 'flag' ? (
                <input
                  type="checkbox"
                  className="tv-switch"
                  checked={value !== 0}
                  onChange={(e) => setParam(param.key, e.target.checked ? 1 : 0, 0, 1)}
                />
              ) : (
                <input
                  type="number"
                  className="tv-input ind-num"
                  value={value}
                  min={param.min}
                  max={param.max}
                  step={param.step ?? 1}
                  onChange={(e) => setParam(param.key, Number(e.target.value), param.min, param.max)}
                />
              )}
            </label>
          )
        })}

        {def.colors.map((_, idx) => (
          <label className="tv-field" key={`color-${idx}`}>
            <span className="tv-field-label">{def.colorLabels?.[idx] ?? `색 ${idx + 1}`}</span>
            <input
              type="color"
              className="tv-color"
              value={instance.colors[idx] ?? def.colors[idx]}
              onChange={(e) => setColor(idx, e.target.value)}
            />
          </label>
        ))}

        <label className="tv-field">
          <span className="tv-field-label">표시</span>
          <input
            type="checkbox"
            className="tv-switch"
            checked={instance.visible}
            onChange={(e) => onChange({ ...instance, visible: e.target.checked })}
          />
        </label>
      </div>
    </Dialog>
  )
}
