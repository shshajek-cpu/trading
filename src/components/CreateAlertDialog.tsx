import { useEffect, useState } from 'react'
import { Dialog } from './ui/Dialog'
import type { AlertCondition } from '../hooks/usePriceAlerts'
import { useSymbols } from '../hooks/useSymbols'
import { displaySymbol, priceDecimals } from '../lib/symbols'
import './widgets/widgets.css'

interface CreateAlertDialogProps {
  open: boolean
  onClose: () => void
  symbol: string
  livePrice: number | null
  onCreate: (symbol: string, condition: AlertCondition, price: number, message?: string) => void
}

type Kind = 'cross' | 'crossUp' | 'crossDown' | 'gt' | 'lt'

const KIND_LABELS: Record<Kind, string> = {
  cross: '교차',
  crossUp: '상향 교차',
  crossDown: '하향 교차',
  gt: '보다 큼',
  lt: '보다 작음',
}

const KIND_ORDER: Kind[] = ['cross', 'crossUp', 'crossDown', 'gt', 'lt']

/** 조건을 푸시 워커가 이해하는 above/below 로 환원. 교차는 현재가 기준으로 방향을 정한다. */
function resolveCondition(kind: Kind, value: number, livePrice: number | null): AlertCondition {
  if (kind === 'crossUp' || kind === 'gt') return 'above'
  if (kind === 'crossDown' || kind === 'lt') return 'below'
  return livePrice != null && value < livePrice ? 'below' : 'above'
}

/** 값 크기에 맞춘 스테퍼 증분. */
function stepFor(value: number): number {
  const v = Math.abs(value)
  if (v >= 1000) return 1
  if (v >= 1) return 0.1
  if (v >= 0.01) return 0.001
  return 0.00001
}

function fmt(value: number, decimals: number): string {
  return Number(value.toFixed(decimals)).toString()
}

export function CreateAlertDialog({ open, onClose, symbol, livePrice, onCreate }: CreateAlertDialogProps) {
  const infos = useSymbols()
  const dec = priceDecimals(symbol, infos)
  const tick = infos.find((i) => i.symbol === symbol)?.tickSize ?? 0
  const [kind, setKind] = useState<Kind>('cross')
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('')
  const [messageDirty, setMessageDirty] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const initial = livePrice != null ? fmt(livePrice, dec) : ''
    setKind('cross')
    setValue(initial)
    setMessage(initial ? `${symbol} 가격이 ${initial}에 도달` : `${symbol} 가격 알림`)
    setMessageDirty(false)
    setError('')
    // livePrice 는 열린 순간의 값만 초기값으로 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, symbol])

  const setValueAndMessage = (next: string) => {
    setValue(next)
    if (!messageDirty) setMessage(next ? `${symbol} 가격이 ${next}에 도달` : `${symbol} 가격 알림`)
  }

  const bump = (dir: 1 | -1) => {
    const current = Number(value)
    const base = Number.isFinite(current) ? current : (livePrice ?? 0)
    const step = tick > 0 ? tick : stepFor(base)
    const next = Math.max(0, base + dir * step)
    setValueAndMessage(fmt(next, dec))
  }

  const submit = () => {
    const num = Number(value)
    if (!Number.isFinite(num) || num <= 0) {
      setError('올바른 가격을 입력하세요.')
      return
    }
    onCreate(symbol, resolveCondition(kind, num, livePrice), num, message)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${displaySymbol(symbol, infos)}에 알림 만들기`}
      width={480}
      className="ca-dialog"
      footer={
        <>
          <button type="button" className="tv-btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="tv-btn primary" onClick={submit}>
            만들기
          </button>
        </>
      }
    >
      <div className="ca-body">
        <label className="ca-field">
          <span className="ca-label">조건</span>
          <select
            className="tv-input ca-select"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>

        <label className="ca-field">
          <span className="ca-label">값</span>
          <div className="ca-stepper">
            <button type="button" className="tv-icon-btn ca-step" aria-label="감소" onClick={() => bump(-1)}>
              −
            </button>
            <input
              className="tv-input ca-value"
              type="number"
              step="any"
              min="0"
              value={value}
              onChange={(e) => {
                setValueAndMessage(e.target.value)
                setError('')
              }}
            />
            <button type="button" className="tv-icon-btn ca-step" aria-label="증가" onClick={() => bump(1)}>
              +
            </button>
          </div>
        </label>

        <div className="ca-field">
          <span className="ca-label">트리거</span>
          <span className="ca-trigger">한 번만</span>
        </div>

        <label className="ca-field ca-field-col">
          <span className="ca-label">메시지</span>
          <textarea
            className="tv-input ca-message"
            rows={3}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value)
              setMessageDirty(true)
            }}
          />
        </label>

        {error && <p className="ca-error">{error}</p>}
      </div>
    </Dialog>
  )
}
