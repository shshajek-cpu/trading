import type { Interval } from './binance'
import { nowIn, zonedToEpoch } from './timezone'

const DAY = 86400

export interface DateRange {
  id: string
  label: string
  /** 이 구간을 보기 좋은 주기로 함께 바꾼다(TradingView 기간 버튼과 같다). */
  interval: Interval
  span: number | 'ytd' | 'all'
}

/** 기간 버튼: 라벨, 바꿀 주기, 거슬러 볼 길이(초). */
export const DATE_RANGES: DateRange[] = [
  { id: '1d', label: '1일', interval: '1m', span: DAY },
  { id: '5d', label: '5일', interval: '5m', span: 5 * DAY },
  { id: '1mo', label: '1개월', interval: '30m', span: 30 * DAY },
  { id: '3mo', label: '3개월', interval: '1h', span: 90 * DAY },
  { id: '6mo', label: '6개월', interval: '2h', span: 180 * DAY },
  { id: 'ytd', label: 'YTD', interval: '1d', span: 'ytd' },
  { id: '1y', label: '1년', interval: '1d', span: 365 * DAY },
  { id: '5y', label: '5년', interval: '1w', span: 5 * 365 * DAY },
  { id: 'all', label: '전체', interval: '1M', span: 'all' },
]

/** 지금 기준 그 기간의 시작·끝(unix 초). YTD 는 차트 시간대(tz)의 1월 1일 0시부터. */
export function rangeBounds(range: DateRange, tz: string): { from: number; to: number } {
  const to = Math.floor(Date.now() / 1000)
  if (range.span === 'ytd') {
    const year = nowIn(tz).date.slice(0, 4)
    return { from: zonedToEpoch(`${year}-01-01`, '00:00', tz) ?? to, to }
  }
  if (range.span === 'all') return { from: 0, to }
  return { from: to - range.span, to }
}
