import { withAlpha, type ChartPalette } from '../../lib/theme'
import type { Drawing, DrawingPoint, DrawingStyle } from '../../lib/drawings'
import { drawVolumeProfile, pocPrice } from '../volumeProfile'
import type { Coords } from './coords'
import { pitchforkDir, type Pt } from './geometry'
import {
  FIB_EXT_LEVELS,
  REGRESSION_DEVIATION,
  fibExtensionPrice,
  fibTimeZoneLogicals,
  profileFor,
  profileWidth,
  regressionFor,
  regressionValue,
} from './studies'

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const

/** 피보나치 레벨의 가격. TradingView 처럼 첫 점(시작)이 1, 둘째 점(끝)이 0 — 0.618 은 끝에서 되돌린 61.8% 자리다. */
export function fibPrice(d: Drawing, level: number): number {
  const start = d.points[0].price
  const end = d.points[1].price
  return end + level * (start - end)
}

let measureCtx: CanvasRenderingContext2D | null = null

function measureFont(size: number): CanvasRenderingContext2D | null {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (measureCtx) measureCtx.font = `${size}px -apple-system, "Malgun Gothic", sans-serif`
  return measureCtx
}

/** 텍스트 그림이 차지하는 상자(앵커가 왼쪽 위). 그리기와 잡기 판정이 같은 크기를 쓴다. */
export function textBox(d: Drawing, a: Pt): { x: number; y: number; w: number; h: number } {
  const size = d.style.fontSize ?? 14
  const m = measureFont(size)
  const w = m ? m.measureText(d.style.text || '텍스트').width : size * 4
  return { x: a.x, y: a.y, w, h: size * 1.3 }
}

const NOTE_PAD_X = 8
const NOTE_PAD_Y = 6

/** 노트 상자(앵커가 왼쪽 위). 줄마다 재서 가장 긴 줄에 맞춘다. 그리기와 잡기 판정이 같은 크기를 쓴다. */
export function noteBox(
  d: Drawing,
  a: Pt,
): { x: number; y: number; w: number; h: number; lines: string[]; size: number; lineHeight: number } {
  const size = d.style.fontSize ?? 14
  const lines = (d.style.text || '노트').split('\n')
  const m = measureFont(size)
  let textW = 0
  for (const l of lines) textW = Math.max(textW, m ? m.measureText(l).width : l.length * size * 0.6)
  const lineHeight = Math.round(size * 1.35)
  return {
    x: a.x,
    y: a.y,
    w: Math.ceil(textW) + NOTE_PAD_X * 2,
    h: lines.length * lineHeight + NOTE_PAD_Y * 2,
    lines,
    size,
    lineHeight,
  }
}

const HANDLE = 8
const ACCENT = '#2962ff'

export interface RenderScope {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  coords: Coords
  palette: ChartPalette
}

/**
 * 화면에 보일 앵커(시각·가격). 가격이 봉에서 나오는 그림은 저장된 가격 대신 계산한 자리를 쓴다 —
 * 회귀 추세는 회귀선 위, 고정 범위 볼륨 프로파일은 상자 모서리(첫 점 위, 둘째 점 아래). 계산할 봉이 없으면 저장값.
 */
export function anchorPoints(d: Drawing, coords: Coords): DrawingPoint[] {
  if (d.kind === 'regressionTrend') {
    const reg = regressionFor(d, coords.candles)
    if (!reg) return d.points
    return d.points.map((p) => {
      const lg = coords.timeToLogical(p.time)
      return lg === null ? p : { time: p.time, price: regressionValue(reg, lg) }
    })
  }
  if (d.kind === 'fixedRangeVolumeProfile') {
    const vp = profileFor(d, coords.candles)
    if (!vp) return d.points
    const top = vp.rows[vp.rows.length - 1].high
    const bottom = vp.rows[0].low
    return d.points.map((p, i) => ({ time: p.time, price: i === 0 ? top : bottom }))
  }
  return d.points
}

/** 한 그림의 모든 앵커를 화면 좌표로. null 이면 좌표를 만들 수 없는 점. */
export function resolvePts(d: Drawing, coords: Coords): (Pt | null)[] {
  return anchorPoints(d, coords).map((p) => {
    const x = coords.timeToX(p.time)
    const y = coords.priceToY(p.price)
    return x === null || y === null ? null : { x, y }
  })
}

