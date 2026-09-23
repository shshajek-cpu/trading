import type { DrawingKind, DrawingPoint } from '../../lib/drawings'
import { INTERVAL_SECONDS } from '../../lib/intervals'
import type { Interval } from '../../lib/binance'

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
 * 클릭한 점들을 최종 앵커 배열로 확장한다. 롱/숏 포지션은 클릭 한 번(진입)으로
 * 목표·손절(±2%)과 오른쪽 끝(20봉)을 만든다.
 */
export function buildPoints(
  kind: DrawingKind,
  clicked: DrawingPoint[],
  interval: Interval,
): DrawingPoint[] {
  if (kind === 'longPosition' || kind === 'shortPosition') {
    const entry = clicked[0]
    if (!entry) return clicked
    const step = INTERVAL_SECONDS[interval]
    const rightTime = entry.time + 20 * step
    const long = kind === 'longPosition'
    const target = entry.price * (long ? 1.02 : 0.98)
    const stop = entry.price * (long ? 0.98 : 1.02)
    return [
      { time: entry.time, price: entry.price },
      { time: rightTime, price: target },
      { time: rightTime, price: stop },
    ]
  }
  return clicked
}

/** 복제 시 몇 봉 오른쪽으로 밀지. */
export function cloneOffset(points: DrawingPoint[], interval: Interval): DrawingPoint[] {
  const step = INTERVAL_SECONDS[interval]
  const dt = 3 * step
  return points.map((p) => ({ time: p.time + dt, price: p.price }))
}
