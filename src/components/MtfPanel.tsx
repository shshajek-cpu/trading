import type { Interval } from '../lib/binance'
import { MTF_PRESETS } from '../lib/layoutConfig'

interface MtfPanelProps {
  symbol: string
  current: Interval[]
  onApply: (intervals: Interval[]) => void
}

/** 같은 종목을 여러 주기로 동시에 띄우는 프리셋. */
export function MtfPanel({ symbol, current, onApply }: MtfPanelProps) {
  const short = symbol.replace('USDT', '')

  return (
    <section className="panel mtf-panel">
      <p className="hint">
        <b>{short}</b> 을(를) 네 칸에 띄우고 주기만 다르게 겁니다.
      </p>

      <ul className="mtf-list">
        {MTF_PRESETS.map((preset) => {
          const active =
            current.length === preset.intervals.length &&
            preset.intervals.every((iv, i) => current[i] === iv)
          return (
            <li key={preset.id}>
              <button
                type="button"
                className={active ? 'active' : undefined}
                onClick={() => onApply(preset.intervals)}
              >
                <span className="mtf-label">{preset.label}</span>
                <span className="mtf-ivs">
                  {preset.intervals.map((iv) => (
                    <em key={iv}>{iv}</em>
                  ))}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