function dashFor(style: DrawingStyle): number[] {
  const w = style.lineWidth
  if (style.lineStyle === 'dashed') return [w * 4, w * 3]
  if (style.lineStyle === 'dotted') return [w, w * 2]
  return []
}

function stroke(ctx: CanvasRenderingContext2D, style: DrawingStyle, color?: string): void {
  ctx.strokeStyle = color ?? style.color
  ctx.lineWidth = style.lineWidth
  ctx.setLineDash(dashFor(style))
}

function fillOf(style: DrawingStyle): string {
  return style.fillColor ?? withAlpha(style.color, 0.2)
}

function line(ctx: CanvasRenderingContext2D, a: Pt, b: Pt): void {
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
}

/** 무한 직선 a→b 를 캔버스 경계까지 잘라 두 끝점을 돌려준다. */
function clipInfinite(a: Pt, b: Pt, w: number, h: number): [Pt, Pt] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return [a, b]
  const big = Math.max(w, h) * 4
  const len = Math.hypot(dx, dy)
  const ux = (dx / len) * big
  const uy = (dy / len) * big
  return [
    { x: a.x - ux, y: a.y - uy },
    { x: b.x + ux, y: b.y + uy },
  ]
}

/** 반직선 a→b 를 b 쪽으로 캔버스 밖까지 연장. */
function extendRay(a: Pt, b: Pt, w: number, h: number): Pt {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const big = Math.max(w, h) * 4
  return { x: b.x + (dx / len) * big, y: b.y + (dy / len) * big }
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bg: string,
  fg = '#ffffff',
  align: CanvasTextAlign = 'left',
): void {
  ctx.save()
  ctx.setLineDash([])
  ctx.font = '11px -apple-system, "Malgun Gothic", sans-serif'
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  const lines = text.split('\n')
  const wds = lines.map((l) => ctx.measureText(l).width)
  const tw = Math.max(...wds)
  const lh = 14
  const padX = 6
  const padY = 4
  const boxH = lines.length * lh + padY * 2
  let bx = x
  if (align === 'center') bx = x - tw / 2 - padX
  else if (align === 'right') bx = x - tw - padX * 2
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect(bx, y - boxH / 2, tw + padX * 2, boxH, 3)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.textAlign = 'left'
  lines.forEach((l, i) => {
    ctx.fillText(l, bx + padX, y - boxH / 2 + padY + lh / 2 + i * lh)
  })
  ctx.restore()
}

function pct(from: number, to: number): string {
  if (from === 0) return '0.00%'
  return `${(((to - from) / from) * 100).toFixed(2)}%`
}

function formatSpan(sec: number): string {
  const s = Math.abs(Math.round(sec))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const parts: string[] = []
  if (d) parts.push(`${d}일`)
  if (h) parts.push(`${h}시간`)
  if (m && !d) parts.push(`${m}분`)
  return parts.length ? parts.join(' ') : '0분'
}

function arrowHead(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, color: string): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const size = 10
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

