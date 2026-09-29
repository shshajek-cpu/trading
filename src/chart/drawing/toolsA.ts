/**
 * 채널·피치포크 변형, 피보나치·갠 도구, 도형(회전 사각형·경로·원·폴리라인·호·곡선) 그리기와 잡기.
 * 한 그림의 모양을 화면(픽셀) 좌표의 선·면·글자 목록(`Geo`)으로 한 번 만들고, 그리기와 잡기 판정이 같은 목록을 쓴다.
 * 앵커는 가격·시각으로 저장되고 화면 좌표로 바꾼 뒤 계산하므로 로그·퍼센트 눈금에서도 다른 도구와 같게 따라간다.
 */
import type { Drawing, DrawingKind, DrawingPoint } from '../../lib/drawings'
import { withAlpha } from '../../lib/theme'
import type { Coords } from './coords'
import { distToPolyline, type Pt } from './geometry'

export type ToolAKind = Extract<
  DrawingKind,
  | 'disjointChannel' | 'flatTopBottom' | 'schiffPitchfork' | 'modifiedSchiffPitchfork' | 'insidePitchfork'
  | 'fibChannel' | 'fibTimeTrend' | 'fibCircles' | 'fibSpeedFan' | 'fibSpeedArcs' | 'fibWedge' | 'fibSpiral' | 'pitchfan'
  | 'gannBox' | 'gannSquareFixed' | 'gannFan'
  | 'rotatedRectangle' | 'path' | 'circle' | 'polyline' | 'arc' | 'curve' | 'doubleCurve'
>

const TOOL_A: Record<ToolAKind, true> = {
  disjointChannel: true, flatTopBottom: true, schiffPitchfork: true, modifiedSchiffPitchfork: true, insidePitchfork: true,
  fibChannel: true, fibTimeTrend: true, fibCircles: true, fibSpeedFan: true, fibSpeedArcs: true, fibWedge: true,
  fibSpiral: true, pitchfan: true,
  gannBox: true, gannSquareFixed: true, gannFan: true,
  rotatedRectangle: true, path: true, circle: true, polyline: true, arc: true, curve: true, doubleCurve: true,
}

export function isToolA(kind: DrawingKind): kind is ToolAKind {
  return Object.hasOwn(TOOL_A, kind)
}

/** 찍는 점 수가 정해지지 않은 도구(경로·폴리라인) — 마지막 점을 다시 누르거나 Enter·Esc 로 끝낸다. */
export function isMultiPoint(kind: DrawingKind): boolean {
  return kind === 'path' || kind === 'polyline'
}

/** 클릭 수. 경로·폴리라인은 끝이 없다(Infinity). */
export function requiredPointsA(kind: ToolAKind): number {
  switch (kind) {
    case 'path':
    case 'polyline':
      return Infinity
    case 'disjointChannel':
    case 'flatTopBottom':
    case 'schiffPitchfork':
    case 'modifiedSchiffPitchfork':
    case 'insidePitchfork':
    case 'pitchfan':
    case 'fibChannel':
    case 'fibTimeTrend':
    case 'fibWedge':
    case 'rotatedRectangle':
    case 'arc':
      return 3
    default:
      return 2
  }
}

// ── 레벨 표(TradingView 기본값) ──
export const FIB_CHANNEL_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236] as const
export const FIB_TIME_LEVELS = [0, 0.382, 0.5, 0.618, 1, 1.382, 1.618, 2, 2.382, 2.618, 3] as const
export const FIB_CIRCLE_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236] as const
export const FIB_SPEED_LEVELS = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1] as const
export const FIB_ARC_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786, 1] as const
export const GANN_BOX_LEVELS = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1] as const
const GANN_SQUARE_LEVELS = [0.25, 0.5, 0.75, 1] as const
/** 갠 팬 각도(가격 × 시간). 1×1 이 두 번째 점을 지난다. */
export const GANN_FAN_RATIOS: readonly [number, number][] = [
  [8, 1], [4, 1], [3, 1], [2, 1], [1, 1], [1, 2], [1, 3], [1, 4], [1, 8],
]
const PITCHFAN_LEVELS = [0.5, 1] as const
const PHI = (1 + Math.sqrt(5)) / 2

