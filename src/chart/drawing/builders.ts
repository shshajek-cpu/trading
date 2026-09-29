import { defaultStyle, type DrawingKind, type DrawingPoint, type DrawingStyle } from '../../lib/drawings'
import { INTERVAL_SECONDS } from '../../lib/intervals'
import type { Interval } from '../../lib/market/types'
import type { Coords } from './coords'
import { buildPointsA, isToolA, requiredPointsA } from './toolsA'
import { barsSnapshot, barsSourceRange } from './studiesB'
import { buildPointsB } from './toolsB'

/** 도구를 완성하는 데 필요한 클릭(점) 수. brush 는 자유곡선이라 0, 경로·폴리라인은 끝이 없다(Infinity). */
export function requiredPoints(kind: DrawingKind): number {
  if (isToolA(kind)) return requiredPointsA(kind)
  switch (kind) {
    case 'horizontal':
    case 'horizontalRay':
    case 'vertical':
    case 'crossLine':
    case 'text':
    case 'note':
    case 'arrowMarkUp':
    case 'arrowMarkDown':
    case 'longPosition':
    case 'shortPosition':
    case 'priceLabel':
    case 'signpost':
    case 'flagMark':
    case 'comment':
    case 'anchoredVwap':
    case 'anchoredVolumeProfile':
      return 1
    case 'parallelChannel':
    case 'triangle':
    case 'fibExtension':
    case 'pitchfork':
    case 'projection':
      return 3
    case 'abcd':
    case 'trianglePattern':
    case 'elliottCorrection':
    case 'elliottDoubleCombo':
      return 4
    case 'xabcd':
    case 'cypher':
      return 5
    case 'elliottImpulse':
    case 'elliottTriangle':
    case 'elliottTripleCombo':
      return 6
    case 'headShoulders':
    case 'threeDrives':
      return 7
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
  if (isToolA(kind)) return buildPointsA(kind, clicked, coords)
  if (kind !== 'longPosition' && kind !== 'shortPosition') return buildPointsB(kind, clicked, coords)
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

/** 새 그림의 스타일. 바 패턴은 고른 구간의 봉을 스타일에 복사해 둔다(원본이 스크롤되어 사라져도 모양이 남게). */
export function buildStyle(kind: DrawingKind, clicked: DrawingPoint[], coords: Coords): DrawingStyle {
  const style = defaultStyle(kind)
  if (kind !== 'barsPattern' || clicked.length < 2) return style
  const range = barsSourceRange(coords.candles, clicked[0].time, clicked[1].time)
  return range ? { ...style, bars: barsSnapshot(coords.candles, range) } : style
}

/** 복제 시 몇 봉 오른쪽으로 밀지. */
export function cloneOffset(points: DrawingPoint[], interval: Interval): DrawingPoint[] {
  const step = INTERVAL_SECONDS[interval]
  const dt = 3 * step
  return points.map((p) => ({ time: p.time + dt, price: p.price }))
}