/** 선택된 그림의 앵커 손잡이를 그린다. */
export function drawHandles(ctx: CanvasRenderingContext2D, pts: (Pt | null)[]): void {
  ctx.save()
  ctx.setLineDash([])
  for (const p of pts) {
    if (!p) continue
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.rect(p.x - HANDLE / 2, p.y - HANDLE / 2, HANDLE, HANDLE)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

/** 한 그림을 pane 캔버스에 그린다(미디어 좌표계). */
export function renderDrawing(rc: RenderScope, d: Drawing, selected: boolean): void {
  const { ctx, width, height, coords } = rc
  const s = d.style
  const pts = resolvePts(d, coords)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  switch (d.kind) {
    case 'trend':
    case 'infoLine':
    case 'ray':
    case 'extended':
    case 'trendAngle': {
      const [a, b] = pts
      if (!a || !b) break
      stroke(ctx, s)
      let p0 = a
      let p1 = b
      if (d.kind === 'extended') [p0, p1] = clipInfinite(a, b, width, height)
      else if (d.kind === 'ray') p1 = extendRay(a, b, width, height)
      line(ctx, p0, p1)
      if (d.kind === 'trendAngle') drawAngle(rc, d, a, b)
      if (d.kind === 'infoLine') drawLineInfo(rc, d, a, b)
      break
    }
    case 'arrowLine': {
      const [a, b] = pts
      if (!a || !b) break
      stroke(ctx, s)
      line(ctx, a, b)
      arrowHead(ctx, a, b, s.color)
      break
    }
    case 'horizontal': {
      const a = pts[0]
      if (!a) break
      stroke(ctx, s)
      line(ctx, { x: 0, y: a.y }, { x: width, y: a.y })
      if (d.alert) drawBell(ctx, width - 18, a.y, s.color, d.fired)
      break
    }
    case 'horizontalRay': {
      const a = pts[0]
      if (!a) break
      stroke(ctx, s)
      line(ctx, a, { x: width, y: a.y })
      break
    }
    case 'vertical': {
      const a = pts[0]
      if (!a) break
      stroke(ctx, s)
      line(ctx, { x: a.x, y: 0 }, { x: a.x, y: height })
      break
    }
    case 'crossLine': {
      const a = pts[0]
      if (!a) break
      stroke(ctx, s)
      line(ctx, { x: 0, y: a.y }, { x: width, y: a.y })
      line(ctx, { x: a.x, y: 0 }, { x: a.x, y: height })
      break
    }
    case 'parallelChannel': {
      drawChannel(rc, d, pts)
      break
    }
    case 'regressionTrend': {
      drawRegression(rc, d, pts)
      break
    }
    case 'pitchfork': {
      drawPitchfork(rc, d, pts)
      break
    }
    case 'fibRetracement': {
      drawFib(rc, d, pts)
      break
    }
    case 'fibExtension': {
      drawFibExtension(rc, d, pts)
      break
    }
    case 'fibTimeZone': {
      drawFibTimeZone(rc, d, pts)
      break
    }
    case 'rectangle': {
      const [a, b] = pts
      if (!a || !b) break
      const x = Math.min(a.x, b.x)
      const y = Math.min(a.y, b.y)
      const w = Math.abs(a.x - b.x)
      const h = Math.abs(a.y - b.y)
      ctx.fillStyle = fillOf(s)
      ctx.fillRect(x, y, w, h)
      stroke(ctx, s)
      ctx.strokeRect(x, y, w, h)
      break
    }
    case 'ellipse': {
      const [a, b] = pts
      if (!a || !b) break
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const rx = Math.abs(a.x - b.x) / 2
      const ry = Math.abs(a.y - b.y) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.fillStyle = fillOf(s)
      ctx.fill()
      stroke(ctx, s)
      ctx.stroke()
      break
    }
    case 'triangle': {
      const [a, b, c] = pts
      if (!a || !b || !c) break
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.lineTo(c.x, c.y)
      ctx.closePath()
      ctx.fillStyle = fillOf(s)
      ctx.fill()
      stroke(ctx, s)
      ctx.stroke()
      break
    }
    case 'brush': {
      if (pts.some((p) => !p)) {
        // 부분적으로 화면 밖이어도 유효한 구간만 잇는다.
      }
      stroke(ctx, s)
      ctx.beginPath()
      let started = false
      for (const p of pts) {
        if (!p) continue
        if (!started) {
          ctx.moveTo(p.x, p.y)
          started = true
        } else ctx.lineTo(p.x, p.y)
      }
      if (started) ctx.stroke()
      break
    }
    case 'text': {
      const a = pts[0]
      if (!a) break
      drawText(ctx, d, a)
      break
    }
    case 'note': {
      const a = pts[0]
      if (!a) break
      drawNote(rc, d, a)
      break
    }
    case 'arrowMarkUp':
    case 'arrowMarkDown': {
      const a = pts[0]
      if (!a) break
      drawMark(ctx, d, a)
      break
    }
    case 'longPosition':
    case 'shortPosition': {
      drawPosition(rc, d, pts)
      break
    }
    case 'priceRange': {
      drawPriceRange(rc, d, pts)
      break
    }
    case 'dateRange': {
      drawDateRange(rc, d, pts)
      break
    }
    case 'datePriceRange': {
      drawDatePriceRange(rc, d, pts)
      break
    }
    case 'fixedRangeVolumeProfile': {
      drawFixedRangeProfile(rc, d, pts)
      break
    }
  }

  ctx.restore()
  if (selected) drawHandles(ctx, pts)
}

/** 정보 라인의 값 상자 — 선을 가리지 않게 끝점 바깥쪽(시작점 반대편) 옆에 둔다. */
function drawLineInfo(rc: RenderScope, d: Drawing, a: Pt, b: Pt): void {
  const { ctx, coords } = rc
  const p0 = d.points[0]
  const p1 = d.points[1]
  const dPrice = p1.price - p0.price
  const bars = coords.barCount(p0.time, p1.time)
  const angle = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI
  const text = `${dPrice >= 0 ? '+' : ''}${coords.format(dPrice)} (${pct(p0.price, p1.price)})\n${bars} 봉 · ${angle.toFixed(1)}°`
  const right = b.x >= a.x
  label(ctx, text, b.x + (right ? 10 : -10), b.y, withAlpha(d.style.color, 0.9), '#fff', right ? 'left' : 'right')
}

/** 추세 각도: 시작점의 수평 기준선과 호, 그 옆에 각도 값. */
function drawAngle(rc: RenderScope, d: Drawing, a: Pt, b: Pt): void {
  const { ctx } = rc
  const r = 28
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  ctx.save()
  ctx.setLineDash([2, 2])
  ctx.strokeStyle = d.style.color
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(a.x + r + 10, a.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(a.x, a.y, r, Math.min(ang, 0), Math.max(ang, 0))
  ctx.stroke()
  const deg = (-ang * 180) / Math.PI
  ctx.setLineDash([])
  ctx.font = '12px -apple-system, "Malgun Gothic", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = d.style.color
  // 값은 기준선 건너편에 — 완만한 선과 겹치지 않는다.
  ctx.fillText(`${deg.toFixed(1)}°`, a.x + r + 14, a.y + (deg >= 0 ? 9 : -9))
  ctx.restore()
}

function drawChannel(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx } = rc
  const [a, b, c] = pts
  if (!a || !b) return
  const s = d.style
  // c 로 채널 폭(수직 오프셋)을 정한다.
  let dy = 0
  if (c) {
    const t = b.x === a.x ? 0 : (c.x - a.x) / (b.x - a.x)
    const yOnLine = a.y + t * (b.y - a.y)
    dy = c.y - yOnLine
  }
  const a2 = { x: a.x, y: a.y + dy }
  const b2 = { x: b.x, y: b.y + dy }
  ctx.fillStyle = fillOf(s)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.lineTo(b2.x, b2.y)
  ctx.lineTo(a2.x, a2.y)
  ctx.closePath()
  ctx.fill()
  stroke(ctx, s)
  line(ctx, a, b)
  line(ctx, a2, b2)
  // 중앙 점선
  ctx.save()
  ctx.setLineDash([4, 4])
  line(ctx, { x: a.x, y: a.y + dy / 2 }, { x: b.x, y: b.y + dy / 2 })
  ctx.restore()
}

/** 앵커를 잇는 옅은 점선 — 레벨 그림이 어느 점에서 어느 점으로 그려졌는지(0 이 어디인지) 보이게. */
function guide(ctx: CanvasRenderingContext2D, s: DrawingStyle, a: Pt, b: Pt): void {
  ctx.save()
  ctx.setLineDash([4, 4])
  ctx.strokeStyle = withAlpha(s.color, 0.6)
  ctx.lineWidth = 1
  line(ctx, a, b)
  ctx.restore()
}

/** 피보나치 가격 레벨: x1~x2 가로선, 레벨 사이 옅은 띠, 오른쪽 끝에 "레벨  가격". */
function drawFibLevels(
  rc: RenderScope,
  s: DrawingStyle,
  levels: readonly number[],
  priceOf: (level: number) => number,
  x1: number,
  x2: number,
): void {
  const { ctx, coords } = rc
  let prevY: number | null = null
  for (const lvl of levels) {
    const price = priceOf(lvl)
    const y = coords.priceToY(price)
    if (y === null) continue
    if (prevY !== null) {
      ctx.fillStyle = withAlpha(s.color, 0.08)
      ctx.fillRect(x1, Math.min(prevY, y), x2 - x1, Math.abs(y - prevY))
    }
    prevY = y
    stroke(ctx, s)
    line(ctx, { x: x1, y }, { x: x2, y })
    label(ctx, `${lvl}  ${coords.format(price)}`, x2 + 4, y, withAlpha(s.color, 0.85))
  }
}

function drawFib(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const [a, b] = pts
  if (!a || !b) return
  guide(rc.ctx, d.style, a, b)
  drawFibLevels(rc, d.style, FIB_LEVELS, (lvl) => fibPrice(d, lvl), Math.min(a.x, b.x), Math.max(a.x, b.x))
}

/** 추세 기반 피보나치 확장 레벨선의 가로 구간: 셋째 점에서 1→2 움직임의 폭만큼 오른쪽(최소 40px). */
export function fibExtensionSpan(a: Pt, b: Pt, c: Pt): [number, number] {
  return [c.x, c.x + Math.max(Math.abs(b.x - a.x), 40)]
}

/** 추세 기반 피보나치 확장: 1→2→3 점선, 3 에서 1→2 움직임을 레벨 배로 이은 가격선. 셋째 점 전에는 1→2 만. */
function drawFibExtension(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const [a, b, c] = pts
  if (!a || !b) return
  const s = d.style
  guide(rc.ctx, s, a, b)
  if (!c) return
  guide(rc.ctx, s, b, c)
  const [x1, x2] = fibExtensionSpan(a, b, c)
  const [p1, p2, p3] = d.points
  drawFibLevels(rc, s, FIB_EXT_LEVELS, (lvl) => fibExtensionPrice(p1.price, p2.price, p3.price, lvl), x1, x2)
}

/** 피보나치 타임 존 세로선의 x 와 배수. 봉 수로 세므로 두 점의 논리 인덱스에서 바로 찍는다. */
export function fibTimeZoneXs(d: Drawing, coords: Coords): { n: number; x: number }[] {
  const [a, b] = d.points
  const l0 = a ? coords.timeToLogical(a.time) : null
  const l1 = b ? coords.timeToLogical(b.time) : null
  if (l0 === null || l1 === null) return []
  const out: { n: number; x: number }[] = []
  for (const z of fibTimeZoneLogicals(l0, l1)) {
    const x = coords.logicalToX(z.logical)
    if (x !== null) out.push({ n: z.n, x })
  }
  return out
}

/** 피보나치 타임 존: 두 점 점선, 배수마다 전체 높이 세로선, 아래쪽에 배수 라벨(너무 붙은 라벨은 건너뛴다). */
function drawFibTimeZone(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx, height } = rc
  const [a, b] = pts
  if (!a || !b) return
  const s = d.style
  guide(ctx, s, a, b)
  let lastLabelX = -Infinity
  for (const z of fibTimeZoneXs(d, rc.coords)) {
    stroke(ctx, s)
    line(ctx, { x: z.x, y: 0 }, { x: z.x, y: height })
    if (Math.abs(z.x - lastLabelX) < 22) continue
    label(ctx, String(z.n), z.x + 4, height - 14, withAlpha(s.color, 0.85))
    lastLabelX = z.x
  }
}

/** 회귀 추세 세 선(기준·위·아래)의 두 끝 — 두 점 시각에서의 회귀값과 ±편차. 봉이 모자라면 null. */
export function regressionChannel(
  d: Drawing,
  coords: Coords,
): { base: [Pt, Pt]; upper: [Pt, Pt]; lower: [Pt, Pt]; r: number } | null {
  const reg = regressionFor(d, coords.candles)
  if (!reg || d.points.length < 2) return null
  const dev = REGRESSION_DEVIATION * reg.stdev
  const base: Pt[] = []
  const upper: Pt[] = []
  const lower: Pt[] = []
  for (let i = 0; i < 2; i++) {
    const lg = coords.timeToLogical(d.points[i].time)
    if (lg === null) return null
    const x = coords.logicalToX(lg)
    const v = regressionValue(reg, lg)
    const y = coords.priceToY(v)
    const yu = coords.priceToY(v + dev)
    const yl = coords.priceToY(v - dev)
    if (x === null || y === null || yu === null || yl === null) return null
    base.push({ x, y })
    upper.push({ x, y: yu })
    lower.push({ x, y: yl })
  }
  return { base: [base[0], base[1]], upper: [upper[0], upper[1]], lower: [lower[0], lower[1]], r: reg.r }
}

/** 회귀 추세: 종가 회귀선(점선)과 ±2 표준편차 선, 그 사이 채움(고른 경우), 아래 선 왼쪽 밑에 피어슨 R. */
function drawRegression(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx } = rc
  const [a, b] = pts
  if (!a || !b) return
  const s = d.style
  const ch = regressionChannel(d, rc.coords)
  if (!ch) {
    // 구간 안 봉이 둘 미만(미래·아직 받지 않은 과거) — 고른 구간만 점선으로 보인다.
    guide(ctx, s, a, b)
    return
  }
  const { base, upper, lower } = ch
  if (s.fillColor) {
    ctx.fillStyle = s.fillColor
    ctx.beginPath()
    ctx.moveTo(upper[0].x, upper[0].y)
    ctx.lineTo(upper[1].x, upper[1].y)
    ctx.lineTo(lower[1].x, lower[1].y)
    ctx.lineTo(lower[0].x, lower[0].y)
    ctx.closePath()
    ctx.fill()
  }
  stroke(ctx, s)
  line(ctx, upper[0], upper[1])
  line(ctx, lower[0], lower[1])
  ctx.setLineDash([6, 4])
  line(ctx, base[0], base[1])
  const left = lower[0].x <= lower[1].x ? lower[0] : lower[1]
  label(ctx, `R ${ch.r.toFixed(2)}`, left.x, left.y + 16, withAlpha(s.color, 0.85))
}