// ── 화면 모양 목록 ──
interface Stroke {
  pts: Pt[]
  closed?: boolean
  /** 점선 안내선(앵커 연결) — 옅고 가늘게. */
  guide?: boolean
  /** 격자처럼 옅게 그리는 보조선. */
  faint?: boolean
  /** 선의 스타일(굵기·종류)과 무관하게 점선으로. */
  dashed?: boolean
}

interface Area {
  pts: Pt[]
  /** 'shape' = 스타일의 채움 색(없으면 채우지 않음, 안쪽을 누르면 잡힘). 'band' = 선 색을 옅게(잡히지 않음). */
  kind: 'shape' | 'band'
  alpha?: number
}

interface Text {
  text: string
  x: number
  y: number
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
}

interface Geo {
  strokes: Stroke[]
  areas: Area[]
  texts: Text[]
  arrows: [Pt, Pt][]
}

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k })
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const len = (a: Pt): number => Math.hypot(a.x, a.y)
const unit = (a: Pt): Pt | null => {
  const l = len(a)
  return l === 0 ? null : { x: a.x / l, y: a.y / l }
}
/** a→b 에 수직인 단위벡터(화면에서 왼쪽). */
const normal = (a: Pt, b: Pt): Pt | null => {
  const u = unit(sub(b, a))
  return u ? { x: u.y, y: -u.x } : null
}

/** 원(또는 호)을 점으로 나눈다. a0→a1 은 라디안, 캔버스 방향(아래가 +y). */
function arcPts(c: Pt, r: number, a0: number, a1: number, steps = 72): Pt[] {
  const n = Math.max(8, Math.ceil((steps * Math.abs(a1 - a0)) / (Math.PI * 2)))
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n
    out.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) })
  }
  return out
}

/** a·b 를 지나고 h 를 t=0.5 에서 지나는 2차 곡선을 점으로. */
function quadThrough(a: Pt, b: Pt, h: Pt, steps = 40): Pt[] {
  const q = sub(mul(h, 2), mid(a, b))
  const out: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const s = 1 - t
    out.push({ x: s * s * a.x + 2 * s * t * q.x + t * t * b.x, y: s * s * a.y + 2 * s * t * q.y + t * t * b.y })
  }
  return out
}

/** 곡선의 기본 휨: a–b 가운데에서 선 길이의 1/4 만큼 옆으로(side = ±1). */
function defaultBend(a: Pt, b: Pt, side: 1 | -1): Pt {
  const n = normal(a, b) ?? { x: 0, y: -1 }
  return add(mid(a, b), mul(n, (len(sub(b, a)) / 4) * side))
}

/** 세 점을 지나는 원. 거의 한 직선이면 null. */
function circleThrough(a: Pt, b: Pt, c: Pt): { c: Pt; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-6) return null
  const a2 = a.x * a.x + a.y * a.y
  const b2 = b.x * b.x + b.y * b.y
  const c2 = c.x * c.x + c.y * c.y
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
  const center = { x: cx, y: cy }
  return { c: center, r: len(sub(a, center)) }
}

/** 호 a→b 가 c 를 지나게 그리는 시작·끝 각도. */
function arcAngles(o: Pt, a: Pt, b: Pt, c: Pt): [number, number] {
  const ang = (p: Pt) => Math.atan2(p.y - o.y, p.x - o.x)
  const norm = (x: number) => ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  const a0 = ang(a)
  const sweepB = norm(ang(b) - a0)
  const sweepC = norm(ang(c) - a0)
  // 양의 방향으로 돌아 b 에 닿기 전에 c 를 지나면 양의 방향, 아니면 음의 방향.
  return sweepC <= sweepB ? [a0, a0 + sweepB] : [a0, a0 + sweepB - Math.PI * 2]
}

