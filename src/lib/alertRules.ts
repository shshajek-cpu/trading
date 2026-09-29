/**
 * 가격·선 알림의 모양과 판정 규칙. 앱(usePriceAlerts·useDrawings)과 푸시 워커(worker/index.ts)가 같은 판정을 하도록
 * 함께 쓴다 — 워커 번들에 들어가므로 window·document·localStorage·차트 코드를 넣지 않는다.
 *
 * 판정은 모두 "띠"(아래 경계 lo, 위 경계 hi — 가격 하나면 lo = hi)와 "목표"(Target)로 한다.
 * 알림은 먼저 거는 조건(armTarget)이 맞아 목표가 정해진 뒤, 가격이 그 목표에 닿으면(hits) 울린다.
 * 「매번」 알림은 울린 뒤 목표를 비우고, 가격이 경계에서 히스테리시스(%)만큼 벗어나 다시 걸려야 또 울린다.
 */

/** 가격이 선의 어느 쪽인지(가격 알림의 condition). */
export type Side = 'above' | 'below'

/** 기다리는 목표. up: 가격 ≥ 아래 경계 · down: 가격 ≤ 위 경계 · in: 띠 안 · out: 띠 밖. */
export type Target = 'up' | 'down' | 'in' | 'out'

/** 판정할 가격 띠. 가격 하나(수평선·교차 알림)는 lo = hi. */
export interface Band {
  lo: number
  hi: number
}

/** 띠에 거는 조건. cross 는 가격 하나면 교차, 띠면 어느 경계든 넘기. */
export type BandRule = 'cross' | 'crossUp' | 'crossDown' | 'gt' | 'lt' | 'enter' | 'exit' | 'inside' | 'outside'

/** 판정 상태. target 이 null 이면 아직 걸리지 않았다. firedAt 은 「매번」 알림이 마지막으로 울린 시각(ms). */
export interface RuleState {
  target: Target | null
  firedAt?: number
}

/* ── 반복·만료 ─────────────────────────────────────────────────────── */

/** 트리거: 한 번만(울리면 꺼짐) · 매번(다시 걸리면 또 울림). */
export type RepeatMode = 'once' | 'every'

export const REPEAT_LABELS: Record<RepeatMode, string> = { once: '한 번만', every: '매번' }

/** 「매번」 알림이 다시 걸리려면 가격이 경계에서 벗어나야 하는 거리(%) 기본값. */
export const DEFAULT_HYSTERESIS = 0.1
export const HYSTERESIS_MAX = 50
/** 재알림 대기(분) 상한 — 일주일. */
export const COOLDOWN_MAX = 10_080

/** 알림마다의 반복·만료 설정. 모두 선택 — 없으면 한 번만·만료 없음. */
export interface AlertTiming {
  repeat?: 'every'
  /** 다시 걸리는 거리(%, 「매번」만). 없으면 DEFAULT_HYSTERESIS. */
  hysteresis?: number
  /** 울린 뒤 이만큼(분)은 다시 걸지도 울리지도 않는다(「매번」만). */
  cooldown?: number
  /** 이 시각(ms)부터는 울리지 않는다. */
  expiresAt?: number
}

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** 저장된 객체에서 올바른 반복·만료 필드만 골라낸다(틀린 값은 버린다 — 알림 자체는 살린다). */
export function parseTiming(v: Record<string, unknown>): AlertTiming {
  return {
    ...(v.repeat === 'every' ? { repeat: 'every' as const } : {}),
    ...(num(v.hysteresis) && v.hysteresis >= 0 && v.hysteresis <= HYSTERESIS_MAX ? { hysteresis: v.hysteresis } : {}),
    ...(num(v.cooldown) && v.cooldown > 0 && v.cooldown <= COOLDOWN_MAX ? { cooldown: v.cooldown } : {}),
    ...(num(v.expiresAt) && v.expiresAt > 0 ? { expiresAt: v.expiresAt } : {}),
  }
}

