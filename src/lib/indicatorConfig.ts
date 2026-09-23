import { INDICATOR_PALETTE } from './theme'
import { notifySettingsChanged } from './syncBus'

/**
 * 지표 설정 모델(v3). TradingView 처럼 "지표 인스턴스" 목록으로 다룬다 —
 * 같은 종류를 여러 개(예: MA 9, MA 21, MA 50) 올릴 수 있다.
 */
export type IndicatorKind =
  | 'maSet'
  | 'volume'
  | 'volumeSpike'
  | 'multiMa'
  | 'sma'
  | 'ema'
  | 'wma'
  | 'vwma'
  | 'bb'
  | 'vwap'
  | 'ichimoku'
  | 'psar'
  | 'rsi'
  | 'macd'
  | 'stoch'
  | 'stochRsi'
  | 'atr'
  | 'cci'
  | 'obv'
  | 'williamsR'
  | 'mfi'
  | 'adx'

export interface IndicatorInstance {
  id: string
  kind: IndicatorKind
  params: Record<string, number>
  colors: string[]
  visible: boolean
}

export type IndicatorCategory = '세트' | '이동평균' | '오실레이터' | '변동성' | '거래량' | '추세'

export interface IndicatorParamDef {
  key: string
  label: string
  default: number
  min: number
  max: number
  step?: number
  /** 'flag' 는 0/1 스위치로, 나머지는 숫자 입력으로 그린다. */
  kind?: 'number' | 'flag'
  /** 설정 창의 "스타일" 탭에 둔다(선 굵기 등). 없으면 "입력" 탭. */
  tab?: 'style'
  /** 설정 창에서 이 값 위에 붙는 묶음 제목(여러 지표를 합친 세트용). 바뀔 때마다 제목 줄이 생긴다. */
  section?: string
}

export interface IndicatorDef {
  kind: IndicatorKind
  /** 다이얼로그·검색에 쓰는 한국어 이름. */
  name: string
  /** 범례·객체트리용 짧은 이름(MA, EMA, RSI …). */
  shortName: string
  /** true 면 가격 패널(pane 0) 위에 겹쳐 그린다. */
  overlay: boolean
  category: IndicatorCategory
  params: IndicatorParamDef[]
  /** 각 그려지는 선의 기본색. */
  colors: string[]
  /** 색상 편집 UI 라벨. */
  colorLabels?: string[]
  /** 색마다 속한 묶음 제목(세트용). colors 와 같은 길이. */
  colorSections?: string[]
}

/** 이동평균 계열 — 새로 추가할 때 색을 팔레트에서 돌려 쓴다. */
const IS_MA: Partial<Record<IndicatorKind, true>> = { sma: true, ema: true, wma: true, vwma: true }

const len = (def: number): IndicatorParamDef => ({ key: 'length', label: '기간', default: def, min: 1, max: 1000, step: 1 })

/**
 * 멀티 이동평균의 선 6개 기본 기간. 흔히 쓰는 50·100·200·400 을 켜 두고, 앞뒤 한 칸(짧은·긴 선)은 비워 둔다.
 * 색·굵기는 짧은 선부터 보라·노랑·흰색·초록·빨강·하늘, 긴 선일수록 굵게.
 */
const MULTI_MA_LENGTHS = [0, 50, 100, 200, 400, 0]
const MULTI_MA_WIDTHS = [1, 1, 3, 2, 3, 4]

const VOLUME_SPIKE_DEF: IndicatorDef = {
  kind: 'volumeSpike',
  name: '거래량 급증',
  shortName: 'Vol 급증',
  overlay: false,
  category: '거래량',
  params: [
    { key: 'count', label: '볼륨 카운트 (평균 구간)', default: 70, min: 2, max: 1000, step: 1 },
    { key: 'lv1', label: 'Lv1 배율 (x)', default: 3, min: 0.1, max: 100, step: 0.1 },
    { key: 'lv2', label: 'Lv2 배율 (x, 0 = 사용 안 함)', default: 5, min: 0, max: 100, step: 0.1 },
    { key: 'lv3', label: 'Lv3 배율 (x, 0 = 사용 안 함)', default: 7, min: 0, max: 100, step: 0.1 },
    { key: 'background', label: '배경 강조', default: 1, min: 0, max: 1, kind: 'flag' },
    { key: 'backgroundAt', label: '배경 강조 기준 배율 (x)', default: 5, min: 0.1, max: 100, step: 0.1 },
  ],
  colors: ['#00ff88', '#fff59d', '#ec407a', '#00796b', '#c62828'],
  colorLabels: ['Lv1 (메로나)', 'Lv2 (옐로우)', 'Lv3 (레드)', '양봉', '음봉'],
}

