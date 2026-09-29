/**
 * 추가 그리기 도구(묶음 B)의 그리기·잡기 판정: 차트 패턴, 엘리엇 파동, 주기, 주석(말풍선·가격 라벨·표지판 등),
 * 예측(예측·바 패턴·프로젝션), 거래량 기반(앵커 VWAP·앵커 볼륨 프로파일).
 * render.ts / hitTest.ts 의 switch 가 이 모듈로 넘긴다. 좌표계는 미디어(CSS px).
 */
import type { Drawing, DrawingPoint, DrawingStyle } from '../../lib/drawings'
import { readableTextOn, withAlpha } from '../../lib/theme'
import { drawVolumeProfile, pocPrice } from '../volumeProfile'
import type { Coords } from './coords'
import { distToPolyline, distToSegment, pointInRect, pointInTriangle, type Pt } from './geometry'
import { fillOf, formatSpan, label, line, measureFont, pct, stroke, type RenderScope } from './render'
import { profileWidth } from './studies'
import { anchoredProfileFor, barIndexAt, barsSourceRange, forecastOutcome, patternBars, vwapBands, vwapFor } from './studiesB'

const FONT = '-apple-system, "Malgun Gothic", sans-serif'

/** 꼭짓점마다 붙는 이름(null 이면 없음). 패턴은 상자 라벨, 엘리엇 파동은 글자만. */
const POINT_NAMES: Partial<Record<Drawing['kind'], (string | null)[]>> = {
  xabcd: ['X', 'A', 'B', 'C', 'D'],
  cypher: ['X', 'A', 'B', 'C', 'D'],
  abcd: ['A', 'B', 'C', 'D'],
  trianglePattern: ['A', 'B', 'C', 'D'],
  headShoulders: [null, '왼쪽 어깨', null, '머리', null, '오른쪽 어깨', null],
  threeDrives: [null, '1', null, '2', null, '3', null],
  elliottImpulse: ['(0)', '(1)', '(2)', '(3)', '(4)', '(5)'],
  elliottCorrection: ['(0)', '(A)', '(B)', '(C)'],
  elliottTriangle: ['(0)', '(A)', '(B)', '(C)', '(D)', '(E)'],
  elliottDoubleCombo: ['(0)', '(W)', '(X)', '(Y)'],
  elliottTripleCombo: ['(0)', '(W)', '(X)', '(Y)', '(X)', '(Z)'],
}

/** 비율 점선: i–j 를 잇고 가운데에 |P[n1]−P[n0]| / |P[d1]−P[d0]| 을 적는다(하모닉 패턴 비율). */
type RatioLine = [i: number, j: number, n0: number, n1: number, d0: number, d1: number]

const RATIO_LINES: Partial<Record<Drawing['kind'], RatioLine[]>> = {
  // XABCD: B 는 XA 되돌림, C 는 AB 되돌림, D 는 BC 확장, D 는 XA 되돌림.
  xabcd: [[0, 2, 1, 2, 0, 1], [1, 3, 2, 3, 1, 2], [2, 4, 3, 4, 2, 3], [0, 4, 1, 4, 0, 1]],
  // 사이퍼: B 는 XA 되돌림, C 는 XA 확장, D 는 XC 되돌림.
  cypher: [[0, 2, 1, 2, 0, 1], [0, 3, 0, 3, 0, 1], [0, 4, 3, 4, 0, 3]],
  abcd: [[0, 2, 1, 2, 0, 1], [1, 3, 2, 3, 1, 2]],
  // 세 번의 드라이브: 되돌림(2·4)과 드라이브 확장(3·5).
  threeDrives: [[0, 2, 1, 2, 0, 1], [2, 4, 3, 4, 2, 3], [1, 3, 2, 3, 1, 2], [3, 5, 4, 5, 3, 4]],
}

/** 채우는 삼각형(꼭짓점 번호). */
const FILL_TRIANGLES: Partial<Record<Drawing['kind'], [number, number, number][]>> = {
  xabcd: [[0, 1, 2], [2, 3, 4]],
  cypher: [[0, 1, 2], [2, 3, 4]],
  headShoulders: [[0, 1, 2], [2, 3, 4], [4, 5, 6]],
}

const ELLIOTT: Partial<Record<Drawing['kind'], true>> = {
  elliottImpulse: true, elliottCorrection: true, elliottTriangle: true, elliottDoubleCombo: true, elliottTripleCombo: true,
}

const PLACEHOLDER: Partial<Record<Drawing['kind'], string>> = { callout: '말풍선', comment: '코멘트', signpost: '표지판' }

/** 글 상자의 크기(줄마다 재서 가장 긴 줄에 맞춘다). */
interface TextLayout {
  lines: string[]
  size: number
  lineHeight: number
  w: number
  h: number
}

const PAD_X = 8
const PAD_Y = 6

