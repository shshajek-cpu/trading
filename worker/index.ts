/**
 * 가격 알림 감시기 (Cron, 1분마다).
 *
 * 앱이 꺼져 있어도 알림이 가야 하므로 서버가 대신 시세를 본다.
 * 감시 목록은 모든 기기가 함께 쓰는 동기화 설정(s:<code>)에서 매분 새로 뽑는다 — 어느 기기에서 만들거나 고치거나 옮긴
 * 알림이든 설정이 동기화되면 그대로 감시한다. /api/push 는 푸시를 보낼 구독만 w:<code> 에 둔다.
 *
 * 시세는 앱과 같은 바이낸스 USDT-M 1분봉을 먼저 읽는다. 바이낸스가 데이터센터 IP·지역을 막거나(403/451)
 * 요청 한도에 걸리면(418/429) 이번 호출 동안은 다시 부르지 않고 같은 무기한 선물의 gate.io 1분봉으로 대신한다
 * (가격차는 0.01% 미만). 봉을 못 읽은 종목은 gate.io 전체 시세의 현재가 하나로 본다.
 *
 * 현재가 하나만 보면 두 점검 사이에 닿았다 돌아온 가격을 놓친다. 그래서 봉마다 시가·고가·저가·종가를
 * 시간순 경로로 펼쳐(pathSince) 앱과 같은 규칙으로 한 점씩 판정한다.
 * 지난 점검 시각은 따로 적지 않는다 — 가격 알림은 만들거나 고치거나 다시 켠 시각(createdAt·updatedAt) 뒤의 봉만,
 * 수평선은 기준 쪽을 잡은 시각(SideMark.at) 뒤의 봉만 본다. 그래서 알림을 만들거나 고치기 전의 움직임으로는 울리지 않는다.
 *
 * 울린 알림은 앱이 확인할 때까지 firedIds 에 두고 다시 울리지 않는다. 동기화 설정에서 감시 대상이 아니게 됐거나
 * (가격 알림을 껐다·지웠다, 수평선이 울렸다·알림을 껐다·지웠다) 앱이 받았다고 알린(acks) 뒤에 설정이 다시 저장됐으면
 * 확인된 것으로 보고 뺀다. 그 뒤 다시 켜면 다시 울린다.
 *
 * Workers 무료 플랜 한도 안에서 돈다:
 * - KV(하루 목록 조회 1,000회·쓰기 1,000회): 매분 목록을 조회하지 않고 감시 대상 코드 목록 키(`w-index`)와
 *   코드마다 구독 기록(w:)·동기화 설정(s:) 두 개만 읽는다. 목록 조회는 정각마다 한 번(하루 24회) 색인을 다시 맞출 때만 쓴다.
 * - 기록은 바뀐 것이 있을 때만 한다 — 푸시를 보냈을 때, 교차 알림이 걸리거나 수평선의 기준 쪽을 처음 잡았을 때,
 *   감시에서 빠진 항목의 기준을 지울 때, firedIds 가 바뀔 때. 조용한 분에는 쓰지 않는다.
 * - 외부 요청(호출 하나당 50회): 종목별 봉 조회는 CANDLE_FETCH_MAX 번까지만 하고 나머지는 전체 시세 한 번으로 본다.
 *   푸시 발송도 이 한도에 들어가므로, 넘칠 것 같은 알림은 발동으로 적지 않고 다음 분으로 미룬다.
 */
import { sendPush, type PushSubscription } from './webpush'

interface Env {
  SETTINGS: KVNamespace
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
}

type Side = 'above' | 'below'

/** 교차 알림을 걸기 전에 가격이 먼저 있어야 할 쪽(away = 선에서 벗어나기만 하면 된다). 앱(usePriceAlerts.AlertArm)과 같은 뜻. */
type Arm = 'below' | 'above' | 'away'

/** 동기화 설정에서 뽑은 켜진 가격 알림. */
interface WatchAlert {
  id: string
  symbol: string
  condition: Side
  price: number
  /** 사용자 메모. 푸시 본문에 붙인다. */
  message?: string
  /** 아직 걸리지 않은 교차 알림(pending) — 가격이 먼저 이쪽에 있는 것을 본 뒤에 건다. */
  arm?: Arm
  /** 감시 시작 시각(ms) — 앱이 알림을 만들거나 고치거나 다시 켠 때(createdAt·updatedAt 중 늦은 것). 이 전의 움직임으로는 울리지 않는다. */
  since: number
}

/** 동기화 설정에서 뽑은 아직 안 울린 수평선 알림. 처음 잡은 기준 쪽(lineMarks)에서 가격이 선을 지나 반대쪽으로 가면 울린다. */
interface WatchLine {
  id: string
  symbol: string
  price: number
  /** 그린 시각(createdAt, ms). 선을 옮겨도 그대로다 — 기준 쪽을 처음 잡을 때는 설정이 저장된 시각도 함께 본다(judgeLine). */
  since: number
}

