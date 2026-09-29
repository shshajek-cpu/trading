/**
 * 가격·선 알림 판정(감시기 1단계). 모양 검사와 판정 규칙은 앱과 같은 lib/alertRules 를 쓴다 — 여기서는 동기화 설정에서
 * 감시 목록을 뽑고, 1분봉을 시간순 가격 점으로 펴서 점마다 그 규칙을 돌린다. KV·네트워크는 모른다(따로 시험할 수 있게).
 */
import {
  alertSince,
  bandAt,
  geometryKey,
  initialPriceState,
  isExpired,
  isMoveKind,
  lineAlertMode,
  lineRule,
  moveHit,
  parseLineAlertOptions,
  parsePriceAlert,
  priceBand,
  stepRule,
  type AlertGeometry,
  type Band,
  type BandRule,
  type LineAlertMode,
  type LineAlertOptions,
  type PriceAlert,
  type RuleState,
  type Target,
} from '../src/lib/alertRules'

const MINUTE_MS = 60_000

/** 1분봉 하나(worker/market 의 Bar 와 같은 모양). 전체 시세의 현재가는 시작·끝이 같은 점 하나다. */
export interface PathBar {
  /** 시작 시각(ms) */
  t: number
  /** 이 자료가 덮는 끝 시각(ms). 닫힌 봉은 t + 1분, 진행 중인 봉은 조회 시각. */
  end: number
  /** 더 바뀌지 않는 자료. 판정 기록(RuleMark)은 닫힌 자료로만 적는다 — 진행 중인 봉은 닫힌 뒤 다시 본다. */
  closed: boolean
  o: number
  h: number
  l: number
  c: number
}

/**
 * 감시기가 알림마다 적어 두는 판정 상태와 그것을 확인한 시각(at, ms) — 이 시각 뒤의 움직임만 본다.
 * target 이 null 이면 아직 걸리지 않았다(「매번」 알림은 울린 뒤 다시 걸리기를 기다린다). firedAt 은 「매번」 알림이 마지막으로 울린 시각.
 * /api/push 와 모양이 같아야 한다.
 */
export interface RuleMark {
  target: Target | null
  at: number
  firedAt?: number
}

/** 동기화 설정에서 뽑은 켜진 선 알림(아직 안 울렸고 만료되지 않았다). */
export interface WatchLine {
  id: string
  symbol: string
  mode: LineAlertMode
  geometry: AlertGeometry
  opts?: LineAlertOptions
  /** 감시 시작 — 알림을 켜거나 선을 옮긴 시각(없으면 그린 시각). */
  since: number
}

/** 켜진 가격 알림. 모양 검사는 앱(usePriceAlerts)과 같다 — 앱이 버리는 항목은 감시하지 않는다. 만료된 것은 뺀다. */
export function readAlerts(list: unknown[], now: number): PriceAlert[] {
  const out: PriceAlert[] = []
  for (const value of list) {
    const alert = parsePriceAlert(value)
    if (alert?.active && !isExpired(alert, now)) out.push(alert)
  }
  return out
}

function isGeoPoint(p: unknown): p is { time: number; price: number } {
  if (typeof p !== 'object' || p === null) return false
  const { time, price } = p as Record<string, unknown>
  return typeof time === 'number' && Number.isFinite(time) && typeof price === 'number' && Number.isFinite(price)
}

/** 아직 안 울린 선 알림. 앱의 감시 조건과 같다 — 알림을 걸 수 있는 그림이고, 켜져 있고, 울리지 않았고, 만료되지 않았다. */
export function readLines(list: unknown[], now: number): WatchLine[] {
  const out: WatchLine[] = []
  for (const value of list) {
    if (typeof value !== 'object' || value === null) continue
    const { id, symbol, kind, alert, fired, points, style, alertOpts, createdAt } = value as Record<string, unknown>
    if (typeof id !== 'string' || typeof symbol !== 'string' || typeof kind !== 'string') continue
    const mode = lineAlertMode(kind)
    if (!mode || alert !== true || fired === true) continue
    if (!Array.isArray(points) || points.length === 0 || !points.every(isGeoPoint)) continue
    const opts = parseLineAlertOptions(alertOpts)
    if (opts && isExpired(opts, now)) continue
    const s = typeof style === 'object' && style !== null ? (style as Record<string, unknown>) : {}
    out.push({
      id,
      symbol,
      mode,
      geometry: {
        kind,
        points,
        style: { extendLeft: s.extendLeft === true, extendRight: s.extendRight === true },
      },
      ...(opts ? { opts } : {}),
      since: opts?.since ?? (typeof createdAt === 'number' ? createdAt : 0),
    })
  }
  return out
}