/** 피치포크 변형의 중앙선 시작점. */
function pitchforkOrigin(kind: ToolAKind, a: Pt, b: Pt): Pt {
  if (kind === 'schiffPitchfork') return { x: a.x, y: (a.y + b.y) / 2 }
  return mid(a, b)
}

/** 두 점 사이 거리가 이 값(px) 이하이면 같은 자리로 본다 — 경로를 끝내는 두 번째 누름 판정. */
export const SAME_SPOT_PX = 6

function geometry(d: Drawing, pts: (Pt | null)[], coords: Coords, width: number, height: number): Geo {
  const g: Geo = { strokes: [], areas: [], texts: [], arrows: [] }
  const far = Math.max(width, height) * 4
  const kind = d.kind as ToolAKind
  const [a, b, c] = pts
  const ahead = (o: Pt, u: Pt): Pt => add(o, mul(u, far))

  switch (kind) {
    case 'disjointChannel': {
      if (!a || !b) break
      g.strokes.push({ pts: [a, b] })
      if (!c) break
      const a2 = { x: a.x, y: c.y }
      const b2 = { x: b.x, y: c.y - (b.y - a.y) }
      g.strokes.push({ pts: [a2, b2] })
      g.areas.push({ pts: [a, b, b2, a2], kind: 'shape' })
      break
    }
    case 'flatTopBottom': {
      if (!a || !b) break
      g.strokes.push({ pts: [a, b] })
      if (!c) break
      const a2 = { x: a.x, y: c.y }
      const b2 = { x: b.x, y: c.y }
      g.strokes.push({ pts: [a2, b2] })
      g.areas.push({ pts: [a, b, b2, a2], kind: 'shape' })
      break
    }
    case 'schiffPitchfork':
    case 'modifiedSchiffPitchfork':
    case 'insidePitchfork': {
      if (!a || !b) break
      if (!c) {
        g.strokes.push({ pts: [a, b] })
        break
      }
      const o = pitchforkOrigin(kind, a, b)
      const u = unit(sub(mid(b, c), o))
      g.strokes.push({ pts: [a, o], guide: true })
      g.strokes.push({ pts: [b, c] })
      if (!u) break
      // 인사이드 피치포크는 두 갈래를 중앙선 시작점의 가로 자리까지 뒤로 끌어와, 갈래가 시작점에서부터 펼쳐진다.
      const back = (p: Pt): Pt => (kind === 'insidePitchfork' ? sub(p, mul(u, (p.x - o.x) / (u.x || 1))) : p)
      const b0 = back(b)
      const c0 = back(c)
      g.areas.push({ pts: [b0, c0, ahead(c, u), ahead(b, u)], kind: 'shape' })
      g.strokes.push({ pts: [o, ahead(o, u)] })
      g.strokes.push({ pts: [b0, ahead(b, u)] })
      g.strokes.push({ pts: [c0, ahead(c, u)] })
      if (kind === 'insidePitchfork') g.strokes.push({ pts: [b0, c0], faint: true })
      break
    }
    case 'pitchfan': {
      if (!a || !b) break
      if (!c) {
        g.strokes.push({ pts: [a, b] })
        break
      }
      const m = mid(b, c)
      g.strokes.push({ pts: [b, c] })
      const through: Pt[] = [m]
      for (const l of PITCHFAN_LEVELS) {
        through.push(add(m, mul(sub(b, m), l)), add(m, mul(sub(c, m), l)))
      }
      for (const t of through) {
        const u = unit(sub(t, a))
        if (u) g.strokes.push({ pts: [a, ahead(a, u)], dashed: t === m })
      }
      const ub = unit(sub(b, a))
      const uc = unit(sub(c, a))
      if (ub && uc) g.areas.push({ pts: [a, ahead(a, ub), ahead(a, uc)], kind: 'shape' })
      break
    }
    case 'fibChannel': {
      if (!a || !b) break
      if (!c) {
        g.strokes.push({ pts: [a, b] })
        break
      }
      const t = b.x === a.x ? 0 : (c.x - a.x) / (b.x - a.x)
      const off = c.y - (a.y + t * (b.y - a.y))
      let prev: [Pt, Pt] | null = null
      const left = a.x <= b.x ? 'a' : 'b'
      for (const l of FIB_CHANNEL_LEVELS) {
        const p0 = { x: a.x, y: a.y + off * l }
        const p1 = { x: b.x, y: b.y + off * l }
        if (prev) g.areas.push({ pts: [prev[0], prev[1], p1, p0], kind: 'band', alpha: 0.06 })
        prev = [p0, p1]
        g.strokes.push({ pts: [p0, p1] })
        const lp = left === 'a' ? p0 : p1
        g.texts.push({ text: String(l), x: lp.x - 6, y: lp.y, align: 'right' })
      }
      break
    }
    case 'fibTimeTrend': {
      if (!a || !b) break
      g.strokes.push({ pts: [a, b], guide: true })
      if (!c) break
      g.strokes.push({ pts: [b, c], guide: true })
      const [p1, p2, p3] = d.points
      const l1 = coords.timeToLogical(p1.time)
      const l2 = coords.timeToLogical(p2.time)
      const l3 = coords.timeToLogical(p3.time)
      if (l1 === null || l2 === null || l3 === null) break
      const unitBars = l2 - l1
      let lastX = -Infinity
      for (const l of FIB_TIME_LEVELS) {
        const x = coords.logicalToX(l3 + l * unitBars)
        if (x === null) continue
        g.strokes.push({ pts: [{ x, y: 0 }, { x, y: height }] })
        if (Math.abs(x - lastX) < 26) continue
        g.texts.push({ text: String(l), x: x + 4, y: height - 8, baseline: 'bottom' })
        lastX = x
        if (unitBars === 0) break
      }
      break
    }
    case 'fibCircles': {
      if (!a || !b) break
      g.strokes.push({ pts: [a, b], guide: true })
      const o = mid(a, b)
      const r = len(sub(b, a)) / 2
      if (r === 0) break
      // 붙은 라벨은 건너뛴다(글자 폭만큼 떨어진 원만).
      let lastR = -Infinity
      for (const l of FIB_CIRCLE_LEVELS) {
        g.strokes.push({ pts: arcPts(o, r * l, 0, Math.PI * 2), closed: true })
        if (r * l - lastR < 32) continue
        g.texts.push({ text: String(l), x: o.x + r * l + 3, y: o.y, baseline: 'bottom' })
        lastR = r * l
      }
      break
    }
    case 'fibSpeedFan': {
      if (!a || !b) break
      const dx = b.x - a.x
      const dy = b.y - a.y
      // 상자 격자(옅게) — 가격 레벨은 가로, 시간 레벨은 세로.
      for (const l of FIB_SPEED_LEVELS) {
        const y = b.y - l * dy
        const x = b.x - l * dx
        g.strokes.push({ pts: [{ x: a.x, y }, { x: b.x, y }], faint: true })
        g.strokes.push({ pts: [{ x, y: a.y }, { x, y: b.y }], faint: true })
        g.texts.push({ text: String(l), x: b.x + (dx >= 0 ? 4 : -4), y, align: dx >= 0 ? 'left' : 'right' })
        g.texts.push({ text: String(l), x, y: b.y + (dy >= 0 ? 12 : -12), align: 'center' })
      }
      for (const l of FIB_SPEED_LEVELS) {
        if (l === 1) continue
        const up = unit({ x: dx, y: dy - l * dy })
        if (up) g.strokes.push({ pts: [a, ahead(a, up)] })
        if (l === 0) continue
        const ut = unit({ x: dx - l * dx, y: dy })
        if (ut) g.strokes.push({ pts: [a, ahead(a, ut)] })
      }
      break
    }
    case 'fibSpeedArcs': {
      if (!a || !b) break
      g.strokes.push({ pts: [a, b], guide: true })
      const r = len(sub(b, a))
      if (r === 0) break
      // 두 번째 점이 있는 쪽(위·아래) 반원.
      const up = b.y <= a.y
      const [s0, s1] = up ? [Math.PI, Math.PI * 2] : [0, Math.PI]
      let lastR = -Infinity
      for (const l of FIB_ARC_LEVELS) {
        g.strokes.push({ pts: arcPts(a, r * l, s0, s1) })
        if (r * l - lastR < 13) continue
        g.texts.push({ text: String(l), x: a.x, y: a.y + (up ? -1 : 1) * r * l, align: 'center', baseline: up ? 'bottom' : 'top' })
        lastR = r * l
      }
      break
    }
    case 'fibWedge': {
      if (!a || !b) break
      if (!c) {
        g.strokes.push({ pts: [a, b] })
        break
      }
      const r = len(sub(b, a))
      const uc = unit(sub(c, a))
      if (r === 0 || !uc) break
      const cEnd = add(a, mul(uc, r))
      g.strokes.push({ pts: [a, b] })
      g.strokes.push({ pts: [a, cEnd] })
      const t0 = Math.atan2(b.y - a.y, b.x - a.x)
      let t1 = Math.atan2(uc.y, uc.x)
      // 두 선 사이의 좁은 쪽으로 호를 긋는다.
      while (t1 - t0 > Math.PI) t1 -= Math.PI * 2
      while (t1 - t0 < -Math.PI) t1 += Math.PI * 2
      let prev: Pt[] | null = null
      for (const l of FIB_ARC_LEVELS) {
        const arc = arcPts(a, r * l, t0, t1)
        if (prev) g.areas.push({ pts: [...prev, ...[...arc].reverse()], kind: 'band', alpha: 0.06 })
        prev = arc
        g.strokes.push({ pts: arc })
        const end = arc[arc.length - 1]
        g.texts.push({ text: String(l), x: end.x + 4, y: end.y })
      }
      break
    }
    case 'fibSpiral': {
      if (!a || !b) break
      g.strokes.push({ pts: [a, b], guide: true })
      const r0 = len(sub(b, a))
      if (r0 === 0) break
      const th0 = Math.atan2(b.y - a.y, b.x - a.x)
      // 로그 나선 r = r0·φ^(θ/(π/2)) — 네 분의 한 바퀴마다 φ 배. 안쪽 네 바퀴부터 화면을 벗어날 때까지.
      const k = Math.log(PHI) / (Math.PI / 2)
      const out: Pt[] = []
      for (let th = -8 * Math.PI; ; th += Math.PI / 36) {
        const r = r0 * Math.exp(k * th)
        out.push({ x: a.x + r * Math.cos(th0 + th), y: a.y + r * Math.sin(th0 + th) })
        if (r > far) break
      }
      g.strokes.push({ pts: out })
      break
    }
    case 'gannBox': {
      if (!a || !b) break
      const dx = b.x - a.x
      const dy = b.y - a.y
      g.areas.push({ pts: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], kind: 'shape' })
      for (const l of GANN_BOX_LEVELS) {
        const y = a.y + l * dy
        const x = a.x + l * dx
        g.strokes.push({ pts: [{ x: a.x, y }, { x: b.x, y }], faint: l !== 0 && l !== 1 })
        g.strokes.push({ pts: [{ x, y: a.y }, { x, y: b.y }], faint: l !== 0 && l !== 1 })
        g.texts.push({ text: String(l), x: Math.min(a.x, b.x) - 4, y, align: 'right' })
        g.texts.push({ text: String(l), x, y: Math.max(a.y, b.y) + 12, align: 'center' })
      }
      g.strokes.push({ pts: [a, b], dashed: true })
      g.strokes.push({ pts: [{ x: a.x, y: b.y }, { x: b.x, y: a.y }], dashed: true })
      break
    }
    case 'gannSquareFixed': {
      if (!a || !b) break
      const dx = b.x - a.x
      const dy = b.y - a.y
      g.areas.push({ pts: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], kind: 'shape' })
      g.strokes.push({ pts: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], closed: true })
      for (const l of GANN_SQUARE_LEVELS) {
        if (l !== 1) {
          g.strokes.push({ pts: [{ x: a.x, y: a.y + l * dy }, { x: b.x, y: a.y + l * dy }], faint: true })
          g.strokes.push({ pts: [{ x: a.x + l * dx, y: a.y }, { x: a.x + l * dx, y: b.y }], faint: true })
        }
        // 시작 모서리에서 뻗는 부채선(가격·시간 쪽 각각)과 모서리 중심의 4분원.
        g.strokes.push({ pts: [a, { x: b.x, y: a.y + l * dy }] })
        if (l !== 1) g.strokes.push({ pts: [a, { x: a.x + l * dx, y: b.y }] })
        const rx = Math.abs(dx) * l
        const ry = Math.abs(dy) * l
        const steps = 24
        const q: Pt[] = []
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * (Math.PI / 2)
          q.push({ x: a.x + Math.cos(t) * rx * Math.sign(dx || 1), y: a.y + Math.sin(t) * ry * Math.sign(dy || 1) })
        }
        g.strokes.push({ pts: q, faint: l !== 1 })
        g.texts.push({ text: String(l), x: b.x + (dx >= 0 ? 4 : -4), y: a.y + l * dy, align: dx >= 0 ? 'left' : 'right' })
      }
      break
    }
    case 'gannFan': {
      if (!a || !b) break
      const dx = b.x - a.x
      const dy = b.y - a.y
      const r = len(sub(b, a))
      let prev: Pt | null = null
      for (const [p, t] of GANN_FAN_RATIOS) {
        // p×t: 시간 t 칸 동안 가격 p 칸 — 1×1 이 두 번째 점을 지난다.
        const u = unit({ x: dx * (t >= p ? 1 : t / p), y: dy * (p >= t ? 1 : p / t) })
        if (!u) continue
        const end = ahead(a, u)
        if (prev) g.areas.push({ pts: [a, prev, end], kind: 'band', alpha: 0.05 })
        prev = end
        g.strokes.push({ pts: [a, end] })
        const lp = add(a, mul(u, Math.max(r, 40) * 1.1))
        g.texts.push({ text: `${p}/${t}`, x: lp.x + 4, y: lp.y })
      }
      break
    }
    case 'rotatedRectangle': {
      if (!a || !b) break
      if (!c) {
        g.strokes.push({ pts: [a, b] })
        break
      }
      const n = normal(a, b)
      if (!n) break
      const h = (c.x - a.x) * n.x + (c.y - a.y) * n.y
      const poly = [a, b, add(b, mul(n, h)), add(a, mul(n, h))]
      g.areas.push({ pts: poly, kind: 'shape' })
      g.strokes.push({ pts: poly, closed: true })
      break
    }
    case 'path':
    case 'polyline': {
      const valid = pts.filter((p): p is Pt => p !== null)
      if (valid.length < 2) break
      const closed = kind === 'polyline' && d.style.closed === true
      g.strokes.push({ pts: valid, closed })
      if (closed) g.areas.push({ pts: valid, kind: 'shape' })
      if (kind === 'path') g.arrows.push([valid[valid.length - 2], valid[valid.length - 1]])
      break
    }
    case 'circle': {
      if (!a || !b) break
      const r = len(sub(b, a))
      const ring = arcPts(a, r, 0, Math.PI * 2)
      g.areas.push({ pts: ring, kind: 'shape' })
      g.strokes.push({ pts: ring, closed: true })
      break
    }
    case 'arc': {
      if (!a || !b) break
      const circ = c ? circleThrough(a, b, c) : null
      if (!c || !circ) {
        g.strokes.push({ pts: [a, b] })
        break
      }
      const [t0, t1] = arcAngles(circ.c, a, b, c)
      const arc = arcPts(circ.c, circ.r, t0, t1)
      g.areas.push({ pts: arc, kind: 'shape' })
      g.strokes.push({ pts: arc })
      break
    }
    case 'curve': {
      if (!a || !b) break
      g.strokes.push({ pts: quadThrough(a, b, c ?? defaultBend(a, b, 1)) })
      break
    }
    case 'doubleCurve': {
      if (!a || !b) break
      const m = mid(a, b)
      const h1 = c ?? defaultBend(a, m, 1)
      const h2 = pts[3] ?? defaultBend(m, b, -1)
      g.strokes.push({ pts: [...quadThrough(a, m, h1), ...quadThrough(m, b, h2).slice(1)] })
      break
    }
  }
  return g
}