/** 적어 둔 기준 쪽과 그것을 확인한 시각(ms). 이 시각 뒤의 움직임만 본다. /api/push 와 모양이 같아야 한다. */
interface SideMark {
  side: Side
  at: number
}

/**
 * 코드마다의 감시 기록(w:<code>). 구독은 /api/push 가, 나머지는 감시기가 쓴다 — 두 곳의 모양이 같아야 한다.
 * 예전 기록의 기기별 감시 목록(alertsBy·linesBy·alerts)은 읽지 않고, 다음에 쓸 때 빠진다.
 */
interface WatchRecord {
  subs: PushSubscription[]
  /** 수평선마다 처음 잡은 기준 쪽. 키는 lineKey — 선을 옮기면 새로 잡는다. */
  lineMarks?: Record<string, SideMark>
  /** 걸린 교차 알림이 기다리는 쪽. 키는 armKey — 가격·거는 조건을 바꾸면 새로 건다. */
  armMarks?: Record<string, SideMark>
  /** 감시기가 울렸고 앱이 아직 확인하지 않은 알림·수평선 id. 여기 있는 동안은 다시 울리지 않는다. */
  firedIds: string[]
  /** 앱이 받았다고 알린 시각(ms, id 별). 이 뒤에 저장된 설정은 그 확인을 반영한 것으로 본다. */
  acks?: Record<string, number>
}

/** 동기화 설정에서 감시 목록을 꺼내는 키. 앱의 localStorage 키(syncMerge.SYNCED_KEYS)와 같아야 한다. */
const PRICE_ALERTS_KEY = 'trading.priceAlerts.v1'
const DRAWINGS_KEY = 'trading.drawings.v2'

/** 푸시 본문에 붙이는 메모 길이 한도. */
const MESSAGE_MAX = 200

/** 앱(usePriceAlerts.PRICE_ALERT_KINDS)이 아는 조건. 모르는 조건의 알림은 앱이 버리므로 감시하지 않는다. */
const ALERT_KINDS: Record<string, true> = { cross: true, crossUp: true, crossDown: true, gt: true, lt: true }

/** 동기화 설정의 저장 시각(ms)과 거기서 뽑은 감시 목록. */
interface Watch {
  at: number
  alerts: WatchAlert[]
  lines: WatchLine[]
}