export function isExpired(timing: Pick<AlertTiming, 'expiresAt'>, now: number): boolean {
  return timing.expiresAt !== undefined && now >= timing.expiresAt
}

/** 「매번」 알림이 울린 뒤 다시 걸지 않고 기다리는 시간(ms). 한 번만 알림은 0. */
function cooldownMs(timing: AlertTiming): number {
  return timing.repeat === 'every' && timing.cooldown ? timing.cooldown * 60_000 : 0
}

/* ── 띠 판정 ───────────────────────────────────────────────────────── */

/** 처음부터 걸려 있는 조건(보다 큼·작음·채널 안·밖)의 목표. 나머지는 거는 조건을 먼저 본다. */
export function startTarget(rule: BandRule): Target | null {
  if (rule === 'gt') return 'up'
  if (rule === 'lt') return 'down'
  if (rule === 'inside') return 'in'
  if (rule === 'outside') return 'out'
  return null
}

/**
 * 거는 조건이 맞으면 기다릴 목표, 아직이면 null. h 는 경계에서 벗어나야 하는 비율 — 처음 걸 때는 0(가격이 선 위에만
 * 있지 않으면 된다), 「매번」 알림이 울린 뒤 다시 걸 때는 히스테리시스.
 */
export function armTarget(rule: BandRule, p: number, band: Band, h: number): Target | null {
  const below = p < band.lo - Math.abs(band.lo) * h
  const above = p > band.hi + Math.abs(band.hi) * h
  // 띠 안쪽으로 h 만큼 들어와 있다. 띠가 좁아 안쪽이 없으면 가운데만 본다.
  const inset = Math.min(Math.abs(band.lo) * h, (band.hi - band.lo) / 2)
  const inner = p >= band.lo + inset && p <= band.hi - inset
  switch (rule) {
    case 'crossUp':
    case 'gt':
      return below ? 'up' : null
    case 'crossDown':
    case 'lt':
      return above ? 'down' : null
    case 'enter':
    case 'inside':
      return below || above ? 'in' : null
    case 'exit':
    case 'outside':
      return inner ? 'out' : null
    case 'cross':
      if (below) return 'up'
      if (above) return 'down'
      // 가격 하나(lo = hi)에 딱 붙어 있으면 아직 어느 쪽인지 모른다.
      return band.hi > band.lo && inner ? 'out' : null
  }
}

/** 목표에 닿았는가. */
export function hits(target: Target, p: number, band: Band): boolean {
  switch (target) {
    case 'up':
      return p >= band.lo
    case 'down':
      return p <= band.hi
    case 'in':
      return p >= band.lo && p <= band.hi
    case 'out':
      return p < band.lo || p > band.hi
  }
}

export interface StepResult {
  /** 바뀌지 않았으면 넘긴 state 그대로(같은 객체). */
  state: RuleState
  fired: boolean
}

/**
 * 가격 점 하나로 한 걸음 판정한다. 거는 점에서는 울리지 않는다. 「매번」이면 울린 뒤 목표를 비우고 울린 시각을 적는다
 * (재알림 대기 동안은 걸지도 않는다). 한 번만이면 상태는 그대로 두고 fired 만 알린다 — 끄는 것은 부르는 쪽 몫이다.
 */
export function stepRule(rule: BandRule, state: RuleState, p: number, band: Band, t: number, timing: AlertTiming): StepResult {
  if (state.firedAt !== undefined && t < state.firedAt + cooldownMs(timing)) return { state, fired: false }
  if (state.target === null) {
    const h = state.firedAt !== undefined ? (timing.hysteresis ?? DEFAULT_HYSTERESIS) / 100 : 0
    const target = armTarget(rule, p, band, h)
    return target ? { state: { ...state, target }, fired: false } : { state, fired: false }
  }
  if (!hits(state.target, p, band)) return { state, fired: false }
  return { state: timing.repeat === 'every' ? { target: null, firedAt: t } : state, fired: true }
}

/* ── 이동 % ────────────────────────────────────────────────────────── */