function dashFor(w: number, style: string): number[] {
  if (style === 'dashed') return [w * 4, w * 3]
  if (style === 'dotted') return [w, w * 2]
  return []
}

function strokePath(ctx: CanvasRenderingContext2D, s: Stroke): void {
  ctx.beginPath()
  ctx.moveTo(s.pts[0].x, s.pts[0].y)
  for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y)
  if (s.closed) ctx.closePath()
  ctx.stroke()
}

function arrowHead(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, color: string, w: number): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const size = 8 + w * 2
  ctx.save()
  ctx.setLineDash([])
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** 그룹 A 그림 하나를 그린다(미디어 좌표계). 손잡이는 renderDrawing 이 그린다. */
export function renderToolA(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  coords: Coords,
  d: Drawing,
  pts: (Pt | null)[],
): void {
  const s = d.style
  const g = geometry(d, pts, coords, width, height)
  for (const area of g.areas) {
    if (area.pts.length < 3) continue
    const color = area.kind === 'shape' ? s.fillColor : withAlpha(s.color, area.alpha ?? 0.08)
    if (!color) continue
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(area.pts[0].x, area.pts[0].y)
    for (let i = 1; i < area.pts.length; i++) ctx.lineTo(area.pts[i].x, area.pts[i].y)
    ctx.closePath()
    ctx.fill()
  }
  for (const st of g.strokes) {
    if (st.pts.length < 2) continue
    if (st.guide) {
      ctx.strokeStyle = withAlpha(s.color, 0.6)
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
    } else {
      ctx.strokeStyle = st.faint ? withAlpha(s.color, 0.45) : s.color
      ctx.lineWidth = st.faint ? 1 : s.lineWidth
      ctx.setLineDash(st.dashed ? [6, 4] : dashFor(ctx.lineWidth, s.lineStyle))
    }
    strokePath(ctx, st)
  }
  for (const [from, to] of g.arrows) arrowHead(ctx, from, to, s.color, s.lineWidth)
  if (g.texts.length) {
    ctx.setLineDash([])
    ctx.font = '11px -apple-system, "Malgun Gothic", sans-serif'
    ctx.fillStyle = s.color
    for (const t of g.texts) {
      ctx.textAlign = t.align ?? 'left'
      ctx.textBaseline = t.baseline ?? 'middle'
      ctx.fillText(t.text, t.x, t.y)
    }
  }
}

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** 선·곡선 근처거나, 채운 도형(채움 색이 있을 때)의 안쪽이면 잡힌다. 안내 점선도 잡힌다. */
export function hitToolA(d: Drawing, coords: Coords, pts: (Pt | null)[], p: Pt, tol: number): boolean {
  const pane = coords.paneSize()
  const g = geometry(d, pts, coords, pane.width, pane.height)
  for (const st of g.strokes) {
    const line = st.closed ? [...st.pts, st.pts[0]] : st.pts
    if (line.length >= 2 && distToPolyline(p, line) <= tol) return true
  }
  if (d.style.fillColor === undefined) return false
  return g.areas.some((a) => a.kind === 'shape' && a.pts.length >= 3 && pointInPolygon(p, a.pts))
}