/** 앤드루스 피치포크: 첫 점에서 2–3 가운데를 지나는 중앙선, 2·3 을 지나는 나란한 두 갈래(오른쪽으로 연장), 2–3 선분. */
function drawPitchfork(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx, width, height } = rc
  const [a, b, c] = pts
  if (!a || !b) return
  const s = d.style
  stroke(ctx, s)
  if (!c) {
    // 셋째 점을 찍기 전 미리보기: 첫 두 점만 잇는다.
    line(ctx, a, b)
    return
  }
  const u = pitchforkDir(a, b, c)
  if (!u) {
    line(ctx, b, c)
    return
  }
  const far = Math.max(width, height) * 4
  const ahead = (o: Pt): Pt => ({ x: o.x + u.x * far, y: o.y + u.y * far })
  if (s.fillColor) {
    const b2 = ahead(b)
    const c2 = ahead(c)
    ctx.fillStyle = s.fillColor
    ctx.beginPath()
    ctx.moveTo(b.x, b.y)
    ctx.lineTo(c.x, c.y)
    ctx.lineTo(c2.x, c2.y)
    ctx.lineTo(b2.x, b2.y)
    ctx.closePath()
    ctx.fill()
  }
  line(ctx, a, ahead(a))
  line(ctx, b, ahead(b))
  line(ctx, c, ahead(c))
  line(ctx, b, c)
}

