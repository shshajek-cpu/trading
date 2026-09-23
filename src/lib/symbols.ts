/**
 * 심볼 메타데이터 유틸.
 *
 * Binance USDT-M 선물 exchangeInfo 를 앱이 다루기 좋은 형태(SymbolInfo)로 정규화하고,
 * TradingView 식 이름표("Bitcoin / TetherUS 무기한 계약")·표시 심볼("BTCUSDT.P")을 만든다.
 */

import type { ExchangeSymbol } from './binance'

export interface SymbolInfo {
  symbol: string
  baseAsset: string
  quoteAsset: string
  /** PERPETUAL | CURRENT_QUARTER | NEXT_QUARTER | … */
  contractType: string
  /** COIN | INDEX 등. 주식·원자재 분류에 쓴다. */
  underlyingType?: string
  pricePrecision: number
  /** 가격 최소 단위(PRICE_FILTER.tickSize). 표시 자릿수 산출에 쓴다. */
  tickSize: number
  /** 분기물 인도일(ms). */
  deliveryDate?: number
}

/** exchangeInfo 행 → SymbolInfo. */
export function toSymbolInfo(s: ExchangeSymbol): SymbolInfo {
  const priceFilter = s.filters?.find((f) => f.filterType === 'PRICE_FILTER')
  const tickSize = priceFilter?.tickSize != null ? Number(priceFilter.tickSize) : 0
  return {
    symbol: s.symbol,
    baseAsset: s.baseAsset,
    quoteAsset: s.quoteAsset,
    contractType: s.contractType,
    underlyingType: s.underlyingType,
    pricePrecision: s.pricePrecision,
    tickSize: Number.isFinite(tickSize) ? tickSize : 0,
    deliveryDate: s.deliveryDate,
  }
}

/** tickSize 의 소수 자릿수. "0.00100000" → 3, "1" → 0. */
function tickDecimals(tick: number): number {
  if (!Number.isFinite(tick) || tick <= 0) return 2
  const [mant, exp] = tick.toExponential().split('e')
  const mantDecimals = (mant.split('.')[1] ?? '').length
  return Math.max(0, mantDecimals - parseInt(exp, 10))
}

/** 가격을 몇 자리로 표시할지. tickSize 기준, 없으면 2. */
export function priceDecimals(symbol: string, infos: SymbolInfo[]): number {
  const info = infos.find((i) => i.symbol === symbol)
  if (!info || info.tickSize <= 0) return 2
  return tickDecimals(info.tickSize)
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

/** 심볼 검색 탭 분류. */
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
 *  - 무기한:  "Bitcoin / TetherUS 무기한 계약"
 *  - 분기물:  "Bitcoin / TetherUS 분기물 26.09.25"
 *  - 주식·원자재: 코드 유지 "US500 / TetherUS 무기한 계약"
 */
export function describeSymbol(symbol: string, infos: SymbolInfo[]): string {
  const info = infos.find((i) => i.symbol === symbol)
  if (!info) return symbol
  const name = isStockLike(info) ? baseCode(info.baseAsset) : coinName(info.baseAsset)
  const quote = QUOTE_NAMES[info.quoteAsset.toUpperCase()] ?? info.quoteAsset.toUpperCase()
  if (isQuarterly(info)) {
    const code = deliveryCode(info)
    const when = code ? ` ${code.slice(0, 2)}.${code.slice(2, 4)}.${code.slice(4, 6)}` : ''
    return `${name} / ${quote} 분기물${when}`
  }
  return `${name} / ${quote} 무기한 계약`
}

/**
 * 표시 심볼.
 *  - 무기한:  "BTCUSDT.P"
 *  - 분기물:  "BTCUSDT260925" (밑줄 제거)
 */
export function displaySymbol(symbol: string, infos: SymbolInfo[]): string {
  const info = infos.find((i) => i.symbol === symbol)
  if (!info) return symbol
  if (isQuarterly(info)) return info.symbol.replace('_', '')
  return `${info.symbol}.P`
}
