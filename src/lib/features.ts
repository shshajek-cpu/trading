import type { Candle } from './binance'

/**
 * 핀 시점의 시장 상태를 숫자로 요약한 것.
 *
 * 값은 모두 "그 시점까지의 캔들만" 써서 계산한다 — 미래를 보면 규칙이 실전에서 듣지 않는다.
 * 절대가격 대신 비율·백분위를 쓴다. 종목과 시기가 달라도 비교할 수 있어야 하기 때문이다.
 */
export interface FeatureSet {
  /** 0~100. 과매도/과매수 */
  rsi14: number
  /** MACD 히스토그램을 가격 대비 %로 환산 */
  macdHistPct: number
  /** MACD 선이 시그널 위면 1, 아래면 -1 */
  macdCross: number
  /** 볼린저 밴드 내 위치. 0=하단, 1=상단, 밖으로 나가면 0 미만/1 초과 */
  bbPosition: number
  /** 밴드 폭을 중심선 대비 %로. 변동성 수축/확장 판단 */
  bbWidthPct: number
  /** 20 이평 대비 이격도 % */
  dev20: number
  /** 50 이평 대비 이격도 % */
  dev50: number
  /** 단기 이평이 장기 위면 1, 아래면 -1 */
  maTrend: number
  /** 스토캐스틱 %K (0~100) */
  stochK: number
  /** 스토캐스틱 %D (0~100) */
  stochD: number
  /** ATR 을 가격 대비 %로. 변동성 크기 */
  atrPct: number
  /** 최근 20봉 평균 거래량 대비 몇 배인가 */
  volRatio: number
  /** 추세 강도 0~100. 25 넘으면 추세장 */
  adx14: number
  /** OBV 의 최근 20봉 기울기를 정규화 */
  obvSlope: number
  /** 최근 50봉 고가·저가 범위에서의 위치 0~1 */
  range50: number
  /** 직전 5봉 누적 변동률 % */
  momentum5: number
  /** 윌리엄스 %R (-100~0) */
  williamsR: number
  /** CCI */
  cci20: number
}

/** 지표 이름 → 사람이 읽는 이름. 규칙을 설명할 때 쓴다. */
export const FEATURE_LABELS: Record<keyof FeatureSet, string> = {
  rsi14: 'RSI(14)',
  macdHistPct: 'MACD 히스토그램',
  macdCross: 'MACD 교차',
  bbPosition: '볼린저 위치',
  bbWidthPct: '볼린저 폭',
  dev20: '20이평 이격도',
  dev50: '50이평 이격도',
  maTrend: '이평 배열',
  stochK: '스토캐스틱 %K',
  stochD: '스토캐스틱 %D',
  atrPct: 'ATR 변동성',
  volRatio: '거래량 배율',
  adx14: 'ADX 추세강도',
  obvSlope: 'OBV 기울기',
  range50: '50봉 내 위치',
  momentum5: '5봉 모멘텀',
  williamsR: '윌리엄스 %R',
  cci20: 'CCI(20)',
}

/** 값을 사람이 읽는 문자열로. 단위가 제각각이라 지표마다 다르게 붙인다. */
export function formatFeature(key: keyof FeatureSet, v: number): string {
  switch (key) {
    case 'macdCross':
      return v > 0 ? '상향' : '하향'
    case 'maTrend':
      return v > 0 ? '정배열' : '역배열'
    case 'volRatio':
      return `${v.toFixed(1)}배`
    case 'bbPosition':
    case 'range50':
      return v.toFixed(2)
    case 'macdHistPct':
    case 'bbWidthPct':
    case 'dev20':
    case 'dev50':
    case 'atrPct':
    case 'momentum5':
      return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
    default:
      return v.toFixed(1)
  }
}

function emaAt(values: number[], period: number): number[] {
  const out: number[] = []
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
}

function stdev(xs: number[]): number {
  if (xs.length === 0) return 0
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

/** 0 으로 나누는 것을 막는다. 가격·거래량이 0 인 캔들이 실제로 있다. */
function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b
}

/** 지표를 계산하려면 최소 이만큼의 과거 캔들이 필요하다. */
export const MIN_HISTORY = 60

/**
 * `index` 번째 캔들 시점의 지표 묶음을 계산한다.
 *
 * index 이후의 캔들은 절대 보지 않는다.
 * 과거가 모자라면 null — 억지로 계산하면 값이 왜곡된다.
 */
