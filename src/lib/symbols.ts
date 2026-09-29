/**
 * 심볼 메타데이터 유틸.
 *
 * 거래소 목록(바이낸스 선물·현물 exchangeInfo, 업비트 마켓, 야후 차트 메타)을 앱이 다루기 좋은 형태(SymbolInfo)로
 * 정규화하고, TradingView 식 이름표("Bitcoin / TetherUS 무기한 계약")·표시 심볼("BTCUSDT.P")을 만든다.
 */

import type { ExchangeSymbol } from './market/binance'
import { marketOf, nativeSymbol } from './market/ids'
import { upbitTickSize, type UpbitMarketRow } from './market/upbit'
import { yahooDelayMinutes, type YahooMeta } from './market/yahoo'
import { knownYahoo } from './market/yahooNames'

export interface SymbolInfo {
  /** 앱 심볼 id(BTCUSDT, BSPOT:BTCUSDT, UPBIT:KRW-BTC, YF:AAPL). */
  symbol: string
  /** 기초 자산 코드(BTC). 야후는 야후 심볼. */
  baseAsset: string
  /** 견적 자산·통화(USDT, KRW, USD …). */
  quoteAsset: string
  /** 선물만: PERPETUAL | CURRENT_QUARTER | NEXT_QUARTER | … 나머지는 ''. */
  contractType: string
  /** COIN | INDEX 등. 주식·원자재 분류에 쓴다. */
  underlyingType?: string
  pricePrecision: number
  /** 가격 최소 단위(PRICE_FILTER.tickSize). 표시 자릿수 산출에 쓴다. */
  tickSize: number
  /** 수량 최소 단위(LOT_SIZE.stepSize). 주문 수량을 이 배수로 맞춘다. */
  stepSize: number
  /** 최소 주문 수량(LOT_SIZE.minQty). */
  minQty: number
  /** 분기물 인도일(ms). */
  deliveryDate?: number
  /** 이름(업비트 한글명, 야후 종목명). */
  name?: string
  /** 검색용 다른 이름(업비트 영문명). */
  altName?: string
  /** 야후: 거래소 표기(NasdaqGS, KSE …). */
  exchange?: string
  /** 야후: 종류(EQUITY, INDEX, CURRENCY, FUTURE, ETF …). */
  kind?: string
  /** 야후: 시세 지연(분). 0 이면 실시간. */
  delay?: number
  /** 야후: 정규장 시각(초) — 오늘(또는 다음) 장의 시작·끝. 심볼 정보의 「시장 열림/닫힘」에 쓴다. */
  session?: { start: number; end: number }
}

/** tickSize 의 소수 자릿수. "0.00100000" → 3, "1" → 0. */
function tickDecimals(tick: number): number {
  if (!Number.isFinite(tick) || tick <= 0) return 2
  const [mant, exp] = tick.toExponential().split('e')
  const mantDecimals = (mant.split('.')[1] ?? '').length
  return Math.max(0, mantDecimals - parseInt(exp, 10))
}

/** exchangeInfo 행 → SymbolInfo. id 는 앱 심볼 id(선물은 거래소 심볼 그대로, 현물은 BSPOT:…). */
export function toSymbolInfo(s: ExchangeSymbol, id = s.symbol): SymbolInfo {
  const priceFilter = s.filters?.find((f) => f.filterType === 'PRICE_FILTER')
  const tickRaw = priceFilter?.tickSize != null ? Number(priceFilter.tickSize) : 0
  const tickSize = Number.isFinite(tickRaw) ? tickRaw : 0
  const lotFilter = s.filters?.find((f) => f.filterType === 'LOT_SIZE')
  const stepRaw = lotFilter?.stepSize != null ? Number(lotFilter.stepSize) : 0
  const stepSize = Number.isFinite(stepRaw) && stepRaw > 0 ? stepRaw : 0.001
  const minRaw = lotFilter?.minQty != null ? Number(lotFilter.minQty) : 0
  const minQty = Number.isFinite(minRaw) && minRaw > 0 ? minRaw : stepSize
  return {
    symbol: id,
    baseAsset: s.baseAsset,
    quoteAsset: s.quoteAsset,
    contractType: s.contractType ?? '',
    underlyingType: s.underlyingType,
    pricePrecision: s.pricePrecision ?? tickDecimals(tickSize),
    tickSize,
    stepSize,
    minQty,
    deliveryDate: s.deliveryDate,
  }
}

