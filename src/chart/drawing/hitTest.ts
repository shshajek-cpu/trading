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
import { FIB_LEVELS, fibPrice, resolvePts, textBox } from './render'

export type Hit =
  | { type: 'anchor'; index: number }
  | { type: 'body' }

interface Tolerance {
  anchor: number
  line: number
}

const MOUSE_TOL: Tolerance = { anchor: 7, line: 6 }
// 손가락 끝은 마우스 커서보다 훨씬 굵다 — 터치로 누를 때는 잡히는 폭을 넓힌다.
const TOUCH_TOL: Tolerance = { anchor: 18, line: 14 }

export interface Picked {
  drawing: Drawing
  hit: Hit
}

/**
 * 위에 그려진 것부터 검사해 커서 아래의 그림 한 개를 고른다. `touch` 면 잡는 폭이 넓다.
 * `skipLocked` 면 잠긴 그림은 지나쳐 그 아래 그림을 본다(지우개).
 */
export function pickDrawing(
  drawings: Drawing[],
  coords: Coords,
  p: Pt,
  touch = false,
  skipLocked = false,
): Picked | null {
  const tol = touch ? TOUCH_TOL : MOUSE_TOL
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i]
    if (d.hidden || (skipLocked && d.locked)) continue
    const hit = hitDrawing(d, coords, p, tol)
    if (hit) return { drawing: d, hit }
  }
  return null
}

export function hitDrawing(
  d: Drawing,
  coords: Coords,
  p: Pt,
  tol: Tolerance = MOUSE_TOL,
): Hit | null {
  const pts = resolvePts(d, coords)

  // 앵커 손잡이 우선(잠긴 그림은 이동 불가라 body 로만).
  if (!d.locked) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      if (a && Math.hypot(p.x - a.x, p.y - a.y) <= tol.anchor) {
        return { type: 'anchor', index: i }
      }
    }
  }

  return hitBody(d, coords, pts, p, tol.line) ? { type: 'body' } : null
}

function hitBody(
  d: Drawing,
  coords: Coords,
  pts: (Pt | null)[],
  p: Pt,
  tol: number,
): boolean {
  const s = d.style
  const fill = s.fillColor !== undefined
  switch (d.kind) {
    case 'trend':
    case 'infoLine':
    case 'trendAngle':
    case 'arrowLine': {
      const [a, b] = pts
      return !!a && !!b && distToSegment(p, a, b) <= tol
    }
    case 'ray': {
      const [a, b] = pts
      if (!a || !b) return false
      // 반직선: a 쪽 뒤로는 무시.
      const proj = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y))
      return proj >= 0 && distToLine(p, a, b) <= tol
    }
    case 'extended': {
      const [a, b] = pts
      return !!a && !!b && distToLine(p, a, b) <= tol
    }
    case 'horizontal':
    case 'horizontalRay': {
      const a = pts[0]
      if (!a) return false
      if (d.kind === 'horizontalRay' && p.x < a.x - tol) return false
      return Math.abs(p.y - a.y) <= tol
    }
    case 'vertical': {
      const a = pts[0]
      return !!a && Math.abs(p.x - a.x) <= tol
    }
    case 'crossLine': {
      const a = pts[0]
      return !!a && (Math.abs(p.x - a.x) <= tol || Math.abs(p.y - a.y) <= tol)
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
      return distToSegment(p, a, b) <= tol || distToSegment(p, a2, b2) <= tol
    }
    case 'fibRetracement': {
      const [a, b] = pts
      if (!a || !b) return false
      const x1 = Math.min(a.x, b.x)
      const x2 = Math.max(a.x, b.x)
      if (p.x < x1 - tol || p.x > x2 + tol) return false
      return FIB_LEVELS.some((lvl) => {
        const y = coords.priceToY(fibPrice(d, lvl))
        return y !== null && Math.abs(p.y - y) <= tol
      })
    }
    case 'rectangle': {
      const [a, b] = pts
      if (!a || !b) return false
      return fill ? pointInRect(p, a, b) : nearRectEdge(p, a, b, tol)
    }
    case 'priceRange':
    case 'dateRange':
    case 'datePriceRange': {
      // 높이나 폭이 0 인 범위(같은 가격·같은 봉)도 잡히게 가장자리 바깥까지 조금 넓힌다.
      const [a, b] = pts
      return !!a && !!b && pointInRect(p, a, b, tol)
    }
    case 'ellipse': {
      const [a, b] = pts
      if (!a || !b) return false
      return fill ? pointInEllipse(p, a, b) : nearRectEdge(p, a, b, tol)
    }
    case 'triangle': {
      const [a, b, c] = pts
      if (!a || !b || !c) return false
      return pointInTriangle(p, a, b, c)
    }
    case 'brush': {
      const valid = pts.filter((x): x is Pt => x !== null)
      return distToPolyline(p, valid) <= tol
    }
    case 'text': {
      const a = pts[0]
      if (!a) return false
      const box = textBox(d, a)
      return pointInRect(p, { x: box.x, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, tol)
    }
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
  return false
}