/**
 * 고정 범위 볼륨 프로파일: 고른 시각 구간을 감싼 옅은 상자, 왼쪽 끝에서 오른쪽으로 자라는 가격대별 거래량,
 * 구간 끝까지 긋는 POC. a·b 는 프로파일이 있으면 그 가격 폭의 모서리다(anchorPoints). 봉이 없으면 점선 상자만.
 */
function drawFixedRangeProfile(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx, coords, palette } = rc
  const [a, b] = pts
  if (!a || !b) return
  const s = d.style
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const w = Math.abs(a.x - b.x)
  const h = Math.abs(a.y - b.y)
  const vp = profileFor(d, coords.candles)
  ctx.fillStyle = withAlpha(s.color, 0.06)
  ctx.fillRect(x, y, w, h)
  stroke(ctx, s, withAlpha(s.color, 0.5))
  if (!vp) ctx.setLineDash([4, 4])
  ctx.strokeRect(x, y, w, h)
  if (!vp) return
  drawVolumeProfile(
    ctx,
    vp,
    { priceToY: (price) => coords.priceToY(price), x, width: profileWidth(w), direction: 'right' },
    {
      upColor: palette.up,
      downColor: palette.down,
      pocColor: s.color,
      showPoc: false,
      showValueArea: true,
      valueAreaAlpha: 0.6,
      outsideAlpha: 0.25,
    },
  )
  const pocY = coords.priceToY(pocPrice(vp))
  if (pocY === null) return
  stroke(ctx, s)
  line(ctx, { x, y: pocY }, { x: x + w, y: pocY })
}