function textLayout(d: Drawing): TextLayout {
  const size = d.style.fontSize ?? 14
  const lines = (d.style.text || PLACEHOLDER[d.kind] || '텍스트').split('\n')
  const m = measureFont(size)
  let textW = 0
  for (const l of lines) textW = Math.max(textW, m ? m.measureText(l).width : l.length * size * 0.6)
  const lineHeight = Math.round(size * 1.35)
  return { lines, size, lineHeight, w: Math.ceil(textW) + PAD_X * 2, h: lines.length * lineHeight + PAD_Y * 2 }
}

/** 글을 품는 그림(말풍선·코멘트·표지판)의 상자. 그리기와 잡기, 편집기 위치가 같은 자리를 쓴다. */
export function textBoxB(d: Drawing, pts: (Pt | null)[]): (TextLayout & { x: number; y: number }) | null {
  const t = textLayout(d)
  if (d.kind === 'callout') {
    const b = pts[1]
    return b ? { ...t, x: b.x, y: b.y } : null
  }
  const a = pts[0]
  if (!a) return null
  if (d.kind === 'comment') return { ...t, x: a.x, y: a.y - 12 - t.h }
  if (d.kind === 'signpost') return { ...t, x: a.x - t.w / 2, y: a.y - t.h / 2 }
  return null
}

/**
 * 봉에서 자리가 나오는 앵커 — 앵커 VWAP 은 앵커 봉의 VWAP 시작값, 앵커 볼륨 프로파일은 프로파일 위 끝,
 * 바 패턴의 끝점은 복사한 마지막 봉 종가, 시간 주기의 둘째 점은 기준선 위. 해당 없으면 null.
 */
export function anchorPointsB(d: Drawing, coords: Coords): DrawingPoint[] | null {
  switch (d.kind) {
    case 'anchoredVwap': {
      const vw = vwapFor(d, coords.candles)
      return vw ? [{ time: coords.candles[vw.start].time, price: vw.vwap[0] }] : null
    }
    case 'anchoredVolumeProfile': {
      const vp = anchoredProfileFor(d, coords.candles)
      if (!vp) return null
      const bar = coords.candles[barIndexAt(coords.candles, d.points[0].time)]
      return [{ time: bar.time, price: vp.rows[vp.rows.length - 1].high }]
    }
    case 'barsPattern': {
      const bars = patternBars(d)
      const [a, b] = d.points
      if (!a || !b || bars.length === 0) return null
      return [a, { time: b.time, price: a.price + bars[bars.length - 1][3] }]
    }
    case 'timeCycles': {
      const [a, b] = d.points
      return a && b ? [a, { time: b.time, price: a.price }] : null
    }
    default:
      return null
  }
}

/**
 * 클릭한 점을 최종 앵커로. 앵커 VWAP·앵커 볼륨 프로파일은 누른 봉의 시각에 붙이고, 바 패턴은 고른 원본 구간 바로 뒤에
 * 복사본을 놓는다(첫 봉 시가 = 원본 마지막 종가 — 지금 흐름에 이어 붙는다). 봉이 없어 만들 수 없으면 null.
 */
export function buildPointsB(kind: Drawing['kind'], clicked: DrawingPoint[], coords: Coords): DrawingPoint[] | null {
  const candles = coords.candles
  if (kind === 'anchoredVwap' || kind === 'anchoredVolumeProfile') {
    const a = clicked[0]
    if (!a || candles.length === 0) return null
    return [{ time: candles[barIndexAt(candles, a.time)].time, price: a.price }]
  }
  if (kind !== 'barsPattern') return clicked
  const [a, b] = clicked
  const range = a && b ? barsSourceRange(candles, a.time, b.time) : null
  if (!range) return null
  const n = range[1] - range[0] + 1
  const first = candles[range[0]].open
  const lastClose = candles[range[1]].close
  return [
    { time: coords.logicalToTime(range[1] + 1), price: lastClose },
    { time: coords.logicalToTime(range[1] + n), price: lastClose + lastClose - first },
  ]
}

function polyline(ctx: CanvasRenderingContext2D, pts: (Pt | null)[]): void {
  ctx.beginPath()
  let started = false
  for (const p of pts) {
    if (!p) continue
    if (started) ctx.lineTo(p.x, p.y)
    else ctx.moveTo(p.x, p.y)
    started = true
  }
  if (started) ctx.stroke()
}

function fillPolygon(ctx: CanvasRenderingContext2D, pts: Pt[], color: string): void {
  ctx.fillStyle = color
  ctx.beginPath()
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
  ctx.fill()
}

function dashed(ctx: CanvasRenderingContext2D, s: DrawingStyle, a: Pt, b: Pt): void {
  ctx.save()
  ctx.setLineDash([4, 4])
  ctx.strokeStyle = withAlpha(s.color, 0.7)
  ctx.lineWidth = 1
  line(ctx, a, b)
  ctx.restore()
}