const MULTI_MA_DEF: IndicatorDef = {
  kind: 'multiMa',
  name: '멀티 이동평균',
  shortName: 'MA',
  overlay: true,
  category: '이동평균',
  params: [
    { key: 'ema', label: '지수이동평균(EMA)으로 계산', default: 0, min: 0, max: 1, kind: 'flag' },
    ...MULTI_MA_LENGTHS.map((d, i) => ({
      key: `len${i + 1}`,
      label: `선 ${i + 1} 기간 (0 = 사용 안 함)`,
      default: d,
      min: 0,
      max: 2000,
      step: 1,
    })),
    ...MULTI_MA_WIDTHS.map((d, i) => ({
      key: `width${i + 1}`,
      label: `선 ${i + 1} 굵기`,
      default: d,
      min: 1,
      max: 4,
      step: 1,
      tab: 'style' as const,
    })),
  ],
  colors: ['#c39bd3', '#fdd835', '#ffffff', '#43a047', '#e53935', '#26c6da'],
  colorLabels: MULTI_MA_LENGTHS.map((_, i) => `선 ${i + 1}`),
}

const RSI_DEF: IndicatorDef = {
  kind: 'rsi',
  name: '상대강도지수',
  shortName: 'RSI',
  overlay: false,
  category: '오실레이터',
  params: [
    { key: 'length', label: '기간', default: 14, min: 1, max: 1000, step: 1 },
    { key: 'upper', label: '과매수', default: 70, min: 50, max: 100, step: 1 },
    { key: 'lower', label: '과매도', default: 30, min: 0, max: 50, step: 1 },
  ],
  colors: ['#7e57c2'],
  colorLabels: ['선'],
}

/**
 * 이평선 · 거래량 급증 · RSI 를 한 지표로 묶은 세트. 각 부분의 설정은 접두어를 붙여 한 인스턴스에 담는다
 * (예: `ma_len2`, `vs_lv1`, `rsi_length`). 그릴 때는 부분마다 원래 지표로 풀어 계산한다(`setParts`).
 */
const SET_PARTS = [
  { key: 'ma', def: MULTI_MA_DEF, section: '이동평균' },
  { key: 'vs', def: VOLUME_SPIKE_DEF, section: '거래량 급증' },
  { key: 'rsi', def: RSI_DEF, section: 'RSI' },
] as const

const MA_SET_DEF: IndicatorDef = {
  kind: 'maSet',
  name: '이평선 · 거래량 급증 · RSI',
  shortName: '이평·급증·RSI',
  overlay: true,
  category: '세트',
  params: SET_PARTS.flatMap((part) => [
    { key: `${part.key}_on`, label: `${part.section} 표시`, default: 1, min: 0, max: 1, kind: 'flag' as const, section: part.section },
    ...part.def.params.map((p) => ({ ...p, key: `${part.key}_${p.key}`, section: part.section })),
  ]),
  colors: SET_PARTS.flatMap((part) => part.def.colors),
  colorLabels: SET_PARTS.flatMap((part) => part.def.colors.map((_, i) => part.def.colorLabels?.[i] ?? `색 ${i + 1}`)),
  colorSections: SET_PARTS.flatMap((part) => part.def.colors.map(() => part.section)),
}

/** 세트를 부분(이평선·거래량 급증·RSI)별 원래 지표 인스턴스로 푼다. 꺼 둔 부분도 on=false 로 돌려준다. */
export function setParts(i: IndicatorInstance): { key: string; on: boolean; instance: IndicatorInstance }[] {
  let colorAt = 0
  return SET_PARTS.map((part) => {
    const params: Record<string, number> = {}
    for (const p of part.def.params) params[p.key] = i.params[`${part.key}_${p.key}`] ?? p.default
    const colors = part.def.colors.map((c, k) => i.colors[colorAt + k] ?? c)
    colorAt += part.def.colors.length
    return {
      key: part.key,
      on: (i.params[`${part.key}_on`] ?? 1) !== 0,
      instance: { id: `${i.id}/${part.key}`, kind: part.def.kind, params, colors, visible: true },
    }
  })
}