export type MoveRule = 'moveUp' | 'moveDown'

/** 이동 % 알림이 볼 수 있는 가장 긴 시간 창(분). 서버는 이만큼의 1분봉을 읽는다. */
export const MOVE_MINUTES_MAX = 240

/** 가격 표본 — t(ms) 무렵의 최저·최고. */
export interface Sample {
  t: number
  lo: number
  hi: number
}

/**
 * 이동 % 조건: 지금 가격 p 가 [max(from, t - 분), t] 안의 최저가보다 pct% 이상 올랐다(moveUp) / 최고가보다 pct% 이상
 * 내렸다(moveDown). from 은 감시 시작(만든·고친 시각, 「매번」이면 마지막으로 울린 시각) — 그 전의 움직임은 보지 않는다.
 */
export function moveHit(rule: MoveRule, pct: number, minutes: number, samples: readonly Sample[], from: number, t: number, p: number): boolean {
  const start = Math.max(from, t - minutes * 60_000)
  const up = rule === 'moveUp'
  let base = up ? Infinity : -Infinity
  for (const s of samples) {
    if (s.t < start || s.t > t) continue
    base = up ? Math.min(base, s.lo) : Math.max(base, s.hi)
  }
  if (!Number.isFinite(base) || base <= 0) return false
  return up ? p >= base * (1 + pct / 100) : p <= base * (1 - pct / 100)
}

/* ── 가격 알림 ─────────────────────────────────────────────────────── */

/** 알림 창에서 고르는 조건(TradingView 어휘). */
export type PriceAlertKind = BandRule | MoveRule

export const PRICE_ALERT_KINDS: PriceAlertKind[] = [
  'cross',
  'crossUp',
  'crossDown',
  'gt',
  'lt',
  'enter',
  'exit',
  'inside',
  'outside',
  'moveUp',
  'moveDown',
]

export const PRICE_ALERT_KIND_LABELS: Record<PriceAlertKind, string> = {
  cross: '교차',
  crossUp: '상향 교차',
  crossDown: '하향 교차',
  gt: '보다 큼',
  lt: '보다 작음',
  enter: '채널 진입',
  exit: '채널 이탈',
  inside: '채널 안',
  outside: '채널 밖',
  moveUp: '상승 %',
  moveDown: '하락 %',
}

/** 가격 둘(채널)을 쓰는 조건. */
export function isChannelKind(kind: PriceAlertKind): kind is 'enter' | 'exit' | 'inside' | 'outside' {
  return kind === 'enter' || kind === 'exit' || kind === 'inside' || kind === 'outside'
}

export function isMoveKind(kind: PriceAlertKind): kind is MoveRule {
  return kind === 'moveUp' || kind === 'moveDown'
}

export interface PriceAlert extends AlertTiming {
  id: string
  symbol: string
  /** 가격 하나 조건이 넘어갈 쪽(above = 이상, below = 이하). 다른 조건에서는 쓰지 않는다(예전 앱이 읽는 필수 필드). */
  condition: Side
  /** 기준 가격. 채널 조건은 두 가격 중 하나, 이동 % 조건(moveUp·moveDown)은 퍼센트. */
  price: number
  active: boolean
  createdAt: number
  /**
   * 마지막으로 고치거나 다시 켜거나 한 번만 알림이 걸린 시각. 서버 감시기(worker)는 이 시각(없으면 createdAt) 뒤의
   * 움직임만 본다 — 고치기 전에 지나간 가격으로 울리지 않게. 예전 알림에는 없다.
   */
  updatedAt?: number
  /** 발동 시 함께 보여줄 메모. 선택. */
  message?: string
  /** 고른 조건(예전 알림에는 없다 — 그때는 교차다). */
  kind?: PriceAlertKind
  /**
   * 아직 걸리지 않았다 — 거는 조건(armTarget)을 먼저 봐야 한다. 한 번만 알림은 걸리면 앱이 지우고(가격 하나 조건은
   * 넘어갈 쪽을 condition 에 적는다), 「매번」 알림은 기기·서버가 각자 들고 있는 상태로 판정한다.
   */
  pending?: boolean
  /** 채널 조건의 다른 가격. */
  price2?: number
  /** 이동 % 조건의 시간 창(분). */
  minutes?: number
}

