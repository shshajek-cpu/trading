/**
 * 심볼 검색 순위·병합(심볼 검색 창과 빠른 검색이 같이 쓴다). 네트워크·저장소를 건드리지 않는다.
 * 야후는 전체 목록이 없어 한글 이름표(KNOWN_YAHOO) + 야후 검색 결과를 섞는다.
 */
import { marketOf, nativeSymbol } from './market/ids'
import type { MarketId } from './market/types'
import type { YahooQuote } from './market/yahoo'
import { KNOWN_YAHOO, knownYahoo, type KnownYahoo } from './market/yahooNames'
import { isQuarterly, type SymbolInfo } from './symbols'

/** 검색어(대문자) → 순위(낮을수록 위, -1 제외). useSymbols 의 rankSymbol 을 넘긴다. */
export type RankFn = (info: SymbolInfo, q: string) => number

const KIND_OF: Record<KnownYahoo['kind'], string> = {
  index: 'INDEX',
  stock: 'EQUITY',
  etf: 'ETF',
  fx: 'CURRENCY',
  future: 'FUTURE',
}

/** 야후 심볼 접미사 → 거래소 표기(검색 결과를 못 받은 이름표 종목용). */
function guessExchange(symbol: string, kind: string): string {
  if (symbol.endsWith('.KS')) return 'KSE'
  if (symbol.endsWith('.KQ')) return 'KOSDAQ'
  if (kind === 'CURRENCY') return 'CCY'
  return 'Yahoo'
}

/** 이름표 종목 → 검색 행. */
export function knownYahooInfo(k: KnownYahoo): SymbolInfo {
  const kind = KIND_OF[k.kind]
  return {
    symbol: `YF:${k.symbol}`,
    baseAsset: k.symbol,
    quoteAsset: '',
    contractType: '',
    pricePrecision: k.kind === 'fx' ? 4 : 2,
    tickSize: 0,
    stepSize: 1,
    minQty: 1,
    name: k.ko,
    exchange: guessExchange(k.symbol, kind),
    kind,
  }
}

/** 야후 검색 결과 → 검색 행. */
export function quoteInfo(q: YahooQuote): SymbolInfo {
  return {
    symbol: `YF:${q.symbol}`,
    baseAsset: q.symbol,
    quoteAsset: '',
    contractType: '',
    pricePrecision: q.symbol.endsWith('=X') ? 4 : 2,
    tickSize: 0,
    stepSize: 1,
    minQty: 1,
    name: q.longname ?? q.shortname,
    exchange: q.exchDisp ?? q.exchange,
    kind: q.quoteType,
  }
}

/** 행을 고를 때 rememberYahooQuote 에 넘길 값(이름표 종목도 같은 모양으로). */
export function infoQuote(info: SymbolInfo): YahooQuote {
  const native = nativeSymbol(info.symbol)
  return {
    symbol: native,
    longname: info.name ?? knownYahoo(native)?.ko,
    exchDisp: info.exchange,
    quoteType: info.kind,
  }
}

const YAHOO_KIND_LABEL: Record<string, string> = {
  EQUITY: '주식',
  ETF: 'ETF',
  INDEX: '지수',
  CURRENCY: '환율',
  FUTURE: '선물·원자재',
  CRYPTOCURRENCY: '코인',
  MUTUALFUND: '펀드',
}

/** 행의 종류 꼬리표. */
export function symbolTypeTag(info: SymbolInfo): string {
  switch (marketOf(info.symbol)) {
    case 'binance':
      return isQuarterly(info) ? '선물 분기물' : '선물 무기한'
    case 'bspot':
      return '현물'
    case 'upbit':
      return '원화'
    case 'yahoo':
      return YAHOO_KIND_LABEL[(info.kind ?? '').toUpperCase()] ?? '주식·지수'
  }
}