export const INDICATOR_DEFS: Record<IndicatorKind, IndicatorDef> = {
  maSet: MA_SET_DEF,
  volume: {
    kind: 'volume',
    name: '거래량',
    shortName: 'Vol',
    overlay: false,
    category: '거래량',
    params: [
      { key: 'surge', label: '거래량 급증 강조', default: 0, min: 0, max: 1, kind: 'flag' },
      { key: 'window', label: '평균 구간', default: 20, min: 2, max: 500, step: 1 },
      { key: 'low', label: '급증 1단계 배율', default: 2, min: 1, max: 20, step: 0.1 },
      { key: 'mid', label: '급증 2단계 배율', default: 3, min: 1, max: 20, step: 0.1 },
      { key: 'high', label: '급증 3단계 배율', default: 5, min: 1, max: 30, step: 0.1 },
    ],
    colors: [],
  },
  volumeSpike: VOLUME_SPIKE_DEF,
  multiMa: MULTI_MA_DEF,
  sma: {
    kind: 'sma',
    name: '이동평균',
    shortName: 'MA',
    overlay: true,
    category: '이동평균',
    params: [len(9)],
    colors: ['#2962ff'],
    colorLabels: ['선'],
  },
  ema: {
    kind: 'ema',
    name: '지수이동평균',
    shortName: 'EMA',
    overlay: true,
    category: '이동평균',
    params: [len(9)],
    colors: ['#ff6d00'],
    colorLabels: ['선'],
  },
  wma: {
    kind: 'wma',
    name: '가중이동평균',
    shortName: 'WMA',
    overlay: true,
    category: '이동평균',
    params: [len(9)],
    colors: ['#7e57c2'],
    colorLabels: ['선'],
  },
  vwma: {
    kind: 'vwma',
    name: '거래량가중이동평균',
    shortName: 'VWMA',
    overlay: true,
    category: '이동평균',
    params: [len(20)],
    colors: ['#00bcd4'],
    colorLabels: ['선'],
  },
  bb: {
    kind: 'bb',
    name: '볼린저 밴드',
    shortName: 'BB',
    overlay: true,
    category: '변동성',
    params: [
      { key: 'length', label: '기간', default: 20, min: 1, max: 1000, step: 1 },
      { key: 'mult', label: '표준편차', default: 2, min: 0.1, max: 10, step: 0.1 },
    ],
    colors: ['#ff6d00', '#2962ff'],
    colorLabels: ['기준선', '상단/하단'],
  },
  vwap: {
    kind: 'vwap',
    name: 'VWAP',
    shortName: 'VWAP',
    overlay: true,
    category: '이동평균',
    params: [],
    colors: ['#2962ff'],
    colorLabels: ['선'],
  },
  ichimoku: {
    kind: 'ichimoku',
    name: '일목균형표',
    shortName: 'Ichimoku',
    overlay: true,
    category: '추세',
    params: [
      { key: 'conversion', label: '전환선', default: 9, min: 1, max: 200, step: 1 },
      { key: 'base', label: '기준선', default: 26, min: 1, max: 400, step: 1 },
      { key: 'spanB', label: '선행스팬 B', default: 52, min: 1, max: 600, step: 1 },
      { key: 'displacement', label: '선행 이동', default: 26, min: 1, max: 200, step: 1 },
    ],
    colors: ['#2962ff', '#f23645', '#089981', '#f7525f', '#9c27b0'],
    colorLabels: ['전환선', '기준선', '선행 A', '선행 B', '후행 스팬'],
  },
  psar: {
    kind: 'psar',
    name: '파라볼릭 SAR',
    shortName: 'SAR',
    overlay: true,
    category: '추세',
    params: [
      { key: 'start', label: '시작', default: 0.02, min: 0.001, max: 1, step: 0.001 },
      { key: 'increment', label: '증가폭', default: 0.02, min: 0.001, max: 1, step: 0.001 },
      { key: 'max', label: '최대', default: 0.2, min: 0.01, max: 1, step: 0.01 },
    ],
    colors: ['#2962ff'],
    colorLabels: ['점'],
  },
  rsi: RSI_DEF,
  macd: {
    kind: 'macd',
    name: 'MACD',
    shortName: 'MACD',
    overlay: false,
    category: '오실레이터',
    params: [
      { key: 'fast', label: '빠른 길이', default: 12, min: 1, max: 500, step: 1 },
      { key: 'slow', label: '느린 길이', default: 26, min: 2, max: 1000, step: 1 },
      { key: 'signal', label: '시그널', default: 9, min: 1, max: 500, step: 1 },
    ],
    colors: ['#2962ff', '#ff6d00'],
    colorLabels: ['MACD', '시그널'],
  },
  stoch: {
    kind: 'stoch',
    name: '스토캐스틱',
    shortName: 'Stoch',
    overlay: false,
    category: '오실레이터',
    params: [
      { key: 'k', label: '%K 기간', default: 14, min: 1, max: 500, step: 1 },
      { key: 'smooth', label: '%K 평활', default: 1, min: 1, max: 100, step: 1 },
      { key: 'd', label: '%D 평활', default: 3, min: 1, max: 100, step: 1 },
    ],
    colors: ['#2962ff', '#ff6d00'],
    colorLabels: ['%K', '%D'],
  },
  stochRsi: {
    kind: 'stochRsi',
    name: '스토캐스틱 RSI',
    shortName: 'Stoch RSI',
    overlay: false,
    category: '오실레이터',
    params: [
      { key: 'rsiLength', label: 'RSI 기간', default: 14, min: 1, max: 500, step: 1 },
      { key: 'stochLength', label: '스토캐스틱 기간', default: 14, min: 1, max: 500, step: 1 },
      { key: 'k', label: '%K 평활', default: 3, min: 1, max: 100, step: 1 },
      { key: 'd', label: '%D 평활', default: 3, min: 1, max: 100, step: 1 },
    ],
    colors: ['#2962ff', '#ff6d00'],
    colorLabels: ['%K', '%D'],
  },
  atr: {
    kind: 'atr',
    name: '평균 실질 범위',
    shortName: 'ATR',
    overlay: false,
    category: '변동성',
    params: [len(14)],
    colors: ['#f23645'],
    colorLabels: ['선'],
  },
  cci: {
    kind: 'cci',
    name: '상품 채널 지수',
    shortName: 'CCI',
    overlay: false,
    category: '오실레이터',
    params: [len(20)],
    colors: ['#2962ff'],
    colorLabels: ['선'],
  },
  obv: {
    kind: 'obv',
    name: '온 밸런스 볼륨',
    shortName: 'OBV',
    overlay: false,
    category: '거래량',
    params: [],
    colors: ['#2962ff'],
    colorLabels: ['선'],
  },
  williamsR: {
    kind: 'williamsR',
    name: '윌리엄스 %R',
    shortName: 'W%R',
    overlay: false,
    category: '오실레이터',
    params: [len(14)],
    colors: ['#7e57c2'],
    colorLabels: ['선'],
  },
  mfi: {
    kind: 'mfi',
    name: '자금 흐름 지수',
    shortName: 'MFI',
    overlay: false,
    category: '오실레이터',
    params: [len(14)],
    colors: ['#00bcd4'],
    colorLabels: ['선'],
  },
  adx: {
    kind: 'adx',
    name: '평균 방향 지수 (DMI)',
    shortName: 'ADX',
    overlay: false,
    category: '추세',
    params: [len(14)],
    colors: ['#8c8c8c', '#089981', '#f23645'],
    colorLabels: ['ADX', '+DI', '-DI'],
  },
}

