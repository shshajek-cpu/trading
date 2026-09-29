/**
 * 야후 프록시의 공통 처리(Pages Function functions/api/yahoo.ts 와 개발 서버 vite.config.ts 가 같이 쓴다).
 * window·Pages 타입을 쓰지 않는다.
 *
 * 받는 요청(이 모양 말고는 400):
 *   type=chart&symbol=AAPL&interval=1d&period1=<초>&period2=<초>[&includePrePost=false]
 *   type=chart&symbol=AAPL&interval=1d&range=1d            (시세 한 줄 — range 는 1d·5d 만)
 *   type=search&q=<검색어 1~40자>
 * 모르는 파라미터는 버리고, 야후로 보내는 주소는 항상 같은 순서로 다시 만든다(엣지 캐시 열쇠가 된다).
 */
import { YAHOO_CHART_URL, YAHOO_SEARCH_URL } from './yahoo'

const SYMBOL_RE = /^[0-9A-Za-z^=.\-&]{1,24}$/
const INT_RE = /^\d{1,12}$/
/** 야후 interval → 캐시 초. 분봉은 짧게, 1m 은 더 짧게. */
const CHART_TTL: Record<string, number> = {
  '1m': 5,
  '5m': 10,
  '15m': 10,
  '30m': 10,
  '60m': 10,
  '1d': 60,
  '1wk': 60,
  '1mo': 60,
}
const RANGES: Record<string, true> = { '1d': true, '5d': true }
const RANGE_TTL = 15
const SEARCH_TTL = 600
const MAX_Q = 40
/** period2 가 지금보다 이만큼(초)까지 앞서는 것은 받는다. */
const FUTURE_SLACK = 2 * 86_400
const TIMEOUT_MS = 10_000

/** 야후가 봇 응답(빈 본문·차단)을 덜 주도록 브라우저처럼 보낸다. */
const UPSTREAM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  Accept: 'application/json',
}

export type YahooUpstream = { url: string; ttl: number } | { error: string }

export interface YahooProxyResult {
  status: number
  body: string
  ttl: number
}

/** 같은 이름이 두 번 오면 끼워넣기로 보고 null(=잘못된 요청). 없으면 undefined. */
function one(params: URLSearchParams, key: string): string | undefined | null {
  const all = params.getAll(key)
  if (all.length > 1) return null
  return all[0]
}

/** 요청 파라미터 검사 → 야후 주소와 캐시 초. 틀리면 { error }. */
export function yahooUpstream(params: URLSearchParams, nowSec: number): YahooUpstream {
  const type = one(params, 'type')
  if (type === 'search') {
    const raw = one(params, 'q')
    if (raw == null) return { error: '검색어(q)가 없습니다' }
    const q = raw.trim()
    if (q.length < 1 || q.length > MAX_Q) return { error: `검색어는 1~${MAX_Q}자입니다` }
    const up = new URLSearchParams({
      q,
      quotesCount: '10',
      newsCount: '0',
      listsCount: '0',
      enableFuzzyQuery: 'false',
    })
    return { url: `${YAHOO_SEARCH_URL}?${up}`, ttl: SEARCH_TTL }
  }
  if (type !== 'chart') return { error: 'type 은 chart 또는 search 입니다' }

  const symbol = one(params, 'symbol')
  if (!symbol || !SYMBOL_RE.test(symbol)) return { error: '심볼 형식이 올바르지 않습니다' }
  const interval = one(params, 'interval')
  if (!interval || !Object.hasOwn(CHART_TTL, interval)) return { error: '지원하지 않는 interval 입니다' }
  const prePost = one(params, 'includePrePost')
  if (prePost !== undefined && prePost !== 'false') return { error: 'includePrePost 는 false 만 됩니다' }

  const range = one(params, 'range')
  const p1 = one(params, 'period1')
  const p2 = one(params, 'period2')
  const up = new URLSearchParams({ interval })
  let ttl: number
  if (range !== undefined) {
    if (p1 !== undefined || p2 !== undefined) return { error: 'range 와 period 는 같이 쓸 수 없습니다' }
    if (range === null || !Object.hasOwn(RANGES, range)) return { error: 'range 는 1d 또는 5d 입니다' }
    up.set('range', range)
    ttl = RANGE_TTL
  } else {
    if (!p1 || !p2 || !INT_RE.test(p1) || !INT_RE.test(p2)) return { error: 'period1·period2 는 정수(초)입니다' }
    const from = Number(p1)
    const to = Number(p2)
    if (!(from < to) || to > nowSec + FUTURE_SLACK) return { error: '기간이 올바르지 않습니다' }
    up.set('period1', String(from))
    up.set('period2', String(to))
    ttl = CHART_TTL[interval]
  }
  up.set('includePrePost', 'false')
  return { url: `${YAHOO_CHART_URL}${encodeURIComponent(symbol)}?${up}`, ttl }
}

function jsonError(status: number, message: string): YahooProxyResult {
  return { status, body: JSON.stringify({ error: message }), ttl: 0 }
}

/**
 * 검사 후 야후를 부른다. 야후의 상태(200·404·422·429 …)와 본문을 그대로 돌려준다.
 * 본문이 JSON 이 아니면(429 안내문 등) 상태는 두고 { error } 로 바꾼다 — 앱은 JSON 만 읽는다.
 */
export async function fetchYahoo(
  params: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
  nowSec: number = Date.now() / 1000,
): Promise<YahooProxyResult> {
  const up = yahooUpstream(params, nowSec)
  if ('error' in up) return jsonError(400, up.error)
  let res: Response
  let body: string
  try {
    res = await fetchImpl(up.url, { headers: UPSTREAM_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
    body = await res.text()
  } catch (e) {
    return jsonError(502, `야후에 연결하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`)
  }
  const type = res.headers.get('Content-Type') ?? ''
  if (!type.includes('json')) return { ...jsonError(res.status, `Yahoo ${res.status}`), ttl: up.ttl }
  return { status: res.status, body, ttl: up.ttl }
}