/** 야후 검색에 보낼 만한 검색어인가(야후는 한글을 받지 않는다). */
export function yahooQueryable(query: string): boolean {
  return /[A-Za-z0-9]/.test(query) && !/[^\x20-\x7e]/.test(query.trim())
}

export type SearchTab = 'all' | MarketId

const MARKET_ORDER: Record<MarketId, number> = { binance: 0, bspot: 1, upbit: 2, yahoo: 3 }
/** 이름표 순서(야후 동점 정렬). */
const KNOWN_INDEX: Record<string, number> = Object.fromEntries(KNOWN_YAHOO.map((k, i) => [k.symbol, i]))

interface Ranked {
  info: SymbolInfo
  score: number
  order: number
}

/**
 * 탭·검색어로 행을 고르고 정렬한다.
 *  - infos: 받아 둔 모든 SymbolInfo(선물·현물·업비트·배운 야후)
 *  - hits: 야후 검색 결과(없으면 빈 배열)
 * 같은 id 는 한 번만(배운 정보 > 검색 결과 > 이름표 순으로 우선).
 */
export function searchSymbols(
  infos: readonly SymbolInfo[],
  hits: readonly YahooQuote[],
  query: string,
  tab: SearchTab,
  rank: RankFn,
  max = 200,
): SymbolInfo[] {
  const q = query.trim().toUpperCase()
  const seen = new Set<string>()
  const ranked: Ranked[] = []
  const add = (info: SymbolInfo, fallback: number) => {
    if (seen.has(info.symbol)) return
    const market = marketOf(info.symbol)
    if (tab !== 'all' && tab !== market) return
    let score: number
    if (!q) score = market === 'binance' && isQuarterly(info) ? 1 : 0
    else {
      score = rank(info, q)
      if (score < 0) score = fallback
    }
    if (score < 0) return
    seen.add(info.symbol)
    ranked.push({ info, score, order: MARKET_ORDER[market] })
  }
  const withYahoo = tab === 'all' || tab === 'yahoo'
  // 검색어 없는 전체 탭은 코인 목록만으로도 넘쳐서 야후 행은 주식·지수 탭에서 본다.
  const showKnown = withYahoo && (q !== '' || tab === 'yahoo')
  for (const info of infos) {
    // 배운 야후 종목은 검색어가 있거나 주식·지수 탭일 때만.
    if (marketOf(info.symbol) === 'yahoo' && !showKnown) continue
    add(info, -1)
  }
  if (withYahoo) {
    // 야후가 찾아 준 것은 이름이 안 겹쳐도(철자 교정 등) 맨 뒤에 둔다.
    for (const h of hits) add(quoteInfo(h), 5)
    if (showKnown) for (const k of KNOWN_YAHOO) add(knownYahooInfo(k), -1)
  }
  ranked.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    if (a.order !== b.order) return a.order - b.order
    // 무기한을 분기물보다 앞에.
    const aq = isQuarterly(a.info) ? 1 : 0
    const bq = isQuarterly(b.info) ? 1 : 0
    if (aq !== bq) return aq - bq
    // 검색어가 없으면 들어온 순서(이름표·거래대금 순)를 지킨다.
    if (!q) return 0
    // 야후끼리는 이름표 순서(대표 종목 먼저 — '삼성' → 삼성전자), 이름표에 없으면 야후 검색 순서.
    if (a.order === MARKET_ORDER.yahoo) {
      return (KNOWN_INDEX[nativeSymbol(a.info.symbol)] ?? KNOWN_YAHOO.length) - (KNOWN_INDEX[nativeSymbol(b.info.symbol)] ?? KNOWN_YAHOO.length)
    }
    // 접두사 계열에선 짧은 심볼(ETHUSDT)이 긴 것(ETHFIUSDT)보다 앞에.
    if (a.info.symbol.length !== b.info.symbol.length) return a.info.symbol.length - b.info.symbol.length
    return a.info.symbol.localeCompare(b.info.symbol)
  })
  return ranked.slice(0, max).map((r) => r.info)
}