function drawText(ctx: CanvasRenderingContext2D, d: Drawing, a: Pt): void {
  const s = d.style
  const size = s.fontSize ?? 14
  const text = s.text ?? ''
  ctx.save()
  ctx.setLineDash([])
  ctx.font = `${size}px -apple-system, "Malgun Gothic", sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = s.color
  ctx.fillText(text || '텍스트', a.x, a.y)
  ctx.restore()
}

/** 노트: 불투명 바탕 위 채움 색 상자와 테두리, 안에 여러 줄 글. 뒤의 봉·선이 비치지 않는 메모지. */
function drawNote(rc: RenderScope, d: Drawing, a: Pt): void {
  const { ctx, palette } = rc
  const s = d.style
  const box = noteBox(d, a)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(box.x, box.y, box.w, box.h, 4)
  ctx.fillStyle = palette.background
  ctx.fill()
  ctx.fillStyle = fillOf(s)
  ctx.fill()
  stroke(ctx, s)
  ctx.stroke()
  ctx.font = `${box.size}px -apple-system, "Malgun Gothic", sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = s.text ? palette.text : palette.textDim
  box.lines.forEach((l, i) => {
    ctx.fillText(l, box.x + NOTE_PAD_X, box.y + NOTE_PAD_Y + box.lineHeight * (i + 0.5))
  })
  ctx.restore()
}

