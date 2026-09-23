/**
 * 지표 인스턴스 → 그릴 수 있는 플롯 데이터로 변환한다.
 *
 * Chart 는 이 결과를 lightweight-charts 시리즈로 그리고, ChartCell 은 같은 결과에서
 * 범례 값을 뽑는다 — 지표 계산은 한 번만 한다(요건: 캔들 수가 바뀔 때만 재계산).
 */
import { LineStyle } from 'lightweight-charts'
import type { Candle } from '../lib/binance'
import type { ChartPalette } from '../lib/theme'
import {
  VOLUME_TIER_COLORS,
  volumeTiers,
  adx,
  atr,
  bollinger,
  cci,
  ema,
  ichimoku,
  macd,
  mfi,
  obv,
  psar,
  rsi,
  sma,
  stochRsi,
  stochastic,
  vwap,
  volumeZScores,
  vwma,
  williamsR,
  wma,
  type LinePoint,
} from '../lib/indicators'
import {
  INDICATOR_DEFS,
  indicatorTitle,
  type IndicatorInstance,
  type IndicatorKind,
} from '../lib/indicatorConfig'

export type LegendFormat = 'price' | 'fixed2' | 'volume' | 'sigma'

export interface PlotLine {
  key: string
  type: 'line' | 'histogram'
  points: LinePoint<number>[]
  color: string
  /** 히스토그램/거래량의 봉별 색. */
  colors?: string[]
  lineWidth?: 1 | 2 | 3 | 4
  lineStyle?: LineStyle
  /** 별도 price scale(거래량 전용). */
  priceScaleId?: string
  pointMarkers?: boolean
  lineVisible?: boolean
  /** 이 값이 있으면 범례에 그 라벨로 표시한다. */
  legendLabel?: string
  legendFormat?: LegendFormat
  /** 차트에 그리지 않고 범례·알림에만 쓰는 값(예: 거래량 급증 강도). */
  hidden?: boolean
  /** 알림 창에서 고르는 이름. 없으면 PLOT_NAMES 로 정한다. */
  name?: string
  /**
   * 봉 위치에서 앞뒤로 밀려 그려지는 선(일목 선행·후행 스팬). 마지막 점이 지금 봉 시각이 아니어도
   * 지금 봉으로 계산한 최신 값이다 — 알림은 그 값으로 판정한다.
   */
  displaced?: boolean
}

export interface LevelLine {
  price: number
  color: string
  lineStyle?: LineStyle
}

export interface ComputedIndicator {
  instanceId: string
  kind: IndicatorKind
  overlay: boolean
  isVolume: boolean
  title: string
  lines: PlotLine[]
  levels: LevelLine[]
  /** 두 값 사이를 옅게 채우는 밴드(예: RSI 70/30). */
  band?: { top: number; bottom: number; color: string }
  /** 패널 배경을 봉 단위로 옅게 칠하는 구간(예: 거래량 급증 봉). */
  highlights?: { time: number; color: string }[]
}


/** 볼륨 봉별 색: 급증 단계는 형광, 평소엔 방향색을 흐리게. */
function volumeColors(candles: Candle[], instance: IndicatorInstance, palette: ChartPalette): string[] {
  const surgeOn = (instance.params.surge ?? 1) !== 0
  const window = instance.params.window ?? 20
  const tiers = surgeOn
    ? volumeTiers(candles.map((c) => c.volume), window, {
        low: instance.params.low ?? 2,
        mid: instance.params.mid ?? 3,
        high: instance.params.high ?? 5,
      })
    : null
  const dim = tiers ? '45' : '80'
  return candles.map((c, i) => {
    const tier = tiers ? tiers[i] : 0
    if (tier > 0) return VOLUME_TIER_COLORS[tier as 1 | 2 | 3]
    return c.close >= c.open ? `${palette.up}${dim}` : `${palette.down}${dim}`
  })
}


