import { useEffect, useId, useState } from 'react'
import { Dialog } from './ui/Dialog'
import { AlertTimingFields } from './AlertTimingFields'
import { timingDraftOf, timingFromDraft, type TimingDraft } from '../lib/alertTimingDraft'
import { describeLineAlert, lineAlertMode, SHAPE_WHEN_LABELS, type LineAlertOptions, type ShapeWhen } from '../lib/alertRules'
import { DRAWING_LABELS, type Drawing } from '../lib/drawings'
import './widgets/widgets.css'

interface LineAlertDialogProps {
  /** 설정할 그림. null 이면 닫혀 있다. */
  drawing: Drawing | null
  onClose: () => void
  /** 알림을 켜고 설정을 저장한다(울린 알림도 다시 켠다). */
  onSave: (id: string, patch: Pick<Drawing, 'alert' | 'fired' | 'alertOpts'>) => void
}

const WHEN_ORDER: ShapeWhen[] = ['cross', 'enter', 'exit']

/** 선·도형 알림 설정 — 조건(도형), 트리거(한 번만/매번), 재알림, 만료, 메모. */
export function LineAlertDialog({ drawing, onClose, onSave }: LineAlertDialogProps) {
  const [when, setWhen] = useState<ShapeWhen>('cross')
  const [timing, setTiming] = useState<TimingDraft>(() => timingDraftOf(undefined))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const formId = useId()
  const mode = drawing ? lineAlertMode(drawing.kind) : undefined

  useEffect(() => {
    if (!drawing) return
    setWhen(drawing.alertOpts?.when ?? 'cross')
    setTiming(timingDraftOf(drawing.alertOpts))
    setMessage(drawing.alertOpts?.message ?? '')
    setError('')
    // 여는 순간의 설정만 채운다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing?.id])

  if (!drawing || !mode) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const times = timingFromDraft(timing, mode !== 'time')
    if (typeof times === 'string') {
      setError(times)
      return
    }
    const trimmed = message.trim()
    const opts: LineAlertOptions = {
      ...(mode === 'band' && when !== 'cross' ? { when } : {}),
      ...(trimmed ? { message: trimmed } : {}),
      ...times,
    }
    onSave(drawing.id, { alert: true, fired: false, alertOpts: opts })
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${DRAWING_LABELS[drawing.kind]} 알림`}
      width={440}
      className="ca-dialog"
      footer={
        <>
          <button type="button" className="tv-btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" form={formId} className="tv-btn primary">
            저장
          </button>
        </>
      }
    >
      <form id={formId} className="ca-body" onSubmit={submit}>
        <label className="ca-field">
          <span className="ca-label">조건</span>
          {mode === 'band' ? (
            <select className="tv-input ca-select" value={when} onChange={(e) => setWhen(e.target.value as ShapeWhen)}>
              {WHEN_ORDER.map((w) => (
                <option key={w} value={w}>
                  {SHAPE_WHEN_LABELS[w]}
                </option>
              ))}
            </select>
          ) : (
            <span className="ca-trigger">{mode === 'time' ? '그 시각 도달' : '교차'}</span>
          )}
        </label>

        <AlertTimingFields draft={timing} onChange={setTiming} repeat={mode !== 'time'} hysteresis />

        <label className="ca-field ca-field-col">
          <span className="ca-label">메시지</span>
          <textarea
            className="tv-input ca-message"
            rows={2}
            placeholder={`${drawing.symbol} ${describeLineAlert(drawing, mode === 'band' && when !== 'cross' ? { when } : undefined)}`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>

        <p className="ca-note">
          {mode === 'time'
            ? '그 시각이 되면 한 번 울립니다. 이미 지난 시각이면 울리지 않습니다.'
            : mode === 'band'
              ? '가격이 도형의 경계를 넘거나(경계 교차) 안으로 들어오거나(진입) 밖으로 나가면(이탈) 울립니다. 도형의 시간 구간 안에서만 봅니다.'
              : '가격이 선을 지나가면 울립니다. 기울어진 선은 지금 시각의 선 가격으로 보고, 레이는 시작점 뒤로만 봅니다.'}
        </p>

        {error && <p className="ca-error">{error}</p>}
      </form>
    </Dialog>
  )
}
