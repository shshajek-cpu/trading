/**
 * 감시기가 시세를 읽는 공통 부분 — 가격·수평선 알림의 1분봉(index.ts)과 지표 알림의 주기별 봉(indicatorAlerts.ts)이 함께 쓴다.
 *
 * 앱과 같은 바이낸스 USDT-M 을 먼저 부른다. 바이낸스가 데이터센터 IP·지역을 막거나(403/451) 요청 한도에 걸리면(418/429)
 * 이번 호출 동안은 다시 부르지 않고 같은 무기한 선물의 gate.io 봉으로 대신한다. 운영(Cloudflare)에서는 바이낸스가 막혀 있어
 * 실제로는 gate.io 를 쓴다. 두 쪽 봉 조회는 한 호출에서 CANDLE_FETCH_MAX 번까지 — 넘는 것은 다음 분에 읽는다.
 */

export const KLINES_URL = 'https://fapi.binance.com/fapi/v1/klines'
export const GATE_CANDLES_URL = 'https://api.gateio.ws/api/v4/futures/usdt/candlesticks'
const TICKERS_URL = 'https://api.gateio.ws/api/v4/futures/usdt/tickers'

/** 무료 플랜의 호출 하나당 외부 요청(하위 요청) 한도. 시세·봉 조회와 푸시 발송이 함께 쓴다. */
export const SUBREQUEST_MAX = 50
/** 봉 조회(바이낸스·gate 합계, 가격 시세와 지표 봉 합계) 상한. 남는 14회는 전체 시세 한 번과 푸시 발송 몫이다. */
export const CANDLE_FETCH_MAX = 36
/** 바이낸스 표기(BTCUSDT, 1000PEPEUSDT, BTCUSDT_250328). 모양이 다른 값으로는 요청을 쓰지 않는다. */
export const SYMBOL_RE = /^[0-9A-Z_]{2,40}$/
/** 이 응답이면 이번 호출 동안 바이낸스를 다시 부르지 않는다 — 지역·IP 차단(403/451)과 요청 한도(418/429). */
export const BINANCE_BLOCKED = new Set([403, 418, 429, 451])

export type PriceSource = 'binance' | 'gate'

/** 이번 호출에서 쓴 외부 요청과, 호출 안에서 한 번만 알아내면 되는 것. */
export interface Budget {
  /** 외부 요청(하위 요청) 수. 시세 조회와 푸시 발송이 함께 쓴다. */
  used: number
  /** 봉 조회 수. CANDLE_FETCH_MAX 까지. */
  candles: number
  /** 바이낸스가 막혔다 — 이번 호출에서는 다시 부르지 않는다. */
  binanceBlocked: boolean
  /** gate.io 전체 시세. 처음 필요할 때 한 번만 부른다. */
  tickers?: Promise<Map<string, GateTicker> | null>
}

export function newBudget(): Budget {
  return { used: 0, candles: 0, binanceBlocked: false }
}

/** gate.io 계약 이름, 바이낸스 표기로 바꾸는 가격 배율, 현재가(바이낸스 배율), 계약 1장의 바이낸스 표기 수량. */
export interface GateTicker {
  contract: string
  scale: number
  last: number
  /** 봉 거래량(계약 수)에 곱해 바이낸스 거래량(기초 자산 수량)으로 바꾸는 값 — quanto_multiplier ÷ scale. */
  volume: number
}

/**
 * gate.io 전체 시세. BTC_USDT 형식이라 밑줄을 빼 바이낸스 표기(BTCUSDT)로 맞춘다.
 * gate 는 1000 배 계약을 따로 상장하지 않고 원 코인만 둔다(PEPE_USDT 등).
 * 그래서 바이낸스 1000PEPEUSDT 도 찾을 수 있게 ×1000 항목을 함께 넣는다(같은 이름의 계약이 있으면 그쪽을 쓴다).
 * 호출 안에서 한 번만 부른다.
 */