/** 새 알림·편집에 넘기는 값(id·켜짐·시각은 훅이 정한다). */
export type PriceAlertInput = Omit<PriceAlert, 'id' | 'active' | 'createdAt' | 'updatedAt'>

const KIND_SET: Record<string, true> = Object.fromEntries(PRICE_ALERT_KINDS.map((k) => [k, true]))

/** 저장된 가격 알림 하나. 모양이 틀리면 null. 앱(usePriceAlerts)과 서버 감시기가 같은 검사를 쓴다. */
export function parsePriceAlert(value: unknown): PriceAlert | null {
  if (typeof value !== 'object' || value === null) return null
  const a = value as Record<string, unknown>
  if (typeof a.id !== 'string' || typeof a.symbol !== 'string') return null
  if (a.condition !== 'above' && a.condition !== 'below') return null
  if (!num(a.price) || typeof a.active !== 'boolean' || !num(a.createdAt)) return null
  if (a.updatedAt !== undefined && !num(a.updatedAt)) return null
  if (a.message !== undefined && typeof a.message !== 'string') return null
  if (a.kind !== undefined && (typeof a.kind !== 'string' || KIND_SET[a.kind] !== true)) return null
  if (a.pending !== undefined && typeof a.pending !== 'boolean') return null
  const kind = a.kind as PriceAlertKind | undefined
  if (kind && isChannelKind(kind) && !(num(a.price2) && a.price2 > 0)) return null
  if (kind && isMoveKind(kind) && !(num(a.minutes) && a.minutes >= 1 && a.minutes <= MOVE_MINUTES_MAX && a.price > 0)) return null
  return {
    id: a.id,
    symbol: a.symbol,
    condition: a.condition,
    price: a.price,
    active: a.active,
    createdAt: a.createdAt,
    ...(a.updatedAt !== undefined ? { updatedAt: a.updatedAt as number } : {}),
    ...(a.message !== undefined ? { message: a.message as string } : {}),
    ...(kind ? { kind } : {}),
    ...(a.pending !== undefined ? { pending: a.pending as boolean } : {}),
    ...(kind && isChannelKind(kind) ? { price2: a.price2 as number } : {}),
    ...(kind && isMoveKind(kind) ? { minutes: a.minutes as number } : {}),
    ...parseTiming(a),
  }
}

/** 감시 시작 시각 — 만들거나 고치거나 다시 켜거나 걸린 때. */
export function alertSince(alert: Pick<PriceAlert, 'createdAt' | 'updatedAt'>): number {
  return Math.max(alert.createdAt, alert.updatedAt ?? 0)
}

/** 가격 알림의 판정 띠. 이동 % 조건은 띠가 없다. */
export function priceBand(alert: Pick<PriceAlert, 'price' | 'price2' | 'kind'>): Band {
  const other = alert.kind && isChannelKind(alert.kind) && alert.price2 !== undefined ? alert.price2 : alert.price
  return { lo: Math.min(alert.price, other), hi: Math.max(alert.price, other) }
}

/** 저장된 알림이 뜻하는 처음 상태. 한 번만 알림이 걸렸으면(pending 아님) 그 목표. */
export function initialPriceState(alert: Pick<PriceAlert, 'kind' | 'pending' | 'condition'>): RuleState {
  const kind = alert.kind ?? 'cross'
  if (alert.pending || isMoveKind(kind)) return { target: null }
  if (kind === 'enter' || kind === 'inside') return { target: 'in' }
  if (kind === 'exit' || kind === 'outside') return { target: 'out' }
  return { target: alert.condition === 'above' ? 'up' : 'down' }
}

