import { useEffect, useMemo, useState } from 'react'
import { Dialog } from './ui/Dialog'
import type { AlertCondition } from '../hooks/usePriceAlerts'
import { useSymbols } from '../hooks/useSymbols'
import { displaySymbol, priceDecimals } from '../lib/symbols'
import type { Interval } from '../lib/binance'
import { INTERVAL_INFO } from '../lib/intervals'
import { indicatorTitle, setParts, type IndicatorInstance } from '../lib/indicatorConfig'
import { computeIndicator, plotName } from '../chart/compute'
import { CHART_PALETTES } from '../lib/theme'
import {
  CONDITION_LABELS,
  CONDITION_ORDER,
  TRIGGER_LABELS,
  TRIGGER_ORDER,
  describeIndicatorAlert,
  formatAlertValue,
  type AlertTrigger,
  type IndicatorCondition,
  type NewIndicatorAlert,
} from '../lib/indicatorAlerts'
import './widgets/widgets.css'

interface CreateAlertDialogProps {
  open: boolean
  onClose: () => void
  symbol: string
  livePrice: number | null
  /** 우클릭 "…에 알림 추가"처럼 가격을 정해 열 때. 없으면 현재가로 시작한다. */
  initialPrice?: number | null
  onCreate: (symbol: string, condition: AlertCondition, price: number, message?: string) => void
  /** 지표 알림: 지금 차트의 주기와 지표 목록. 없으면 가격 알림만 만든다. */
  interval?: Interval
  indicators?: IndicatorInstance[]
  /** 범례 🔔 처럼 특정 지표로 열 때 그 지표 id. */
  initialIndicatorId?: string | null
  onCreateIndicatorAlert?: (alert: NewIndicatorAlert) => void
}

type PriceKind = 'cross' | 'crossUp' | 'crossDown' | 'gt' | 'lt'

const PRICE_KIND_LABELS: Record<PriceKind, string> = {
  cross: '교차',
  crossUp: '상향 교차',
  crossDown: '하향 교차',
  gt: '보다 큼',
  lt: '보다 작음',
}

const PRICE_KIND_ORDER: PriceKind[] = ['cross', 'crossUp', 'crossDown', 'gt', 'lt']