/** 가격 알림의 판정 기록 키. 고치거나 다시 켜거나 걸리면 감시 시작이 바뀌어 새로 시작한다. */
export function alertKey(alert: PriceAlert): string {
  return `${alert.id}@${alertSince(alert)}`
}

/** 선 알림의 판정 기록 키. 옮기거나 알림을 다시 켜거나 조건을 바꾸면 새로 시작한다. */
export function lineKey(line: WatchLine): string {
  return `${line.id}@${line.since}@${geometryKey(line.geometry)}@${line.opts?.when ?? ''}`
}

/** 판정에 쓰는 가격 점 하나 — 가격, 시각(ms), 그 점이 속한 봉. */
interface Point {
  price: number
  t: number
  bar: PathBar
}

/**
 * from(ms) 뒤의 움직임을 시간순 가격 점으로 편다.
 * - from 뒤에 시작한 봉: 시가 → 양봉이면 저가 → 고가, 음봉이면 고가 → 저가 → 종가. 봉 안의 실제 순서는 알 수 없어
 *   흔히 쓰는 가정을 따른다. 시각은 시가 = 봉 시작, 고가·저가 = 봉 가운데, 종가 = 봉 끝(기울어진 선의 가격을 이 시각으로 잡는다).
 * - from 을 품은 봉: 앞부분이 from 전이라 고가·저가를 믿을 수 없다. 봉 끝의 가격(종가)만 쓴다.
 * - from 전에 끝난 봉은 버린다.
 */
export function pathSince(bars: readonly PathBar[], from: number): Point[] {
  const points: Point[] = []
  for (const bar of bars) {
    if (bar.end <= from) continue
    const mid = (bar.t + bar.end) / 2
    const path: [number, number][] =
      bar.t < from
        ? [[bar.c, bar.end]]
        : bar.c >= bar.o
          ? [[bar.o, bar.t], [bar.l, mid], [bar.h, mid], [bar.c, bar.end]]
          : [[bar.o, bar.t], [bar.h, mid], [bar.l, mid], [bar.c, bar.end]]
    for (const [price, t] of path) if (points.at(-1)?.price !== price) points.push({ price, t, bar })
  }
  return points
}

/**
 * 판정 결과. fire: 울릴 점(가격·시각·그 점이 뜻하는 목표)과, 「매번」 알림이면 울린 뒤 적을 기록.
 * mark: 울리지 않았지만 새로 적을 기록(닫힌 봉에서 걸렸다).
 */
export type Verdict = { fire: { price: number; t: number; target: Target | null }; mark?: RuleMark } | { mark: RuleMark } | null

function toMark(state: RuleState, at: number): RuleMark {
  return { target: state.target, at, ...(state.firedAt !== undefined ? { firedAt: state.firedAt } : {}) }
}

/** 이동 % 알림. 감시 시작(「매번」이면 마지막 발동) 뒤의 점마다, 그 앞 N분 안의 최저·최고와 비교한다. */
function judgeMove(alert: PriceAlert, mark: RuleMark | undefined, bars: readonly PathBar[]): Verdict {
  const kind = alert.kind
  if (!kind || !isMoveKind(kind)) return null
  const last = alert.repeat === 'every' ? mark?.firedAt : undefined
  const from = Math.max(alertSince(alert), last ?? 0)
  const points = pathSince(bars, from)
  const samples = points.map((p) => ({ t: p.t, lo: p.price, hi: p.price }))
  const wait = last !== undefined ? last + (alert.cooldown ?? 0) * MINUTE_MS : 0
  for (const p of points) {
    if (p.t < wait) continue
    if (!moveHit(kind, alert.price, alert.minutes ?? 1, samples, from, p.t, p.price)) continue
    return {
      fire: { price: p.price, t: p.t, target: null },
      ...(alert.repeat === 'every' ? { mark: { target: null, at: p.bar.end, firedAt: p.t } } : {}),
    }
  }
  return null
}

