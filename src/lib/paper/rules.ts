/**
 * 종목 규칙(구간표) — OKX USDT 무기한 기준.
 *
 * 가격·수량 단위는 바이낸스 심볼을 따르고, 레버리지·유지증거금 구간은 OKX 공개 구간표를 쓴다.
 * OKX 는 "계약 수(contracts)"로 값을 주므로 계약당 코인 수(ctVal)와 바이낸스 배수 접두사(1000 등)로
 * 바이낸스 수량 단위(코인 개수)로 환산한다. OKX 에 없는 종목은 기본값(최대 20배·유지 2.5%)을 쓴다.
 */

import type { RiskTier, SymbolRules } from './types'
import type { SymbolInfo } from '../symbols'

const INSTRUMENTS_KEY = 'trading.okxInstruments.v1'
const TIERS_KEY = 'trading.okxTiers.v1'
const TTL_MS = 24 * 60 * 60 * 1000

const OKX_BASE = 'https://www.okx.com/api/v5/public'

/** 기본 규칙 — OKX 에 없거나 가져오기 실패한 종목. */
const DEFAULT_MAX_LEVERAGE = 20
const DEFAULT_MMR = 0.025

interface OkxResponse<T> {
  code: string
  msg: string
  data: T[]
}

interface OkxInstrument {
  instId: string
  instFamily: string
  ctVal: string
  lever: string
  settleCcy: string
}

interface OkxTier {
  maxSz: string
  maxLever: string
  mmr: string
}

/** 캐시에 담는 종목 정보 — 계약당 코인 수(ctVal)와 종목 최대 레버리지. */
interface InstrumentMeta {
  ctVal: number
  lever: number
}

interface InstrumentsCache {
  at: number
  map: Record<string, InstrumentMeta>
}

/** OKX 원본 구간(계약 수 단위)을 그대로 담는다 — 바이낸스 배수 환산은 읽을 때 한다. */
interface RawTier {
  maxSz: number
  maxLever: number
  mmr: number
}

type TiersCache = Record<string, { at: number; tiers: RawTier[] }>

/**
 * 바이낸스 기초자산에서 배수 접두사를 떼어 OKX 코드와 배수를 얻는다.
 * "1000PEPE" → { code: 'PEPE', mult: 1000 }, "1MBABYDOGE" → { code: 'BABYDOGE', mult: 1e6 }.
 */
function baseFamily(baseAsset: string): { code: string; mult: number } {
  const m = /^(1000000|1000|1M)(?=[A-Z])/i.exec(baseAsset)
  const prefix = m?.[1]?.toUpperCase()
  const mult = prefix === '1000' ? 1e3 : prefix === '1000000' || prefix === '1M' ? 1e6 : 1
  const code = baseAsset.replace(/^(1000000|1000|1M)(?=[A-Z])/i, '').toUpperCase()
  return { code, mult }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 저장 실패해도 이번 세션은 동작한다 */
  }
}

