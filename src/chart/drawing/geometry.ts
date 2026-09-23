/** 화면(픽셀) 좌표계에서의 히트 테스트 계산 모음. */

export interface Pt {
  x: number
  y: number
}

/** 점 p 에서 선분 a-b 까지의 최단 거리(px). */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  return Math.hypot(p.x - cx, p.y - cy)
}

/** 점 p 에서 무한 직선 a-b 까지의 수직 거리(px). 레이/연장선 판정용. */
export function distToLine(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len
}

export function pointInRect(p: Pt, a: Pt, b: Pt): boolean {
  const x1 = Math.min(a.x, b.x)
  const x2 = Math.max(a.x, b.x)
  const y1 = Math.min(a.y, b.y)
  const y2 = Math.max(a.y, b.y)
  return p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2
}

/** 사각형 테두리(±tol) 근처인지. 채움이 없는 도형 판정용. */
export function nearRectEdge(p: Pt, a: Pt, b: Pt, tol: number): boolean {
  const tl = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }
  const br = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }
  const tr = { x: br.x, y: tl.y }
  const bl = { x: tl.x, y: br.y }
  return (
    distToSegment(p, tl, tr) <= tol ||
    distToSegment(p, tr, br) <= tol ||
    distToSegment(p, br, bl) <= tol ||
    distToSegment(p, bl, tl) <= tol
  )
}

export function pointInEllipse(p: Pt, a: Pt, b: Pt): boolean {
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const rx = Math.abs(a.x - b.x) / 2
  const ry = Math.abs(a.y - b.y) / 2
  if (rx === 0 || ry === 0) return false
  const nx = (p.x - cx) / rx
  const ny = (p.y - cy) / ry
  return nx * nx + ny * ny <= 1
}

export function pointInTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const d1 = sign(p, a, b)
  const d2 = sign(p, b, c)
  const d3 = sign(p, c, a)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

function sign(p: Pt, a: Pt, b: Pt): number {
  return (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y)
}

/** 이어진 점들(브러시) 근처인지 — 가장 가까운 구간 거리. */
export function distToPolyline(p: Pt, pts: Pt[]): number {
  if (pts.length === 0) return Infinity
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y)
  let min = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(p, pts[i], pts[i + 1])
    if (d < min) min = d
  }
  return min
}

/** Ramer–Douglas–Peucker 로 브러시 점을 솎아낸다. */
export function simplify(pts: Pt[], epsilon: number): Pt[] {
  if (pts.length <= 2) return pts
  let maxDist = 0
  let index = 0
  const end = pts.length - 1
  for (let i = 1; i < end; i++) {
    const d = distToSegment(pts[i], pts[0], pts[end])
    if (d > maxDist) {
      maxDist = d
      index = i
    }
  }
  if (maxDist > epsilon) {
    const left = simplify(pts.slice(0, index + 1), epsilon)
    const right = simplify(pts.slice(index), epsilon)
    return [...left.slice(0, -1), ...right]
  }
  return [pts[0], pts[end]]
}
