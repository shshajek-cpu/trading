/**
 * 실시간 시세(브라우저). React 밖의 구독 함수 — 훅(useLiveCandles·useMiniTickers)과 지표 알림 감시가 같이 쓴다.
 *
 *  - 바이낸스 선물·현물: 결합 웹소켓(봉 약 250ms~2s + 체결마다, 미니 티커 1~2s)
 *  - 업비트: 웹소켓 체결·시세. 봉 스트림이 없어 받은 최신 봉에 체결을 쌓아 봉을 만든다(주기 경계에서 새 봉).
 *  - 야후: 웹소켓이 없어 화면이 보이는 동안만 폴링한다(차트 7초, 시세 15초). 숨기면 멈추고 돌아오면 바로 한 번.
 *
 * 웹소켓은 끊기면 지수 백오프(1s → 30s)로 다시 붙고, 핸드셰이크만 되고 조용한 연결은 감시 타이머로 끊는다.
 */
import { barStart } from './bars'
import {
  combinedStreamUrl,
  klineStreamName,
  normalizeMiniTicker,
  normalizeStreamKline,
  toStreamSymbol,
  type AggTradeEvent,
  type CombinedStreamMessage,
  type KlineStreamEvent,
  type MiniTickerEvent,
} from './binance'
import { marketOf, nativeSymbol, symbolId } from './ids'
import { fetchLatest, fetchTickers, rateLimitedUntil } from './index'
import type { Candle, Interval, MarketId, Ticker24h } from './types'
import { UPBIT_WS, upbitSubscribe, type UpbitTickerMessage, type UpbitTradeMessage } from './upbit'

export type LiveStatus = 'idle' | 'connecting' | 'open' | 'closed'

export interface CandleHandlers {
  /** 봉 갱신(미확정 포함). closed=true 면 그 봉이 확정된 것. */
  onCandle: (candle: Candle, closed: boolean) => void
  /** 체결마다(바이낸스만) — 봉 이벤트 사이에도 현재가·거래량을 바로 움직인다. time 은 ms. */
  onTrade?: (price: number, qty: number, time: number) => void
  onStatus?: (status: LiveStatus) => void
  /** 다시 붙었을 때 — 끊긴 동안의 빈틈을 REST 로 메우는 용도. */
  onReconnect?: () => void
}

const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000
/** 야후 차트 폴링 간격. 프록시가 같은 요청을 5~10초 캐시한다. */
const YAHOO_CANDLE_POLL_MS = 7000
/** 야후 시세 폴링 간격. */
const YAHOO_TICKER_POLL_MS = 15000
/** 웹소켓 시세가 끊겼을 때만 도는 REST 예비 조회 간격. */
const TICKER_REST_MS = 30000
/** 업비트는 2분 동안 아무 것도 없으면 연결을 끊는다 — 1분마다 PING 을 보낸다(답은 {"status":"UP"}). */
const UPBIT_PING_MS = 60000

interface SocketOptions {
  url: string
  /** 이만큼 조용하면 죽은 연결로 보고 다시 붙는다. */
  idleMs: number
  onOpen: (ws: WebSocket, reconnect: boolean) => void
  onMessage: (text: string) => void
  onClose?: () => void
  /** 연결 유지용 메시지와 간격. */
  ping?: { payload: string; everyMs: number }
}

/** 다시 붙는 웹소켓. 반환값으로 닫는다. 바이너리 메시지(업비트)는 UTF-8 로 풀어 넘긴다. */
function openSocket(opts: SocketOptions): () => void {
  let disposed = false
  let socket: WebSocket | null = null
  let retryTimer: number | undefined
  let idleTimer: number | undefined
  let pingTimer: number | undefined
  let backoff = INITIAL_BACKOFF_MS
  let opened = false
  const decoder = new TextDecoder()

  const armIdle = (ws: WebSocket) => {
    window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(() => {
      if (!disposed && socket === ws) ws.close()
    }, opts.idleMs)
  }

  const connect = () => {
    if (disposed) return
    const ws = new WebSocket(opts.url)
    ws.binaryType = 'arraybuffer'
    socket = ws
    ws.onopen = () => {
      if (disposed) return
      backoff = INITIAL_BACKOFF_MS
      armIdle(ws)
      const ping = opts.ping
      if (ping) {
        window.clearInterval(pingTimer)
        pingTimer = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(ping.payload), ping.everyMs)
      }
      opts.onOpen(ws, opened)
      opened = true
    }
    ws.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (disposed) return
      armIdle(ws)
      opts.onMessage(typeof event.data === 'string' ? event.data : decoder.decode(event.data))
    }
    ws.onerror = () => ws.close()
    ws.onclose = () => {
      window.clearInterval(pingTimer)
      if (disposed) return
      opts.onClose?.()
      const delay = backoff
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
      retryTimer = window.setTimeout(connect, delay)
    }
  }

  connect()
  return () => {
    disposed = true
    window.clearTimeout(retryTimer)
    window.clearTimeout(idleTimer)
    window.clearInterval(pingTimer)
    if (socket) {
      socket.onopen = null
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      socket.close()
    }
  }
}