async function okxGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${OKX_BASE}${path}`)
  if (!res.ok) throw new Error(`OKX ${path} ${res.status}`)
  const body = (await res.json()) as OkxResponse<T>
  if (body.code !== '0') throw new Error(`OKX ${path} code ${body.code}: ${body.msg}`)
  return body.data
}

// 종목 목록은 한 번만 받는다(전체 SWAP 한 방). 동시에 여러 종목이 부르면 같은 약속을 나눠 쓴다.
let instrumentsPromise: Promise<Record<string, InstrumentMeta>> | null = null

async function loadInstruments(): Promise<Record<string, InstrumentMeta>> {
  const cached = readJson<InstrumentsCache>(INSTRUMENTS_KEY)
  if (cached && Date.now() - cached.at < TTL_MS && cached.map) return cached.map
  if (!instrumentsPromise) {
    instrumentsPromise = (async () => {
      const list = await okxGet<OkxInstrument>('/instruments?instType=SWAP')
      const map: Record<string, InstrumentMeta> = {}
      for (const it of list) {
        if (it.settleCcy !== 'USDT' || !it.instId.endsWith('-USDT-SWAP')) continue
        map[it.instFamily] = { ctVal: Number(it.ctVal), lever: Number(it.lever) }
      }
      writeJson(INSTRUMENTS_KEY, { at: Date.now(), map } satisfies InstrumentsCache)
      return map
    })().catch((e) => {
      instrumentsPromise = null // 다음 호출에서 다시 시도할 수 있게
      throw e
    })
  }
  return instrumentsPromise
}

// 구간표는 종목군(family)마다 따로 받는다. 같은 family 를 동시에 부르면 약속을 나눠 쓴다.
const tiersInFlight = new Map<string, Promise<RawTier[]>>()

async function loadTiers(family: string): Promise<RawTier[]> {
  const cache = readJson<TiersCache>(TIERS_KEY) ?? {}
  const hit = cache[family]
  if (hit && Date.now() - hit.at < TTL_MS && Array.isArray(hit.tiers)) return hit.tiers

  const existing = tiersInFlight.get(family)
  if (existing) return existing

  const promise = (async () => {
    const data = await okxGet<OkxTier>(
      `/position-tiers?instType=SWAP&tdMode=cross&instFamily=${encodeURIComponent(family)}`,
    )
    const tiers = data.map((t) => ({ maxSz: Number(t.maxSz), maxLever: Number(t.maxLever), mmr: Number(t.mmr) }))
    const next = readJson<TiersCache>(TIERS_KEY) ?? {}
    next[family] = { at: Date.now(), tiers }
    writeJson(TIERS_KEY, next)
    return tiers
  })()
    .finally(() => tiersInFlight.delete(family))
  tiersInFlight.set(family, promise)
  return promise
}

/**
 * 이 종목의 규칙(구간표). OKX 구간표를 바이낸스 수량 단위로 환산해 돌려준다.
 * OKX 에 없거나 가져오기 실패하면 기본값(최대 20배·유지 2.5%)을 쓴다.
 */
export async function loadRules(symbol: string, info: SymbolInfo | undefined): Promise<SymbolRules> {
  const tickSize = info && info.tickSize > 0 ? info.tickSize : 0.01
  const stepSize = info && info.stepSize > 0 ? info.stepSize : 0.001
  const minQty = info && info.minQty > 0 ? info.minQty : stepSize

  const defaults: SymbolRules = {
    symbol,
    tickSize,
    stepSize,
    minQty,
    maxLeverage: DEFAULT_MAX_LEVERAGE,
    tiers: [{ maxQty: Infinity, maxLeverage: DEFAULT_MAX_LEVERAGE, mmr: DEFAULT_MMR }],
    source: 'default',
  }

  const baseAsset = info?.baseAsset ?? symbol.replace(/USDT$/i, '')
  const { code, mult } = baseFamily(baseAsset)
  const family = `${code}-USDT`

  try {
    const instruments = await loadInstruments()
    const meta = instruments[family]
    if (!meta || !(meta.ctVal > 0)) return defaults

    const raw = await loadTiers(family)
    if (raw.length === 0) return defaults

    // 계약 수 → 바이낸스 코인 수량. 마지막 구간의 값도 유한하게 둔다(엔진이 더 큰 크기를 마지막 구간으로 본다).
    const tiers: RiskTier[] = raw
      .map((t) => ({ maxQty: (t.maxSz * meta.ctVal) / mult, maxLeverage: t.maxLever, mmr: t.mmr }))
      .sort((a, b) => a.maxQty - b.maxQty)

    return {
      symbol,
      tickSize,
      stepSize,
      minQty,
      maxLeverage: tiers[0].maxLeverage,
      tiers,
      source: 'okx',
    }
  } catch {
    return defaults
  }
}