/**
 * 띠 판정 공통: state 에서 시작해 from 뒤의 점마다 규칙을 돌린다. band 는 점 시각의 띠(그 시각에 그림이 없으면 null — 건너뛴다).
 * 거는 점에서는 울리지 않는다(앱도 거는 틱에는 울리지 않는다).
 */
function judgeBand(
  rule: BandRule,
  start: RuleState,
  from: number,
  bars: readonly PathBar[],
  band: (t: number) => Band | null,
  timing: LineAlertOptions | PriceAlert,
): Verdict {
  let state = start
  let mark: RuleMark | null = null
  for (const p of pathSince(bars, from)) {
    const b = band(p.t)
    if (!b) continue
    const step = stepRule(rule, state, p.price, b, p.t, timing)
    if (step.fired) {
      return {
        fire: { price: p.price, t: p.t, target: state.target },
        ...(timing.repeat === 'every' ? { mark: toMark(step.state, p.bar.end) } : {}),
      }
    }
    if (step.state === state) continue
    state = step.state
    // 닫힌 봉에서 걸린 것만 적는다. 진행 중인 봉에서 걸렸으면 봉이 닫힌 뒤 다시 보고 적는다(쓰기는 한 번 그대로).
    if (p.bar.closed) mark = toMark(state, p.bar.end)
  }
  return mark ? { mark } : null
}

/**
 * 가격 알림 하나를 앱(usePriceAlerts.checkPrice)과 같은 규칙으로 점마다 판정한다. 기록(mark)이 없으면 저장된 알림이
 * 뜻하는 상태(한 번만 알림이 앱에서 걸렸으면 그 목표)에서 감시 시작 뒤부터 본다.
 */
export function judgePrice(alert: PriceAlert, mark: RuleMark | undefined, bars: readonly PathBar[]): Verdict {
  const kind = alert.kind ?? 'cross'
  if (isMoveKind(kind)) return judgeMove(alert, mark, bars)
  const band = priceBand(alert)
  const start = mark ? { target: mark.target, ...(mark.firedAt !== undefined ? { firedAt: mark.firedAt } : {}) } : initialPriceState(alert)
  return judgeBand(kind, start, Math.max(alertSince(alert), mark?.at ?? 0), bars, () => band, alert)
}

/**
 * 선·도형 하나를 앱(useDrawings.checkPrice)과 같은 규칙으로 판정한다. 첫 점은 기준만 잡는다.
 * 기록이 없으면 감시 시작과 설정이 저장된 시각(savedAt) 중 늦은 때부터 본다 — 예전 앱이 옮긴 선은 감시 시작을 새로 적지 않았다.
 */
export function judgeLine(line: WatchLine, mark: RuleMark | undefined, bars: readonly PathBar[], savedAt: number): Verdict {
  const start = mark ? { target: mark.target, ...(mark.firedAt !== undefined ? { firedAt: mark.firedAt } : {}) } : { target: null }
  const from = mark ? mark.at : Math.max(line.since, savedAt)
  return judgeBand(lineRule(line.mode, line.opts), start, from, bars, (t) => bandAt(line.geometry, t), line.opts ?? {})
}

/** 수직선(시각 알림): 감시 시작 뒤에 그 시각이 지났다. */
export function timeReached(line: WatchLine, now: number): boolean {
  const at = line.geometry.points[0].time * 1000
  return at > line.since && at <= now
}

/** 이동 % 알림이 있는 종목마다 읽어야 하는 1분봉 수(시간 창 + 진행 중인 봉과 앞선 봉). */
export function barsNeeded(alerts: readonly PriceAlert[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const a of alerts) {
    if (!a.kind || !isMoveKind(a.kind)) continue
    out.set(a.symbol, Math.max(out.get(a.symbol) ?? 0, (a.minutes ?? 1) + 2))
  }
  return out
}
