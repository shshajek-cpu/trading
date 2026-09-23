import { useState } from 'react'
import { VOLUME_TIER_COLORS, VOLUME_TIER_LABELS } from '../lib/indicators'
import { Icon } from './Icon'
import {
  nextMaColor,
  type IndicatorSettings,
  type MaType,
} from '../lib/indicatorConfig'

interface IndicatorPanelProps {
  settings: IndicatorSettings
  onChange: (next: IndicatorSettings) => void
}

/** fast/slow/signal 은 영어 그대로면 뭘 뜻하는지 알기 어렵다. */
const MACD_LABELS = {
  fast: '빠른선',
  slow: '느린선',
  signal: '신호선',
} as const

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
      <div className="panel-group">
        <h3>이동평균</h3>
        <ul className="ma-list">
          {settings.mas.map((ma) => (
            <li key={ma.id}>
              <input
                type="checkbox"
                className="switch"
                aria-label={`${ma.type.toUpperCase()} ${ma.period} 보이기`}
                checked={ma.visible}
                onChange={(e) => updateMa(ma.id, { visible: e.target.checked })}
              />
              <input
                type="color"
                aria-label={`${ma.type.toUpperCase()} ${ma.period} 색상`}
                value={ma.color}
                onChange={(e) => updateMa(ma.id, { color: e.target.value })}
              />
              <span className="ma-label">
                {ma.type.toUpperCase()} {ma.period}
              </span>
              <button
                type="button"
                className="icon-btn remove"
                aria-label={`${ma.type.toUpperCase()} ${ma.period} 지우기`}
                onClick={() =>
                  onChange({ ...settings, mas: settings.mas.filter((m) => m.id !== ma.id) })
                }
              >
                <Icon name="close" size={15} />
              </button>
            </li>
          ))}
        </ul>
        <div className="inline-form ma-add">
          <select
            aria-label="이동평균 종류"
            value={newType}
            onChange={(e) => setNewType(e.target.value as MaType)}
          >
            <option value="sma">SMA</option>
            <option value="ema">EMA</option>
            <option value="vwma">VWMA</option>
          </select>
          <input
            type="number"
            aria-label="기간"
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

      <div className={`panel-group${settings.rsi.enabled ? ' on' : ''}`}>
        <label className="group-head">
          <span>RSI</span>
          <input
            type="checkbox"
            className="switch"
            checked={settings.rsi.enabled}
            onChange={(e) =>
              onChange({ ...settings, rsi: { ...settings.rsi, enabled: e.target.checked } })
            }
          />
        </label>
        {settings.rsi.enabled && (
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
        )}
      </div>

      <div className={`panel-group${settings.macd.enabled ? ' on' : ''}`}>
        <label className="group-head">
          <span>MACD</span>
          <input
            type="checkbox"
            className="switch"
            checked={settings.macd.enabled}
            onChange={(e) =>
              onChange({ ...settings, macd: { ...settings.macd, enabled: e.target.checked } })
            }
          />
        </label>
        {settings.macd.enabled &&
          (['fast', 'slow', 'signal'] as const).map((key) => (
            <label className="field" key={key}>
              {MACD_LABELS[key]}
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

      <div className={`panel-group${settings.volumeSurge.enabled ? ' on' : ''}`}>
        <label className="group-head">
          <span>거래량 급증</span>
          <input
            type="checkbox"
            className="switch"
            checked={settings.volumeSurge.enabled}
            onChange={(e) =>
              onChange({
                ...settings,
                volumeSurge: { ...settings.volumeSurge, enabled: e.target.checked },
              })
            }
          />
        </label>
        {settings.volumeSurge.enabled && (
          <>
            <div className="vol-legend">
              {([
                [1, 'low'],
                [2, 'mid'],
                [3, 'high'],
              ] as const).map(([tier, key]) => (
                <span key={tier}>
                  <i style={{ background: VOLUME_TIER_COLORS[tier] }} />
                  {VOLUME_TIER_LABELS[tier]}
                  <b>{settings.volumeSurge[key]}배</b>
                </span>
              ))}
            </div>
            <p className="hint">평균 대비 몇 배부터 표시할지</p>
            {([
              ['low', '보통'],
              ['mid', '강함'],
              ['high', '폭발'],
            ] as const).map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                <input
                  type="number"
                  min={1.1}
                  max={50}
                  step={0.5}
                  value={settings.volumeSurge[key]}
                  onChange={(e) => {
                    const value = Number(e.target.value)
                    if (!Number.isFinite(value) || value <= 1) return
                    const next = { ...settings.volumeSurge, [key]: value }
                    // 단계가 뒤집히면 색이 뒤엉킨다.
                    if (!(next.low < next.mid && next.mid < next.high)) return
                    onChange({ ...settings, volumeSurge: next })
                  }}
                />
              </label>
            ))}
            <label className="field">
              평균 구간
              <input
                type="number"
                min={5}
                max={200}
                value={settings.volumeSurge.window}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  if (!Number.isInteger(value) || value < 5 || value > 200) return
                  onChange({ ...settings, volumeSurge: { ...settings.volumeSurge, window: value } })
                }}
              />
            </label>
          </>
        )}
      </div>
    </section>
  )
}