export function computeIndicator(
  instance: IndicatorInstance,
  candles: Candle[],
  palette: ChartPalette,
): ComputedIndicator {
  const def = INDICATOR_DEFS[instance.kind]
  const p = instance.params
  const c = instance.colors
  const title = indicatorTitle(instance)
  const base: ComputedIndicator = {
    instanceId: instance.id,
    kind: instance.kind,
    overlay: def.overlay,
    isVolume: instance.kind === 'volume',
    title,
    lines: [],
    levels: [],
  }
  const dim = palette.textDim
  const lvl = (price: number): LevelLine => ({ price, color: dim, lineStyle: LineStyle.Dashed })

  switch (instance.kind) {
    case 'volume':
      base.lines = [
        {
          key: 'vol',
          type: 'histogram',
          points: candles.map((k) => ({ time: k.time, value: k.volume })),
          color: palette.up,
          colors: volumeColors(candles, instance, palette),
          priceScaleId: 'volume',
          legendLabel: 'Vol',
          legendFormat: 'volume',
        },
      ]
      break
    case 'volumeSpike': {
      // 평소 거래량은 방향색으로 옅게, 급증 단계(σ)에 따라 형광색으로 올린다.
      const z = volumeZScores(candles, p.length)
      const zAt = new Map(z.map((pt) => [pt.time, pt.value]))
      const colors = candles.map((k) => {
        const s = zAt.get(k.time)
        const up = k.close >= k.open
        if (s !== undefined && s >= p.extreme) return c[0]
        if (s !== undefined && s >= p.high) return c[1]
        if (s !== undefined && s >= p.medium) return up ? c[2] : c[3]
        return up ? `${palette.up}b3` : `${palette.down}b3`
      })
      base.lines = [
        {
          key: 'vol',
          type: 'histogram',
          points: candles.map((k) => ({ time: k.time, value: k.volume })),
          color: palette.up,
          colors,
          legendLabel: 'Vol',
          legendFormat: 'volume',
        },
        { key: 'z', type: 'line', points: z, color: c[0], hidden: true, legendLabel: '강도', legendFormat: 'sigma' },
      ]
      if (p.background !== 0) {
        base.highlights = candles.flatMap((k) => {
          const s = zAt.get(k.time)
          if (s === undefined || s < p.backgroundAt) return []
          return [{ time: k.time, color: k.close >= k.open ? `${palette.up}33` : `${palette.down}33` }]
        })
      }
      break
    }
    case 'sma':
    case 'ema':
    case 'wma':
    case 'vwma': {
      const fn = instance.kind === 'ema' ? ema : instance.kind === 'wma' ? wma : instance.kind === 'vwma' ? vwma : sma
      base.lines = [
        { key: 'ma', type: 'line', points: fn(candles, p.length), color: c[0], lineWidth: 2, legendLabel: '', legendFormat: 'price' },
      ]
      break
    }
    case 'bb': {
      const b = bollinger(candles, p.length, p.mult)
      base.lines = [
        { key: 'basis', type: 'line', points: b.basis, color: c[0], legendLabel: '', legendFormat: 'price' },
        { key: 'upper', type: 'line', points: b.upper, color: c[1], legendFormat: 'price' },
        { key: 'lower', type: 'line', points: b.lower, color: c[1], legendFormat: 'price' },
      ]
      break
    }
    case 'vwap':
      base.lines = [{ key: 'vwap', type: 'line', points: vwap(candles), color: c[0], legendLabel: '', legendFormat: 'price' }]
      break
    case 'ichimoku': {
      const ich = ichimoku(candles, p.conversion, p.base, p.spanB, p.displacement)
      base.lines = [
        { key: 'tenkan', type: 'line', points: ich.tenkan, color: c[0], legendLabel: '전환', legendFormat: 'price' },
        { key: 'kijun', type: 'line', points: ich.kijun, color: c[1], legendLabel: '기준', legendFormat: 'price' },
        { key: 'spanA', type: 'line', points: ich.spanA, color: c[2], legendFormat: 'price', displaced: true },
        { key: 'spanB', type: 'line', points: ich.spanB, color: c[3], legendFormat: 'price', displaced: true },
        { key: 'chikou', type: 'line', points: ich.chikou, color: c[4], legendFormat: 'price', displaced: true },
      ]
      break
    }
    case 'psar':
      base.lines = [
        {
          key: 'sar',
          type: 'line',
          points: psar(candles, p.start, p.increment, p.max),
          color: c[0],
          pointMarkers: true,
          lineVisible: false,
          legendLabel: '',
          legendFormat: 'price',
        },
      ]
      break
    case 'rsi':
      base.lines = [{ key: 'rsi', type: 'line', points: rsi(candles, p.length), color: c[0], legendLabel: '' }]
      base.levels = [lvl(p.upper), lvl(p.lower), { price: 50, color: dim, lineStyle: LineStyle.Dotted }]
      // 70/30 밴드 사이를 RSI 색 10%로 채운다(트레이딩뷰 기본).
      base.band = { top: p.upper, bottom: p.lower, color: `${c[0]}1a` }
      break
    case 'macd': {
      const m = macd(candles, p.fast, p.slow, p.signal)
      base.lines = [
        {
          key: 'hist',
          type: 'histogram',
          points: m.histogram,
          color: palette.up,
          colors: m.histogram.map((h) => (h.value >= 0 ? `${palette.up}b0` : `${palette.down}b0`)),
        },
        { key: 'macd', type: 'line', points: m.macd, color: c[0], legendLabel: 'MACD' },
        { key: 'signal', type: 'line', points: m.signal, color: c[1], legendLabel: 'S' },
      ]
      base.levels = [{ price: 0, color: dim, lineStyle: LineStyle.Dotted }]
      break
    }
    case 'stoch': {
      const s = stochastic(candles, p.k, p.smooth, p.d)
      base.lines = [
        { key: 'k', type: 'line', points: s.k, color: c[0], legendLabel: '%K' },
        { key: 'd', type: 'line', points: s.d, color: c[1], legendLabel: '%D' },
      ]
      base.levels = [lvl(80), lvl(20)]
      break
    }
    case 'stochRsi': {
      const s = stochRsi(candles, p.rsiLength, p.stochLength, p.k, p.d)
      base.lines = [
        { key: 'k', type: 'line', points: s.k, color: c[0], legendLabel: '%K' },
        { key: 'd', type: 'line', points: s.d, color: c[1], legendLabel: '%D' },
      ]
      base.levels = [lvl(80), lvl(20)]
      break
    }
    case 'atr':
      base.lines = [{ key: 'atr', type: 'line', points: atr(candles, p.length), color: c[0], legendLabel: '' }]
      break
    case 'cci':
      base.lines = [{ key: 'cci', type: 'line', points: cci(candles, p.length), color: c[0], legendLabel: '' }]
      base.levels = [lvl(100), lvl(-100)]
      break
    case 'obv':
      base.lines = [
        { key: 'obv', type: 'line', points: obv(candles), color: c[0], legendLabel: '', legendFormat: 'volume' },
      ]
      break
    case 'williamsR':
      base.lines = [{ key: 'wr', type: 'line', points: williamsR(candles, p.length), color: c[0], legendLabel: '' }]
      base.levels = [lvl(-20), lvl(-80)]
      break
    case 'mfi':
      base.lines = [{ key: 'mfi', type: 'line', points: mfi(candles, p.length), color: c[0], legendLabel: '' }]
      base.levels = [lvl(80), lvl(20)]
      break
    case 'adx': {
      const a = adx(candles, p.length)
      base.lines = [
        { key: 'adx', type: 'line', points: a.adx, color: c[0], lineWidth: 2, legendLabel: 'ADX' },
        { key: 'plus', type: 'line', points: a.plusDI, color: c[1], legendLabel: '+DI' },
        { key: 'minus', type: 'line', points: a.minusDI, color: c[2], legendLabel: '-DI' },
      ]
      base.levels = [lvl(25)]
      break
    }
  }
  return base
}

