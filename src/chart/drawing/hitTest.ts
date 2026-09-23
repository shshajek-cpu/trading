import type { Drawing } from '../../lib/drawings'
import type { Coords } from './coords'
import {
  distToLine,
  distToPolyline,
  distToSegment,
  nearRectEdge,
  pointInEllipse,
  pointInRect,
  pointInTriangle,
  type Pt,
} from './geometry'
import { FIB_LEVELS, resolvePts } from './render'

export type Hit =
  | { type: 'anchor'; index: number }
  | { type: 'body' }

const ANCHOR_TOL = 7
const LINE_TOL = 6

export interface Picked {
  drawing: Drawing
  hit: Hit
}

/** 위에 그려진 것부터 검사해 커서 아래의 그림 한 개를 고른다. */
export function pickDrawing(
  drawings: Drawing[],
  coords: Coords,
  p: Pt,
  width: number,
  height: number,
): Picked | null {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i]
    if (d.hidden) continue
    const hit = hitDrawing(d, coords, p, width, height)
    if (hit) return { drawing: d, hit }
  }
  return null
}

export function hitDrawing(
  d: Drawing,
  coords: Coords,
  p: Pt,
  width: number,
  height: number,
): Hit | null {
  const pts = resolvePts(d, coords)

  // 앵커 손잡이 우선(잠긴 그림은 이동 불가라 body 로만).
  if (!d.locked) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      if (a && Math.hypot(p.x - a.x, p.y - a.y) <= ANCHOR_TOL) {
        return { type: 'anchor', index: i }
      }
    }
  }

  return hitBody(d, pts, p, width, height) ? { type: 'body' } : null
}

function hitBody(
  d: Drawing,
  pts: (Pt | null)[],
  p: Pt,
  width: number,
  height: number,
): boolean {
  const s = d.style
  const fill = s.fillColor !== undefined
  switch (d.kind) {
    case 'trend':
    case 'infoLine':
    case 'arrowLine': {
      const [a, b] = pts
      return !!a && !!b && distToSegment(p, a, b) <= LINE_TOL
    }
    case 'ray': {
      const [a, b] = pts
      if (!a || !b) return false
      // 반직선: a 쪽 뒤로는 무시.
      const proj = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y))
      return proj >= 0 && distToLine(p, a, b) <= LINE_TOL
    }
    case 'extended':
    case 'trendAngle': {
      const [a, b] = pts
      return !!a && !!b && distToLine(p, a, b) <= LINE_TOL
    }
    case 'horizontal':
    case 'horizontalRay': {
      const a = pts[0]
      if (!a) return false
      if (d.kind === 'horizontalRay' && p.x < a.x - LINE_TOL) return false
      return Math.abs(p.y - a.y) <= LINE_TOL
    }
    case 'vertical': {
      const a = pts[0]
      return !!a && Math.abs(p.x - a.x) <= LINE_TOL
    }
    case 'crossLine': {
      const a = pts[0]
      return !!a && (Math.abs(p.x - a.x) <= LINE_TOL || Math.abs(p.y - a.y) <= LINE_TOL)
    }
    case 'parallelChannel': {
      const [a, b, c] = pts
      if (!a || !b) return false
      let dy = 0
      if (c) {
        const t = b.x === a.x ? 0 : (c.x - a.x) / (b.x - a.x)
        dy = c.y - (a.y + t * (b.y - a.y))
      }
      const a2 = { x: a.x, y: a.y + dy }
      const b2 = { x: b.x, y: b.y + dy }
      return distToSegment(p, a, b) <= LINE_TOL || distToSegment(p, a2, b2) <= LINE_TOL
    }
    case 'fibRetracement': {
      const [a, b] = pts
      if (!a || !b) return false
      const x1 = Math.min(a.x, b.x)
      const x2 = Math.max(a.x, b.x)
      if (p.x < x1 - LINE_TOL || p.x > x2 + LINE_TOL) return false
      return FIB_LEVELS.some((lvl) => Math.abs(p.y - (a.y + lvl * (b.y - a.y))) <= LINE_TOL)
    }
    case 'rectangle':
    case 'priceRange':
    case 'datePriceRange': {
      const [a, b] = pts
      if (!a || !b) return false
      return fill || d.kind !== 'rectangle'
        ? pointInRect(p, a, b)
        : nearRectEdge(p, a, b, LINE_TOL)
    }
    case 'dateRange': {
      const [a, b] = pts
      if (!a || !b) return false
      return pointInRect(p, { x: a.x, y: 0 }, { x: b.x, y: height })
    }
    case 'ellipse': {
      const [a, b] = pts
      if (!a || !b) return false
      return fill ? pointInEllipse(p, a, b) : nearRectEdge(p, a, b, LINE_TOL)
    }
    case 'triangle': {
      const [a, b, c] = pts
      if (!a || !b || !c) return false
      return pointInTriangle(p, a, b, c)
    }
    case 'brush': {
      const valid = pts.filter((x): x is Pt => x !== null)
      return distToPolyline(p, valid) <= LINE_TOL
    }
    case 'text':
    case 'arrowMarkUp':
    case 'arrowMarkDown': {
      const a = pts[0]
      return !!a && Math.hypot(p.x - a.x, p.y - a.y) <= 16
    }
    case 'longPosition':
    case 'shortPosition': {
      const [entry, target, stop] = pts
      if (!entry || !target || !stop) return false
      const x = Math.min(entry.x, target.x)
      const w = Math.abs(target.x - entry.x)
      const top = Math.min(target.y, stop.y)
      const h = Math.abs(target.y - stop.y)
      return pointInRect(p, { x, y: top }, { x: x + w, y: top + h })
    }
  }
  // width 는 일부 종류에서 미사용 — 시그니처 일관성 유지.
  void width
  return false
}