/** 꼭짓점이 이웃보다 위(화면에서 작은 y)면 라벨을 위에, 아니면 아래에 둔다. */
function isPeak(pts: (Pt | null)[], i: number): boolean {
  const p = pts[i]
  if (!p) return true
  const ns = [pts[i - 1], pts[i + 1]].filter((q): q is Pt => !!q)
  if (ns.length === 0) return true
  return p.y <= ns.reduce((sum, q) => sum + q.y, 0) / ns.length
}

function pointNames(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const names = POINT_NAMES[d.kind]
  if (!names) return
  const { ctx } = rc
  const elliott = ELLIOTT[d.kind] === true
  pts.forEach((p, i) => {
    const name = names[i]
    if (!p || !name) return
    const up = isPeak(pts, i)
    if (elliott) {
      ctx.save()
      ctx.setLineDash([])
      ctx.font = `bold 12px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = up ? 'bottom' : 'top'
      ctx.fillStyle = d.style.color
      ctx.fillText(name, p.x, up ? p.y - 6 : p.y + 6)
      ctx.restore()
    } else {
      label(ctx, name, p.x, up ? p.y - 16 : p.y + 16, withAlpha(d.style.color, 0.9), undefined, 'center')
    }
  })
}

function drawPattern(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx } = rc
  const s = d.style
  for (const [i, j, k] of FILL_TRIANGLES[d.kind] ?? []) {
    const a = pts[i]
    const b = pts[j]
    const c = pts[k]
    if (a && b && c && s.fillColor) fillPolygon(ctx, [a, b, c], s.fillColor)
  }
  if (d.kind === 'headShoulders') drawNeckline(rc, d, pts)
  if (d.kind === 'trianglePattern') drawTriangleLines(rc, d, pts)
  stroke(ctx, s)
  polyline(ctx, pts)
  const prices = d.points.map((p) => p.price)
  for (const [i, j, n0, n1, d0, d1] of RATIO_LINES[d.kind] ?? []) {
    const a = pts[i]
    const b = pts[j]
    if (!a || !b || prices[n1] === undefined || prices[d1] === undefined) continue
    dashed(ctx, s, a, b)
    const den = prices[d1] - prices[d0]
    if (den === 0) continue
    const ratio = Math.abs(prices[n1] - prices[n0]) / Math.abs(den)
    label(ctx, ratio.toFixed(3), (a.x + b.x) / 2, (a.y + b.y) / 2, withAlpha(s.color, 0.85), undefined, 'center')
  }
  pointNames(rc, d, pts)
}

/** 머리어깨 목선: 두 목 점(2·4)을 지나 양 끝 점(0·6)의 x 까지. */
function necklineOf(pts: (Pt | null)[]): [Pt, Pt] | null {
  const n1 = pts[2]
  const n2 = pts[4]
  if (!n1 || !n2) return null
  const x0 = Math.min(pts[0]?.x ?? n1.x, n1.x)
  const x1 = Math.max(pts[6]?.x ?? n2.x, n2.x)
  const slope = n2.x === n1.x ? 0 : (n2.y - n1.y) / (n2.x - n1.x)
  return [
    { x: x0, y: n1.y + slope * (x0 - n1.x) },
    { x: x1, y: n1.y + slope * (x1 - n1.x) },
  ]
}

function drawNeckline(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const neck = necklineOf(pts)
  if (!neck) return
  stroke(rc.ctx, d.style)
  line(rc.ctx, neck[0], neck[1])
}

/** 삼각형 패턴의 두 추세선(A–C, B–D)을 만나는 자리까지(너무 멀면 마지막 점 x 까지) 늘인다. */
function triangleLines(pts: (Pt | null)[]): [[Pt, Pt], [Pt, Pt]] | null {
  const [a, b, c, dd] = pts
  if (!a || !b || !c || !dd) return null
  const s1 = c.x === a.x ? 0 : (c.y - a.y) / (c.x - a.x)
  const s2 = dd.x === b.x ? 0 : (dd.y - b.y) / (dd.x - b.x)
  const b1 = a.y - s1 * a.x
  const b2 = b.y - s2 * b.x
  const lastX = Math.max(c.x, dd.x)
  const span = lastX - Math.min(a.x, b.x)
  let endX = lastX
  if (s1 !== s2) {
    const ix = (b2 - b1) / (s1 - s2)
    if (ix > lastX && ix < lastX + span * 3) endX = ix
  }
  return [
    [a, { x: endX, y: s1 * endX + b1 }],
    [b, { x: endX, y: s2 * endX + b2 }],
  ]
}

function drawTriangleLines(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const tl = triangleLines(pts)
  if (!tl) return
  const [[a, a2], [b, b2]] = tl
  if (d.style.fillColor) fillPolygon(rc.ctx, [a, a2, b2, b], d.style.fillColor)
  stroke(rc.ctx, d.style)
  line(rc.ctx, a, a2)
  line(rc.ctx, b, b2)
}

/** 주기선: 첫 점에서 두 점 간격(봉 수)마다 오른쪽으로 세로선. */
function cyclicXs(d: Drawing, coords: Coords, width: number): number[] {
  const [a, b] = d.points
  const l0 = a ? coords.timeToLogical(a.time) : null
  const l1 = b ? coords.timeToLogical(b.time) : null
  if (l0 === null || l1 === null) return []
  const step = Math.abs(l1 - l0)
  const x0 = coords.logicalToX(l0)
  const x1 = coords.logicalToX(l0 + step)
  if (x0 === null || x1 === null) return []
  const px = x1 - x0
  if (px < 2) return [x0]
  const out: number[] = []
  // 화면 왼쪽 밖의 선은 건너뛰고 오른쪽 끝에서 멈춘다.
  const first = x0 < 0 ? Math.ceil(-x0 / px) : 0
  for (let k = first; k < first + 2000; k++) {
    const x = x0 + k * px
    if (x > width) break
    out.push(x)
  }
  return out
}

/** 시간 주기: 두 점 간격을 지름으로 하는 반원을 기준선 위로 양쪽에 잇는다. [중심 x, 반지름]. */
function cycleArcs(pts: (Pt | null)[], width: number): { cx: number; r: number; y: number }[] {
  const [a, b] = pts
  if (!a || !b) return []
  const dx = Math.abs(b.x - a.x)
  if (dx < 2) return []
  const r = dx / 2
  const start = Math.min(a.x, b.x)
  const kMin = Math.floor(-start / dx) - 1
  const kMax = Math.ceil((width - start) / dx)
  const out: { cx: number; r: number; y: number }[] = []
  for (let k = Math.max(kMin, -2000); k <= Math.min(kMax, 2000); k++) out.push({ cx: start + k * dx + r, r, y: a.y })
  return out
}

/** 사인선: 첫 점이 마루(또는 골), 둘째 점이 반주기 뒤의 반대편 — 화면 전체 폭으로. */
function sineY(pts: (Pt | null)[], x: number): number | null {
  const [a, b] = pts
  if (!a || !b || a.x === b.x) return null
  const mid = (a.y + b.y) / 2
  const amp = (a.y - b.y) / 2
  return mid + amp * Math.cos((Math.PI * (x - a.x)) / (b.x - a.x))
}

function drawTextBox(rc: RenderScope, d: Drawing, box: TextLayout & { x: number; y: number }): void {
  const { ctx, palette } = rc
  const s = d.style
  ctx.beginPath()
  ctx.roundRect(box.x, box.y, box.w, box.h, 4)
  ctx.fillStyle = palette.background
  ctx.fill()
  ctx.fillStyle = fillOf(s)
  ctx.fill()
  stroke(ctx, s)
  ctx.lineWidth = Math.min(s.lineWidth, 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.font = `${box.size}px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = s.text ? palette.text : palette.textDim
  box.lines.forEach((l, i) => ctx.fillText(l, box.x + PAD_X, box.y + PAD_Y + box.lineHeight * (i + 0.5)))
}

/** 말풍선 꼬리: 상자 가운데에서 앵커로 뻗는 삼각형(상자 아래에 칠해 이음매가 보이지 않는다). */
function drawTail(rc: RenderScope, d: Drawing, tip: Pt, base: Pt, half: number): void {
  const { ctx, palette } = rc
  const dx = tip.x - base.x
  const dy = tip.y - base.y
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * half
  const ny = (dx / len) * half
  const tri = [tip, { x: base.x + nx, y: base.y + ny }, { x: base.x - nx, y: base.y - ny }]
  fillPolygon(ctx, tri, palette.background)
  fillPolygon(ctx, tri, fillOf(d.style))
  ctx.beginPath()
  ctx.moveTo(tri[1].x, tri[1].y)
  ctx.lineTo(tip.x, tip.y)
  ctx.lineTo(tri[2].x, tri[2].y)
  stroke(ctx, d.style)
  ctx.lineWidth = Math.min(d.style.lineWidth, 2)
  ctx.stroke()
}

/** 가격 라벨 상자: 앵커 오른쪽 위, 앵커를 가리키는 꼬리. */
function priceLabelBox(a: Pt, text: string): { x: number; y: number; w: number; h: number } {
  const m = measureFont(12)
  const w = (m ? m.measureText(text).width : text.length * 7) + 14
  return { x: a.x - 6, y: a.y - 12 - 22, w, h: 22 }
}

/** 표지판 기둥이 닿는 봉 끝(상자가 봉 위면 고가, 아래면 저가). 봉이 없거나 상자가 봉 안이면 null. */
function signpostFoot(d: Drawing, coords: Coords, a: Pt): Pt | null {
  const candles = coords.candles
  const n = candles.length
  const t = d.points[0].time
  if (n === 0 || t > candles[n - 1].time) return null
  const bar = candles[barIndexAt(candles, t)]
  const x = coords.timeToX(bar.time)
  const hi = coords.priceToY(bar.high)
  const lo = coords.priceToY(bar.low)
  if (x === null || hi === null || lo === null) return null
  if (a.y < hi) return { x, y: hi }
  if (a.y > lo) return { x, y: lo }
  return null
}

function flagRect(a: Pt): { x: number; y: number; w: number; h: number } {
  return { x: a.x, y: a.y - 26, w: 16, h: 11 }
}

function drawForecast(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx, coords, palette } = rc
  const [a, b] = pts
  if (!a || !b) return
  const s = d.style
  stroke(ctx, s)
  line(ctx, a, b)
  ctx.setLineDash([])
  for (const p of [a, b]) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = palette.background
    ctx.fill()
    ctx.stroke()
  }
  const [p0, p1] = d.points
  if (!p1) return
  const dPrice = p1.price - p0.price
  const outcome = forecastOutcome(coords.candles, p0, p1)
  const status = outcome === 'success' ? '성공' : outcome === 'failure' ? '실패' : '진행 중'
  const bg = outcome === 'success' ? palette.up : outcome === 'failure' ? palette.down : s.color
  const text = `${dPrice >= 0 ? '+' : ''}${coords.format(dPrice)} (${pct(p0.price, p1.price)})\n${coords.barCount(p0.time, p1.time)} 봉 · ${formatSpan(p1.time - p0.time)}\n${status}`
  const right = b.x >= a.x
  label(ctx, text, b.x + (right ? 10 : -10), b.y, withAlpha(bg, 0.9), undefined, right ? 'left' : 'right')
}

function drawProjection(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx } = rc
  const [a, b, c] = pts
  if (!a || !b) return
  const s = d.style
  if (c && s.fillColor) fillPolygon(ctx, [a, b, c], s.fillColor)
  stroke(ctx, s)
  polyline(ctx, [a, b, c ?? null])
  if (!c) return
  // B 를 중심으로 BA 방향에서 BC 방향까지 BC 길이의 호.
  const r = Math.hypot(c.x - b.x, c.y - b.y)
  const angA = Math.atan2(a.y - b.y, a.x - b.x)
  const angC = Math.atan2(c.y - b.y, c.x - b.x)
  let sweep = angC - angA
  while (sweep > Math.PI) sweep -= Math.PI * 2
  while (sweep < -Math.PI) sweep += Math.PI * 2
  ctx.save()
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.arc(b.x, b.y, r, angA, angA + sweep, sweep < 0)
  ctx.stroke()
  ctx.restore()
  const [p0, p1, p2] = d.points
  const leg = p1.price - p0.price
  if (leg === 0) return
  const ratio = (Math.abs(p2.price - p1.price) / Math.abs(leg)) * 100
  label(ctx, `${ratio.toFixed(1)}%`, c.x + 8, c.y, withAlpha(s.color, 0.9))
}

