import type { ChartPalette } from '../../lib/theme'
import { withAlpha, type Drawing, type DrawingStyle } from '../../lib/drawings'
import type { Coords } from './coords'
import type { Pt } from './geometry'

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const

/** 피보나치 레벨의 가격. TradingView 처럼 첫 점(시작)이 1, 둘째 점(끝)이 0 — 0.618 은 끝에서 되돌린 61.8% 자리다. */
export function fibPrice(d: Drawing, level: number): number {
  const start = d.points[0].price
  const end = d.points[1].price
  return end + level * (start - end)
}

let measureCtx: CanvasRenderingContext2D | null = null

/** 텍스트 그림이 차지하는 상자(앵커가 왼쪽 위). 그리기와 잡기 판정이 같은 크기를 쓴다. */
export function textBox(d: Drawing, a: Pt): { x: number; y: number; w: number; h: number } {
  const size = d.style.fontSize ?? 14
  measureCtx ??= document.createElement('canvas').getContext('2d')
  let w = size * 4
  if (measureCtx) {
    measureCtx.font = `${size}px -apple-system, "Malgun Gothic", sans-serif`
    w = measureCtx.measureText(d.style.text || '텍스트').width
  }
  return { x: a.x, y: a.y, w, h: size * 1.3 }
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

/** 한 그림의 모든 앵커를 화면 좌표로. null 이면 좌표를 만들 수 없는 점. */
export function resolvePts(d: Drawing, coords: Coords): (Pt | null)[] {
  return d.points.map((p) => {
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
    case 'fibRetracement': {
      drawFib(rc, d, pts)
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

function drawFib(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx, coords } = rc
  const [a, b] = pts
  if (!a || !b) return
  const s = d.style
  const x1 = Math.min(a.x, b.x)
  const x2 = Math.max(a.x, b.x)
  // 추세선(시작→끝)을 점선으로 — 어느 쪽에서 그렸는지(0 이 어디인지) 보이게.
  ctx.save()
  ctx.setLineDash([4, 4])
  ctx.strokeStyle = withAlpha(s.color, 0.6)
  ctx.lineWidth = 1
  line(ctx, a, b)
  ctx.restore()
  let prevY: number | null = null
  FIB_LEVELS.forEach((lvl) => {
    const price = fibPrice(d, lvl)
    const y = coords.priceToY(price)
    if (y === null) return
    if (prevY !== null) {
      ctx.fillStyle = withAlpha(s.color, 0.08)
      ctx.fillRect(x1, Math.min(prevY, y), x2 - x1, Math.abs(y - prevY))
    }
    prevY = y
    stroke(ctx, s)
    line(ctx, { x: x1, y }, { x: x2, y })
    label(ctx, `${lvl}  ${coords.format(price)}`, x2 + 4, y, withAlpha(s.color, 0.85))
  })
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