/** 조건을 푸시 워커가 이해하는 above/below 로 환원. 교차는 현재가 기준으로 방향을 정한다. */
function resolveCondition(kind: PriceKind, value: number, livePrice: number | null): AlertCondition {
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

const PRICE = 'price'

/** 알림을 걸 수 있는 선: 그리는 선 + 범례·알림 전용 값(예: 급증 강도). */
function alertLines(instance: IndicatorInstance) {
  return computeIndicator(instance, [], CHART_PALETTES.dark).lines.map((line) => ({ key: line.key, name: plotName(line) }))
}

/** 지표를 고르면 처음 채워 줄 기준값. 급증 배율은 Lv2 배율(끄면 Lv1), 오실레이터는 첫 기준선(RSI 70 등). */
function defaultIndicatorValue(instance: IndicatorInstance, lineKey: string, livePrice: number | null): number | null {
  // 세트는 그 선이 속한 부분(원래 지표)으로 따진다.
  if (instance.kind === 'maSet') {
    const part = setParts(instance).find((p) =>
      computeIndicator(p.instance, [], CHART_PALETTES.dark).lines.some((l) => l.key === lineKey),
    )
    return part ? defaultIndicatorValue(part.instance, lineKey, livePrice) : null
  }
  if (instance.kind === 'volumeSpike' && lineKey === 'ratio') return instance.params.lv2 || instance.params.lv1
  const computed = computeIndicator(instance, [], CHART_PALETTES.dark)
  if (computed.levels[0]) return computed.levels[0].price
  if (computed.overlay) return livePrice
  return null
}

export function CreateAlertDialog({
  open,
  onClose,
  symbol,
  livePrice,
  initialPrice,
  onCreate,
  interval,
  indicators = [],
  initialIndicatorId,
  onCreateIndicatorAlert,
}: CreateAlertDialogProps) {
  const infos = useSymbols()
  const dec = priceDecimals(symbol, infos)
  const tick = infos.find((i) => i.symbol === symbol)?.tickSize ?? 0
  const canIndicator = Boolean(interval && onCreateIndicatorAlert && indicators.length > 0)

  const [source, setSource] = useState<string>(PRICE)
  const [priceKind, setPriceKind] = useState<PriceKind>('cross')
  const [lineKey, setLineKey] = useState('')
  const [indicatorCondition, setIndicatorCondition] = useState<IndicatorCondition>('crossing')
  const [trigger, setTrigger] = useState<AlertTrigger>('once')
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('')
  const [messageDirty, setMessageDirty] = useState(false)
  const [error, setError] = useState('')

  const instance = source === PRICE ? null : (indicators.find((i) => i.id === source) ?? null)
  const lines = useMemo(() => (instance ? alertLines(instance) : []), [instance])
  const line = lines.find((l) => l.key === lineKey) ?? lines[0]

  const autoMessage = (nextValue: string, nextInstance = instance, nextLine = line, nextCondition = indicatorCondition) => {
    if (!nextInstance || !nextLine) {
      return nextValue ? `${symbol} 가격이 ${nextValue}에 도달` : `${symbol} 가격 알림`
    }
    const num = Number(nextValue)
    return `${symbol} ${interval ? INTERVAL_INFO[interval].short : ''} ${describeIndicatorAlert({
      title: indicatorTitle(nextInstance),
      lineName: nextLine.name,
      condition: nextCondition,
      value: Number.isFinite(num) ? num : 0,
    })}`
  }

  // 지표를 고르면 선·조건·트리거·기준값을 그 지표에 맞춰 채운다.
  const pickSource = (next: string, fromOpen = false) => {
    setSource(next)
    setError('')
    const nextInstance = next === PRICE ? null : (indicators.find((i) => i.id === next) ?? null)
    if (!nextInstance) {
      const start = (fromOpen ? initialPrice : null) ?? livePrice
      const initial = start != null ? fmt(start, dec) : ''
      setValue(initial)
      if (fromOpen || !messageDirty) setMessage(autoMessage(initial, null))
      return
    }
    const nextLines = alertLines(nextInstance)
    const spike = nextInstance.kind === 'volumeSpike'
    const nextLine = nextLines.find((l) => l.key === 'ratio') ?? nextLines[0]
    const nextCondition: IndicatorCondition = spike ? 'greater' : 'crossing'
    setLineKey(nextLine?.key ?? '')
    setIndicatorCondition(nextCondition)
    // 급증은 한 번 울리고 끝나면 다음 급증을 놓친다 — 봉마다 한 번이 기본.
    setTrigger(spike ? 'perBar' : 'once')
    const initial = nextLine ? defaultIndicatorValue(nextInstance, nextLine.key, livePrice) : null
    const text = initial !== null ? formatAlertValue(initial).replace(/,/g, '') : ''
    setValue(text)
    if (fromOpen || !messageDirty) setMessage(autoMessage(text, nextInstance, nextLine, nextCondition))
  }

  useEffect(() => {
    if (!open) return
    setMessageDirty(false)
    setPriceKind('cross')
    const preset = initialIndicatorId && indicators.some((i) => i.id === initialIndicatorId) ? initialIndicatorId : PRICE
    pickSource(canIndicator ? preset : PRICE, true)
    // 열린 순간의 값만 초기값으로 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, symbol, initialIndicatorId])

  const setValueAndMessage = (next: string) => {
    setValue(next)
    if (!messageDirty) setMessage(autoMessage(next))
  }

  const bump = (dir: 1 | -1) => {
    const current = Number(value)
    const base = Number.isFinite(current) ? current : (livePrice ?? 0)
    const step = instance ? stepFor(base || 1) : tick > 0 ? tick : stepFor(base)
    const next = instance ? base + dir * step : Math.max(0, base + dir * step)
    setValueAndMessage(instance ? formatAlertValue(next).replace(/,/g, '') : fmt(next, dec))
  }

  const submit = () => {
    const num = Number(value)
    if (value.trim() === '' || !Number.isFinite(num) || (!instance && num <= 0)) {
      setError(instance ? '기준값을 입력하세요.' : '올바른 가격을 입력하세요.')
      return
    }
    if (instance && line && interval && onCreateIndicatorAlert) {
      onCreateIndicatorAlert({
        symbol,
        interval,
        indicator: { ...instance, params: { ...instance.params }, colors: [...instance.colors] },
        title: indicatorTitle(instance),
        lineKey: line.key,
        lineName: line.name,
        condition: indicatorCondition,
        value: num,
        trigger,
        message,
      })
    } else {
      // 상향·하향 교차는 가격이 반대편에서 넘어와야 한다. 이미 넘어가 있으면 첫 틱에 바로 울려 버린다.
      if (livePrice != null && priceKind === 'crossUp' && livePrice >= num) {
        setError('현재가가 이미 이 가격 위에 있어 바로 울립니다. 더 높은 가격을 넣거나 "보다 큼"을 고르세요.')
        return
      }
      if (livePrice != null && priceKind === 'crossDown' && livePrice <= num) {
        setError('현재가가 이미 이 가격 아래에 있어 바로 울립니다. 더 낮은 가격을 넣거나 "보다 작음"을 고르세요.')
        return
      }
      onCreate(symbol, resolveCondition(priceKind, num, livePrice), num, message)
    }
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
        {canIndicator && (
          <label className="ca-field">
            <span className="ca-label">대상</span>
            <select className="tv-input ca-select" value={source} onChange={(e) => pickSource(e.target.value)}>
              <option value={PRICE}>가격</option>
              {indicators.map((i) => (
                <option key={i.id} value={i.id}>
                  {indicatorTitle(i)}
                </option>
              ))}
            </select>
          </label>
        )}

        {instance && lines.length > 1 && (
          <label className="ca-field">
            <span className="ca-label">값</span>
            <select
              className="tv-input ca-select"
              value={line?.key ?? ''}
              onChange={(e) => {
                const next = lines.find((l) => l.key === e.target.value)
                setLineKey(e.target.value)
                if (!messageDirty) setMessage(autoMessage(value, instance, next))
              }}
            >
              {lines.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="ca-field">
          <span className="ca-label">조건</span>
          {instance ? (
            <select
              className="tv-input ca-select"
              value={indicatorCondition}
              onChange={(e) => {
                const next = e.target.value as IndicatorCondition
                setIndicatorCondition(next)
                if (!messageDirty) setMessage(autoMessage(value, instance, line, next))
              }}
            >
              {CONDITION_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
          ) : (
            <select className="tv-input ca-select" value={priceKind} onChange={(e) => setPriceKind(e.target.value as PriceKind)}>
              {PRICE_KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {PRICE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="ca-field">
          <span className="ca-label">{instance ? '기준값' : '값'}</span>
          <div className="ca-stepper">
            <button type="button" className="tv-icon-btn ca-step" aria-label="감소" onClick={() => bump(-1)}>
              −
            </button>
            <input
              className="tv-input ca-value"
              type="number"
              step="any"
              min={instance ? undefined : '0'}
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
          {instance ? (
            <select className="tv-input ca-select" value={trigger} onChange={(e) => setTrigger(e.target.value as AlertTrigger)}>
              {TRIGGER_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TRIGGER_LABELS[t]}
                </option>
              ))}
            </select>
          ) : (
            <span className="ca-trigger">한 번만</span>
          )}
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

        {instance && interval && (
          <p className="ca-note">
            {INTERVAL_INFO[interval].short} 봉으로 계산합니다. 지표 알림은 이 앱이 열려 있는 동안(다른 탭에 있어도)
            울리고, 앱을 닫으면 오지 않습니다.
          </p>
        )}

        {error && <p className="ca-error">{error}</p>}
      </div>
    </Dialog>
  )
}