/** 바 패턴 봉 하나하나의 자리: 논리 인덱스를 두 점 사이에 고르게 놓는다(끝점을 끌면 가로로 늘고 준다). */
function barsLayout(d: Drawing, coords: Coords): { x: number; o: number; h: number; l: number; c: number }[] {
  const bars = patternBars(d)
  const [a, b] = d.points
  if (!a || !b || bars.length === 0) return []
  const l0 = coords.timeToLogical(a.time)
  const l1 = coords.timeToLogical(b.time)
  if (l0 === null || l1 === null) return []
  const n = bars.length
  const out: { x: number; o: number; h: number; l: number; c: number }[] = []
  for (let i = 0; i < n; i++) {
    const x = coords.logicalToX(n === 1 ? l0 : l0 + (i * (l1 - l0)) / (n - 1))
    const [o, h, l, c] = bars[i].map((v) => coords.priceToY(a.price + v))
    if (x === null || o === null || h === null || l === null || c === null) continue
    out.push({ x, o, h, l, c })
  }
  return out
}

function drawBarsPattern(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx, coords } = rc
  const s = d.style
  const layout = barsLayout(d, coords)
  if (layout.length === 0) {
    // 만드는 중(원본 구간 고르기): 고른 구간만 옅은 상자로.
    const [a, b] = pts
    if (!a || !b) return
    ctx.fillStyle = withAlpha(s.color, 0.1)
    ctx.fillRect(Math.min(a.x, b.x), 0, Math.abs(b.x - a.x), rc.height)
    return
  }
  const gap = layout.length > 1 ? Math.abs(layout[1].x - layout[0].x) : 8
  const bodyW = Math.max(1, Math.min(gap * 0.7, 14))
  ctx.save()
  ctx.setLineDash([])
  ctx.strokeStyle = withAlpha(s.color, 0.8)
  ctx.lineWidth = 1
  for (const bar of layout) {
    line(ctx, { x: bar.x, y: bar.h }, { x: bar.x, y: bar.l })
    const top = Math.min(bar.o, bar.c)
    const h = Math.max(1, Math.abs(bar.o - bar.c))
    // 오른 봉(종가가 위)은 속이 빈 몸통, 내린 봉은 채운 몸통.
    ctx.fillStyle = bar.c <= bar.o ? rc.palette.background : withAlpha(s.color, 0.6)
    ctx.fillRect(bar.x - bodyW / 2, top, bodyW, h)
    ctx.strokeRect(bar.x - bodyW / 2, top, bodyW, h)
  }
  ctx.restore()
}