/**
 * 화면에 보일 앵커. 앵커 하나가 가격이나 시각 한쪽만 쓰는 도구는 그 앵커를 모양 위 자리로 옮겨 보인다 —
 * 분리 채널·플랫 톱/바텀의 셋째 점은 첫 점의 시각, 회전 사각형의 셋째 점은 맞은편 변의 가운데.
 */
export function anchorPointsA(d: Drawing, coords: Coords): DrawingPoint[] {
  const [p1, p2, p3] = d.points
  if (!p1 || !p2 || !p3) return d.points
  if (d.kind === 'disjointChannel' || d.kind === 'flatTopBottom') {
    return [p1, p2, { time: p1.time, price: p3.price }, ...d.points.slice(3)]
  }
  if (d.kind === 'rotatedRectangle') {
    const xy = (q: DrawingPoint): Pt | null => {
      const x = coords.timeToX(q.time)
      const y = coords.priceToY(q.price)
      return x === null || y === null ? null : { x, y }
    }
    const a = xy(p1)
    const b = xy(p2)
    const c = xy(p3)
    const n = a && b ? normal(a, b) : null
    if (!a || !b || !c || !n) return d.points
    const h = (c.x - a.x) * n.x + (c.y - a.y) * n.y
    const m = add(mid(a, b), mul(n, h))
    const time = coords.xToTime(m.x)
    const price = coords.yToPrice(m.y)
    if (time === null || price === null) return d.points
    return [p1, p2, { time, price }]
  }
  return d.points
}