/** 목록·푸시 문구용 한 줄 설명. fmt 는 가격 표기(자릿수). 예: "60,000 ~ 65,000 채널 진입", "15분 안에 2% 상승". */
export function describePriceAlert(alert: PriceAlert, fmt: (price: number) => string): string {
  const kind = alert.kind ?? 'cross'
  if (isMoveKind(kind)) return `${alert.minutes ?? 0}분 안에 ${alert.price}% ${kind === 'moveUp' ? '상승' : '하락'}`
  if (isChannelKind(kind)) {
    const { lo, hi } = priceBand(alert)
    return `${fmt(lo)} ~ ${fmt(hi)} ${PRICE_ALERT_KIND_LABELS[kind]}`
  }
  // 조건이 없는 예전 알림은 이상/이하로 보인다.
  return `${fmt(alert.price)} ${alert.kind ? PRICE_ALERT_KIND_LABELS[alert.kind] : alert.condition === 'above' ? '이상' : '이하'}`
}

/* ── 선 알림(그림) ─────────────────────────────────────────────────── */

/** 알림을 걸 수 있는 그림과 판정 방식: level = 선 하나 교차, band = 도형 띠, time = 그 시각 도달. */
export type LineAlertMode = 'level' | 'band' | 'time'

const LINE_ALERT_MODES: Partial<Record<string, LineAlertMode>> = {
  horizontal: 'level',
  horizontalRay: 'level',
  trend: 'level',
  ray: 'level',
  extended: 'level',
  parallelChannel: 'band',
  rectangle: 'band',
  vertical: 'time',
}

export function lineAlertMode(kind: string): LineAlertMode | undefined {
  return LINE_ALERT_MODES[kind]
}

/** 알림 문구용 그림 이름(lib/drawings 의 DRAWING_LABELS 와 같게 — 그 파일은 브라우저 코드라 워커가 못 읽는다). */
export const LINE_ALERT_LABELS: Record<string, string> = {
  horizontal: '수평선',
  horizontalRay: '수평 레이',
  trend: '추세선',
  ray: '레이',
  extended: '연장 라인',
  parallelChannel: '평행 채널',
  rectangle: '사각형',
  vertical: '수직선',
}

/** 선 알림 버튼(선택 도구바·객체 트리)의 설명. */
export const LINE_ALERT_HINTS: Record<LineAlertMode, string> = {
  level: '가격이 이 선을 지나가면 알려 줍니다. 우클릭 「알림 설정…」에서 매번·만료를 고릅니다.',
  band: '가격이 이 도형의 경계를 넘으면 알려 줍니다. 우클릭 「알림 설정…」에서 진입·이탈·매번·만료를 고릅니다.',
  time: '이 시각이 되면 알려 줍니다.',
}

/** 도형 알림 조건. 없으면 cross(어느 경계든 넘기). */
export type ShapeWhen = 'cross' | 'enter' | 'exit'

export const SHAPE_WHEN_LABELS: Record<ShapeWhen, string> = { cross: '경계 교차', enter: '진입', exit: '이탈' }

/** 그림(Drawing.alertOpts)에 붙는 알림 설정. 모두 선택. */
export interface LineAlertOptions extends AlertTiming {
  /** 도형(평행 채널·사각형) 조건. */
  when?: 'enter' | 'exit'
  message?: string
  /** 알림을 켜거나 그림을 옮긴 시각(ms). 서버는 이 뒤의 움직임만 본다. 없으면 그린 시각. */
  since?: number
}