function barsBounds(d: Drawing, coords: Coords): { a: Pt; b: Pt } | null {
  const layout = barsLayout(d, coords)
  if (layout.length === 0) return null
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const bar of layout) {
    x0 = Math.min(x0, bar.x)
    x1 = Math.max(x1, bar.x)
    y0 = Math.min(y0, bar.h)
    y1 = Math.max(y1, bar.l)
  }
  return { a: { x: x0 - 4, y: y0 }, b: { x: x1 + 4, y: y1 } }
}

/** 앵커 VWAP 과 밴드의 화면 점(보이는 봉만). lines[0] 이 VWAP, 그 뒤로 +1σ·−1σ·+2σ·−2σ. */
function vwapLines(d: Drawing, coords: Coords, width: number): Pt[][] {
  const vw = vwapFor(d, coords.candles)
  if (!vw) return []
  const bands = vwapBands(d)
  const mults = [0, 1, -1, 2, -2].slice(0, 1 + bands * 2)
  const lines: Pt[][] = mults.map(() => [])
  for (let i = 0; i < vw.vwap.length; i++) {
    const x = coords.logicalToX(vw.start + i)
    if (x === null || x < -20) continue
    mults.forEach((m, k) => {
      const y = coords.priceToY(vw.vwap[i] + m * vw.dev[i])
      if (y !== null) lines[k].push({ x, y })
    })
    if (x > width + 20) break
  }
  return lines
}