/** 설정 한 키(JSON 문자열)의 목록. 없거나 깨졌으면 빈 목록. */
function readList(data: Record<string, unknown>, key: string): unknown[] {
  const raw = data[key]
  if (typeof raw !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 교차 알림을 걸기 전에 가격이 먼저 있어야 할 쪽. 앱(usePriceAlerts.armOf)과 같은 규칙 — 조건이 없는 예전 알림은 교차다. */
function armOf(kind: unknown): Arm | undefined {
  const k = kind ?? 'cross'
  if (k === 'crossUp') return 'below'
  if (k === 'crossDown') return 'above'
  if (k === 'cross') return 'away'
  return undefined
}

/** 켜진 가격 알림. 모양 검사는 앱(usePriceAlerts.isAlert)과 같다 — 앱이 버리는 항목은 감시하지 않는다. */
function readAlerts(list: unknown[]): WatchAlert[] {
  const out: WatchAlert[] = []
  for (const value of list) {
    if (typeof value !== 'object' || value === null) continue
    const { id, symbol, condition, price, active, createdAt, updatedAt, message, kind, pending } = value as Record<
      string,
      unknown
    >
    if (typeof id !== 'string' || typeof symbol !== 'string') continue
    if (condition !== 'above' && condition !== 'below') continue
    if (typeof price !== 'number' || !Number.isFinite(price)) continue
    if (typeof createdAt !== 'number') continue
    if (updatedAt !== undefined && typeof updatedAt !== 'number') continue
    if (message !== undefined && typeof message !== 'string') continue
    if (kind !== undefined && (typeof kind !== 'string' || ALERT_KINDS[kind] !== true)) continue
    if (pending !== undefined && typeof pending !== 'boolean') continue
    if (active !== true) continue
    const note = typeof message === 'string' ? message.trim().slice(0, MESSAGE_MAX) : ''
    const arm = pending === true ? armOf(kind) : undefined
    out.push({
      id,
      symbol,
      condition,
      price,
      ...(note ? { message: note } : {}),
      ...(arm ? { arm } : {}),
      // updatedAt 이 없는 예전 알림은 만든 시각을 쓴다.
      since: Math.max(createdAt, typeof updatedAt === 'number' ? updatedAt : 0),
    })
  }
  return out
}

/** 아직 안 울린 수평선 알림. 앱의 감시 조건과 같다 — 수평선이고, 알림이 켜져 있고, 울리지 않았고, 가격이 있다. */
function readLines(list: unknown[]): WatchLine[] {
  const out: WatchLine[] = []
  for (const value of list) {
    if (typeof value !== 'object' || value === null) continue
    const { id, symbol, kind, alert, fired, points, createdAt } = value as Record<string, unknown>
    if (typeof id !== 'string' || typeof symbol !== 'string') continue
    if (kind !== 'horizontal' || alert !== true || fired === true) continue
    const first: unknown = Array.isArray(points) ? points[0] : undefined
    const price = typeof first === 'object' && first !== null && 'price' in first ? first.price : undefined
    if (typeof price !== 'number' || !Number.isFinite(price)) continue
    out.push({ id, symbol, price, since: typeof createdAt === 'number' ? createdAt : 0 })
  }
  return out
}

/** 동기화 설정을 읽어 감시 목록을 뽑는다. 기록이 없거나 깨졌으면 null — 그 코드는 이번 분에 건너뛴다(확인 흔적도 그대로 둔다). */
async function readWatch(env: Env, code: string): Promise<Watch | null> {
  const raw = await env.SETTINGS.get(`s:${code}`)
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || !('data' in parsed)) return null
  const { data } = parsed
  if (typeof data !== 'object' || data === null) return null
  // 설정 API(/api/settings)가 저장하는 모양: localStorage 키 → 저장된 문자열. 값은 readList 가 하나씩 검사한다.
  const snapshot = data as Record<string, unknown>
  const at = 'at' in parsed ? parsed.at : undefined
  return {
    at: typeof at === 'number' ? at : 0,
    alerts: readAlerts(readList(snapshot, PRICE_ALERTS_KEY)),
    lines: readLines(readList(snapshot, DRAWINGS_KEY)),
  }
}

/** lineMarks 키. 선을 옮기면(가격이 바뀌면) 기준 쪽을 새로 잡는다. /api/push 와 형식이 같아야 한다. */
function lineKey(line: WatchLine): string {
  return `${line.id}@${line.price}`
}

/** armMarks 키. /api/push 와 형식이 같아야 한다. */
function armKey(alert: WatchAlert): string {
  return `${alert.id}@${alert.price}@${alert.arm ?? ''}`
}

/** 거는 조건이 맞으면 이제 기다릴 쪽, 아직이면 null. 앱(usePriceAlerts.armedTarget)과 같은 규칙. */
function armedTarget(arm: Arm, now: number, level: number): Side | null {
  if (arm === 'below') return now < level ? 'above' : null
  if (arm === 'above') return now > level ? 'below' : null
  if (now === level) return null
  return now > level ? 'below' : 'above'
}

/** 조건을 만족하면 울린다. 울린 알림은 앱이 확인할 때까지 firedIds 에 남아 다시 울리지 않는다. */
function meets(condition: Side, price: number, now: number): boolean {
  return condition === 'above' ? now >= price : now <= price
}

/** 감시할 동기화 코드 목록 — 구독이 있는 코드. /api/push 가 구독이 바뀔 때 맞춘다. */
const INDEX_KEY = 'w-index'

const KLINES_URL = 'https://fapi.binance.com/fapi/v1/klines'
const GATE_CANDLES_URL = 'https://api.gateio.ws/api/v4/futures/usdt/candlesticks'
const TICKERS_URL = 'https://api.gateio.ws/api/v4/futures/usdt/tickers'

/** 무료 플랜의 호출 하나당 외부 요청(하위 요청) 한도. 시세 조회와 푸시 발송이 함께 쓴다. */
const SUBREQUEST_MAX = 50
/** 종목별 봉 조회(바이낸스·gate 합계) 상한. 남는 14회는 전체 시세 한 번과 푸시 발송 몫이다. */
const CANDLE_FETCH_MAX = 36
/** 종목마다 읽는 1분봉 수 — 진행 중인 봉과 앞선 두 봉. 크론이 한 번 늦거나 건너뛰어도 구간이 끊기지 않는다. */
const BAR_LIMIT = 3
const MINUTE_MS = 60_000
/** 바이낸스 표기(BTCUSDT, 1000PEPEUSDT, BTCUSDT_250328). 모양이 다른 값으로는 요청을 쓰지 않는다. */
const SYMBOL_RE = /^[0-9A-Z_]{2,40}$/
/** 이 응답이면 이번 호출 동안 바이낸스를 다시 부르지 않는다 — 지역·IP 차단(403/451)과 요청 한도(418/429). */
const BINANCE_BLOCKED = new Set([403, 418, 429, 451])

/** 1분봉 하나(가격은 바이낸스 표기 배율). 전체 시세의 현재가는 시작·끝이 같은 점 하나로 담는다. */
interface Bar {
  /** 시작 시각(ms) */
  t: number
  /** 이 자료가 덮는 끝 시각(ms). 닫힌 봉은 t + 1분, 진행 중인 봉은 조회 시각. */
  end: number
  /** 더 바뀌지 않는 자료. 기준(SideMark)은 닫힌 자료로만 적는다 — 진행 중인 봉은 닫힌 뒤 다시 본다. */
  closed: boolean
  o: number
  h: number
  l: number
  c: number
}

type PriceSource = 'binance' | 'gate'

/** 종목 하나의 시세. bars 는 시간순이고 비어 있지 않다. */
interface Quote {
  source: PriceSource
  bars: Bar[]
}

/** 이번 호출에서 쓴 외부 요청 수. */
interface Budget {
  used: number
}

/** [시작 ms, 시가, 고가, 저가, 종가] 목록을 봉으로 바꾼다. 마지막 봉만 진행 중일 수 있다. 값이 이상하면 null. */
function toBars(rows: number[][], scale: number): Bar[] | null {
  const now = Date.now()
  const bars: Bar[] = []
  for (const [t, o, h, l, c] of rows) {
    if (![t, o, h, l, c].every(Number.isFinite)) return null
    bars.push({ t, end: t + MINUTE_MS, closed: true, o: o * scale, h: h * scale, l: l * scale, c: c * scale })
  }
  const last = bars.at(-1)
  if (!last) return null
  if (last.end > now) {
    last.closed = false
    last.end = Math.max(now, last.t)
  }
  return bars
}

/** 바이낸스 1분봉. 막혔으면 'blocked'(다른 종목도 부르지 않는다), 이 종목만 실패했으면 null. */
async function binanceBars(symbol: string, budget: Budget): Promise<Bar[] | 'blocked' | null> {
  budget.used++
  let res: Response
  try {
    res = await fetch(`${KLINES_URL}?symbol=${symbol}&interval=1m&limit=${BAR_LIMIT}`)
  } catch {
    // 연결부터 안 되면 다른 종목도 마찬가지다.
    return 'blocked'
  }
  if (BINANCE_BLOCKED.has(res.status)) return 'blocked'
  if (!res.ok) return null
  try {
    const rows = (await res.json()) as unknown[][]
    return toBars(
      rows.map((r) => [Number(r[0]), Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4])]),
      1,
    )
  } catch {
    return null
  }
}

