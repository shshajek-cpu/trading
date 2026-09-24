import { useState } from 'react'
import { usePaper } from '../../lib/paper/context'
import { DEFAULT_START_BALANCE } from '../../lib/paper/types'
import { Dialog } from '../ui/Dialog'
import './trade.css'

const CONFIRM_WORD = '초기화'

interface ResetDialogProps {
  open: boolean
  onClose: () => void
}

/** 계좌 초기화 — 시작 잔고를 정하고 확인 문구를 입력해야 실행된다. */
export function ResetDialog({ open, onClose }: ResetDialogProps) {
  const paper = usePaper()
  const [balance, setBalance] = useState(String(DEFAULT_START_BALANCE))
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const start = Number(balance.replace(/[^0-9.]/g, ''))
  const canReset = confirmText.trim() === CONFIRM_WORD && start > 0

  async function reset() {
    if (busy || !canReset) return
    setBusy(true)
    setError(null)
    const err = await paper.reset(start)
    setBusy(false)
    if (err) setError(err)
    else {
      setConfirmText('')
      onClose()
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="계좌 초기화"
      width={420}
      footer={
        <>
          <button type="button" className="tv-btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="tv-btn primary" disabled={!canReset || busy} onClick={reset}>
            초기화
          </button>
        </>
      }
    >
      <div className="acc-dialog">
        <p className="acc-warn">모든 포지션·주문·기록이 지워지고 새 잔고로 다시 시작합니다.</p>
        <label className="op-field">
          <span className="op-field-label">시작 잔고 (USDT)</span>
          <input
            className="op-input"
            inputMode="decimal"
            value={balance}
            onChange={(e) => {
              setBalance(e.target.value)
              setError(null)
            }}
          />
        </label>
        <label className="op-field">
          <span className="op-field-label">확인하려면 “{CONFIRM_WORD}” 입력</span>
          <input
            className="op-input"
            value={confirmText}
            onChange={(e) => {
              setConfirmText(e.target.value)
              setError(null)
            }}
          />
        </label>
        {error && <p className="op-error">{error}</p>}
      </div>
    </Dialog>
  )
}

interface FeesDialogProps {
  open: boolean
  onClose: () => void
}

/** 수수료 설정 — 메이커/테이커를 % 로 받아 분수로 저장한다. */
export function FeesDialog({ open, onClose }: FeesDialogProps) {
  const paper = usePaper()
  const [maker, setMaker] = useState((paper.account.fees.maker * 100).toString())
  const [taker, setTaker] = useState((paper.account.fees.taker * 100).toString())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    const m = Number(maker.replace(/[^0-9.]/g, ''))
    const t = Number(taker.replace(/[^0-9.]/g, ''))
    if (!(m >= 0) || !(t >= 0)) {
      setError('올바른 수수료를 입력하세요.')
      return
    }
    setBusy(true)
    setError(null)
    const err = await paper.setFees({ maker: m / 100, taker: t / 100 })
    setBusy(false)
    if (err) setError(err)
    else onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="수수료 설정"
      width={380}
      footer={
        <>
          <button type="button" className="tv-btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="tv-btn primary" disabled={busy} onClick={save}>
            저장
          </button>
        </>
      }
    >
      <div className="acc-dialog">
        <label className="op-field">
          <span className="op-field-label">메이커 (%)</span>
          <input
            className="op-input"
            inputMode="decimal"
            value={maker}
            onChange={(e) => {
              setMaker(e.target.value)
              setError(null)
            }}
          />
        </label>
        <label className="op-field">
          <span className="op-field-label">테이커 (%)</span>
          <input
            className="op-input"
            inputMode="decimal"
            value={taker}
            onChange={(e) => {
              setTaker(e.target.value)
              setError(null)
            }}
          />
        </label>
        {error && <p className="op-error">{error}</p>}
      </div>
    </Dialog>
  )
}