function drawVwap(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx, coords, width } = rc
  const s = d.style
  const lines = vwapLines(d, coords, width)
  if (lines.length === 0) {
    // 앵커가 마지막 봉 뒤(미래) — 누른 자리만 표시한다.
    const a = pts[0]
    if (!a) return
    stroke(ctx, s)
    ctx.beginPath()
    ctx.arc(a.x, a.y, 4, 0, Math.PI * 2)
    ctx.stroke()
    return
  }
  const outer = lines.length >= 5 ? [lines[3], lines[4]] : lines.length >= 3 ? [lines[1], lines[2]] : null
  if (outer && s.fillColor && outer[0].length > 1) {
    fillPolygon(ctx, [...outer[0], ...[...outer[1]].reverse()], s.fillColor)
  }
  for (let k = 1; k < lines.length; k++) {
    stroke(ctx, s, withAlpha(s.color, 0.7))
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    polyline(ctx, lines[k])
  }
  stroke(ctx, s)
  polyline(ctx, lines[0])
  const last = lines[0][lines[0].length - 1]
  const vw = vwapFor(d, coords.candles)
  if (!last || !vw) return
  // 마지막 봉이 오른쪽 끝에 붙어 있으면 값 상자를 선 왼쪽 위에 둔다(가격 축에 잘리지 않게).
  const text = `VWAP ${coords.format(vw.vwap[vw.vwap.length - 1])}`
  const inside = last.x > width - 90
  const x = Math.min(last.x, width)
  label(ctx, text, inside ? x - 6 : x + 6, inside ? last.y - 16 : last.y, withAlpha(s.color, 0.9), undefined, inside ? 'right' : 'left')
}

/** 앵커 볼륨 프로파일의 상자(앵커 봉 ~ 마지막 봉, 프로파일 가격 폭). */
function anchoredProfileBox(d: Drawing, coords: Coords): { x: number; y: number; w: number; h: number } | null {
  const vp = anchoredProfileFor(d, coords.candles)
  if (!vp) return null
  const candles = coords.candles
  const x0 = coords.timeToX(candles[barIndexAt(candles, d.points[0].time)].time)
  const x1 = coords.timeToX(candles[candles.length - 1].time)
  const yTop = coords.priceToY(vp.rows[vp.rows.length - 1].high)
  const yBottom = coords.priceToY(vp.rows[0].low)
  if (x0 === null || x1 === null || yTop === null || yBottom === null) return null
  return { x: x0, y: Math.min(yTop, yBottom), w: Math.max(1, x1 - x0), h: Math.abs(yBottom - yTop) }
}