/** gate.io 계약 이름과 바이낸스 표기로 바꾸는 배율, 현재가(바이낸스 배율). */
interface GateTicker {
  contract: string
  scale: number
  last: number
}

/**
 * gate.io 전체 시세. BTC_USDT 형식이라 밑줄을 빼 바이낸스 표기(BTCUSDT)로 맞춘다.
 * gate 는 1000 배 계약을 따로 상장하지 않고 원 코인만 둔다(PEPE_USDT 등).
 * 그래서 바이낸스 1000PEPEUSDT 도 찾을 수 있게 ×1000 항목을 함께 넣는다(같은 이름의 계약이 있으면 그쪽을 쓴다).
 */
async function gateTickers(budget: Budget): Promise<Map<string, GateTicker> | null> {
  budget.used++
  try {
    const res = await fetch(TICKERS_URL, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const list = (await res.json()) as { contract: string; last: string }[]
    const map = new Map<string, GateTicker>()
    const scaled: [string, GateTicker][] = []
    for (const t of list) {
      const last = Number(t.last)
      if (!Number.isFinite(last) || !t.contract.endsWith('_USDT')) continue
      const symbol = t.contract.replace('_', '')
      map.set(symbol, { contract: t.contract, scale: 1, last })
      scaled.push([`1000${symbol}`, { contract: t.contract, scale: 1000, last: last * 1000 }])
    }
    for (const [symbol, ticker] of scaled) if (!map.has(symbol)) map.set(symbol, ticker)
    return map
  } catch {
    return null
  }
}

/** gate.io 1분봉(바이낸스 배율로 환산). 실패하면 null. */
async function gateBars(ticker: GateTicker, budget: Budget): Promise<Bar[] | null> {
  budget.used++
  try {
    const res = await fetch(`${GATE_CANDLES_URL}?contract=${ticker.contract}&interval=1m&limit=${BAR_LIMIT}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const rows = (await res.json()) as { t: number; o: string; h: string; l: string; c: string }[]
    return toBars(
      rows.map((r) => [r.t * 1000, Number(r.o), Number(r.h), Number(r.l), Number(r.c)]),
      ticker.scale,
    )
  } catch {
    return null
  }
}

/**
 * 종목별 시세를 모은다. 바이낸스 1분봉 → (막혔거나 실패한 종목) gate.io 1분봉 → gate.io 현재가 순.
 * 종목별 봉 조회는 CANDLE_FETCH_MAX 번까지 — 넘는 종목과 봉을 못 읽은 종목은 전체 시세 한 번(현재가 점 하나)으로 본다.
 */
async function loadQuotes(symbols: string[], budget: Budget): Promise<Map<string, Quote>> {
  const quotes = new Map<string, Quote>()
  const [first, ...others] = [...new Set(symbols)].filter((s) => SYMBOL_RE.test(s)).sort()
  if (first === undefined) return quotes

  let candles = 0
  let blocked = false
  const fallback: string[] = []
  const viaBinance = async (symbol: string): Promise<void> => {
    candles++
    const bars = await binanceBars(symbol, budget)
    if (bars === 'blocked') blocked = true
    if (bars && bars !== 'blocked') quotes.set(symbol, { source: 'binance', bars })
    else fallback.push(symbol)
  }
  // 첫 종목으로 막혔는지 먼저 본다 — 막혔으면 나머지 종목에는 바이낸스 요청을 쓰지 않는다.
  await viaBinance(first)
  const rest = blocked ? [] : others.slice(0, CANDLE_FETCH_MAX - candles)
  await Promise.all(rest.map(viaBinance))
  fallback.push(...others.slice(rest.length))
  if (fallback.length === 0) return quotes

  fallback.sort()
  const tickers = await gateTickers(budget)
  if (!tickers) return quotes
  // gate 에 없는 종목에는 요청을 쓰지 않는다.
  const listed = fallback.flatMap((symbol) => {
    const ticker = tickers.get(symbol)
    return ticker ? [{ symbol, ticker }] : []
  })
  await Promise.all(
    listed.slice(0, Math.max(0, CANDLE_FETCH_MAX - candles)).map(async ({ symbol, ticker }) => {
      const bars = await gateBars(ticker, budget)
      if (bars) quotes.set(symbol, { source: 'gate', bars })
    }),
  )
  const now = Date.now()
  for (const { symbol, ticker } of listed) {
    if (quotes.has(symbol)) continue
    const { last } = ticker
    quotes.set(symbol, { source: 'gate', bars: [{ t: now, end: now, closed: true, o: last, h: last, l: last, c: last }] })
  }
  return quotes
}

/** 판정에 쓰는 가격 점 하나와 그 점이 속한 봉. */
interface Point {
  price: number
  bar: Bar
}

/**
 * from(ms) 뒤의 움직임을 시간순 가격 점으로 편다.
 * - from 뒤에 시작한 봉: 시가 → 양봉이면 저가 → 고가, 음봉이면 고가 → 저가 → 종가.
 *   봉 안의 실제 순서는 알 수 없어 흔히 쓰는 가정을 따른다. 닿았다 돌아온 고가·저가도 이렇게 경로에 들어간다.
 * - from 을 품은 봉: 앞부분이 from 전이라 고가·저가를 믿을 수 없다. 봉 끝의 가격(종가)만 쓴다.
 * - from 전에 끝난 봉은 버린다.
 */
function pathSince(bars: Bar[], from: number): Point[] {
  const points: Point[] = []
  for (const bar of bars) {
    if (bar.end <= from) continue
    const prices =
      bar.t < from ? [bar.c] : bar.c >= bar.o ? [bar.o, bar.l, bar.h, bar.c] : [bar.o, bar.h, bar.l, bar.c]
    for (const price of prices) if (points.at(-1)?.price !== price) points.push({ price, bar })
  }
  return points
}

/** 판정 결과. fire: 울릴 점의 가격과 넘어간 쪽. mark: 새로 적을 기준(교차 알림이 걸렸거나 수평선 기준 쪽을 처음 잡았다). */
type Verdict = { fire: { price: number; side: Side } } | { mark: SideMark } | null

/**
 * 가격 알림 하나를 앱(usePriceAlerts.checkPrice)과 같은 규칙으로 점마다 판정한다.
 * 아직 걸리지 않은 교차 알림은 거는 조건부터 보고, 걸린 뒤 같은 구간 안에서 넘어가면 바로 울린다.
 */
function judgeAlert(alert: WatchAlert, armed: SideMark | undefined, bars: Bar[]): Verdict {
  const { arm } = alert
  // 고치거나 다시 켜기 전에 걸린 기준은 쓰지 않는다 — 앱처럼 다시 걸어야 한다.
  const valid = armed && armed.at >= alert.since ? armed : undefined
  let target: Side | null = arm ? (valid?.side ?? null) : alert.condition
  let mark: SideMark | null = null
  for (const { price, bar } of pathSince(bars, Math.max(alert.since, valid?.at ?? 0))) {
    if (target === null) {
      // 거는 점에서는 울리지 않는다(앱도 거는 틱에는 울리지 않는다).
      target = arm ? armedTarget(arm, price, alert.price) : alert.condition
      // 닫힌 봉에서 걸린 것만 적는다. 진행 중인 봉에서 걸렸으면 봉이 닫힌 뒤 다시 보고 적는다(쓰기는 한 번 그대로).
      if (target && bar.closed) mark = { side: target, at: bar.end }
      continue
    }
    if (meets(target, alert.price, price)) return { fire: { price, side: target } }
  }
  return mark ? { mark } : null
}

/**
 * 수평선 하나를 앱(useDrawings)과 같은 기준(선 이상이면 위, 미만이면 아래)으로 판정한다. 첫 점은 기준 쪽만 잡는다.
 * 기준 쪽을 아직 못 잡았으면 설정이 저장된 시각(savedAt) 뒤부터 본다 — 선을 옮겨도 그린 시각(since)은 그대로라,
 * 옮기기 전의 움직임으로 기준을 잡거나 울리지 않게 한다. 옮긴 선은 lineKey 가 달라 기준 없이 여기서 다시 시작한다.
 */
function judgeLine(line: WatchLine, seen: SideMark | undefined, bars: Bar[], savedAt: number): Verdict {
  let side = seen?.side
  let mark: SideMark | null = null
  for (const { price, bar } of pathSince(bars, Math.max(line.since, seen ? seen.at : savedAt))) {
    const now: Side = price >= line.price ? 'above' : 'below'
    if (side === undefined) {
      side = now
      if (bar.closed) mark = { side, at: bar.end }
      continue
    }
    if (now !== side) return { fire: { price, side: now } }
  }
  return mark ? { mark } : null
}

/** gate ×1000 환산에서 생기는 부동소수 꼬리(12.344999999…)를 떼어 보인다. */
function formatPrice(price: number): string {
  return String(Number(price.toPrecision(10)))
}

/** 푸시 본문의 가격 줄. 어느 시세로 판정했는지와, 닿았다 돌아왔으면 닿은 가격도 보인다. */
function priceNote(quote: Quote, hit: number): string {
  const last = quote.bars[quote.bars.length - 1].c
  const source = quote.source === 'binance' ? '바이낸스' : 'gate.io 대체 시세'
  return hit === last
    ? `${source} 현재가 ${formatPrice(last)}`
    : `${source} ${formatPrice(hit)} 도달 · 현재가 ${formatPrice(last)}`
}

/** 이번 분에 보낼 푸시 하나. */
interface Hit {
  id: string
  payload: string
}

/** 이번 분에 볼 코드 하나. */
interface Entry {
  key: string
  record: WatchRecord
  watch: Watch
  /** 확인된 발동을 뺀 firedIds 와, 그 가운데 앱이 받았다고 알린 것의 시각. */
  firedIds: string[]
  acks: Record<string, number>
}

/**
 * 앱이 확인한 발동을 firedIds 에서 뺀다. 설정에서 감시 대상이 아니게 됐거나(가격 알림 끔·지움, 수평선 울림·알림 끔·지움),
 * 앱이 받았다고 알린 뒤에 설정이 다시 저장됐으면 확인된 것이다 — 그래도 켜져 있으면 다시 켠 것이라 다시 감시한다.
 */
function unackedFired(record: WatchRecord, watch: Watch): Pick<Entry, 'firedIds' | 'acks'> {
  const live = new Set([...watch.alerts, ...watch.lines].map((w) => w.id))
  const prev = record.acks ?? {}
  const firedIds = record.firedIds.filter((id) => {
    const ackedAt = prev[id]
    return live.has(id) && !(ackedAt !== undefined && watch.at > ackedAt)
  })
  const acks: Record<string, number> = {}
  for (const id of firedIds) if (prev[id] !== undefined) acks[id] = prev[id]
  return { firedIds, acks }
}

/** 지금 감시하는 항목(keys)의 기준만 남긴다. 지운 것이 있으면 pruned — 기록해야 옛 기준이 되살아나지 않는다. */
function liveMarks(
  marks: Record<string, SideMark> | undefined,
  keys: string[],
): { marks: Record<string, SideMark>; pruned: boolean } {
  const out: Record<string, SideMark> = {}
  for (const k of keys) if (marks?.[k]) out[k] = marks[k]
  return { marks: out, pruned: Object.keys(marks ?? {}).length !== Object.keys(out).length }
}

/**
 * 목록 조회로 감시 대상 색인을 다시 만든다(색인이 없을 때, 그리고 정각마다 — 동시 수정으로 어긋난 색인을 바로잡는다).
 * 구독이 있는 코드만 넣는다 — 무엇을 감시할지는 매분 동기화 설정에서 뽑는다.
 */
async function rebuildIndex(env: Env, current: string[] | null): Promise<string[]> {
  const codes: string[] = []
  let cursor: string | undefined
  do {
    const page = await env.SETTINGS.list({ prefix: 'w:', cursor })
    for (const key of page.keys) {
      const record = await env.SETTINGS.get<WatchRecord>(key.name, 'json')
      if (record && record.subs.length > 0) codes.push(key.name.slice(2))
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  codes.sort()
  if (!current || current.join(',') !== codes.join(',')) {
    await env.SETTINGS.put(INDEX_KEY, JSON.stringify(codes))
  }
  return codes
}

async function checkAll(env: Env, rebuild: boolean): Promise<void> {
  const stored = await env.SETTINGS.get<string[]>(INDEX_KEY, 'json')
  const codes = rebuild || !stored ? await rebuildIndex(env, stored) : stored

  // 기록을 먼저 모두 읽어 이번 분에 볼 종목을 모은다 — 여러 코드가 같은 종목을 봐도 한 번만 조회한다.
  const entries: Entry[] = []
  for (const code of codes) {
    const key = `w:${code}`
    const record = await env.SETTINGS.get<WatchRecord>(key, 'json')
    // 구독이 없으면 보낼 곳이 없다 — 설정은 읽지 않는다.
    if (!record || record.subs.length === 0) continue
    const watch = await readWatch(env, code)
    if (watch) entries.push({ key, record, watch, ...unackedFired(record, watch) })
  }
  if (entries.length === 0) return

  const budget: Budget = { used: 0 }
  const symbols = entries.flatMap(({ watch, firedIds }) =>
    [...watch.alerts, ...watch.lines].filter((w) => !firedIds.includes(w.id)).map((w) => w.symbol),
  )
  const quotes = await loadQuotes(symbols, budget)
  for (const entry of entries) await checkRecord(env, entry, quotes, budget)
}

async function checkRecord(env: Env, entry: Entry, quotes: Map<string, Quote>, budget: Budget): Promise<void> {
  const { key, record, watch } = entry
  const fired = new Set(entry.firedIds)
  // 울렸고 아직 확인되지 않은 것은 판정하지 않는다.
  const alerts = watch.alerts.filter((a) => !fired.has(a.id))
  const lines = watch.lines.filter((l) => !fired.has(l.id))
  // 확인된 발동을 뺐으면 적는다.
  let dirty =
    entry.firedIds.length !== record.firedIds.length ||
    Object.keys(entry.acks).length !== Object.keys(record.acks ?? {}).length
  // 감시에서 빠졌다가(울림·끔·지움) 같은 모습으로 돌아온 항목이 옛 기준으로 곧바로 울리지 않게, 빠진 항목의 기준은 지워 적는다.
  const { marks: armMarks, pruned: armPruned } = liveMarks(record.armMarks, alerts.filter((a) => a.arm).map(armKey))
  const { marks: lineMarks, pruned: linePruned } = liveMarks(record.lineMarks, lines.map(lineKey))
  if (armPruned || linePruned) dirty = true

  const hits: Hit[] = []
  for (const alert of alerts) {
    const quote = quotes.get(alert.symbol)
    if (!quote) continue
    const ak = armKey(alert)
    const verdict = judgeAlert(alert, alert.arm ? armMarks[ak] : undefined, quote.bars)
    if (!verdict) continue
    if ('mark' in verdict) {
      armMarks[ak] = verdict.mark
      dirty = true
      continue
    }
    const note = priceNote(quote, verdict.fire.price)
    hits.push({
      id: alert.id,
      payload: JSON.stringify({
        title: `${alert.symbol} ${verdict.fire.side === 'above' ? '▲' : '▼'} ${alert.price}`,
        body: alert.message ? `${alert.message}\n${note}` : note,
        // 로컬 시스템 알림과 같은 태그를 써 OS 가 하나로 합치게 한다.
        tag: `price-${alert.id}`,
        // 알림을 누르면 이 종목 차트를 연다(sw-push.js).
        symbol: alert.symbol,
      }),
    })
  }

  for (const line of lines) {
    const quote = quotes.get(line.symbol)
    if (!quote) continue
    const lk = lineKey(line)
    const verdict = judgeLine(line, lineMarks[lk], quote.bars, watch.at)
    if (!verdict) continue
    if ('mark' in verdict) {
      lineMarks[lk] = verdict.mark
      dirty = true
      continue
    }
    hits.push({
      id: line.id,
      payload: JSON.stringify({
        title: `${line.symbol} 수평선 ${line.price} 통과`,
        body: priceNote(quote, verdict.fire.price),
        tag: `line-${line.id}`,
        symbol: line.symbol,
      }),
    })
  }

  const dead = new Set<string>()
  for (const hit of hits) {
    const targets = record.subs.filter((s) => !dead.has(s.endpoint))
    // 외부 요청 한도를 넘기면 이 알림은 발동으로 적지 않고 다음 분으로 미룬다(기준도 그대로 둔다).
    if (budget.used + targets.length > SUBREQUEST_MAX) continue
    fired.add(hit.id)
    dirty = true
    for (const sub of targets) {
      budget.used++
      // 한 기기의 발송 실패(네트워크 등)가 나머지 기기와 발동 기록을 막지 않게 한다.
      // 기록이 안 남으면 매분 같은 알림이 다시 울린다.
      try {
        const r = await sendPush(sub, hit.payload, {
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
          subject: env.VAPID_SUBJECT || 'mailto:noreply@example.com',
        })
        // 404/410 은 구독이 죽은 것 — 다음부터 빼둔다.
        if (!r.ok && (r.status === 404 || r.status === 410)) dead.add(sub.endpoint)
      } catch (e) {
        console.error('push failed', sub.endpoint, e)
      }
    }
  }
  // 바뀐 것이 없으면 아무것도 쓰지 않는다 — 무료 한도의 대부분이 여기서 아껴진다.
  if (!dirty) return

  // 울린 교차 알림·수평선은 기준을 지운다 — 확인된 뒤 다시 켜면 그때 새로 잡는다.
  for (const alert of alerts) if (fired.has(alert.id)) delete armMarks[armKey(alert)]
  for (const line of lines) if (fired.has(line.id)) delete lineMarks[lineKey(line)]

  // 예전 기록의 기기별 목록(alertsBy·linesBy·alerts)은 여기서 빠진다. 키 순서는 /api/push 와 같게 둔다(같은 내용이면 다시 쓰지 않게).
  await env.SETTINGS.put(
    key,
    JSON.stringify({
      subs: record.subs.filter((s) => !dead.has(s.endpoint)),
      lineMarks,
      armMarks,
      firedIds: [...fired],
      ...(Object.keys(entry.acks).length > 0 ? { acks: entry.acks } : {}),
    } satisfies WatchRecord),
  )
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // 정각에만 목록 조회로 색인을 다시 맞춘다(하루 24회 — 무료 한도 1,000회의 2.4%).
    const rebuild = new Date(event.scheduledTime).getUTCMinutes() === 0
    ctx.waitUntil(checkAll(env, rebuild))
  },

  /** 수동 점검용 — 크론을 기다리지 않고 바로 돌려본다. */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/run') {
      try {
        await checkAll(env, url.searchParams.get('rebuild') === '1')
        return new Response('ok')
      } catch (e) {
        return new Response(e instanceof Error ? e.message : String(e), { status: 500 })
      }
    }

    // 상태 들여다보기 — 알림이 안 오는 이유를 찾을 때 쓴다.
    if (url.pathname === '/debug') {
      const code = url.searchParams.get('code')
      if (!code) return new Response('code 가 필요합니다', { status: 400 })
      const rec = await env.SETTINGS.get<WatchRecord>(`w:${code}`, 'json')
      const watch = await readWatch(env, code)
      const items = watch ? [...watch.alerts, ...watch.lines] : []
      const quotes = await loadQuotes(items.map((w) => w.symbol), { used: 0 })
      return Response.json({
        subs: rec?.subs.length ?? 0,
        watched: ((await env.SETTINGS.get<string[]>(INDEX_KEY, 'json')) ?? []).includes(code),
        // 감시 목록을 뽑은 동기화 설정(s:<code>)의 저장 시각. null 이면 설정이 없거나 깨졌다.
        settingsAt: watch?.at ?? null,
        // 동기화 설정에서 뽑은 감시 목록(since: 감시 시작 시각, arm: 아직 안 걸린 교차 알림).
        alerts: watch?.alerts ?? [],
        lines: watch?.lines ?? [],
        lineMarks: rec?.lineMarks ?? {},
        armMarks: rec?.armMarks ?? {},
        firedIds: rec?.firedIds ?? [],
        acks: rec?.acks ?? {},
        // 판정에 쓰는 시세(출처와 1분봉).
        quotes: Object.fromEntries(quotes),
      })
    }

    // 실제 발송 경로를 그대로 한 번 통과시킨다.
    if (url.pathname === '/test-push') {
      const code = url.searchParams.get('code')
      if (!code) return new Response('code 가 필요합니다', { status: 400 })
      const rec = await env.SETTINGS.get<WatchRecord>(`w:${code}`, 'json')
      if (!rec || rec.subs.length === 0) return new Response('구독이 없습니다', { status: 404 })
      const results = []
      for (const sub of rec.subs) {
        const r = await sendPush(
          sub,
          JSON.stringify({ title: '테스트 알림', body: '발송 경로가 정상입니다', tag: 'test' }),
          {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT || 'mailto:noreply@example.com',
          },
        )
        results.push(r)
      }
      return Response.json(results)
    }

    return new Response('price alert watcher')
  },
}
