/**
 * 가격 알림 감시기 (Cron, 1분마다).
 *
 * 앱이 꺼져 있어도 알림이 가야 하므로 서버가 대신 시세를 본다.
 * 시세는 앱과 같은 바이낸스 USDT-M 1분봉을 먼저 읽는다. 바이낸스가 데이터센터 IP·지역을 막거나(403/451)
 * 요청 한도에 걸리면(418/429) 이번 호출 동안은 다시 부르지 않고 같은 무기한 선물의 gate.io 1분봉으로 대신한다
 * (가격차는 0.01% 미만). 봉을 못 읽은 종목은 gate.io 전체 시세의 현재가 하나로 본다.
 *
 * 현재가 하나만 보면 두 점검 사이에 닿았다 돌아온 가격을 놓친다. 그래서 봉마다 시가·고가·저가·종가를
 * 시간순 경로로 펼쳐(pathSince) 앱과 같은 규칙으로 한 점씩 판정한다.
 * 지난 점검 시각은 따로 적지 않는다 — 알림마다 /api/push 가 붙인 감시 시작 시각(since)과
 * 기록해 둔 기준 시각(SideMark.at) 뒤의 봉만 본다. 그래서 알림을 만들기 전의 움직임으로는 울리지 않는다.
 *
 * Workers 무료 플랜 한도 안에서 돈다:
 * - KV(하루 목록 조회 1,000회·쓰기 1,000회): 매분 목록을 조회하지 않고 감시 대상 코드 목록 키(`w-index`) 하나만 읽는다.
 *   목록 조회는 정각마다 한 번(하루 24회) 색인을 다시 맞출 때만 쓴다.
 * - 기록은 알림이 실제로 울렸을 때만 한다(예전에는 매분 모든 코드를 다시 썼다).
 *   예외로 교차 알림이 걸리거나 수평선의 기준 쪽을 처음 잡을 때 한 번 기록한다.
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

interface WatchAlert {
  id: string
  symbol: string
  condition: 'above' | 'below'
  price: number
  /** 사용자 메모. 푸시 본문에 붙인다. */
  message?: string
  /** 아직 걸리지 않은 교차 알림 — 가격이 먼저 이쪽(away = 선에서 벗어남)에 있어야 건다. /api/push 와 같은 뜻. */
  arm?: 'below' | 'above' | 'away'
  /** /api/push 가 이 내용(가격·조건)을 처음 받은 시각(ms). 이 시각 전의 움직임으로는 울리지 않는다. 예전 기록에는 없다. */
  since?: number
}

/** 수평선 알림. 처음 잡은 기준 쪽(lineMarks)에서 가격이 선을 지나 반대쪽으로 가면 울린다. */
interface WatchLine {
  id: string
  symbol: string
  price: number
  /** /api/push 가 이 선(가격)을 처음 받은 시각(ms). 예전 기록에는 없다. */
  since?: number
}

type Side = 'above' | 'below'

/** 적어 둔 기준 쪽과 그것을 확인한 시각(ms). 이 시각 뒤의 움직임만 본다. /api/push 와 모양이 같아야 한다. */
interface SideMark {
  side: Side
  at: number
}

interface WatchRecord {
  subs: PushSubscription[]
  // 기기별 알림 버킷. /api/push 가 각 기기 endpoint 로 나눠 담는다.
  alertsBy?: Record<string, WatchAlert[]>
  // 버킷 도입 전 레거시 평면 목록. 감시기는 건드리지 않고 첫 PUT 에서 정리된다.
  alerts?: WatchAlert[]
  // 기기별 수평선 버킷. 예전 기록에는 없다.
  linesBy?: Record<string, WatchLine[]>
  // 수평선마다 처음 잡은 기준 쪽. 키는 lineKey — /api/push 와 형식이 같아야 한다.
  lineMarks?: Record<string, SideMark>
  // 걸린 교차 알림이 기다리는 쪽. 키는 armKey — /api/push 와 형식이 같아야 한다.
  armMarks?: Record<string, SideMark>
  firedIds: string[]
}

/** alertsBy 버킷과 레거시 목록을 합쳐 알림 id 로 중복을 제거한다. */
function unionAlerts(record: WatchRecord): WatchAlert[] {
  const byId = new Map<string, WatchAlert>()
  for (const list of Object.values(record.alertsBy ?? {})) {
    for (const a of list) byId.set(a.id, a)
  }
  for (const a of record.alerts ?? []) if (!byId.has(a.id)) byId.set(a.id, a)
  return [...byId.values()]
}