/** 카테고리 표시 순서(다이얼로그 사이드바). */
export const INDICATOR_CATEGORIES: IndicatorCategory[] = [
  '세트',
  '이동평균',
  '오실레이터',
  '변동성',
  '거래량',
  '추세',
]

export const ALL_INDICATOR_KINDS = Object.keys(INDICATOR_DEFS) as IndicatorKind[]

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `ind-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }
}

function defaultParams(def: IndicatorDef): Record<string, number> {
  const params: Record<string, number> = {}
  for (const p of def.params) params[p.key] = p.default
  return params
}

export function createIndicator(kind: IndicatorKind, existing: IndicatorInstance[]): IndicatorInstance {
  const def = INDICATOR_DEFS[kind]
  const colors = [...def.colors]
  // 이동평균 계열은 겹쳐 쓰므로 아직 안 쓴 팔레트 색을 골라 준다.
  if (IS_MA[kind]) {
    const used = new Set(existing.filter((i) => IS_MA[i.kind]).map((i) => i.colors[0]))
    colors[0] =
      INDICATOR_PALETTE.find((c) => !used.has(c)) ?? INDICATOR_PALETTE[existing.length % INDICATOR_PALETTE.length]
  }
  return { id: newId(), kind, params: defaultParams(def), colors, visible: true }
}

/** 범례·객체트리에 쓰는 제목. 예: "MA 9", "MACD 12 26 9". */
export function indicatorTitle(i: IndicatorInstance): string {
  const def = INDICATOR_DEFS[i.kind]
  const p = i.params
  switch (i.kind) {
    case 'volume':
      return 'Vol'
    case 'volumeSpike':
      return `${def.shortName} ${p.count}`
    case 'multiMa': {
      const lens = multiMaSlots(i).map((s) => s.length)
      const name = p.ema ? 'EMA' : def.shortName
      return lens.length > 0 ? `${name} ${lens.join(' ')}` : name
    }
    case 'sma':
    case 'ema':
    case 'wma':
    case 'vwma':
    case 'atr':
    case 'cci':
    case 'williamsR':
    case 'mfi':
    case 'rsi':
    case 'adx':
      return `${def.shortName} ${p.length}`
    case 'bb':
      return `${def.shortName} ${p.length} ${p.mult}`
    case 'vwap':
    case 'obv':
      return def.shortName
    case 'ichimoku':
      return `${def.shortName} ${p.conversion} ${p.base} ${p.spanB}`
    case 'psar':
      return `${def.shortName} ${p.start} ${p.max}`
    case 'macd':
      return `${def.shortName} ${p.fast} ${p.slow} ${p.signal}`
    case 'stoch':
      return `${def.shortName} ${p.k} ${p.smooth} ${p.d}`
    case 'stochRsi':
      return `${def.shortName} ${p.rsiLength} ${p.stochLength} ${p.k} ${p.d}`
    default:
      return def.shortName
  }
}

/** 멀티 이동평균에서 켜 둔(기간 > 0) 선들의 기간. 선 번호(1~6)와 함께 돌려준다. */
export function multiMaSlots(i: IndicatorInstance): { slot: number; length: number }[] {
  const out: { slot: number; length: number }[] = []
  for (let s = 1; s <= MULTI_MA_LENGTHS.length; s++) {
    const length = Math.floor(i.params[`len${s}`] ?? 0)
    if (length > 0) out.push({ slot: s, length })
  }
  return out
}

/* ── 저장/불러오기 (v3) + v2 마이그레이션 ─────────────────────────────── */

const STORAGE_KEY = 'trading.indicators.v3'
const LEGACY_KEY = 'trading.indicators.v2'
const TEMPLATE_KEY = 'trading.indicatorTemplates.v1'

function isInstance(v: unknown): v is IndicatorInstance {
  if (typeof v !== 'object' || v === null) return false
  const i = v as Record<string, unknown>
  return (
    typeof i.id === 'string' &&
    typeof i.kind === 'string' &&
    Object.hasOwn(INDICATOR_DEFS, i.kind) &&
    typeof i.params === 'object' &&
    i.params !== null &&
    Array.isArray(i.colors) &&
    typeof i.visible === 'boolean'
  )
}

/** 저장된 인스턴스의 빠진 파라미터를 기본값으로 채우고 색을 보정한다. */
function normalize(i: IndicatorInstance): IndicatorInstance {
  const def = INDICATOR_DEFS[i.kind]
  // 거래량 급증은 σ 기준(length·extreme·high·medium)에서 평균 배율 기준(count·lv1~3)으로 바뀌었다.
  // 옛 값과 색은 뜻이 달라 이어 쓸 수 없다 — 새 기본값으로 바꾼다.
  if (i.kind === 'volumeSpike' && 'extreme' in i.params) {
    return { id: i.id, kind: i.kind, params: defaultParams(def), colors: [...def.colors], visible: i.visible }
  }
  const params: Record<string, number> = {}
  for (const p of def.params) {
    const v = i.params[p.key]
    params[p.key] = typeof v === 'number' && Number.isFinite(v) ? v : p.default
  }
  const colors = def.colors.map((c, idx) => (typeof i.colors[idx] === 'string' ? i.colors[idx] : c))
  return { id: i.id, kind: i.kind, params, colors, visible: i.visible }
}

/** 밖에서 받은 값(알림에 저장해 둔 지표 사본 등)을 검증·보정한다. 쓸 수 없으면 null. */
export function toIndicatorInstance(v: unknown): IndicatorInstance | null {
  return isInstance(v) ? normalize(v) : null
}

interface LegacyMa {
  id?: string
  type?: string
  period?: number
  color?: string
  visible?: boolean
}

/** v2 설정을 v3 인스턴스 목록으로 옮긴다. 거래량이 맨 앞. */
function migrateV2(raw: string): IndicatorInstance[] | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const list: IndicatorInstance[] = []

    const vs = parsed.volumeSurge as Record<string, unknown> | undefined
    const vol = createIndicator('volume', list)
    if (vs) {
      vol.params = {
        surge: vs.enabled === false ? 0 : 1,
        window: typeof vs.window === 'number' ? vs.window : 20,
        low: typeof vs.low === 'number' ? vs.low : 2,
        mid: typeof vs.mid === 'number' ? vs.mid : 3,
        high: typeof vs.high === 'number' ? vs.high : 5,
      }
    }
    list.push(vol)

    const mas = parsed.mas
    if (Array.isArray(mas)) {
      for (const m of mas as LegacyMa[]) {
        const kind: IndicatorKind =
          m.type === 'ema' ? 'ema' : m.type === 'vwma' ? 'vwma' : 'sma'
        list.push({
          id: newId(),
          kind,
          params: { length: typeof m.period === 'number' ? m.period : 9 },
          colors: [typeof m.color === 'string' ? m.color : INDICATOR_DEFS[kind].colors[0]],
          visible: m.visible !== false,
        })
      }
    }

    const rsiCfg = parsed.rsi as Record<string, unknown> | undefined
    if (rsiCfg && rsiCfg.enabled) {
      const inst = createIndicator('rsi', list)
      inst.params.length = typeof rsiCfg.period === 'number' ? rsiCfg.period : 14
      list.push(inst)
    }

    const macdCfg = parsed.macd as Record<string, unknown> | undefined
    if (macdCfg && macdCfg.enabled) {
      const inst = createIndicator('macd', list)
      inst.params = {
        fast: typeof macdCfg.fast === 'number' ? macdCfg.fast : 12,
        slow: typeof macdCfg.slow === 'number' ? macdCfg.slow : 26,
        signal: typeof macdCfg.signal === 'number' ? macdCfg.signal : 9,
      }
      list.push(inst)
    }

    return list
  } catch {
    return null
  }
}

export function loadIndicators(): IndicatorInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter(isInstance).map(normalize)
    }
    // v3 가 없으면 v2 를 옮겨 온다.
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const migrated = migrateV2(legacy)
      if (migrated) {
        saveIndicators(migrated)
        return migrated
      }
    }
    // 신규 사용자: TradingView 기본값 = 거래량 하나.
    return [createIndicator('volume', [])]
  } catch {
    return [createIndicator('volume', [])]
  }
}

export function saveIndicators(list: IndicatorInstance[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    notifySettingsChanged()
  } catch {
    /* 저장 실패는 무시 — 다음 저장에서 회복 */
  }
}

/* ── 템플릿 ───────────────────────────────────────────────────────────── */

export interface IndicatorTemplate {
  id: string
  name: string
  indicators: Omit<IndicatorInstance, 'id'>[]
}

function isTemplate(v: unknown): v is IndicatorTemplate {
  if (typeof v !== 'object' || v === null) return false
  const t = v as Record<string, unknown>
  return typeof t.id === 'string' && typeof t.name === 'string' && Array.isArray(t.indicators)
}

export function loadTemplates(): IndicatorTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isTemplate) : []
  } catch {
    return []
  }
}

export function saveTemplates(t: IndicatorTemplate[]): void {
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(t))
    notifySettingsChanged()
  } catch {
    /* 저장 실패는 무시 */
  }
}

/** 인스턴스에서 id 를 떼어 템플릿용으로 만든다. */
export function toTemplateEntry(i: IndicatorInstance): Omit<IndicatorInstance, 'id'> {
  return { kind: i.kind, params: { ...i.params }, colors: [...i.colors], visible: i.visible }
}

/** 템플릿을 적용할 때 새 id 를 부여해 인스턴스로 되살린다. */
export function fromTemplateEntry(e: Omit<IndicatorInstance, 'id'>): IndicatorInstance {
  return normalize({ id: newId(), kind: e.kind, params: { ...e.params }, colors: [...e.colors], visible: e.visible })
}