function parse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

/**
 * 화면이 보이는 동안만 도는 폴링. run 이 끝나면 everyMs 뒤에 다시 돈다. 숨었다 돌아오면 바로 한 번.
 */
function poll(run: (signal: AbortSignal) => Promise<void>, everyMs: number): () => void {
  let disposed = false
  let timer: number | undefined
  let running = false
  const controller = new AbortController()
  const tick = async () => {
    window.clearTimeout(timer)
    if (disposed || running) return
    if (!document.hidden) {
      running = true
      await run(controller.signal).catch(() => {})
      running = false
    }
    if (!disposed) timer = window.setTimeout(() => void tick(), everyMs)
  }
  const onVisible = () => {
    if (!document.hidden) void tick()
  }
  document.addEventListener('visibilitychange', onVisible)
  void tick()
  return () => {
    disposed = true
    controller.abort()
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/* ── 봉 ─────────────────────────────────────────────────── */

function binanceCandles(symbol: string, interval: Interval, h: CandleHandlers): () => void {
  const venue = marketOf(symbol) === 'bspot' ? 'spot' : 'futures'
  const native = nativeSymbol(symbol)
  h.onStatus?.('connecting')
  return openSocket({
    url: combinedStreamUrl(venue, [klineStreamName(native, interval), `${toStreamSymbol(native)}@aggTrade`]),
    // 봉 스트림은 느려도 2초마다 온다.
    idleMs: 20000,
    onOpen: (_, reconnect) => {
      h.onStatus?.('open')
      if (reconnect) h.onReconnect?.()
    },
    onClose: () => h.onStatus?.('closed'),
    onMessage: (text) => {
      const payload = parse<CombinedStreamMessage<KlineStreamEvent | AggTradeEvent>>(text)?.data
      if (!payload) return
      if (payload.e === 'kline' && payload.k) h.onCandle(normalizeStreamKline(payload.k), payload.k.x)
      else if (payload.e === 'aggTrade') h.onTrade?.(Number(payload.p), Number(payload.q), payload.T)
    },
  })
}

/**
 * 업비트: 연결될 때마다 최신 봉을 REST 로 받아 시작값으로 두고, 체결을 쌓는다. 체결이 다음 봉 경계를 넘으면
 * 지금 봉을 확정하고 새 봉을 연다. 시작값을 받기 전의 체결은 버린다(REST 봉에 이미 들어 있다).
 */
function upbitCandles(symbol: string, interval: Interval, h: CandleHandlers): () => void {
  const code = nativeSymbol(symbol)
  let current: Candle | null = null
  let seed: AbortController | null = null
  h.onStatus?.('connecting')
  const close = openSocket({
    url: UPBIT_WS,
    idleMs: 150000,
    ping: { payload: 'PING', everyMs: UPBIT_PING_MS },
    onOpen: (ws, reconnect) => {
      ws.send(upbitSubscribe(['trade'], [code]))
      h.onStatus?.('open')
      if (reconnect) h.onReconnect?.()
      seed?.abort()
      const controller = new AbortController()
      seed = controller
      current = null
      fetchLatest(symbol, interval, controller.signal)
        .then((list) => {
          const last = list.at(-1)
          if (controller.signal.aborted || !last) return
          current = last
          h.onCandle(last, false)
        })
        .catch(() => {})
    },
    onClose: () => h.onStatus?.('closed'),
    onMessage: (text) => {
      const m = parse<UpbitTradeMessage>(text)
      if (!m || m.ty !== 'trade' || m.cd !== code || !current) return
      const start = barStart(interval, Math.floor(m.ttms / 1000))
      if (start < current.time) return
      if (start === current.time) {
        current = {
          ...current,
          close: m.tp,
          high: Math.max(current.high, m.tp),
          low: Math.min(current.low, m.tp),
          volume: current.volume + m.tv,
        }
      } else {
        h.onCandle(current, true)
        current = { time: start, open: m.tp, high: m.tp, low: m.tp, close: m.tp, volume: m.tv }
      }
      h.onCandle(current, false)
    },
  })
  return () => {
    seed?.abort()
    close()
  }
}

/**
 * 야후: 최신 봉을 폴링한다. 마지막 봉은 진행 중으로 넘기고, 마지막 봉이 새 봉으로 바뀐 순간에만 앞 봉을 확정으로
 * 넘긴다(봉 마감 판정이 폴링마다 되풀이되지 않게).
 */
function yahooCandles(symbol: string, interval: Interval, h: CandleHandlers): () => void {
  let lastTime: number | null = null
  h.onStatus?.('connecting')
  return poll(async (signal) => {
    if (rateLimitedUntil(symbol) > Date.now()) return
    try {
      const list = await fetchLatest(symbol, interval, signal)
      if (signal.aborted) return
      const last = list.at(-1)
      const prev = list.at(-2)
      if (last) {
        if (lastTime !== null && last.time > lastTime && prev?.time === lastTime) h.onCandle(prev, true)
        lastTime = last.time
        h.onCandle(last, false)
      }
      h.onStatus?.('open')
    } catch (err) {
      if (!signal.aborted) h.onStatus?.('closed')
      throw err
    }
  }, YAHOO_CANDLE_POLL_MS)
}

/** 차트 한 칸의 실시간 봉. 반환값으로 멈춘다. */
export function subscribeCandles(symbol: string, interval: Interval, handlers: CandleHandlers): () => void {
  switch (marketOf(symbol)) {
    case 'binance':
    case 'bspot':
      return binanceCandles(symbol, interval, handlers)
    case 'upbit':
      return upbitCandles(symbol, interval, handlers)
    case 'yahoo':
      return yahooCandles(symbol, interval, handlers)
  }
}

/* ── 24시간 시세 ─────────────────────────────────────────── */

/**
 * REST 예비 조회: 처음 한 번, 그 뒤로는 웹소켓이 값을 주지 않는 동안만(isLive 가 false) 주기마다.
 * 요청 한도로 쉬는 중이거나 화면이 숨었으면 건너뛴다.
 */
function restFallback(symbols: string[], onTicker: (t: Ticker24h) => void, isLive: () => boolean): () => void {
  return poll(async (signal) => {
    if (isLive() || rateLimitedUntil(symbols[0]) > Date.now()) return
    for (const t of await fetchTickers(symbols, signal)) if (!signal.aborted) onTicker(t)
  }, TICKER_REST_MS)
}

function binanceTickers(market: MarketId, symbols: string[], onTicker: (t: Ticker24h) => void): () => void {
  let live = false
  const byNative = new Map(symbols.map((s) => [nativeSymbol(s).toUpperCase(), s]))
  const close = openSocket({
    url: combinedStreamUrl(
      market === 'bspot' ? 'spot' : 'futures',
      symbols.map((s) => `${toStreamSymbol(nativeSymbol(s))}@miniTicker`),
    ),
    // 미니 티커는 종목당 1~2초마다 온다.
    idleMs: 30000,
    onOpen: () => {},
    onClose: () => {
      live = false
    },
    onMessage: (text) => {
      const data = parse<CombinedStreamMessage<MiniTickerEvent>>(text)?.data
      const id = data?.e === '24hrMiniTicker' ? byNative.get(data.s) : undefined
      if (!data || !id) return
      live = true
      onTicker(normalizeMiniTicker(data, id))
    },
  })
  const stopRest = restFallback(symbols, onTicker, () => live)
  return () => {
    close()
    stopRest()
  }
}

function upbitTickers(symbols: string[], onTicker: (t: Ticker24h) => void): () => void {
  let live = false
  const codes = symbols.map(nativeSymbol)
  const close = openSocket({
    url: UPBIT_WS,
    idleMs: 150000,
    ping: { payload: 'PING', everyMs: UPBIT_PING_MS },
    onOpen: (ws) => ws.send(upbitSubscribe(['ticker'], codes)),
    onClose: () => {
      live = false
    },
    onMessage: (text) => {
      const m = parse<UpbitTickerMessage>(text)
      if (!m || m.ty !== 'ticker') return
      live = true
      onTicker({
        symbol: symbolId('upbit', m.cd),
        lastPrice: m.tp,
        priceChange: m.scp,
        priceChangePercent: m.scr * 100,
        highPrice: m.hp,
        lowPrice: m.lp,
        volume: m.atv24h,
        quoteVolume: m.atp24h,
      })
    },
  })
  const stopRest = restFallback(symbols, onTicker, () => live)
  return () => {
    close()
    stopRest()
  }
}

function yahooTickers(symbols: string[], onTicker: (t: Ticker24h) => void): () => void {
  return poll(async (signal) => {
    if (rateLimitedUntil(symbols[0]) > Date.now()) return
    for (const t of await fetchTickers(symbols, signal)) if (!signal.aborted) onTicker(t)
  }, YAHOO_TICKER_POLL_MS)
}

/** 여러 종목(시장이 섞여도 된다)의 24시간 시세. 반환값으로 멈춘다. */
export function subscribeTickers(symbols: string[], onTicker: (t: Ticker24h) => void): () => void {
  const groups = new Map<MarketId, string[]>()
  for (const s of new Set(symbols)) {
    const market = marketOf(s)
    groups.set(market, [...(groups.get(market) ?? []), s])
  }
  const stops = [...groups].map(([market, list]) => {
    switch (market) {
      case 'binance':
      case 'bspot':
        return binanceTickers(market, list, onTicker)
      case 'upbit':
        return upbitTickers(list, onTicker)
      case 'yahoo':
        return yahooTickers(list, onTicker)
    }
  })
  return () => {
    for (const stop of stops) stop()
  }
}