/** 저장된 선 알림 설정. 틀린 필드는 버리고, 남는 것이 없으면 undefined. */
export function parseLineAlertOptions(value: unknown): LineAlertOptions | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as Record<string, unknown>
  const out: LineAlertOptions = {
    ...(v.when === 'enter' || v.when === 'exit' ? { when: v.when } : {}),
    ...(typeof v.message === 'string' && v.message.trim() ? { message: v.message } : {}),
    ...(num(v.since) && v.since > 0 ? { since: v.since } : {}),
    ...parseTiming(v),
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** 판정에 필요한 그림의 모양(lib/drawings 의 Drawing 과 같은 필드). 시각은 unix 초. */
export interface AlertGeometry {
  kind: string
  points: readonly { time: number; price: number }[]
  style?: { extendLeft?: boolean; extendRight?: boolean }
}

/** 선 알림의 띠 조건. */
export function lineRule(mode: LineAlertMode, opts: LineAlertOptions | undefined): BandRule {
  return mode === 'band' && opts?.when ? opts.when : 'cross'
}

/** 두 점을 지나는 직선의 t(초) 값. */
function lineAt(a: { time: number; price: number }, b: { time: number; price: number }, t: number): number {
  return a.price + ((b.price - a.price) * (t - a.time)) / (b.time - a.time)
}

/** 선분 [a, b] 의 시간 구간 안인가 — 양끝 연장 설정을 따른다. */
function withinSpan(t0: number, t1: number, t: number, style: AlertGeometry['style']): boolean {
  const lo = Math.min(t0, t1)
  const hi = Math.max(t0, t1)
  return (t >= lo || style?.extendLeft === true) && (t <= hi || style?.extendRight === true)
}

/**
 * tMs 시각의 판정 띠. 선은 앵커를 시간으로 선형 보간한 가격 하나(lo = hi), 평행 채널·사각형은 두 경계.
 * 그 시각에 그림이 없으면 null — 추세선·채널·사각형은 앵커 구간 밖(연장 설정 제외), 레이는 시작점 전·반대쪽,
 * 수평 레이는 시작 시각 전. 수직선(시각 알림)은 띠가 없다.
 */
export function bandAt(g: AlertGeometry, tMs: number): Band | null {
  const t = tMs / 1000
  const [a, b, c] = g.points
  if (!a) return null
  switch (g.kind) {
    case 'horizontal':
      return { lo: a.price, hi: a.price }
    case 'horizontalRay':
      return t >= a.time ? { lo: a.price, hi: a.price } : null
    case 'trend':
    case 'ray':
    case 'extended': {
      if (!b || a.time === b.time) return null
      if (g.kind === 'trend' && !withinSpan(a.time, b.time, t, g.style)) return null
      // 레이는 a 에서 b 쪽으로만 뻗는다.
      if (g.kind === 'ray' && (b.time > a.time ? t < a.time : t > a.time)) return null
      const p = lineAt(a, b, t)
      return { lo: p, hi: p }
    }
    case 'parallelChannel': {
      if (!b || a.time === b.time || !withinSpan(a.time, b.time, t, g.style)) return null
      const p = lineAt(a, b, t)
      // 세 번째 점이 채널 폭(가격 차)을 정한다.
      const q = c ? p + (c.price - lineAt(a, b, c.time)) : p
      return { lo: Math.min(p, q), hi: Math.max(p, q) }
    }
    case 'rectangle': {
      if (!b || !withinSpan(a.time, b.time, t, undefined)) return null
      return { lo: Math.min(a.price, b.price), hi: Math.max(a.price, b.price) }
    }
    default:
      return null
  }
}

/** 그림 모양을 문자열로 — 옮기면 달라진다(서버 판정 기록의 열쇠). */
export function geometryKey(g: AlertGeometry): string {
  return g.points.map((p) => `${p.time}:${p.price}`).join(',')
}

/** 선 알림 문구(무엇이 일어났는지). 예: "수평선 65000 통과", "평행 채널 진입", "수직선 시각 도달". */
export function describeLineAlert(g: AlertGeometry, opts: LineAlertOptions | undefined): string {
  const mode = lineAlertMode(g.kind)
  const label = LINE_ALERT_LABELS[g.kind] ?? '선'
  if (mode === 'time') return `${label} 시각 도달`
  if (mode === 'band') return `${label} ${SHAPE_WHEN_LABELS[opts?.when ?? 'cross']}`
  return g.kind === 'horizontal' || g.kind === 'horizontalRay' ? `${label} ${g.points[0]?.price ?? ''} 통과` : `${label} 통과`
}