export function computeFeatures(candles: Candle[], index: number): FeatureSet | null {
  if (index < MIN_HISTORY || index >= candles.length) return null

  const hist = candles.slice(0, index + 1)
  const closes = hist.map((c) => c.close)
  const highs = hist.map((c) => c.high)
  const lows = hist.map((c) => c.low)
  const vols = hist.map((c) => c.volume)
  const last = closes[closes.length - 1]
  const n = closes.length

  // ── RSI(14) Wilder
  let gain = 0
  let loss = 0
  for (let i = 1; i <= 14; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  let avgGain = gain / 14
  let avgLoss = loss / 14
  for (let i = 15; i < n; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * 13 + Math.max(d, 0)) / 14
    avgLoss = (avgLoss * 13 + Math.max(-d, 0)) / 14
  }
  const rsi14 = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss)

  // ── MACD(12,26,9)
  const e12 = emaAt(closes, 12)
  const e26 = emaAt(closes, 26)
  const macdLine: number[] = []
  for (let i = 25; i < n; i++) macdLine.push(e12[i] - e26[i])
  const signalArr = emaAt(macdLine, 9)
  const macdNow = macdLine[macdLine.length - 1] ?? 0
  const signalNow = signalArr[signalArr.length - 1] ?? 0
  const macdHistPct = safeDiv(macdNow - signalNow, last) * 100
  const macdCross = macdNow >= signalNow ? 1 : -1

  // ── 볼린저(20, 2σ)
  const win20 = closes.slice(-20)
  const mid = mean(win20)
  const sd = stdev(win20)
  const upper = mid + sd * 2
  const lower = mid - sd * 2
  const bbPosition = upper === lower ? 0.5 : (last - lower) / (upper - lower)
  const bbWidthPct = safeDiv(upper - lower, mid) * 100

  // ── 이평 이격도
  const ma20 = mid
  const ma50 = mean(closes.slice(-50))
  const dev20 = safeDiv(last - ma20, ma20) * 100
  const dev50 = safeDiv(last - ma50, ma50) * 100
  const maTrend = ma20 >= ma50 ? 1 : -1

  // ── 스토캐스틱(14,3)
  const stochRaw: number[] = []
  for (let i = n - 3; i < n; i++) {
    const hh = Math.max(...highs.slice(i - 13, i + 1))
    const ll = Math.min(...lows.slice(i - 13, i + 1))
    stochRaw.push(hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100)
  }
  const stochK = stochRaw[stochRaw.length - 1]
  const stochD = mean(stochRaw)

  // ── ATR(14) / ADX(14) — 둘 다 True Range 를 쓴다
  const trs: number[] = []
  const plusDM: number[] = []
  const minusDM: number[] = []
  for (let i = 1; i < n; i++) {
    trs.push(
      Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1]),
      ),
    )
    const up = highs[i] - highs[i - 1]
    const dn = lows[i - 1] - lows[i]
    plusDM.push(up > dn && up > 0 ? up : 0)
    minusDM.push(dn > up && dn > 0 ? dn : 0)
  }
  const atr = mean(trs.slice(-14))
  const atrPct = safeDiv(atr, last) * 100

  const atrForDi = mean(trs.slice(-14))
  const pdi = safeDiv(mean(plusDM.slice(-14)), atrForDi) * 100
  const mdi = safeDiv(mean(minusDM.slice(-14)), atrForDi) * 100
  const dx = safeDiv(Math.abs(pdi - mdi), pdi + mdi) * 100
  // 정식 ADX 는 DX 의 평활이지만, 한 시점만 필요하므로 최근 DX 로 근사한다.
  const adx14 = Number.isFinite(dx) ? dx : 0

  // ── 거래량 배율
  const volRatio = safeDiv(vols[n - 1], mean(vols.slice(-21, -1)))

  // ── OBV 기울기
  let obv = 0
  const obvSeries: number[] = []
  for (let i = 1; i < n; i++) {
    if (closes[i] > closes[i - 1]) obv += vols[i]
    else if (closes[i] < closes[i - 1]) obv -= vols[i]
    obvSeries.push(obv)
  }
  const obvWin = obvSeries.slice(-20)
  const obvRange = Math.max(...obvWin.map(Math.abs)) || 1
  const obvSlope = safeDiv(obvWin[obvWin.length - 1] - obvWin[0], obvRange)

  // ── 50봉 내 위치
  const hi50 = Math.max(...highs.slice(-50))
  const lo50 = Math.min(...lows.slice(-50))
  const range50 = hi50 === lo50 ? 0.5 : (last - lo50) / (hi50 - lo50)

  // ── 모멘텀
  const momentum5 = safeDiv(last - closes[n - 6], closes[n - 6]) * 100

  // ── 윌리엄스 %R(14)
  const hh14 = Math.max(...highs.slice(-14))
  const ll14 = Math.min(...lows.slice(-14))
  const williamsR = hh14 === ll14 ? -50 : ((hh14 - last) / (hh14 - ll14)) * -100

  // ── CCI(20)
  const tp = hist.slice(-20).map((c) => (c.high + c.low + c.close) / 3)
  const tpMean = mean(tp)
  const md = mean(tp.map((x) => Math.abs(x - tpMean)))
  const cci20 = md === 0 ? 0 : (tp[tp.length - 1] - tpMean) / (0.015 * md)

  const out: FeatureSet = {
    rsi14,
    macdHistPct,
    macdCross,
    bbPosition,
    bbWidthPct,
    dev20,
    dev50,
    maTrend,
    stochK,
    stochD,
    atrPct,
    volRatio,
    adx14,
    obvSlope,
    range50,
    momentum5,
    williamsR,
    cci20,
  }

  // 캔들에 구멍이 있으면 NaN 이 새어나온다. 하나라도 깨지면 통째로 버린다.
  for (const v of Object.values(out)) {
    if (!Number.isFinite(v)) return null
  }
  return out
}
