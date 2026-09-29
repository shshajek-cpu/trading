import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Dialog } from './ui/Dialog'
import {
  describePriceAlert,
  isChannelKind,
  isMoveKind,
  MOVE_MINUTES_MAX,
  PRICE_ALERT_KINDS,
  PRICE_ALERT_KIND_LABELS,
  type PriceAlert,
  type PriceAlertInput,
  type PriceAlertKind,
  type Side,
} from '../lib/alertRules'
import { AlertTimingFields } from './AlertTimingFields'
import { timingDraftOf, timingFromDraft, type TimingDraft } from '../lib/alertTimingDraft'
import { useSymbols } from '../hooks/useSymbols'
import { displaySymbol, priceDecimals } from '../lib/symbols'
import type { Interval } from '../lib/market/types'
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
  onCreate: (input: PriceAlertInput) => void
  /** 이 가격 알림을 고친다(가격 알림만). 있으면 제목·버튼이 편집으로 바뀌고 저장하면 onUpdate 를 부른다. */
  editing?: PriceAlert | null
  onUpdate?: (id: string, input: Omit<PriceAlertInput, 'symbol'>) => void
  /** 지표 알림: 지금 차트의 주기와 지표 목록. 없으면 가격 알림만 만든다. */
  interval?: Interval
  indicators?: IndicatorInstance[]
  /** 범례 🔔 처럼 특정 지표로 열 때 그 지표 id. */
  initialIndicatorId?: string | null
  onCreateIndicatorAlert?: (alert: NewIndicatorAlert) => void
}

/**
 * 고른 조건을 저장할 condition·pending 으로 바꾼다. 교차는 현재가 쪽을 보고 넘어갈 쪽을 정한다.
 * 현재가와 같은 가격이거나 현재가를 모르면 아직 정할 수 없다 — pending 으로 두면 가격이 먼저 한쪽에 선 뒤에 건다
 * (그러지 않으면 만들자마자 다음 틱에 울린다). 채널 진입·이탈도 가격이 먼저 채널 밖·안에 있어야 건다.
 */