/** 업비트 마켓 행 → SymbolInfo. price 를 알면 원화 호가 단위로 표시 자릿수를 정한다. */
export function upbitInfo(row: UpbitMarketRow, price?: number): SymbolInfo {
  const tickSize = price !== undefined && price > 0 ? upbitTickSize(price) : 0
  return {
    symbol: `UPBIT:${row.market}`,
    baseAsset: row.market.slice(row.market.indexOf('-') + 1),
    quoteAsset: 'KRW',
    contractType: '',
    pricePrecision: tickDecimals(tickSize),
    tickSize,
    stepSize: 0.00000001,
    minQty: 0,
    name: row.korean_name,
    altName: row.english_name,
  }
}

/** 야후 차트 메타 → SymbolInfo(가격 자릿수는 priceHint). */
export function yahooInfo(native: string, meta: YahooMeta): SymbolInfo {
  // 원화 주식·ETF 는 호가가 원 단위인데 야후 priceHint 는 2 로 온다 — 소수점을 뺀다(지수·환율은 그대로).
  const wholeWon = meta.currency === 'KRW' && (meta.instrumentType === 'EQUITY' || meta.instrumentType === 'ETF')
  const hint = wholeWon
    ? 0
    : typeof meta.priceHint === 'number' && Number.isInteger(meta.priceHint)
      ? meta.priceHint
      : native.endsWith('=X')
        ? 4
        : 2
  return {
    symbol: `YF:${native}`,
    baseAsset: native,
    quoteAsset: meta.currency ?? '',
    contractType: '',
    pricePrecision: hint,
    tickSize: 10 ** -hint,
    stepSize: 1,
    minQty: 1,
    name: meta.longName ?? meta.shortName,
    exchange: meta.fullExchangeName ?? meta.exchangeName,
    kind: meta.instrumentType,
    delay: yahooDelayMinutes(meta.exchangeName),
    session:
      meta.currentTradingPeriod?.regular?.start !== undefined && meta.currentTradingPeriod.regular.end !== undefined
        ? { start: meta.currentTradingPeriod.regular.start, end: meta.currentTradingPeriod.regular.end }
        : undefined,
  }
}

/**
 * 가격을 몇 자리로 표시할지. tickSize 기준. 목록에 아직 없으면 환율(=X)은 4, 나머지는 2.
 */
export function priceDecimals(symbol: string, infos: SymbolInfo[]): number {
  const info = infos.find((i) => i.symbol === symbol)
  if (info && info.tickSize > 0) return tickDecimals(info.tickSize)
  return symbol.endsWith('=X') ? 4 : 2
}

/**
 * 1000SHIB, 1000000MOG, 1MBABYDOODGE 처럼 붙는 배수 접두사를 떼어 실제 코인 코드만 남긴다.
 * 아이콘·이름 조회에 쓴다.
 */
export function baseCode(base: string): string {
  return base.replace(/^(1000000|1000|1M)(?=[A-Z])/i, '').toUpperCase()
}

/**
 * Binance USDT-M 선물 거래대금 상위 코인들의 정식 명칭.
 * 없으면 코드(BTC 등)를 그대로 쓴다. TradingView 이름표에 들어간다.
 */
