import { useState } from 'react'
import {
  nextMaColor,
  type IndicatorSettings,
  type MaType,
} from '../lib/indicatorConfig'

interface IndicatorPanelProps {
  settings: IndicatorSettings
  onChange: (next: IndicatorSettings) => void
}

export function IndicatorPanel({ settings, onChange }: IndicatorPanelProps) {
  const [newPeriod, setNewPeriod] = useState('50')
  const [newType, setNewType] = useState<MaType>('sma')

  const addMa = () => {
    const period = Number(newPeriod)
    if (!Number.isInteger(period) || period < 1 || period > 1000) return
    onChange({
      ...settings,
      mas: [
        ...settings.mas,
        {
          id: `ma-${newType}-${period}-${Date.now()}`,
          type: newType,
          period,
          color: nextMaColor(settings.mas),
          visible: true,
        },
      ],
    })
  }

  const updateMa = (id: string, patch: Partial<IndicatorSettings['mas'][number]>) => {
    onChange({
      ...settings,
      mas: settings.mas.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })
  }

  return (
    <section className="panel">
      <h2>지표</h2>

      <div className="panel-group">
        <h3>이동평균</h3>
        <ul className="ma-list">
          {settings.mas.map((ma) => (
            <li key={ma.id}>
              <input
                type="checkbox"
                checked={ma.visible}
                onChange={(e) => updateMa(ma.id, { visible: e.target.checked })}
              />
              <input
                type="color"
                value={ma.color}
                onChange={(e) => updateMa(ma.id, { color: e.target.value })}
              />
              <span className="ma-label">
                {ma.type.toUpperCase()} {ma.period}
              </span>
              <button
                type="button"
                className="remove"
                onClick={() =>
                  onChange({ ...settings, mas: settings.mas.filter((m) => m.id !== ma.id) })
                }
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="ma-add">
          <select value={newType} onChange={(e) => setNewType(e.target.value as MaType)}>
            <option value="sma">SMA</option>
            <option value="ema">EMA</option>
          </select>
          <input
            type="number"
            min={1}
            max={1000}
            value={newPeriod}
            onChange={(e) => setNewPeriod(e.target.value)}
          />
          <button type="button" onClick={addMa}>
            추가
          </button>
        </div>
      </div>

      <div className="panel-group">
        <h3>
          <label>
            <input
              type="checkbox"
              checked={settings.rsi.enabled}
              onChange={(e) =>
                onChange({ ...settings, rsi: { ...settings.rsi, enabled: e.target.checked } })
              }
            />
            RSI
          </label>
        </h3>
        <label className="field">
          기간
          <input
            type="number"
            min={2}
            max={100}
            value={settings.rsi.period}
            onChange={(e) => {
              const period = Number(e.target.value)
              if (period >= 2 && period <= 100) {
                onChange({ ...settings, rsi: { ...settings.rsi, period } })
              }
            }}
          />
        </label>
      </div>

      <div className="panel-group">
        <h3>
          <label>
            <input
              type="checkbox"
              checked={settings.macd.enabled}
              onChange={(e) =>
                onChange({ ...settings, macd: { ...settings.macd, enabled: e.target.checked } })
              }
            />
            MACD
          </label>
        </h3>
        {(['fast', 'slow', 'signal'] as const).map((key) => (
          <label className="field" key={key}>
            {key}
            <input
              type="number"
              min={1}
              max={200}
              value={settings.macd[key]}
              onChange={(e) => {
                const value = Number(e.target.value)
                if (value < 1 || value > 200) return
                const next = { ...settings.macd, [key]: value }
                // fast >= slow 이면 MACD 계산이 성립하지 않는다.
                if (next.fast >= next.slow) return
                onChange({ ...settings, macd: next })
              }}
            />
          </label>
        ))}
      </div>
    </section>
  )
}