function resolveAlert(
  kind: PriceAlertKind,
  lo: number,
  hi: number,
  livePrice: number | null,
  tick: number,
): { condition: Side; pending: boolean } {
  if (kind === 'gt' || kind === 'moveUp' || kind === 'inside' || kind === 'outside') return { condition: 'above', pending: false }
  if (kind === 'lt' || kind === 'moveDown') return { condition: 'below', pending: false }
  if (kind === 'crossUp') return { condition: 'above', pending: livePrice == null }
  if (kind === 'crossDown') return { condition: 'below', pending: livePrice == null }
  if (kind === 'enter') return { condition: 'above', pending: livePrice == null || (livePrice >= lo && livePrice <= hi) }
  if (kind === 'exit') return { condition: 'above', pending: livePrice == null || livePrice < lo || livePrice > hi }
  const eps = tick > 0 ? tick / 2 : 1e-12
  if (livePrice == null || Math.abs(lo - livePrice) < eps) return { condition: 'above', pending: true }
  return { condition: lo < livePrice ? 'below' : 'above', pending: false }
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
/** 이동 % 조건을 처음 고를 때 채우는 값. */
const MOVE_DEFAULT_PCT = '1'
const MOVE_DEFAULT_MINUTES = '15'
/** 채널 조건을 처음 고를 때 두 번째 경계를 첫 값에서 이만큼 떨어뜨린다. */
const CHANNEL_GAP = 0.01

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

interface StepperProps {
  value: string
  onChange: (next: string) => void
  onBump: (dir: 1 | -1) => void
  inputRef?: React.Ref<HTMLInputElement>
  min?: string
}

/** − [값] + 입력칸. */
function Stepper({ value, onChange, onBump, inputRef, min }: StepperProps) {
  return (
    <div className="ca-stepper">
      <button type="button" className="tv-icon-btn ca-step" aria-label="감소" onClick={() => onBump(-1)}>
        −
      </button>
      <input
        ref={inputRef}
        className="tv-input ca-value"
        type="number"
        step="any"
        inputMode="decimal"
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="tv-icon-btn ca-step" aria-label="증가" onClick={() => onBump(1)}>
        +
      </button>
    </div>
  )
}

export function CreateAlertDialog({
  open,
  onClose,
  symbol,
  livePrice,
  initialPrice,
  onCreate,
  editing,
  onUpdate,
  interval,
  indicators = [],
  initialIndicatorId,
  onCreateIndicatorAlert,
}: CreateAlertDialogProps) {
  const infos = useSymbols()
  const dec = priceDecimals(symbol, infos)
  const tick = infos.find((i) => i.symbol === symbol)?.tickSize ?? 0
  const isEdit = Boolean(editing && onUpdate)
  // 선 값이 없는 지표(볼륨 프로파일 등)는 알림 대상이 될 수 없다.
  const alertable = useMemo(() => indicators.filter((i) => alertLines(i).length > 0), [indicators])
  const canIndicator = Boolean(!isEdit && interval && onCreateIndicatorAlert && alertable.length > 0)

  const [source, setSource] = useState<string>(PRICE)
  const [priceKind, setPriceKind] = useState<PriceAlertKind>('cross')
  const [lineKey, setLineKey] = useState('')
  const [indicatorCondition, setIndicatorCondition] = useState<IndicatorCondition>('crossing')
  const [trigger, setTrigger] = useState<AlertTrigger>('once')
  const [value, setValue] = useState('')
  /** 채널 조건의 다른 경계. */
  const [value2, setValue2] = useState('')
  /** 이동 % 조건의 시간 창(분). */
  const [minutes, setMinutes] = useState(MOVE_DEFAULT_MINUTES)
  const [timing, setTiming] = useState<TimingDraft>(() => timingDraftOf(undefined))
  /** 직접 쓴 메모. null 이면 조건을 따라 바뀌는 자동 문구를 쓴다. */
  const [customMessage, setCustomMessage] = useState<string | null>(null)
  const [error, setError] = useState('')
  const formId = useId()
  const valueRef = useRef<HTMLInputElement>(null)
  // 열릴 때 채운 기준값 — 그 값이 입력칸에 그려진 뒤 포커스·전체 선택한다(바로 고쳐 치게).
  const selectOnOpen = useRef<string | null>(null)

  const instance = source === PRICE ? null : (alertable.find((i) => i.id === source) ?? null)
  const lines = useMemo(() => (instance ? alertLines(instance) : []), [instance])
  const line = lines.find((l) => l.key === lineKey) ?? lines[0]
  const channel = !instance && isChannelKind(priceKind)
  const move = !instance && isMoveKind(priceKind)

  /** 지금 입력으로 만든 자동 문구. */
  const autoMessage = (): string => {
    const num = Number(value)
    if (instance && line) {
      return `${symbol} ${interval ? INTERVAL_INFO[interval].short : ''} ${describeIndicatorAlert({
        title: indicatorTitle(instance),
        lineName: line.name,
        condition: indicatorCondition,
        value: Number.isFinite(num) ? num : 0,
      })}`
    }
    // 가격 알림 문구는 보이는 이름(BTCUSDT.P·BTCKRW·삼성전자 등)으로 — 푸시 본문에도 이 메모가 그대로 간다.
    const name = displaySymbol(symbol, infos)
    if (value.trim() === '' || !Number.isFinite(num)) return `${name} 가격 알림`
    const draft: PriceAlert = {
      id: '',
      symbol,
      condition: 'above',
      price: num,
      active: true,
      createdAt: 0,
      kind: priceKind,
      price2: Number(value2) || num,
      minutes: Number(minutes) || 1,
    }
    return `${name} ${describePriceAlert(draft, (p) => fmt(p, dec))}`
  }
  const message = customMessage ?? autoMessage()

  // 지표를 고르면 선·조건·트리거·기준값을 그 지표에 맞춰 채운다. 채운 기준값을 돌려준다.
  const pickSource = (next: string, fromOpen = false): string => {
    setSource(next)
    setError('')
    const nextInstance = next === PRICE ? null : (alertable.find((i) => i.id === next) ?? null)
    if (!nextInstance) {
      const start = (fromOpen ? initialPrice : null) ?? livePrice
      const initial = start != null ? fmt(start, dec) : ''
      // 이동 % 조건을 고른 채 가격으로 돌아오면 값은 퍼센트 그대로다.
      const text = isMoveKind(priceKind) && !fromOpen ? MOVE_DEFAULT_PCT : initial
      setValue(text)
      return text
    }
    const nextLines = alertLines(nextInstance)
    const spike = nextInstance.kind === 'volumeSpike'
    const nextLine = nextLines.find((l) => l.key === 'ratio') ?? nextLines[0]
    setLineKey(nextLine?.key ?? '')
    setIndicatorCondition(spike ? 'greater' : 'crossing')
    // 급증은 한 번 울리고 끝나면 다음 급증을 놓친다 — 봉마다 한 번이 기본.
    setTrigger(spike ? 'perBar' : 'once')
    const initial = nextLine ? defaultIndicatorValue(nextInstance, nextLine.key, livePrice) : null
    const text = initial !== null ? formatAlertValue(initial).replace(/,/g, '') : ''
    setValue(text)
    return text
  }

  // 조건을 바꾸면 값의 뜻(가격 ↔ 퍼센트)과 두 번째 경계를 맞춰 채운다.
  const pickKind = (next: PriceAlertKind) => {
    const wasMove = isMoveKind(priceKind)
    setPriceKind(next)
    setError('')
    let price = value
    if (isMoveKind(next) && !wasMove) setValue(MOVE_DEFAULT_PCT)
    if (!isMoveKind(next) && wasMove) {
      price = livePrice != null ? fmt(livePrice, dec) : ''
      setValue(price)
    }
    const base = Number(price)
    if (isChannelKind(next) && !(Number(value2) > 0) && base > 0) setValue2(fmt(base * (1 + CHANNEL_GAP), dec))
  }

  useEffect(() => {
    if (!open) return
    setError('')
    if (editing && onUpdate) {
      // 편집: 그 알림의 값으로 채운다(대상은 가격 고정).
      setSource(PRICE)
      const kind = editing.kind ?? 'cross'
      setPriceKind(kind)
      const initial = isMoveKind(kind) ? String(editing.price) : fmt(editing.price, dec)
      setValue(initial)
      setValue2(editing.price2 !== undefined ? fmt(editing.price2, dec) : '')
      setMinutes(String(editing.minutes ?? MOVE_DEFAULT_MINUTES))
      setTiming(timingDraftOf(editing))
      // 저장된 메모가 자동 문구 그대로면 직접 쓴 것이 아니다 — 값을 고치면 문구도 따라 바뀌게 둔다.
      const auto = `${displaySymbol(editing.symbol, infos)} ${describePriceAlert(editing, (p) => fmt(p, dec))}`
      setCustomMessage(editing.message && editing.message !== auto ? editing.message : null)
      selectOnOpen.current = initial
      return
    }
    setCustomMessage(null)
    setPriceKind('cross')
    setValue2('')
    setMinutes(MOVE_DEFAULT_MINUTES)
    setTiming(timingDraftOf(undefined))
    const preset = initialIndicatorId && alertable.some((i) => i.id === initialIndicatorId) ? initialIndicatorId : PRICE
    selectOnOpen.current = pickSource(canIndicator ? preset : PRICE, true)
    // 열린 순간의 값만 초기값으로 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, symbol, initialIndicatorId, editing?.id])

  // Dialog 는 첫 칸(대상·조건 선택)에 포커스를 준다. 알림은 거의 늘 가격을 고치므로 값 칸으로 옮긴다.
  useEffect(() => {
    const el = valueRef.current
    if (!open || !el || selectOnOpen.current === null || value !== selectOnOpen.current) return
    selectOnOpen.current = null
    el.focus()
    el.select()
  }, [open, value])

  const bump = (current: string, set: (next: string) => void, dir: 1 | -1) => {
    const num = Number(current)
    const base = Number.isFinite(num) ? num : (livePrice ?? 0)
    setError('')
    if (instance || move) {
      const next = base + dir * stepFor(base || 1)
      set(formatAlertValue(move ? Math.max(0, next) : next).replace(/,/g, ''))
      return
    }
    set(fmt(Math.max(0, base + dir * (tick > 0 ? tick : stepFor(base))), dec))
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const num = Number(value)
    if (value.trim() === '' || !Number.isFinite(num) || (!instance && num <= 0)) {
      setError(instance ? '기준값을 입력하세요.' : move ? '변동 폭(%)을 입력하세요.' : '올바른 가격을 입력하세요.')
      return
    }
    const times = timingFromDraft(timing, !instance)
    if (typeof times === 'string') {
      setError(times)
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
        ...(times.expiresAt !== undefined ? { expiresAt: times.expiresAt } : {}),
      })
      onClose()
      return
    }
    const num2 = Number(value2)
    if (channel && (value2.trim() === '' || !Number.isFinite(num2) || num2 <= 0 || num2 === num)) {
      setError('채널의 두 경계 가격을 서로 다르게 넣으세요.')
      return
    }
    const mins = Number(minutes)
    if (move && (num > 100 || !Number.isInteger(mins) || mins < 1 || mins > MOVE_MINUTES_MAX)) {
      setError(`변동 폭은 100% 이하, 기간은 1~${MOVE_MINUTES_MAX}분(정수)으로 넣으세요.`)
      return
    }
    // 상향·하향 교차는 가격이 반대편에서 넘어와야 한다. 이미 넘어가 있으면 첫 틱에 바로 울려 버린다.
    if (livePrice != null && priceKind === 'crossUp' && livePrice >= num) {
      setError('현재가가 이미 이 가격 위에 있어 바로 울립니다. 더 높은 가격을 넣거나 "보다 큼"을 고르세요.')
      return
    }
    if (livePrice != null && priceKind === 'crossDown' && livePrice <= num) {
      setError('현재가가 이미 이 가격 아래에 있어 바로 울립니다. 더 낮은 가격을 넣거나 "보다 작음"을 고르세요.')
      return
    }
    const lo = channel ? Math.min(num, num2) : num
    const hi = channel ? Math.max(num, num2) : num
    const { condition, pending } = resolveAlert(priceKind, lo, hi, livePrice, tick)
    const input: Omit<PriceAlertInput, 'symbol'> = {
      condition,
      // 채널은 위 경계를 price, 아래 경계를 price2 로 둔다.
      price: hi,
      kind: priceKind,
      message,
      ...(pending ? { pending: true } : {}),
      ...(channel ? { price2: lo } : {}),
      ...(move ? { minutes: mins } : {}),
      ...times,
    }
    if (editing && onUpdate) onUpdate(editing.id, input)
    else onCreate({ symbol, ...input })
    onClose()
  }

  const onValue = (next: string) => {
    setValue(next)
    setError('')
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? `${displaySymbol(symbol, infos)} 알림 편집` : `${displaySymbol(symbol, infos)}에 알림 만들기`}
      width={480}
      className="ca-dialog"
      footer={
        <>
          <button type="button" className="tv-btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" form={formId} className="tv-btn primary">
            {isEdit ? '저장' : '만들기'}
          </button>
        </>
      }
    >
      {/* 폼으로 감싸 값 칸에서 Enter 를 누르면 만들기와 같다(만들기 버튼은 footer 에 있어 form 속성으로 잇는다). */}
      <form id={formId} className="ca-body" onSubmit={submit}>
        {canIndicator && (
          <label className="ca-field">
            <span className="ca-label">대상</span>
            <select className="tv-input ca-select" value={source} onChange={(e) => pickSource(e.target.value)}>
              <option value={PRICE}>가격</option>
              {alertable.map((i) => (
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
            <select className="tv-input ca-select" value={line?.key ?? ''} onChange={(e) => setLineKey(e.target.value)}>
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
              onChange={(e) => setIndicatorCondition(e.target.value as IndicatorCondition)}
            >
              {CONDITION_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
          ) : (
            <select className="tv-input ca-select" value={priceKind} onChange={(e) => pickKind(e.target.value as PriceAlertKind)}>
              {PRICE_ALERT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PRICE_ALERT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="ca-field">
          <span className="ca-label">{instance ? '기준값' : channel ? '경계 1' : move ? '변동 폭(%)' : '값'}</span>
          <Stepper
            value={value}
            onChange={onValue}
            onBump={(dir) => bump(value, onValue, dir)}
            inputRef={valueRef}
            min={instance ? undefined : '0'}
          />
        </label>

        {channel && (
          <label className="ca-field">
            <span className="ca-label">경계 2</span>
            <Stepper
              value={value2}
              onChange={(next) => {
                setValue2(next)
                setError('')
              }}
              onBump={(dir) => bump(value2, setValue2, dir)}
              min="0"
            />
          </label>
        )}

        {move && (
          <label className="ca-field">
            <span className="ca-label">기간(분)</span>
            <input
              className="tv-input ca-value"
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              max={MOVE_MINUTES_MAX}
              value={minutes}
              onChange={(e) => {
                setMinutes(e.target.value)
                setError('')
              }}
            />
          </label>
        )}

        {instance && (
          <label className="ca-field">
            <span className="ca-label">트리거</span>
            <select className="tv-input ca-select" value={trigger} onChange={(e) => setTrigger(e.target.value as AlertTrigger)}>
              {TRIGGER_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TRIGGER_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
        )}

        <AlertTimingFields draft={timing} onChange={setTiming} repeat={!instance} hysteresis={!move} />

        <label className="ca-field ca-field-col">
          <span className="ca-label">메시지</span>
          <textarea className="tv-input ca-message" rows={3} value={message} onChange={(e) => setCustomMessage(e.target.value)} />
        </label>

        {instance && interval && (
          <p className="ca-note">
            {INTERVAL_INFO[interval].short} 봉으로 계산합니다. 앱이 열려 있으면 여기서 울리고, 「앱 꺼도 알림 받기」를 켜면
            앱을 닫아도 서버가 1분마다 확인해 푸시로 보냅니다(서버 값은 대체 시세 때문에 조금 다를 수 있습니다).
          </p>
        )}
        {!instance && timing.repeat === 'every' && (
          <p className="ca-note">
            {move
              ? '매번: 울린 뒤의 움직임으로 다시 잽니다.'
              : '매번: 울린 뒤 가격이 경계에서 다시 걸리는 거리만큼 벗어났다가 조건을 다시 채우면 또 울립니다.'}
          </p>
        )}

        {error && <p className="ca-error">{error}</p>}
      </form>
    </Dialog>
  )
}