function drawMark(ctx: CanvasRenderingContext2D, d: Drawing, a: Pt): void {
  const up = d.kind === 'arrowMarkUp'
  const s = d.style
  const size = 14
  const dir = up ? 1 : -1
  ctx.save()
  ctx.setLineDash([])
  ctx.fillStyle = s.color
  ctx.beginPath()
  // 위쪽 화살표는 봉 아래에서 위를 가리킨다.
  const tipY = up ? a.y - size : a.y + size
  ctx.moveTo(a.x, tipY)
  ctx.lineTo(a.x - size / 2, tipY + dir * size)
  ctx.lineTo(a.x - size / 4, tipY + dir * size)
  ctx.lineTo(a.x - size / 4, a.y + dir * size * 1.6)
  ctx.lineTo(a.x + size / 4, a.y + dir * size * 1.6)
  ctx.lineTo(a.x + size / 4, tipY + dir * size)
  ctx.lineTo(a.x + size / 2, tipY + dir * size)
  ctx.closePath()
  ctx.fill()
  if (s.text) {
    ctx.font = '11px -apple-system, "Malgun Gothic", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = up ? 'bottom' : 'top'
    ctx.fillText(s.text, a.x, up ? tipY - size : tipY + size)
  }
  ctx.restore()
}

/** 값 상자를 가장자리 y 의 바깥(위 또는 아래)에 붙인다 — 상자가 도형을 덮지 않게. */
function labelOutside(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  edgeY: number,
  below: boolean,
  bg: string,
): void {
  const half = (text.split('\n').length * 14 + 8) / 2
  label(ctx, text, x, edgeY + (below ? half + 4 : -half - 4), bg, '#fff', 'center')
}

function drawPosition(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx, coords } = rc
  const [entry, target, stop] = pts
  if (!entry || !target || !stop) return
  const long = d.kind === 'longPosition'
  const x = Math.min(entry.x, target.x)
  const w = Math.abs(target.x - entry.x)
  const green = '#089981'
  const red = '#f23645'
  // 이익 영역: entry → target, 손실 영역: entry → stop
  const profitTop = Math.min(entry.y, target.y)
  const profitH = Math.abs(target.y - entry.y)
  const lossTop = Math.min(entry.y, stop.y)
  const lossH = Math.abs(stop.y - entry.y)
  ctx.fillStyle = withAlpha(green, 0.16)
  ctx.fillRect(x, profitTop, w, profitH)
  ctx.fillStyle = withAlpha(red, 0.16)
  ctx.fillRect(x, lossTop, w, lossH)
  stroke(ctx, d.style, long ? green : red)
  ctx.strokeRect(x, Math.min(profitTop, lossTop), w, profitH + lossH)
  // entry 선
  ctx.save()
  ctx.setLineDash([])
  ctx.strokeStyle = '#dbdbdb'
  ctx.lineWidth = 1
  line(ctx, { x, y: entry.y }, { x: x + w, y: entry.y })
  ctx.restore()

  const eP = d.points[0].price
  const tP = d.points[1].price
  const sP = d.points[2].price
  const risk = Math.abs(eP - sP)
  const reward = Math.abs(tP - eP)
  const rr = risk === 0 ? 0 : reward / risk
  const cx = x + w / 2
  labelOutside(ctx, `목표 ${coords.format(tP)} (${pct(eP, tP)})`, cx, target.y, target.y > entry.y, withAlpha(green, 0.9))
  labelOutside(ctx, `손절 ${coords.format(sP)} (${pct(eP, sP)})`, cx, stop.y, stop.y > entry.y, withAlpha(red, 0.9))
  label(ctx, `손익비 ${rr.toFixed(2)}`, cx, entry.y, withAlpha('#787b86', 0.95), '#fff', 'center')
}