const COIN_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  BNB: 'BNB',
  SOL: 'Solana',
  XRP: 'XRP',
  DOGE: 'Dogecoin',
  ADA: 'Cardano',
  TRX: 'TRON',
  AVAX: 'Avalanche',
  LINK: 'Chainlink',
  DOT: 'Polkadot',
  MATIC: 'Polygon',
  POL: 'Polygon',
  LTC: 'Litecoin',
  SHIB: 'Shiba Inu',
  BCH: 'Bitcoin Cash',
  UNI: 'Uniswap',
  NEAR: 'NEAR Protocol',
  APT: 'Aptos',
  ICP: 'Internet Computer',
  PEPE: 'Pepe',
  ETC: 'Ethereum Classic',
  FIL: 'Filecoin',
  ATOM: 'Cosmos',
  XLM: 'Stellar',
  HBAR: 'Hedera',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  INJ: 'Injective',
  SUI: 'Sui',
  SEI: 'Sei',
  TIA: 'Celestia',
  RUNE: 'THORChain',
  AAVE: 'Aave',
  MKR: 'Maker',
  LDO: 'Lido DAO',
  CRV: 'Curve DAO',
  SAND: 'The Sandbox',
  MANA: 'Decentraland',
  AXS: 'Axie Infinity',
  GALA: 'Gala',
  APE: 'ApeCoin',
  FTM: 'Fantom',
  ALGO: 'Algorand',
  VET: 'VeChain',
  GRT: 'The Graph',
  IMX: 'Immutable',
  RNDR: 'Render',
  RENDER: 'Render',
  FET: 'Artificial Superintelligence',
  AGIX: 'SingularityNET',
  THETA: 'Theta Network',
  EOS: 'EOS',
  EGLD: 'MultiversX',
  FLOW: 'Flow',
  CHZ: 'Chiliz',
  XTZ: 'Tezos',
  KAVA: 'Kava',
  MINA: 'Mina',
  ROSE: 'Oasis',
  ONE: 'Harmony',
  ZIL: 'Zilliqa',
  ENJ: 'Enjin Coin',
  DYDX: 'dYdX',
  GMX: 'GMX',
  SNX: 'Synthetix',
  COMP: 'Compound',
  SUSHI: 'SushiSwap',
  '1INCH': '1inch',
  YFI: 'yearn.finance',
  ORDI: 'ORDI',
  WLD: 'Worldcoin',
  JUP: 'Jupiter',
  PYTH: 'Pyth Network',
  JTO: 'Jito',
  BONK: 'Bonk',
  WIF: 'dogwifhat',
  FLOKI: 'FLOKI',
  BOME: 'BOOK OF MEME',
  ENA: 'Ethena',
  W: 'Wormhole',
  STRK: 'Starknet',
  TAO: 'Bittensor',
  NOT: 'Notcoin',
  ZK: 'zkSync',
  BLUR: 'Blur',
  DASH: 'Dash',
  ZEC: 'Zcash',
  XMR: 'Monero',
  IOTA: 'IOTA',
  NEO: 'Neo',
  QNT: 'Quant',
  KAS: 'Kaspa',
  TON: 'Toncoin',
  STX: 'Stacks',
  MEME: 'Memecoin',
  PENDLE: 'Pendle',
  ONDO: 'Ondo',
}

/** 코인 정식 명칭. 접두사(1000 등)를 떼고 조회, 없으면 코드 그대로. */
export function coinName(base: string): string {
  const code = baseCode(base)
  return COIN_NAMES[code] ?? code
}

/** 견적 자산 정식 명칭. USDT → TetherUS 처럼. */
const QUOTE_NAMES: Record<string, string> = {
  USDT: 'TetherUS',
  USDC: 'USD Coin',
  BUSD: 'Binance USD',
  FDUSD: 'First Digital USD',
  BTC: 'Bitcoin',
}

/** 선물 심볼 검색 분류(무기한·분기물·주식·원자재). */
export type SymbolCategory = 'perp' | 'quarterly' | 'stock'

/**
 * 분기물(인도 계약)인가. Binance 는 무기한에도 먼 인도일(2100-12-25)을 넣고,
 * 주식·원자재 무기한은 contractType 이 TRADIFI_PERPETUAL 이다 — 둘 다 무기한으로 본다.
 */
export function isQuarterly(info: SymbolInfo): boolean {
  return /QUARTER|MONTH/.test(info.contractType) || info.symbol.includes('_')
}

/** 주식·원자재(비 COIN 기초자산)인가. */
export function isStockLike(info: SymbolInfo): boolean {
  return !!info.underlyingType && info.underlyingType.toUpperCase() !== 'COIN'
}

/** 선물 심볼의 분류. */
export function symbolCategory(info: SymbolInfo): SymbolCategory {
  if (isQuarterly(info)) return 'quarterly'
  if (isStockLike(info)) return 'stock'
  return 'perp'
}

/** 심볼 문자열에서 분기물 인도 코드(YYMMDD)를 뽑는다. "BTCUSDT_260925" → "260925". */
function deliveryCode(info: SymbolInfo): string | null {
  const idx = info.symbol.indexOf('_')
  if (idx >= 0) {
    const suffix = info.symbol.slice(idx + 1)
    if (/^\d{6}$/.test(suffix)) return suffix
  }
  if (info.deliveryDate && info.deliveryDate > 0) {
    const d = new Date(info.deliveryDate)
    const yy = String(d.getUTCFullYear()).slice(2)
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    return `${yy}${mm}${dd}`
  }
  return null
}

