/**
 * 시간대·가격·거래량 포맷터. lightweight-charts 는 CSS/Intl 을 못 읽으므로
 * localization.timeFormatter 와 timeScale.tickMarkFormatter 에 넣을 함수를 만든다.
 */
import { TickMarkType, type Time } from 'lightweight-charts'
import type { Interval } from '../lib/binance'
import { INTERVAL_SECONDS } from '../lib/intervals'
import { intlZone } from '../lib/timezone'

const asMs = (time: Time): number => Number(time) * 1000

/**
 * 크로스헤어 시각 라벨(트레이딩뷰 한국어 표기): "수 23 9월 '26  08:25".
 * 일봉 이상(intraday=false)이면 시간을 뺀다. settings.timezone 을 존중한다.
 */
export function makeTimeFormatter(tz: string, intraday: boolean): (time: Time) => string {
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: intlZone(tz),
    weekday: 'short',
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return (time) => {
    const parts = fmt.formatToParts(new Date(asMs(time)))
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
    // ko 의 weekday short 는 "수" 형태(요일만).
    const wd = get('weekday').replace(/요일$/, '')
    const head = `${wd} ${get('day')} ${get('month')}월 '${get('year')}`
    return intraday ? `${head}  ${get('hour')}:${get('minute')}` : head
  }
}

/** 가격 축·라벨용 커스텀 포맷터: 천단위 구분 + 심볼 정밀도(예: "87,200.0"). */
export function priceFormatter(precision: number): (value: number) => string {
  return (value) =>
    value.toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision })
}

/** 시간축 눈금: 연/월/일/시간 종류에 맞춰 최소한만 보여준다. */
export function makeTickFormatter(tz: string): (time: Time, tickMarkType: TickMarkType) => string {
  const zone = intlZone(tz)
  const timeFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false })
  const dayFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: zone, day: 'numeric' })
  const monthFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: zone, month: 'short' })
  const yearFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: zone, year: 'numeric' })
  return (time, tickMarkType) => {
    const date = new Date(asMs(time))
    switch (tickMarkType) {
      case TickMarkType.Year:
        return yearFmt.format(date)
      case TickMarkType.Month:
        return monthFmt.format(date)
      case TickMarkType.DayOfMonth:
        return dayFmt.format(date)
      default:
        return timeFmt.format(date)
    }
  }
}

/** 가격 — 심볼 정밀도(소수 자릿수)에 맞춰 천단위 구분. */
export function formatPrice(value: number, precision?: number): string {
  const digits = precision ?? (value >= 1000 ? 2 : value >= 1 ? 4 : 6)
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatVolume(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`
  return value.toFixed(2)
}

export function formatCountdown(totalSec: number): string {
  const s = Math.max(0, totalSec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * 봉의 마감 시각(초, UTC). 대부분은 열림 + 주기지만, 월봉(1M)은 28~31일로 가변이라
 * Binance 기준(UTC) 다음 달 1일 00:00 을 마감으로 계산한다.
 */
export function barCloseTime(openTime: number, interval: Interval): number {
  if (interval === '1M') {
    const d = new Date(openTime * 1000)
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0)
    return Math.floor(next / 1000)
  }
  return openTime + INTERVAL_SECONDS[interval]
}