function drawAnchoredProfile(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx, coords, palette } = rc
  const s = d.style
  const vp = anchoredProfileFor(d, coords.candles)
  const box = anchoredProfileBox(d, coords)
  if (!vp || !box) {
    const a = pts[0]
    if (!a) return
    stroke(ctx, s)
    ctx.setLineDash([4, 4])
    line(ctx, { x: a.x, y: 0 }, { x: a.x, y: rc.height })
    return
  }
  ctx.fillStyle = withAlpha(s.color, 0.06)
  ctx.fillRect(box.x, box.y, box.w, box.h)
  stroke(ctx, s, withAlpha(s.color, 0.5))
  ctx.strokeRect(box.x, box.y, box.w, box.h)
  drawVolumeProfile(
    ctx,
    vp,
    { priceToY: (price) => coords.priceToY(price), x: box.x, width: profileWidth(Math.max(box.w, 60)), direction: 'right' },
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
  line(ctx, { x: box.x, y: pocY }, { x: box.x + box.w, y: pocY })
}

/** 묶음 B 그림을 그린다. 다른 종류면 아무것도 하지 않는다. */
export function renderGroupB(rc: RenderScope, d: Drawing, pts: (Pt | null)[]): void {
  const { ctx, coords, width, height } = rc
  const s = d.style
  switch (d.kind) {
    case 'xabcd':
    case 'cypher':
    case 'abcd':
    case 'headShoulders':
    case 'trianglePattern':
    case 'threeDrives':
    case 'elliottImpulse':
    case 'elliottCorrection':
    case 'elliottTriangle':
    case 'elliottDoubleCombo':
    case 'elliottTripleCombo':
      drawPattern(rc, d, pts)
      break
    case 'cyclicLines': {
      stroke(ctx, s)
      for (const x of cyclicXs(d, coords, width)) line(ctx, { x, y: 0 }, { x, y: height })
      break
    }
    case 'timeCycles': {
      stroke(ctx, s)
      for (const arc of cycleArcs(pts, width)) {
        ctx.beginPath()
        ctx.arc(arc.cx, arc.y, arc.r, Math.PI, 0)
        ctx.stroke()
      }
      const a = pts[0]
      if (a) line(ctx, { x: 0, y: a.y }, { x: width, y: a.y })
      break
    }
    case 'sineLine': {
      stroke(ctx, s)
      ctx.beginPath()
      for (let x = 0; x <= width; x += 2) {
        const y = sineY(pts, x)
        if (y === null) break
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      break
    }
    case 'callout':
    case 'comment':
    case 'signpost': {
      const box = textBoxB(d, pts)
      const a = pts[0]
      if (!box || !a) break
      if (d.kind === 'callout') drawTail(rc, d, a, { x: box.x + box.w / 2, y: box.y + box.h / 2 }, Math.min(10, box.h / 3))
      if (d.kind === 'comment') drawTail(rc, d, a, { x: a.x + 10, y: box.y + box.h - 2 }, 6)
      if (d.kind === 'signpost') {
        const foot = signpostFoot(d, coords, a)
        if (foot) {
          stroke(ctx, s)
          line(ctx, { x: a.x, y: foot.y < a.y ? box.y : box.y + box.h }, { x: a.x, y: foot.y })
          ctx.setLineDash([])
          ctx.fillStyle = s.color
          ctx.beginPath()
          ctx.arc(a.x, foot.y, 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      drawTextBox(rc, d, box)
      break
    }
    case 'priceLabel': {
      const a = pts[0]
      if (!a) break
      const text = coords.format(d.points[0].price)
      const box = priceLabelBox(a, text)
      fillPolygon(ctx, [a, { x: box.x + 6, y: box.y + box.h }, { x: box.x + 16, y: box.y + box.h }], s.color)
      ctx.beginPath()
      ctx.roundRect(box.x, box.y, box.w, box.h, 4)
      ctx.fillStyle = s.color
      ctx.fill()
      ctx.font = `12px ${FONT}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = readableTextOn(s.color)
      ctx.fillText(text, box.x + 7, box.y + box.h / 2)
      break
    }
    case 'priceNote': {
      const [a, b] = pts
      if (!a) break
      stroke(ctx, s)
      if (b) line(ctx, a, b)
      ctx.setLineDash([])
      ctx.fillStyle = s.color
      ctx.beginPath()
      ctx.arc(a.x, a.y, 3.5, 0, Math.PI * 2)
      ctx.fill()
      if (b) {
        const right = b.x >= a.x
        label(ctx, coords.format(d.points[0].price), b.x + (right ? 4 : -4), b.y, withAlpha(s.color, 0.95), undefined, right ? 'left' : 'right')
      }
      break
    }
    case 'flagMark': {
      const a = pts[0]
      if (!a) break
      const f = flagRect(a)
      ctx.setLineDash([])
      ctx.strokeStyle = s.color
      ctx.lineWidth = 2
      line(ctx, a, { x: a.x, y: f.y })
      fillPolygon(ctx, [{ x: f.x, y: f.y }, { x: f.x + f.w, y: f.y + f.h / 2 - 2 }, { x: f.x + f.w * 0.7, y: f.y + f.h }, { x: f.x, y: f.y + f.h }], s.color)
      break
    }
    case 'forecast':
      drawForecast(rc, d, pts)
      break
    case 'projection':
      drawProjection(rc, d, pts)
      break
    case 'barsPattern':
      drawBarsPattern(rc, d, pts)
      break
    case 'anchoredVwap':
      drawVwap(rc, d, pts)
      break
    case 'anchoredVolumeProfile':
      drawAnchoredProfile(rc, d, pts)
      break
  }
}

function inBox(p: Pt, box: { x: number; y: number; w: number; h: number }, tol: number): boolean {
  return pointInRect(p, { x: box.x, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, tol)
}

/** 묶음 B 그림의 몸통(선·채움·상자)을 눌렀는지. 다른 종류면 false. */
export function hitGroupB(d: Drawing, coords: Coords, pts: (Pt | null)[], p: Pt, tol: number): boolean {
  const valid = pts.filter((x): x is Pt => x !== null)
  const width = coords.paneSize().width
  switch (d.kind) {
    case 'xabcd':
    case 'cypher':
    case 'abcd':
    case 'headShoulders':
    case 'trianglePattern':
    case 'threeDrives':
    case 'elliottImpulse':
    case 'elliottCorrection':
    case 'elliottTriangle':
    case 'elliottDoubleCombo':
    case 'elliottTripleCombo': {
      if (valid.length >= 2 && distToPolyline(p, valid) <= tol) return true
      for (const [i, j, k] of FILL_TRIANGLES[d.kind] ?? []) {
        const a = pts[i]
        const b = pts[j]
        const c = pts[k]
        if (a && b && c && d.style.fillColor && pointInTriangle(p, a, b, c)) return true
      }
      if (d.kind === 'headShoulders') {
        const neck = necklineOf(pts)
        return !!neck && distToSegment(p, neck[0], neck[1]) <= tol
      }
      if (d.kind === 'trianglePattern') {
        const tl = triangleLines(pts)
        return !!tl && (distToSegment(p, tl[0][0], tl[0][1]) <= tol || distToSegment(p, tl[1][0], tl[1][1]) <= tol)
      }
      return false
    }
    case 'cyclicLines':
      return cyclicXs(d, coords, width).some((x) => Math.abs(p.x - x) <= tol)
    case 'timeCycles':
      return cycleArcs(pts, width).some((arc) => p.y <= arc.y + tol && Math.abs(Math.hypot(p.x - arc.cx, p.y - arc.y) - arc.r) <= tol)
    case 'sineLine': {
      // 기울기가 가파른 자리도 잡히게 좌우 몇 px 의 곡선 점까지 본다.
      for (let dx = -tol; dx <= tol; dx += 2) {
        const y = sineY(pts, p.x + dx)
        if (y !== null && Math.hypot(dx, p.y - y) <= tol) return true
      }
      return false
    }
    case 'callout':
    case 'comment':
    case 'signpost': {
      const box = textBoxB(d, pts)
      if (!box) return false
      if (inBox(p, box, tol)) return true
      const a = pts[0]
      return d.kind === 'callout' && !!a && distToSegment(p, a, { x: box.x + box.w / 2, y: box.y + box.h / 2 }) <= tol
    }
    case 'priceLabel': {
      const a = pts[0]
      return !!a && inBox(p, priceLabelBox(a, coords.format(d.points[0].price)), tol)
    }
    case 'priceNote': {
      const [a, b] = pts
      if (!a || !b) return false
      if (distToSegment(p, a, b) <= tol) return true
      // 값 상자(끝점 옆 약 80px).
      const right = b.x >= a.x
      return Math.abs(p.y - b.y) <= 11 && (right ? p.x >= b.x && p.x <= b.x + 90 : p.x <= b.x && p.x >= b.x - 90)
    }
    case 'flagMark': {
      const a = pts[0]
      if (!a) return false
      const f = flagRect(a)
      return inBox(p, { x: a.x - 3, y: f.y, w: f.w + 3, h: a.y - f.y }, tol)
    }
    case 'forecast': {
      const [a, b] = pts
      return !!a && !!b && distToSegment(p, a, b) <= tol
    }
    case 'projection': {
      const [a, b, c] = pts
      if (!a || !b) return false
      if (distToSegment(p, a, b) <= tol) return true
      return !!c && (distToSegment(p, b, c) <= tol || (!!d.style.fillColor && pointInTriangle(p, a, b, c)))
    }
    case 'barsPattern': {
      const bb = barsBounds(d, coords)
      return !!bb && pointInRect(p, bb.a, bb.b, tol)
    }
    case 'anchoredVwap':
      return vwapLines(d, coords, width).some((ln) => ln.length > 1 && distToPolyline(p, ln) <= tol)
    case 'anchoredVolumeProfile': {
      const box = anchoredProfileBox(d, coords)
      return !!box && inBox(p, box, tol)
    }
    default:
      return false
  }
}
