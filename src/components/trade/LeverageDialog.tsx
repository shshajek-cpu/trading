import { useState } from 'react'
import { usePaper } from '../../lib/paper/context'
import type { SymbolRules } from '../../lib/paper/types'
import { displaySymbol, type SymbolInfo } from '../../lib/symbols'
import { Dialog } from '../ui/Dialog'
import { fmtPct, fmtQty } from './format'
import './trade.css'

interface LeverageDialogProps {
  open: boolean
  onClose: () => void
  symbol: string
  symbols: SymbolInfo[]
  leverage: number
  rules: SymbolRules | null
}

export function LeverageDialog({ open, onClose, symbol, symbols, leverage, rules }: LeverageDialogProps) {
  const paper = usePaper()
  const maxLeverage = rules?.maxLeverage ?? 20
  const [value, setValue] = useState(leverage)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const clamp = (n: number) => Math.min(maxLeverage, Math.max(1, Math.round(n)))
  const step = rules?.stepSize ?? 0.001

  async function confirm() {
    if (busy) return
    setBusy(true)
    setError(null)
    const err = await paper.setSymbolSettings(symbol, { leverage: clamp(value) })
    setBusy(false)
    if (err) setError(err)
    else onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${displaySymbol(symbol, symbols)} 레버리지`}
      width={420}
      footer={
        <>
          <button type="button" className="tv-btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="tv-btn primary" disabled={busy} onClick={confirm}>
            확인
          </button>
        </>
      }
    >
      <div className="lev-body">
        <div className="lev-value">{clamp(value)}x</div>
        <input
          type="range"
          min={1}
          max={maxLeverage}
          step={1}
          value={clamp(value)}
          onChange={(e) => {
            setValue(Number(e.target.value))
            setError(null)
          }}
          aria-label="레버리지"
        />
        <div className="lev-input-row">
          <input
            className="op-input"
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9]/g, ''))
              setValue(Number.isFinite(n) ? n : 1)
              setError(null)
            }}
            onBlur={() => setValue(clamp(value))}
          />
          <span className="lev-max">최대 {maxLeverage}x</span>
        </div>

        <table className="lev-tiers">
          <thead>
            <tr>
              <th>수량 구간</th>
              <th>최대 레버리지</th>
              <th>유지증거금률</th>
            </tr>
          </thead>
          <tbody>
            {(rules?.tiers ?? []).map((t, i) => {
              const prev = i === 0 ? 0 : rules!.tiers[i - 1].maxQty
              const upper = Number.isFinite(t.maxQty) ? fmtQty(t.maxQty, step) : '∞'
              return (
                <tr key={i}>
                  <td>
                    {fmtQty(prev, step)} ~ {upper}
                  </td>
                  <td>{t.maxLeverage}x</td>
                  <td>{fmtPct(t.mmr * 100, 2).replace('+', '')}</td>
                </tr>
              )
            })}
            {(!rules || rules.tiers.length === 0) && (
              <tr>
                <td colSpan={3} className="lev-empty">
                  구간표를 불러오는 중…
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {rules?.source === 'default' && (
          <p className="lev-note">OKX 에 없는 종목이라 기본값(최대 20배)을 씁니다.</p>
        )}
        {error && <p className="op-error">{error}</p>}
      </div>
    </Dialog>
  )
}
