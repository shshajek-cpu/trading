import type { DrawingKind, DrawingPoint } from '../../lib/drawings'
import { INTERVAL_SECONDS } from '../../lib/intervals'
import type { Interval } from '../../lib/binance'
import type { Coords } from './coords'

/** 도구를 완성하는 데 필요한 클릭(점) 수. brush 는 자유곡선이라 0. */
export function requiredPoints(kind: DrawingKind): number {
  switch (kind) {
    case 'horizontal':
    case 'horizontalRay':
    case 'vertical':
    case 'crossLine':
    case 'text':
    case 'arrowMarkUp':
    case 'arrowMarkDown':
    case 'longPosition':
    case 'shortPosition':
      return 1
    case 'parallelChannel':
    case 'triangle':
      return 3
    case 'brush':
      return 0
    default:
      return 2
  }
}

/**
 * 클릭한 점들을 최종 앵커 배열로 확장한다. 롱/숏 포지션은 클릭 한 번(진입)으로 목표·손절과 오른쪽 끝을 만든다.
 * 크기는 가격 %가 아니라 화면 기준(칸 높이의 10%, 폭의 12%)이다 — 1분봉에서 ±2% 는 화면 밖까지 뻗는다.
 * 좌표를 만들 수 없으면(캔들이 아직 없음) null — 그리지 않는다.
 */
export function buildPoints(kind: DrawingKind, clicked: DrawingPoint[], coords: Coords): DrawingPoint[] | null {
  if (kind !== 'longPosition' && kind !== 'shortPosition') return clicked
  const entry = clicked[0]
  if (!entry) return null
  const x = coords.timeToX(entry.time)
  const y = coords.priceToY(entry.price)
  if (x === null || y === null) return null
  const pane = coords.paneSize()
  const dy = Math.min(120, Math.max(30, pane.height * 0.1))
  const dx = Math.min(220, Math.max(100, pane.width * 0.12))
  const above = coords.yToPrice(y - dy)
  const below = coords.yToPrice(y + dy)
  const right = coords.xToTime(x + dx)
  if (above === null || below === null || right === null) return null
  const long = kind === 'longPosition'
  return [
    { time: entry.time, price: entry.price },
    { time: right, price: long ? above : below },
    { time: right, price: long ? below : above },
  ]
}

/** 복제 시 몇 봉 오른쪽으로 밀지. */
export function cloneOffset(points: DrawingPoint[], interval: Interval): DrawingPoint[] {
  const step = INTERVAL_SECONDS[interval]
  const dt = 3 * step
  return points.map((p) => ({ time: p.time + dt, price: p.price }))
}