/**
 * 클릭한 점들 → 저장할 앵커. 곡선·이중 곡선은 휨 손잡이를 더하고, 갠 스퀘어는 화면에서 정사각형이 되게
 * 둘째 점 가격을 맞춘다. 경로·폴리라인은 같은 자리를 겹쳐 누른 점을 하나로 합친다. 만들 수 없으면 null.
 */
export function buildPointsA(kind: ToolAKind, clicked: DrawingPoint[], coords: Coords): DrawingPoint[] | null {
  const xy = (q: DrawingPoint): Pt | null => {
    const x = coords.timeToX(q.time)
    const y = coords.priceToY(q.price)
    return x === null || y === null ? null : { x, y }
  }
  const back = (p: Pt): DrawingPoint | null => {
    const time = coords.xToTime(p.x)
    const price = coords.yToPrice(p.y)
    return time === null || price === null ? null : { time, price }
  }
  if (kind === 'path' || kind === 'polyline') {
    const out: DrawingPoint[] = []
    let last: Pt | null = null
    for (const q of clicked) {
      const p = xy(q)
      if (p && last && len(sub(p, last)) <= SAME_SPOT_PX) continue
      out.push(q)
      if (p) last = p
    }
    return out.length >= 2 ? out : null
  }
  if (kind === 'curve' || kind === 'doubleCurve' || kind === 'gannSquareFixed') {
    const a = xy(clicked[0])
    const b = xy(clicked[1])
    if (!a || !b) return null
    if (kind === 'gannSquareFixed') {
      const side = Math.abs(b.x - a.x) || Math.abs(b.y - a.y)
      const corner = back({ x: a.x + Math.sign(b.x - a.x || 1) * side, y: a.y + Math.sign(b.y - a.y || 1) * side })
      return corner ? [clicked[0], corner] : null
    }
    if (kind === 'curve') {
      const h = back(defaultBend(a, b, 1))
      return h ? [clicked[0], clicked[1], h] : null
    }
    const m = mid(a, b)
    const h1 = back(defaultBend(a, m, 1))
    const h2 = back(defaultBend(m, b, -1))
    return h1 && h2 ? [clicked[0], clicked[1], h1, h2] : null
  }
  return clicked
}