/** 기기별 수평선 버킷을 합쳐 id 로 중복을 제거한다. */
function unionLines(record: WatchRecord): WatchLine[] {
  const byId = new Map<string, WatchLine>()
  for (const list of Object.values(record.linesBy ?? {})) {
    for (const l of list) byId.set(l.id, l)
  }
  return [...byId.values()]
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
function armedTarget(arm: NonNullable<WatchAlert['arm']>, now: number, level: number): Side | null {
  if (arm === 'below') return now < level ? 'above' : null
  if (arm === 'above') return now > level ? 'below' : null
  if (now === level) return null
  return now > level ? 'below' : 'above'
}

/** 조건을 만족하면 울린다. 한 번 울린 알림은 firedIds 에 남아 다시 울리지 않는다. */
function meets(condition: Side, price: number, now: number): boolean {
  return condition === 'above' ? now >= price : now <= price
}

/** 감시할 동기화 코드 목록. /api/push 가 구독·알림이 바뀔 때 맞춘다. */
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
  let target: Side | null = arm ? (armed?.side ?? null) : alert.condition
  let mark: SideMark | null = null
  for (const { price, bar } of pathSince(bars, Math.max(alert.since ?? 0, armed?.at ?? 0))) {
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

/** 수평선 하나를 앱(useDrawings)과 같은 기준(선 이상이면 위, 미만이면 아래)으로 판정한다. 첫 점은 기준 쪽만 잡는다. */
function judgeLine(line: WatchLine, seen: SideMark | undefined, bars: Bar[]): Verdict {
  let side = seen?.side
  let mark: SideMark | null = null
  for (const { price, bar } of pathSince(bars, Math.max(line.since ?? 0, seen?.at ?? 0))) {
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

/** 이번 분에 볼 기록 하나. 이미 울린 알림·수평선은 뺐다. */
interface Entry {
  key: string
  record: WatchRecord
  alerts: WatchAlert[]
  lines: WatchLine[]
}

/**
 * 목록 조회로 감시 대상 색인을 다시 만든다(색인이 없을 때, 그리고 정각마다 — 동시 수정으로 어긋난 색인을 바로잡는다).
 * 구독과 알림이 모두 있는 코드만 넣어 매분 읽을 기록 수를 줄인다.
 */
async function rebuildIndex(env: Env, current: string[] | null): Promise<string[]> {
  const codes: string[] = []
  let cursor: string | undefined
  do {
    const page = await env.SETTINGS.list({ prefix: 'w:', cursor })
    for (const key of page.keys) {
      const record = await env.SETTINGS.get<WatchRecord>(key.name, 'json')
      if (record && record.subs.length > 0 && unionAlerts(record).length + unionLines(record).length > 0) {
        codes.push(key.name.slice(2))
      }
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
    if (!record || record.subs.length === 0) continue
    const fired = new Set(record.firedIds)
    const alerts = unionAlerts(record).filter((a) => !fired.has(a.id))
    const lines = unionLines(record).filter((l) => !fired.has(l.id))
    if (alerts.length + lines.length > 0) entries.push({ key, record, alerts, lines })
  }
  if (entries.length === 0) return

  const budget: Budget = { used: 0 }
  const symbols = entries.flatMap(({ alerts, lines }) => [...alerts, ...lines].map((w) => w.symbol))
  const quotes = await loadQuotes(symbols, budget)
  for (const entry of entries) await checkRecord(env, entry, quotes, budget)
}

async function checkRecord(env: Env, entry: Entry, quotes: Map<string, Quote>, budget: Budget): Promise<void> {
  const { key, record, alerts, lines } = entry
  const hits: Hit[] = []
  // 교차 알림 걸기·수평선 기준 잡기는 처음 한 번만 적는다 — 매분 쓰지 않는다.
  const armMarks: Record<string, SideMark> = { ...(record.armMarks ?? {}) }
  const lineMarks: Record<string, SideMark> = { ...(record.lineMarks ?? {}) }
  let marked = false

  for (const alert of alerts) {
    const quote = quotes.get(alert.symbol)
    if (!quote) continue
    const ak = armKey(alert)
    const verdict = judgeAlert(alert, alert.arm ? armMarks[ak] : undefined, quote.bars)
    if (!verdict) continue
    if ('mark' in verdict) {
      armMarks[ak] = verdict.mark
      marked = true
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
    const verdict = judgeLine(line, lineMarks[lk], quote.bars)
    if (!verdict) continue
    if ('mark' in verdict) {
      lineMarks[lk] = verdict.mark
      marked = true
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

  const fired = new Set(record.firedIds)
  const dead = new Set<string>()
  let sent = false
  for (const hit of hits) {
    const targets = record.subs.filter((s) => !dead.has(s.endpoint))
    // 외부 요청 한도를 넘기면 이 알림은 발동으로 적지 않고 다음 분으로 미룬다(기준도 그대로 둔다).
    if (budget.used + targets.length > SUBREQUEST_MAX) continue
    fired.add(hit.id)
    sent = true
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
  // 울린 것도, 새로 적을 기준도 없으면 아무것도 쓰지 않는다 — 무료 한도의 대부분이 여기서 아껴진다.
  if (!sent && !marked) return

  // 울린 교차 알림·수평선은 기준을 지운다 — 다시 켜면 그때 새로 잡는다.
  for (const alert of alerts) if (fired.has(alert.id)) delete armMarks[armKey(alert)]
  for (const line of lines) if (fired.has(line.id)) delete lineMarks[lineKey(line)]

  // 죽은 구독은 그 버킷까지 지운다. 레거시 목록은 감시기가 건드리지 않는다(첫 PUT 에서 정리).
  const alertsBy = { ...(record.alertsBy ?? {}) }
  const linesBy = { ...(record.linesBy ?? {}) }
  for (const ep of dead) {
    delete alertsBy[ep]
    delete linesBy[ep]
  }
  await env.SETTINGS.put(
    key,
    JSON.stringify({
      subs: record.subs.filter((s) => !dead.has(s.endpoint)),
      alertsBy,
      ...(record.alerts ? { alerts: record.alerts } : {}),
      linesBy,
      lineMarks,
      armMarks,
      firedIds: [...fired],
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
      const watch = rec ? unionAlerts(rec) : []
      const lines = rec ? unionLines(rec) : []
      const quotes = await loadQuotes([...watch, ...lines].map((w) => w.symbol), { used: 0 })
      return Response.json({
        subs: rec?.subs.length ?? 0,
        alerts: watch,
        lines,
        lineMarks: rec?.lineMarks ?? {},
        armMarks: rec?.armMarks ?? {},
        watched: ((await env.SETTINGS.get<string[]>(INDEX_KEY, 'json')) ?? []).includes(code),
        firedIds: rec?.firedIds ?? [],
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