export function gateTickers(budget: Budget): Promise<Map<string, GateTicker> | null> {
  budget.tickers ??= (async () => {
    budget.used++
    try {
      const res = await fetch(TICKERS_URL, { headers: { Accept: 'application/json' } })
      if (!res.ok) return null
      const list = (await res.json()) as { contract: string; last: string; quanto_multiplier?: string }[]
      const map = new Map<string, GateTicker>()
      const scaled: [string, GateTicker][] = []
      for (const t of list) {
        const last = Number(t.last)
        if (!Number.isFinite(last) || !t.contract.endsWith('_USDT')) continue
        const symbol = t.contract.replace('_', '')
        const multiplier = Number(t.quanto_multiplier)
        map.set(symbol, { contract: t.contract, scale: 1, last, volume: multiplier })
        scaled.push([
          `1000${symbol}`,
          { contract: t.contract, scale: 1000, last: last * 1000, volume: multiplier / 1000 },
        ])
      }
      for (const [symbol, ticker] of scaled) if (!map.has(symbol)) map.set(symbol, ticker)
      return map
    } catch {
      return null
    }
  })()
  return budget.tickers
}

/**
 * 항목마다 봉을 읽는다 — 바이낸스 먼저, 막혔거나 실패한 항목은 gate.io 로(gate 에 없는 종목에는 요청을 쓰지 않는다).
 * 첫 항목으로 바이낸스가 막혔는지 먼저 보고, 막혔으면 나머지 항목에는 바이낸스 요청을 쓰지 않는다.
 * 봉 조회 수가 ceiling(CANDLE_FETCH_MAX 이하)에 닿거나 외부 요청이 SUBREQUEST_MAX 에 닿으면 남은 항목은 이번 분에
 * 읽지 않는다(결과에 없다).
 */
export async function loadCandles<K extends { symbol: string }, V>(
  items: K[],
  budget: Budget,
  ceiling: number,
  viaBinance: (item: K) => Promise<V | 'blocked' | null>,
  viaGate: (item: K, ticker: GateTicker) => Promise<V | null>,
): Promise<Map<K, { source: PriceSource; value: V }>> {
  const out = new Map<K, { source: PriceSource; value: V }>()
  const fallback: K[] = []
  // 이번 호출에 더 할 수 있는 봉 조회 수. reserve: 그 전에 따로 써야 할 외부 요청 수.
  const room = (reserve = 0) =>
    Math.max(0, Math.min(ceiling - budget.candles, SUBREQUEST_MAX - budget.used - reserve))
  const tryBinance = async (item: K): Promise<void> => {
    budget.candles++
    const value = await viaBinance(item)
    if (value === 'blocked') budget.binanceBlocked = true
    if (value !== null && value !== 'blocked') out.set(item, { source: 'binance', value })
    else fallback.push(item)
  }
  let next = 0
  if (!budget.binanceBlocked && items.length > 0 && room() > 0) {
    await tryBinance(items[0])
    next = 1
  }
  const rest = budget.binanceBlocked ? [] : items.slice(next, next + room())
  await Promise.all(rest.map(tryBinance))
  fallback.push(...items.slice(next + rest.length))
  // gate 로 읽으려면 전체 시세(아직 안 불렀으면 1회) 뒤에 봉 조회 1회가 들어갈 자리가 있어야 한다.
  if (fallback.length === 0 || room(budget.tickers ? 0 : 1) === 0) return out

  const tickers = await gateTickers(budget)
  if (!tickers) return out
  const listed = fallback.flatMap((item) => {
    const ticker = tickers.get(item.symbol)
    return ticker ? [{ item, ticker }] : []
  })
  const picked = listed.slice(0, room())
  budget.candles += picked.length
  await Promise.all(
    picked.map(async ({ item, ticker }) => {
      const value = await viaGate(item, ticker)
      if (value !== null) out.set(item, { source: 'gate', value })
    }),
  )
  return out
}