function formatVolume(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`
  return value.toFixed(2)
}

export interface LegendEntry {
  label?: string
  text: string
  color: string
}

/**
 * 범례에 넣을 값들. atTime 이 있으면 그 봉, 없으면 마지막 값.
 * formatPrice 는 심볼별 정밀도를 아는 호출측이 준다.
 */
export function indicatorLegend(
  computed: ComputedIndicator,
  atTime: number | null,
  formatPrice: (v: number) => string,
): LegendEntry[] {
  const out: LegendEntry[] = []
  for (const line of computed.lines) {
    if (line.legendLabel === undefined) continue
    let point: LinePoint<number> | undefined
    if (atTime !== null) point = line.points.find((pt) => pt.time === atTime)
    if (!point) point = line.points[line.points.length - 1]
    if (!point) continue
    const fmt = line.legendFormat ?? 'fixed2'
    const text =
      fmt === 'volume'
        ? formatVolume(point.value)
        : fmt === 'price'
          ? formatPrice(point.value)
          : fmt === 'sigma'
            ? `${point.value.toFixed(1)}σ`
            : point.value.toFixed(2)
    out.push({ label: line.legendLabel || undefined, text, color: line.color })
  }
  return out
}

/** 알림 창에 보여 줄 선 이름(선 key → 한국어). */
const PLOT_NAMES: Record<string, string> = {
  vol: '거래량',
  z: '급증 강도 (σ)',
  ma: '값',
  basis: '기준선',
  upper: '상단',
  lower: '하단',
  vwap: 'VWAP',
  tenkan: '전환선',
  kijun: '기준선',
  spanA: '선행 스팬 A',
  spanB: '선행 스팬 B',
  chikou: '후행 스팬',
  sar: 'SAR',
  rsi: 'RSI',
  hist: '히스토그램',
  macd: 'MACD',
  signal: '시그널',
  k: '%K',
  d: '%D',
  atr: 'ATR',
  cci: 'CCI',
  obv: 'OBV',
  wr: '%R',
  mfi: 'MFI',
  adx: 'ADX',
  plus: '+DI',
  minus: '-DI',
}

export function plotName(line: PlotLine): string {
  return line.name ?? PLOT_NAMES[line.key] ?? line.key
}
