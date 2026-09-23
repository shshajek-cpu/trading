import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import type { Candle, Interval } from '../../lib/binance'
import type { ChartPalette } from '../../lib/theme'
import { DRAWING_PALETTE } from '../../lib/theme'
import {
  defaultStyle,
  type Drawing,
  type DrawingKind,
  type DrawingPoint,
  type DrawingStyle,
  type DrawingTool,
  type MagnetMode,
  type NewDrawing,
} from '../../lib/drawings'
import { Coords } from './coords'
import { pickDrawing } from './hitTest'
import type { Pt } from './geometry'
import { simplify } from './geometry'
import { buildPoints, cloneOffset, requiredPoints } from './builders'
import { copyDrawing, pasteDrawing } from './clipboard'
import type { ChartMenuRequest } from '../../lib/chartMenu'
import { INTERVAL_SECONDS } from '../../lib/intervals'
import { DrawingPrimitive } from './DrawingPrimitive'
import { SelectedToolbar } from './SelectedToolbar'
import { hasOpenOverlay } from '../../hooks/useBackClose'
import './DrawingOverlay.css'

export interface DrawingOverlayProps {
  chart: IChartApi
  series: ISeriesApi<SeriesType>
  candles: Candle[]
  interval: Interval
  symbol: string
  drawings: Drawing[]
  tool: DrawingTool
  magnet: MagnetMode
  stayInDrawingMode: boolean
  locked: boolean
  hidden: boolean
  enabled: boolean
  palette: ChartPalette
  onCreate: (d: NewDrawing) => string
  onUpdate: (id: string, patch: Partial<Omit<Drawing, 'id'>>, opts?: { history?: boolean }) => void
  onRemove: (id: string) => void
  onToolDone: () => void
  /** 우클릭 — 누른 자리(그림·차트·가격축·시간축)를 알려 준다. 비활성 칸에서도 받는다. */
  onContextMenu?: (req: ChartMenuRequest) => void
}

const CURSOR_TOOLS: Record<string, true> = { cross: true, dot: true, arrow: true, eraser: true }
const DRAG_THRESHOLD = 4

function isCursorTool(tool: DrawingTool): boolean {
  return CURSOR_TOOLS[tool] === true
}

function isDrawingKind(tool: DrawingTool): tool is DrawingKind {
  return !isCursorTool(tool) && tool !== 'measure' && tool !== 'zoom'
}

function nearestBar(candles: Candle[], time: number): Candle | null {
  const n = candles.length
  if (n === 0) return null
  if (time <= candles[0].time) return candles[0]
  if (time >= candles[n - 1].time) return candles[n - 1]
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (candles[mid].time <= time) lo = mid
    else hi = mid
  }
  return time - candles[lo].time <= candles[hi].time - time ? candles[lo] : candles[hi]
}

function makePoint(coords: Coords, candles: Candle[], p: Pt, mode: MagnetMode): DrawingPoint {
  const time = coords.xToTime(p.x) ?? 0
  const price = coords.yToPrice(p.y) ?? 0
  if (mode === 'off' || candles.length === 0) return { time, price }
  const bar = nearestBar(candles, time)
  if (!bar) return { time, price }
  const ohlc = [bar.open, bar.high, bar.low, bar.close]
  if (mode === 'strong') {
    let best = bar.close
    let bd = Infinity
    for (const v of ohlc) {
      const d = Math.abs(v - price)
      if (d < bd) {
        bd = d
        best = v
      }
    }
    return { time: bar.time, price: best }
  }
  // weak: 10px 안에서만 OHLC 에 붙인다.
  const barX = coords.timeToX(bar.time)
  let best: DrawingPoint | null = null
  let bd = Infinity
  for (const v of ohlc) {
    const y = coords.priceToY(v)
    if (y === null || barX === null) continue
    const dist = Math.hypot(p.x - barX, p.y - y)
    if (dist < bd) {
      bd = dist
      best = { time: bar.time, price: v }
    }
  }
  return best && bd <= 10 ? best : { time, price }
}

function previewDrawing(symbol: string, kind: DrawingKind, points: DrawingPoint[], style: DrawingStyle): Drawing {
  return {
    id: '__preview__',
    symbol,
    kind,
    points,
    style,
    locked: false,
    hidden: false,
    alert: false,
    fired: false,
    createdAt: 0,
  }
}