/** 가격 범위: 두 점 사이 상자, 가운데 세로 화살표(시작→끝), 끝점 바깥에 값. */
function drawPriceRange(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx, coords } = rc
  const [a, b] = pts
  if (!a || !b) return
  const s = d.style
  const x1 = Math.min(a.x, b.x)
  const x2 = Math.max(a.x, b.x)
  const cx = (x1 + x2) / 2
  ctx.fillStyle = fillOf(s)
  ctx.fillRect(x1, Math.min(a.y, b.y), x2 - x1, Math.abs(a.y - b.y))
  stroke(ctx, s)
  line(ctx, { x: x1, y: a.y }, { x: x2, y: a.y })
  line(ctx, { x: x1, y: b.y }, { x: x2, y: b.y })
  line(ctx, { x: cx, y: a.y }, { x: cx, y: b.y })
  if (Math.abs(b.y - a.y) > 12) arrowHead(ctx, { x: cx, y: a.y }, { x: cx, y: b.y }, s.color)
  const p0 = d.points[0].price
  const p1 = d.points[1].price
  const dPrice = p1 - p0
  labelOutside(ctx, `${dPrice >= 0 ? '+' : ''}${coords.format(dPrice)} (${pct(p0, p1)})`, cx, b.y, b.y > a.y, withAlpha(s.color, 0.9))
}

/** 날짜 범위: 두 점 사이 상자, 가운데 가로 화살표(시작→끝), 상자 아래에 봉 수·기간. */
function drawDateRange(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx, coords } = rc
  const [a, b] = pts
  if (!a || !b) return
  const s = d.style
  const y1 = Math.min(a.y, b.y)
  const y2 = Math.max(a.y, b.y)
  const cy = (y1 + y2) / 2
  ctx.fillStyle = fillOf(s)
  ctx.fillRect(Math.min(a.x, b.x), y1, Math.abs(a.x - b.x), y2 - y1)
  stroke(ctx, s)
  line(ctx, { x: a.x, y: y1 }, { x: a.x, y: y2 })
  line(ctx, { x: b.x, y: y1 }, { x: b.x, y: y2 })
  line(ctx, { x: a.x, y: cy }, { x: b.x, y: cy })
  if (Math.abs(b.x - a.x) > 12) arrowHead(ctx, { x: a.x, y: cy }, { x: b.x, y: cy }, s.color)
  const t0 = d.points[0].time
  const t1 = d.points[1].time
  const bars = coords.barCount(t0, t1)
  labelOutside(ctx, `${bars} 봉 · ${formatSpan(t1 - t0)}`, (a.x + b.x) / 2, y2, true, withAlpha(s.color, 0.9))
}

/** 날짜와 가격 범위: 상자와 두 화살표, 끝점 쪽 바깥에 가격 변화·봉 수·기간. 측정 도구도 이 모양을 쓴다. */
function drawDatePriceRange(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx, coords } = rc
  const [a, b] = pts
  if (!a || !b) return
  const s = d.style
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const w = Math.abs(a.x - b.x)
  const h = Math.abs(a.y - b.y)
  const cx = x + w / 2
  const cy = y + h / 2
  ctx.fillStyle = fillOf(s)
  ctx.fillRect(x, y, w, h)
  stroke(ctx, s)
  ctx.strokeRect(x, y, w, h)
  line(ctx, { x: cx, y: a.y }, { x: cx, y: b.y })
  line(ctx, { x: a.x, y: cy }, { x: b.x, y: cy })
  if (h > 12) arrowHead(ctx, { x: cx, y: a.y }, { x: cx, y: b.y }, s.color)
  if (w > 12) arrowHead(ctx, { x: a.x, y: cy }, { x: b.x, y: cy }, s.color)
  const p0 = d.points[0].price
  const p1 = d.points[1].price
  const t0 = d.points[0].time
  const t1 = d.points[1].time
  const bars = coords.barCount(t0, t1)
  const dPrice = p1 - p0
  labelOutside(
    ctx,
    `${dPrice >= 0 ? '+' : ''}${coords.format(dPrice)} (${pct(p0, p1)})\n${bars} 봉 · ${formatSpan(t1 - t0)}`,
    cx,
    b.y,
    b.y > a.y,
    withAlpha(s.color, 0.9),
  )
}

function drawBell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  fired: boolean,
): void {
  ctx.save()
  ctx.setLineDash([])
  ctx.globalAlpha = fired ? 0.4 : 1
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, y - 5)
  ctx.quadraticCurveTo(x - 5, y - 5, x - 5, y + 2)
  ctx.lineTo(x + 5, y + 2)
  ctx.quadraticCurveTo(x + 5, y - 5, x, y - 5)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y + 4, 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