/**
 * TradingView 이름표.
 *  - 선물 무기한:  "Bitcoin / TetherUS 무기한 계약"
 *  - 선물 분기물:  "Bitcoin / TetherUS 분기물 26.09.25"
 *  - 선물 주식·원자재: 코드 유지 "US500 / TetherUS 무기한 계약"
 *  - 현물:  "Bitcoin / TetherUS"
 *  - 업비트: "비트코인 / 원화"
 *  - 야후:  한글 이름표가 있으면 그것("삼성전자"), 없으면 종목명("Apple Inc.")
 */
export function describeSymbol(symbol: string, infos: SymbolInfo[]): string {
  const market = marketOf(symbol)
  const info = infos.find((i) => i.symbol === symbol)
  if (market === 'yahoo') {
    const native = nativeSymbol(symbol)
    return knownYahoo(native)?.ko ?? info?.name ?? native
  }
  if (market === 'upbit') return `${info?.name ?? nativeSymbol(symbol).slice(4)} / 원화`
  if (!info) return nativeSymbol(symbol)
  const quote = QUOTE_NAMES[info.quoteAsset.toUpperCase()] ?? info.quoteAsset.toUpperCase()
  if (market === 'bspot') return `${coinName(info.baseAsset)} / ${quote}`
  const name = isStockLike(info) ? baseCode(info.baseAsset) : coinName(info.baseAsset)
  if (isQuarterly(info)) {
    const code = deliveryCode(info)
    const when = code ? ` ${code.slice(0, 2)}.${code.slice(2, 4)}.${code.slice(4, 6)}` : ''
    return `${name} / ${quote} 분기물${when}`
  }
  return `${name} / ${quote} 무기한 계약`
}

/**
 * 표시 심볼.
 *  - 선물 무기한:  "BTCUSDT.P"
 *  - 선물 분기물:  "BTCUSDT260925" (밑줄 제거)
 *  - 현물:  "BTCUSDT"
 *  - 업비트: "BTCKRW"
 *  - 야후:  야후 심볼("AAPL", "005930.KS", "^GSPC")
 */
export function displaySymbol(symbol: string, infos: SymbolInfo[]): string {
  const market = marketOf(symbol)
  const native = nativeSymbol(symbol)
  if (market === 'upbit') return `${native.slice(4)}KRW`
  if (market !== 'binance') return native
  const info = infos.find((i) => i.symbol === symbol)
  if (!info) return symbol
  if (isQuarterly(info)) return info.symbol.replace('_', '')
  return `${info.symbol}.P`
}

/**
 * 코인 아이콘 코드(BTC). 코인이 아닌 종목(야후)은 null — 아이콘 자리에 글자 배지를 그린다.
 * 목록이 없어도 id 만으로 뽑는다(1000PEPEUSDT → PEPE, BSPOT:ETHBTC → ETH, UPBIT:KRW-XRP → XRP).
 */
export function coinCode(symbol: string): string | null {
  const market = marketOf(symbol)
  const native = nativeSymbol(symbol)
  if (market === 'yahoo') return null
  if (market === 'upbit') return native.slice(native.indexOf('-') + 1)
  const base = market === 'bspot' ? native.replace(/(USDT|USDC|FDUSD|BTC)$/, '') : native.replace(/(USDT|USDC|BUSD)(_\d+)?$/, '')
  return baseCode(base || native)
}

/** 거래소 이름(범례·검색 배지·심볼 정보). */
export function exchangeLabel(symbol: string, infos: SymbolInfo[]): string {
  switch (marketOf(symbol)) {
    case 'binance':
    case 'bspot':
      return 'Binance'
    case 'upbit':
      return 'Upbit'
    case 'yahoo':
      return infos.find((i) => i.symbol === symbol)?.exchange ?? 'Yahoo'
  }
}

/** 짧은 이름(위젯 제목·버튼 — "BTC", "005930.KS"). */
export function shortSymbol(symbol: string): string {
  return coinCode(symbol) ?? nativeSymbol(symbol)
}