type PressMode = 'create' | 'brush' | 'move' | 'anchor' | 'measure' | 'zoom'

interface Press {
  mode: PressMode
  pointerId: number
  startPt: Pt
  startPoint: DrawingPoint
  moved: boolean
  // create/brush
  brush?: DrawingPoint[]
  // move/anchor
  id?: string
  index?: number
  original?: DrawingPoint[]
  last?: DrawingPoint[]
  // zoom
  curPt?: Pt
}

export function DrawingOverlay(props: DrawingOverlayProps) {
  const {
    chart,
    series,
    candles,
    interval,
    symbol,
    drawings,
    tool,
    magnet,
    stayInDrawingMode,
    locked,
    hidden,
    enabled,
    palette,
    onCreate,
    onUpdate,
    onRemove,
    onToolDone,
    onContextMenu,
  } = props

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Drawing | null>(null)
  const [zoomBox, setZoomBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [textEdit, setTextEdit] = useState<
    { mode: 'create' | 'edit'; id?: string; dp: DrawingPoint; x: number; y: number; value: string } | null
  >(null)

  const primitiveRef = useRef<DrawingPrimitive | null>(null)
  const pressRef = useRef<Press | null>(null)
  const creatingRef = useRef<{ kind: DrawingKind; committed: DrawingPoint[] } | null>(null)
  const measureRef = useRef<Drawing | null>(null)
  const textEditRef = useRef(textEdit)
  textEditRef.current = textEdit

  // 최신 값을 이벤트 핸들러에서 읽기 위한 refs.
  const latest = useRef({
    chart, series, candles, interval, symbol, drawings, tool, magnet,
    stay: stayInDrawingMode, locked, hidden, enabled, selectedId,
  })
  latest.current = {
    chart, series, candles, interval, symbol, drawings, tool, magnet,
    stay: stayInDrawingMode, locked, hidden, enabled, selectedId,
  }

  // 부모가 렌더마다 새 콜백을 넘겨도 입력 effect 가 다시 걸리지 않게 ref 로 읽는다.
  // 다시 걸리면 cleanup 의 setScroll(true) 가 드래그 도중 차트 스크롤을 되살려, 선을 끌면 차트까지 따라 움직인다.
  const handlers = useRef({ onCreate, onUpdate, onRemove, onToolDone })
  handlers.current = { onCreate, onUpdate, onRemove, onToolDone }

  const coordsOf = useCallback(() => {
    const l = latest.current
    return new Coords(l.chart, l.series, l.candles, l.interval)
  }, [])

  const resolveMagnet = useCallback((ctrl: boolean): MagnetMode => {
    const m = latest.current.magnet
    if (!ctrl) return m
    return m === 'off' ? 'strong' : 'off'
  }, [])

  // ── 프리미티브 부착/재부착 ──
  useEffect(() => {
    const prim = new DrawingPrimitive()
    primitiveRef.current = prim
    series.attachPrimitive(prim)
    return () => {
      series.detachPrimitive(prim)
      if (primitiveRef.current === prim) primitiveRef.current = null
    }
  }, [series])

  // ── 프리미티브 상태 동기화 — 시리즈가 바뀌면 새 프리미티브에도 다시 넣는다. ──
  useEffect(() => {
    primitiveRef.current?.setState({
      drawings,
      preview: preview ?? measureRef.current,
      selectedId,
      candles,
      interval,
      palette,
      allHidden: hidden,
    })
  }, [series, drawings, preview, selectedId, candles, interval, palette, hidden])

  // ── 커서 CSS ──
  useEffect(() => {
    const el = chart.chartElement()
    let cursor = 'default'
    if (enabled) {
      if (tool === 'arrow') cursor = 'default'
      else if (tool === 'eraser') cursor = ERASER_CURSOR
      else if (tool === 'cross' || tool === 'dot') cursor = 'crosshair'
      else cursor = 'crosshair'
    }
    el.style.cursor = cursor
    return () => {
      el.style.cursor = ''
    }
  }, [chart, tool, enabled])

  // ── 화살표 커서일 때만 십자선 숨김(계약: applyOptions 로만) ──
  useEffect(() => {
    const hideCross = enabled && tool === 'arrow'
    chart.applyOptions({
      crosshair: {
        vertLine: { visible: !hideCross },
        horzLine: { visible: !hideCross },
      },
    })
    return () => {
      chart.applyOptions({
        crosshair: { vertLine: { visible: true }, horzLine: { visible: true } },
      })
    }
  }, [chart, tool, enabled])

  // ── 도구·심볼이 바뀌면 진행 중인 생성/측정/미리보기를 정리 ──
  // 심볼이 바뀐 뒤에도 남으면 이전 심볼 가격의 앵커로 새 심볼에 그림이 생긴다.
  useEffect(() => {
    creatingRef.current = null
    measureRef.current = null
    setPreview(null)
    setZoomBox(null)
    setTextEdit(null)
  }, [tool, symbol])

  useEffect(() => {
    setSelectedId(null)
  }, [symbol])

  const setScroll = useCallback(
    (on: boolean) => {
      latest.current.chart.applyOptions({ handleScroll: on, handleScale: on })
    },
    [],
  )

  const clearCreation = useCallback(() => {
    creatingRef.current = null
    setPreview(null)
  }, [])

  const finalizeCreate = useCallback(
    (kind: DrawingKind, clicked: DrawingPoint[]) => {
      const l = latest.current
      const pts = buildPoints(kind, clicked, coordsOf())
      if (pts) handlers.current.onCreate({ symbol: l.symbol, kind, points: pts, style: defaultStyle(kind) })
      clearCreation()
      if (!l.stay) handlers.current.onToolDone()
    },
    [clearCreation, coordsOf],
  )

  const openTextEditor = useCallback(
    (mode: 'create' | 'edit', dp: DrawingPoint, x: number, y: number, value: string, id?: string) => {
      setTextEdit({ mode, dp, x, y, value, id })
    },
    [],
  )

  // ── 포인터/키보드 입력 ──
  useEffect(() => {
    if (!enabled) return
    const el = chart.chartElement()

    const getPt = (e: PointerEvent): Pt => {
      const rect = el.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const updateCreatePreview = (cursorPoint: DrawingPoint) => {
      const c = creatingRef.current
      if (!c) return
      const pts = [...c.committed, cursorPoint]
      setPreview(previewDrawing(latest.current.symbol, c.kind, pts, defaultStyle(c.kind)))
    }

    // 누르던 것을 없던 일로: 옮기던 그림은 제자리로, 미리보기는 지우고, 차트 스크롤은 되살린다.
    const abortPress = () => {
      const press = pressRef.current
      if (!press) return
      pressRef.current = null
      if (el.hasPointerCapture(press.pointerId)) el.releasePointerCapture(press.pointerId)
      setScroll(true)
      if ((press.mode === 'move' || press.mode === 'anchor') && press.last && press.id) {
        handlers.current.onUpdate(press.id, { points: press.original! }, { history: false })
      } else if (press.mode !== 'move' && press.mode !== 'anchor') {
        creatingRef.current = null
        measureRef.current = null
        setPreview(null)
        setZoomBox(null)
      }
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== undefined && e.button !== 0) return
      const l = latest.current
      if (textEditRef.current) return // 편집 중이면 편집기가 처리
      // 누르고 있는 동안 들어온 두 번째 손가락(핀치 등)은 무시한다. 같은 포인터가 또 눌렸다면 놓기를 놓친 것 — 새로 시작.
      const held = pressRef.current
      if (held) {
        if (held.pointerId !== e.pointerId) {
          e.preventDefault()
          e.stopPropagation()
          return
        }
        abortPress()
      }
      const p = getPt(e)
      // 가격·시간축과 아래 지표 칸은 차트 몫이다. 메인 칸 밖 좌표로는 그림 가격이 틀어진다.
      const pane = chart.paneSize()
      if (p.x < 0 || p.y < 0 || p.x > pane.width || p.y > pane.height) return
      const coords = coordsOf()
      const ctrl = e.ctrlKey || e.metaKey
      const shift = e.shiftKey
      const t = l.tool

      // Shift + 드래그 = 커서 도구에서도 측정.
      if (isCursorTool(t) && shift && t !== 'eraser') {
        measureRef.current = null
        pressRef.current = {
          mode: 'measure',
          pointerId: e.pointerId,
          startPt: p,
          startPoint: makePoint(coords, l.candles, p, resolveMagnet(ctrl)),
          moved: false,
        }
        el.setPointerCapture(e.pointerId)
        setScroll(false)
        e.preventDefault()
        e.stopPropagation()
        return
      }

      if (isDrawingKind(t)) {
        const sp = makePoint(coords, l.candles, p, resolveMagnet(ctrl))
        if (t === 'text') {
          // 텍스트는 클릭 시 인라인 편집기를 연다(아래 up 에서 처리하지 않음).
          pressRef.current = { mode: 'create', pointerId: e.pointerId, startPt: p, startPoint: sp, moved: false }
        } else if (t === 'brush') {
          const rp = { time: coords.xToTime(p.x) ?? 0, price: coords.yToPrice(p.y) ?? 0 }
          pressRef.current = { mode: 'brush', pointerId: e.pointerId, startPt: p, startPoint: sp, moved: false, brush: [rp] }
        } else {
          if (!creatingRef.current) creatingRef.current = { kind: t, committed: [] }
          pressRef.current = { mode: 'create', pointerId: e.pointerId, startPt: p, startPoint: sp, moved: false }
        }
        el.setPointerCapture(e.pointerId)
        setScroll(false)
        e.preventDefault()
        e.stopPropagation()
        return
      }

      if (t === 'measure') {
        measureRef.current = null
        pressRef.current = {
          mode: 'measure',
          pointerId: e.pointerId,
          startPt: p,
          startPoint: makePoint(coords, l.candles, p, resolveMagnet(ctrl)),
          moved: false,
        }
        el.setPointerCapture(e.pointerId)
        setScroll(false)
        e.preventDefault()
        e.stopPropagation()
        return
      }

      if (t === 'zoom') {
        pressRef.current = { mode: 'zoom', pointerId: e.pointerId, startPt: p, startPoint: { time: 0, price: 0 }, moved: false, curPt: p }
        el.setPointerCapture(e.pointerId)
        setScroll(false)
        e.preventDefault()
        e.stopPropagation()
        return
      }

      // 커서 도구. 손가락은 마우스보다 부정확해서 터치는 잡는 폭을 넓힌다. 전체 숨김이면 잡을 것이 없다.
      const picked = l.hidden ? null : pickDrawing(l.drawings, coords, p, e.pointerType === 'touch')
      if (t === 'eraser') {
        if (picked) {
          handlers.current.onRemove(picked.drawing.id)
          if (l.selectedId === picked.drawing.id) setSelectedId(null)
          e.preventDefault()
          e.stopPropagation()
        }
        return
      }

      if (picked) {
        setSelectedId(picked.drawing.id)
        const d = picked.drawing
        const immovable = l.locked || d.locked
        if (immovable) {
          e.preventDefault()
          e.stopPropagation()
          return
        }
        if (picked.hit.type === 'anchor') {
          pressRef.current = {
            mode: 'anchor',
            pointerId: e.pointerId,
            startPt: p,
            startPoint: { time: 0, price: 0 },
            moved: false,
            id: d.id,
            index: picked.hit.index,
            original: d.points,
          }
        } else {
          pressRef.current = {
            mode: 'move',
            pointerId: e.pointerId,
            startPt: p,
            startPoint: { time: 0, price: 0 },
            moved: false,
            id: d.id,
            original: d.points,
          }
        }
        el.setPointerCapture(e.pointerId)
        setScroll(false)
        e.preventDefault()
        e.stopPropagation()
      } else {
        // 빈 곳: 선택 해제하고 차트가 팬 하도록 이벤트를 넘긴다.
        setSelectedId(null)
      }
    }

    const onMove = (e: PointerEvent) => {
      const l = latest.current
      const p = getPt(e)
      const coords = coordsOf()
      const ctrl = e.ctrlKey || e.metaKey
      const press = pressRef.current

      if (!press) {
        // 진행 중 생성: 커서를 따라 미리보기.
        if (creatingRef.current) {
          updateCreatePreview(makePoint(coords, l.candles, p, resolveMagnet(ctrl)))
        }
        return
      }
      // 다른 손가락의 움직임은 이 누름과 무관하다.
      if (e.pointerId !== press.pointerId) return

      if (Math.hypot(p.x - press.startPt.x, p.y - press.startPt.y) > DRAG_THRESHOLD) press.moved = true

      switch (press.mode) {
        case 'create': {
          const c = creatingRef.current
          if (!c) break
          const cur = makePoint(coords, l.candles, p, resolveMagnet(ctrl))
          // 첫 점에서 누른 채 끌면 누른 자리~커서가 두 점이다. 미리보기도 그 둘로 그려야 끄는 동안 선이 보인다.
          if (press.moved && c.committed.length === 0 && requiredPoints(c.kind) >= 2) {
            setPreview(previewDrawing(l.symbol, c.kind, [press.startPoint, cur], defaultStyle(c.kind)))
          } else {
            updateCreatePreview(cur)
          }
          break
        }
        case 'brush': {
          const rp = { time: coords.xToTime(p.x) ?? 0, price: coords.yToPrice(p.y) ?? 0 }
          const last = press.brush![press.brush!.length - 1]
          const lx = coords.timeToX(last.time)
          if (lx === null || Math.hypot(p.x - lx, p.y - (coords.priceToY(last.price) ?? p.y)) > 2) {
            press.brush!.push(rp)
          }
          setPreview(previewDrawing(l.symbol, 'brush', press.brush!, defaultStyle('brush')))
          break
        }
        case 'move': {
          // 고르려고 누른 손의 떨림(몇 px)으로 그림이 밀리고 되돌리기 단계가 쌓이지 않게, 문턱을 넘어야 옮긴다.
          if (!press.moved) break
          const t0 = coords.xToTime(press.startPt.x) ?? 0
          const t1 = coords.xToTime(p.x) ?? 0
          const pr0 = coords.yToPrice(press.startPt.y) ?? 0
          const pr1 = coords.yToPrice(p.y) ?? 0
          const dt = t1 - t0
          const dp = pr1 - pr0
          const next = press.original!.map((pt) => ({ time: pt.time + dt, price: pt.price + dp }))
          press.last = next
          handlers.current.onUpdate(press.id!, { points: next }, { history: false })
          break
        }
        case 'anchor': {
          if (!press.moved) break
          const sp = makePoint(coords, l.candles, p, resolveMagnet(ctrl))
          const next = press.original!.map((pt, i) => (i === press.index ? sp : pt))
          press.last = next
          handlers.current.onUpdate(press.id!, { points: next }, { history: false })
          break
        }
        case 'measure': {
          const sp = makePoint(coords, l.candles, p, resolveMagnet(ctrl))
          const shape = previewDrawing(l.symbol, 'datePriceRange', [press.startPoint, sp], defaultStyle('datePriceRange'))
          measureRef.current = shape
          setPreview(shape)
          break
        }
        case 'zoom': {
          press.curPt = p
          setZoomBox({
            x: Math.min(press.startPt.x, p.x),
            y: Math.min(press.startPt.y, p.y),
            w: Math.abs(p.x - press.startPt.x),
            h: Math.abs(p.y - press.startPt.y),
          })
          break
        }
      }
    }

    const onUp = (e: PointerEvent) => {
      const press = pressRef.current
      if (!press || e.pointerId !== press.pointerId) return
      pressRef.current = null
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      setScroll(true)
      const l = latest.current
      const p = getPt(e)
      const coords = coordsOf()
      const ctrl = e.ctrlKey || e.metaKey

      switch (press.mode) {
        case 'create': {
          const c = creatingRef.current
          if (!c) break
          if (press.moved) {
            // 끌었으면 놓은 자리가 점이 된다(미리보기가 따라간 자리). 첫 점에서 끌었다면 누른 자리까지 두 점.
            const end = makePoint(coords, l.candles, p, resolveMagnet(ctrl))
            if (c.committed.length === 0 && requiredPoints(c.kind) >= 2) c.committed.push(press.startPoint)
            c.committed.push(end)
          } else {
            c.committed.push(press.startPoint)
          }
          if (c.committed.length >= requiredPoints(c.kind)) finalizeCreate(c.kind, c.committed)
          break
        }
        case 'brush': {
          if (l.tool === 'text') break
          const kind: DrawingKind = 'brush'
          if (press.brush && press.brush.length >= 2) {
            // 화면 좌표로 단순화한 뒤 다시 시간·가격으로.
            const screen: (Pt & { dp: DrawingPoint })[] = []
            for (const dp of press.brush) {
              const x = coords.timeToX(dp.time)
              const y = coords.priceToY(dp.price)
              if (x !== null && y !== null) screen.push({ x, y, dp })
            }
            const kept = simplify(screen, 2.5)
            const keptSet = new Set(kept)
            const pts = screen.filter((s) => keptSet.has(s)).map((s) => s.dp)
            finalizeCreate(kind, pts.length >= 2 ? pts : press.brush)
          } else {
            clearCreation()
          }
          break
        }
        case 'move':
        case 'anchor': {
          if (press.last && press.id) {
            // 되돌리기 스택에 한 단계로 남기려고: 원본으로 되돌린 뒤 최종을 커밋.
            handlers.current.onUpdate(press.id, { points: press.original! }, { history: false })
            handlers.current.onUpdate(press.id, { points: press.last })
          }
          break
        }
        case 'measure': {
          if (!press.moved) {
            // 단순 클릭 → 남아 있던 측정 지우기.
            measureRef.current = null
            setPreview(null)
          }
          break
        }
        case 'zoom': {
          applyZoom(chart, coords, press.startPt, p)
          setZoomBox(null)
          handlers.current.onToolDone()
          break
        }
      }

      // 텍스트: 놓은 자리에 인라인 편집기를 연다.
      if (press.mode === 'create' && l.tool === 'text') {
        const dp = makePoint(coords, l.candles, p, resolveMagnet(ctrl))
        openTextEditor('create', dp, p.x, p.y, '')
        creatingRef.current = null
      }
    }

    const onDblClick = (e: MouseEvent) => {
      const l = latest.current
      if (!isCursorTool(l.tool)) return
      const rect = el.getBoundingClientRect()
      const p = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const coords = coordsOf()
      const picked = l.hidden ? null : pickDrawing(l.drawings, coords, p)
      if (picked && picked.drawing.kind === 'text' && !l.locked && !picked.drawing.locked) {
        const d = picked.drawing
        const x = coords.timeToX(d.points[0].time)
        const y = coords.priceToY(d.points[0].price)
        if (x !== null && y !== null) {
          openTextEditor('edit', d.points[0], x, y, d.style.text ?? '', d.id)
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }

    // 그림이 잡은 손가락의 touchstart 는 차트(lightweight-charts)에 넘기지 않는다. pointerdown 이 먼저 와서
    // pressRef 가 서 있다. 넘기면 차트가 같은 손가락으로 팬하거나, 길게 눌렀을 때 십자선 추적 모드로 들어간다.
    const onTouchStart = (e: TouchEvent) => {
      if (pressRef.current) e.stopPropagation()
    }

    // 시스템이 제스처를 가져가면(pointercancel) 잡던 것을 원래대로 되돌린다. 안 풀면 차트 스크롤이 계속 꺼져 있다.
    const onCancel = (e: PointerEvent) => {
      if (pressRef.current?.pointerId === e.pointerId) abortPress()
    }

    el.addEventListener('pointerdown', onDown, true)
    el.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    el.addEventListener('dblclick', onDblClick, true)
    return () => {
      // 입력이 꺼지면(리플레이·다른 칸 활성·언마운트) 누르던 것도 끝낸다. 남겨 두면 다음 이동에서 되살아난다.
      abortPress()
      el.removeEventListener('pointerdown', onDown, true)
      el.removeEventListener('touchstart', onTouchStart, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
      el.removeEventListener('dblclick', onDblClick, true)
      setScroll(true)
    }
  }, [chart, enabled, coordsOf, resolveMagnet, setScroll, finalizeCreate, clearCreation, openTextEditor])

  // ── 우클릭: 누른 자리를 가려 메뉴를 요청한다. 비활성 칸도 받아야 해서 enabled 와 무관하게 건다. ──
  const contextRef = useRef(onContextMenu)
  contextRef.current = onContextMenu
  useEffect(() => {
    const el = chart.chartElement()
    let pointerType = 'mouse'
    const onPointer = (e: PointerEvent) => {
      pointerType = e.pointerType
    }
    const onMenu = (e: MouseEvent) => {
      const request = contextRef.current
      if (!request) return
      e.preventDefault()
      // 폰의 길게 누르기는 크로스헤어용이다 — 메뉴를 띄우지 않는다.
      if (pointerType === 'touch') return
      const l = latest.current
      // 그리던 중이면 TradingView 처럼 취소만 한다.
      if (creatingRef.current || textEditRef.current) {
        clearCreation()
        setTextEdit(null)
        return
      }
      const rect = el.getBoundingClientRect()
      const p = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const pane = l.chart.paneSize()
      const areaBottom = rect.height - l.chart.timeScale().height()
      const at = { x: e.clientX, y: e.clientY }
      if (p.y > areaBottom) {
        if (p.x <= pane.width) request({ ...at, target: { kind: 'timeScale' } })
        return
      }
      if (p.x > pane.width) {
        request({ ...at, target: { kind: 'priceScale' } })
        return
      }
      const coords = coordsOf()
      const inMain = p.y <= pane.height
      if (inMain && !l.hidden) {
        // 저장된 그림 하나가 깨져 있어도 메뉴는 떠야 한다 — 그때는 차트 메뉴로 넘어간다.
        let picked: ReturnType<typeof pickDrawing> = null
        try {
          picked = pickDrawing(l.drawings, coords, p)
        } catch {
          picked = null
        }
        if (picked) {
          if (l.enabled) setSelectedId(picked.drawing.id)
          request({ ...at, target: { kind: 'drawing', drawingId: picked.drawing.id } })
          return
        }
      }
      request({
        ...at,
        target: { kind: 'chart', time: coords.snapTimeToBar(p.x), price: inMain ? coords.yToPrice(p.y) : null },
      })
    }
    el.addEventListener('pointerdown', onPointer, true)
    el.addEventListener('contextmenu', onMenu)
    return () => {
      el.removeEventListener('pointerdown', onPointer, true)
      el.removeEventListener('contextmenu', onMenu)
    }
  }, [chart, coordsOf, clearCreation])

  // ── 키보드 ①: Esc 취소. 열린 메뉴가 먼저 Esc 를 먹도록(문서 캡처에서 전파 중단) 버블 단계에서 받는다. ──
  useEffect(() => {
    if (!enabled) return
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (textEditRef.current) {
        setTextEdit(null)
        return
      }
      if (creatingRef.current || measureRef.current || preview) {
        clearCreation()
        measureRef.current = null
        setPreview(null)
        return
      }
      if (latest.current.selectedId) setSelectedId(null)
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [enabled, preview, clearCreation])

  // ── 키보드 ②: Delete 삭제, Ctrl+C/V 복사·붙여넣기, 방향키로 선택한 그림 옮기기 ──
  // 캡처 단계에서 먼저 받아 처리한 키는 preventDefault 한다 — 전역 단축키(방향키 = 차트 스크롤)가 그걸 보고 비켜 간다.
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const l = latest.current
      const active = document.activeElement
      const inInput =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable)
      // 입력칸·메뉴 안의 키, 대화상자·시트가 열려 있을 때의 키는 그쪽 몫이다(포커스가 뒤 페이지에 있어도).
      if (inInput || hasOpenOverlay() || (e.target instanceof Element && e.target.closest('.tv-dialog, .tv-popover'))) {
        return
      }
      const selected =
        l.selectedId && !l.hidden ? l.drawings.find((d) => d.id === l.selectedId && !d.hidden) ?? null : null
      const ctrl = e.ctrlKey || e.metaKey

      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        onRemove(selected.id)
        setSelectedId(null)
        e.preventDefault()
        return
      }
      // 한글 입력 상태에서도 되도록 글자(e.key)가 아니라 물리 키(e.code)로 본다.
      if (ctrl && !e.altKey && !e.shiftKey && e.code === 'KeyC' && selected) {
        copyDrawing(selected)
        e.preventDefault()
        return
      }
      if (ctrl && !e.altKey && !e.shiftKey && e.code === 'KeyV') {
        const next = pasteDrawing(l.symbol, l.interval)
        if (!next) return
        setSelectedId(onCreate(next))
        e.preventDefault()
        return
      }
      // 방향키: ←/→ 한 봉, ↑/↓ 1픽셀만큼. 누르고 있으면 한 번의 되돌리기 단계로 묶는다.
      const arrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown'
      if (arrow && !ctrl && !e.altKey && selected && !l.locked && !selected.locked) {
        const coords = coordsOf()
        let dt = 0
        let dp = 0
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          dt = (e.key === 'ArrowLeft' ? -1 : 1) * INTERVAL_SECONDS[l.interval]
        } else {
          const y = coords.priceToY(selected.points[0]?.price ?? 0) ?? 0
          const moved = coords.yToPrice(y + (e.key === 'ArrowUp' ? -1 : 1))
          const base = coords.yToPrice(y)
          if (moved === null || base === null) return
          dp = moved - base
        }
        const points = selected.points.map((pt) => ({ time: pt.time + dt, price: pt.price + dp }))
        onUpdate(selected.id, { points }, e.repeat ? { history: false } : undefined)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [enabled, onRemove, onCreate, onUpdate, coordsOf])

  // 선택된 그림(현재 심볼) 찾기. 숨긴 그림(개별·전체)은 선택 도구 막대를 띄우지 않는다.
  const selected = useMemo(
    () => (hidden ? null : drawings.find((d) => d.id === selectedId && !d.hidden) ?? null),
    [drawings, selectedId, hidden],
  )

  const commitText = useCallback(() => {
    const te = textEditRef.current
    if (!te) return
    const l = latest.current
    const value = te.value.trim()
    if (te.mode === 'create') {
      if (value) {
        onCreate({
          symbol: l.symbol,
          kind: 'text',
          points: [te.dp],
          style: { ...defaultStyle('text'), text: value },
        })
      }
      setTextEdit(null)
      if (!l.stay) onToolDone()
    } else {
      if (te.id) {
        if (value) onUpdate(te.id, { style: { ...(selected?.style ?? defaultStyle('text')), text: value } })
        else onRemove(te.id)
      }
      setTextEdit(null)
    }
  }, [onCreate, onUpdate, onRemove, onToolDone, selected])

  return (
    <div className="tv-drawoverlay" style={{ pointerEvents: 'none' }} data-enabled={enabled}>
      {zoomBox && (
        <div
          className="tv-draw-zoombox"
          style={{ left: zoomBox.x, top: zoomBox.y, width: zoomBox.w, height: zoomBox.h }}
        />
      )}
      {textEdit && (
        <input
          className="tv-draw-textedit"
          style={{ left: textEdit.x, top: textEdit.y }}
          autoFocus
          value={textEdit.value}
          onChange={(e) => setTextEdit((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitText()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setTextEdit(null)
            }
            e.stopPropagation()
          }}
          onBlur={commitText}
          placeholder="텍스트 입력"
        />
      )}
      {selected && enabled && (
        <SelectedToolbar
          drawing={selected}
          globalLocked={locked}
          onUpdate={onUpdate}
          onRemove={(id) => {
            onRemove(id)
            setSelectedId(null)
          }}
          onClone={(d) => {
            onCreate({
              symbol: d.symbol,
              kind: d.kind,
              points: cloneOffset(d.points, interval),
              style: { ...d.style },
              alert: false,
            })
          }}
          onEditText={(d) => {
            const coords = coordsOf()
            const x = coords.timeToX(d.points[0].time)
            const y = coords.priceToY(d.points[0].price)
            openTextEditor('edit', d.points[0], x ?? 40, y ?? 40, d.style.text ?? '', d.id)
          }}
          palette={DRAWING_PALETTE}
        />
      )}
    </div>
  )
}

const ERASER_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M4 16 L13 7 L19 13 L12 20 L7 20 Z' fill='none' stroke='white' stroke-width='1.6'/><line x1='7' y1='20' x2='20' y2='20' stroke='white' stroke-width='1.6'/></svg>\") 4 20, auto"

function applyZoom(chart: IChartApi, coords: Coords, a: Pt, b: Pt): void {
  const x1 = Math.min(a.x, b.x)
  const x2 = Math.max(a.x, b.x)
  if (x2 - x1 < 6) return
  const from = chart.timeScale().coordinateToLogical(x1)
  const to = chart.timeScale().coordinateToLogical(x2)
  if (from === null || to === null) return
  chart.timeScale().setVisibleLogicalRange({ from, to })
  void coords
}
