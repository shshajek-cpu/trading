import type { Interval } from '../lib/market/types'
import { supportsInterval } from '../lib/market/ids'
import { MTF_PRESETS } from '../lib/layoutConfig'
import { shortSymbol } from '../lib/symbols'

interface MtfPanelProps {
  symbol: string
  current: Interval[]
  onApply: (intervals: Interval[]) => void
}

/** 같은 종목을 여러 주기로 동시에 띄우는 프리셋. */
export function MtfPanel({ symbol, current, onApply }: MtfPanelProps) {
  const short = shortSymbol(symbol)

  return (
    <section className="panel mtf-panel">
      <p className="hint">
        <b>{short}</b> 을(를) 네 칸에 띄우고 주기만 다르게 겁니다.
      </p>

      <ul className="mtf-list">
        {MTF_PRESETS.map((preset) => {
          // 이 시장에서 못 그리는 주기(야후 3d)는 뺀다.
          const intervals = preset.intervals.filter((iv) => supportsInterval(symbol, iv))
          if (intervals.length === 0) return null
          // 앞 칸들이 프리셋 주기와 같으면 켜진 것(칸이 더 많아도).
          const active = intervals.every((iv, i) => current[i] === iv)
          return (
            <li key={preset.id}>
              <button
                type="button"
                className={active ? 'active' : undefined}
                onClick={() => onApply(intervals)}
              >
                <span className="mtf-label">{preset.label}</span>
                <span className="mtf-ivs">
                  {intervals.map((iv) => (
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
