import type { Interval } from './binance'
import { isInterval } from './intervals'
import { toIndicatorInstance, type IndicatorInstance } from './indicatorConfig'
import { notifySettingsChanged } from './syncBus'

/** TradingView 알림 조건 어휘: 교차 / 상향 교차 / 하향 교차 / 보다 큼 / 보다 작음. */
export type IndicatorCondition = 'crossing' | 'crossingUp' | 'crossingDown' | 'greater' | 'less'

/** 얼마나 자주 울릴지 — TradingView "트리거". */
export type AlertTrigger = 'once' | 'perBar' | 'perBarClose'

export const CONDITION_LABELS: Record<IndicatorCondition, string> = {
  crossing: '교차',
  crossingUp: '상향 교차',
  crossingDown: '하향 교차',
  greater: '보다 큼',
  less: '보다 작음',
}

export const CONDITION_ORDER: IndicatorCondition[] = ['crossing', 'crossingUp', 'crossingDown', 'greater', 'less']

export const TRIGGER_LABELS: Record<AlertTrigger, string> = {
  once: '한 번만',
  perBar: '봉마다 한 번',
  perBarClose: '봉 마감 시 한 번',
}

export const TRIGGER_ORDER: AlertTrigger[] = ['once', 'perBar', 'perBarClose']

export interface IndicatorAlert {
  id: string
  symbol: string
  interval: Interval
  /**
   * 만든 순간의 지표 사본. 차트에서 지표를 지우거나 설정을 바꿔도 알림은 만든 그대로 동작한다
   * (TradingView 와 같다).
   */
  indicator: IndicatorInstance
  /** 지표 제목(예: "Vol 급증 100")과 고른 선. */
  title: string
  lineKey: string
  lineName: string
  condition: IndicatorCondition
  value: number
  trigger: AlertTrigger
  active: boolean
  createdAt: number
  /** 봉마다 울리는 알림이 같은 봉에서 또 울리지 않게 마지막으로 울린 봉의 시각. */
  lastBar?: number
  /** 마지막으로 울린 시각(ms). */
  firedAt?: number
  message?: string
}

export type NewIndicatorAlert = Omit<IndicatorAlert, 'id' | 'active' | 'createdAt' | 'lastBar' | 'firedAt'>

/**
 * 조건 판정. prev 는 직전 봉의 값, cur 는 지금(진행 중이거나 방금 마감한) 봉의 값.
 * 교차는 직전 봉과 지금 봉 사이에 기준을 넘었는지 본다.
 */
export function conditionMet(condition: IndicatorCondition, prev: number | undefined, cur: number, value: number): boolean {
  switch (condition) {
    case 'greater':
      return cur > value
    case 'less':
      return cur < value
    case 'crossingUp':
      return prev !== undefined && prev < value && cur >= value
    case 'crossingDown':
      return prev !== undefined && prev > value && cur <= value
    case 'crossing':
      return prev !== undefined && ((prev < value && cur >= value) || (prev > value && cur <= value))
  }
}

export function formatAlertValue(value: number): string {
  return Number(value.toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: 8 })
}

/** 목록·알림 문구용 한 줄 설명. 예: "Vol 급증 100 · 급증 강도 (σ) 보다 큼 2.5". */
export function describeIndicatorAlert(a: Pick<IndicatorAlert, 'title' | 'lineName' | 'condition' | 'value'>): string {
  return `${a.title} · ${a.lineName} ${CONDITION_LABELS[a.condition]} ${formatAlertValue(a.value)}`
}

export const INDICATOR_ALERTS_STORAGE_KEY = 'trading.indicatorAlerts.v1'

const CONDITIONS = new Set<string>(CONDITION_ORDER)
const TRIGGERS = new Set<string>(TRIGGER_ORDER)

function toAlert(v: unknown): IndicatorAlert | null {
  if (typeof v !== 'object' || v === null) return null
  const a = v as Record<string, unknown>
  const indicator = toIndicatorInstance(a.indicator)
  if (
    !indicator ||
    typeof a.id !== 'string' ||
    typeof a.symbol !== 'string' ||
    !isInterval(a.interval) ||
    typeof a.title !== 'string' ||
    typeof a.lineKey !== 'string' ||
    typeof a.lineName !== 'string' ||
    typeof a.condition !== 'string' ||
    !CONDITIONS.has(a.condition) ||
    typeof a.value !== 'number' ||
    !Number.isFinite(a.value) ||
    typeof a.trigger !== 'string' ||
    !TRIGGERS.has(a.trigger) ||
    typeof a.active !== 'boolean' ||
    typeof a.createdAt !== 'number'
  ) {
    return null
  }
  return {
    id: a.id,
    symbol: a.symbol,
    interval: a.interval,
    indicator,
    title: a.title,
    lineKey: a.lineKey,
    lineName: a.lineName,
    condition: a.condition as IndicatorCondition,
    value: a.value,
    trigger: a.trigger as AlertTrigger,
    active: a.active,
    createdAt: a.createdAt,
    ...(typeof a.lastBar === 'number' ? { lastBar: a.lastBar } : {}),
    ...(typeof a.firedAt === 'number' ? { firedAt: a.firedAt } : {}),
    ...(typeof a.message === 'string' ? { message: a.message } : {}),
  }
}

export function loadIndicatorAlerts(): IndicatorAlert[] {
  try {
    const raw = localStorage.getItem(INDICATOR_ALERTS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(toAlert).filter((a): a is IndicatorAlert => a !== null)
  } catch {
    return []
  }
}

export function saveIndicatorAlerts(alerts: IndicatorAlert[]): void {
  try {
    localStorage.setItem(INDICATOR_ALERTS_STORAGE_KEY, JSON.stringify(alerts))
    notifySettingsChanged()
  } catch {
    /* 저장 실패는 무시 — 메모리 상태는 유지된다. */
  }
}
