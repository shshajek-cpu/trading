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
import { DrawingPrimitive } from './DrawingPrimitive'
import { SelectedToolbar } from './SelectedToolbar'
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
  onCreate: (d: NewDrawing) => void
  onUpdate: (id: string, patch: Partial<Omit<Drawing, 'id'>>, opts?: { history?: boolean }) => void
  onRemove: (id: string) => void
  onToolDone: () => void
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
    above: null,
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

  // ── 도구가 바뀌면 진행 중인 생성/측정/미리보기를 정리 ──
  useEffect(() => {
    creatingRef.current = null
    measureRef.current = null
    setPreview(null)
    setZoomBox(null)
    setTextEdit(null)
  }, [tool])

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
      const pts = buildPoints(kind, clicked, l.interval)
      onCreate({ symbol: l.symbol, kind, points: pts, style: defaultStyle(kind) })
      clearCreation()
      if (!l.stay) onToolDone()
    },
    [onCreate, onToolDone, clearCreation],
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

    const onDown = (e: PointerEvent) => {
      if (e.button !== undefined && e.button !== 0) return
      const l = latest.current
      if (textEditRef.current) return // 편집 중이면 편집기가 처리
      const p = getPt(e)
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

      // 커서 도구
      const pane = chart.paneSize()
      const picked = pickDrawing(l.drawings, coords, p, pane.width, pane.height)
      if (t === 'eraser') {
        if (picked) {
          onRemove(picked.drawing.id)
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

      if (Math.hypot(p.x - press.startPt.x, p.y - press.startPt.y) > DRAG_THRESHOLD) press.moved = true

      switch (press.mode) {
        case 'create': {
          const c = creatingRef.current
          if (!c) break
          updateCreatePreview(makePoint(coords, l.candles, p, resolveMagnet(ctrl)))
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
          const t0 = coords.xToTime(press.startPt.x) ?? 0
          const t1 = coords.xToTime(p.x) ?? 0
          const pr0 = coords.yToPrice(press.startPt.y) ?? 0
          const pr1 = coords.yToPrice(p.y) ?? 0
          const dt = t1 - t0
          const dp = pr1 - pr0
          const next = press.original!.map((pt) => ({ time: pt.time + dt, price: pt.price + dp }))
          press.last = next
          onUpdate(press.id!, { points: next }, { history: false })
          break
        }
        case 'anchor': {
          const sp = makePoint(coords, l.candles, p, resolveMagnet(ctrl))
          const next = press.original!.map((pt, i) => (i === press.index ? sp : pt))
          press.last = next
          onUpdate(press.id!, { points: next }, { history: false })
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
          const kind = c.kind
          const req = requiredPoints(kind)
          if (press.moved) {
            const end = makePoint(coords, l.candles, p, resolveMagnet(ctrl))
            if (req === 2) finalizeCreate(kind, [press.startPoint, end])
            else if (req === 1) finalizeCreate(kind, [press.startPoint])
            else {
              c.committed.push(press.startPoint)
              if (c.committed.length >= req) finalizeCreate(kind, c.committed)
            }
          } else {
            c.committed.push(press.startPoint)
            if (c.committed.length >= req) finalizeCreate(kind, c.committed)
          }
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
            onUpdate(press.id, { points: press.original! }, { history: false })
            onUpdate(press.id, { points: press.last })
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
          onToolDone()
          break
        }
      }

      // 텍스트: 클릭(이동 없음)이면 인라인 편집기.
      if (press.mode === 'create' && l.tool === 'text' && !press.moved) {
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
      const pane = chart.paneSize()
      const picked = pickDrawing(l.drawings, coords, p, pane.width, pane.height)
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

    el.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    el.addEventListener('dblclick', onDblClick, true)
    return () => {
      el.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      el.removeEventListener('dblclick', onDblClick, true)
      setScroll(true)
    }
  }, [chart, enabled, coordsOf, resolveMagnet, setScroll, finalizeCreate, clearCreation, onUpdate, onRemove, onToolDone, openTextEditor])

  // ── 키보드: Esc 취소, Delete 삭제 ──
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const l = latest.current
      const active = document.activeElement
      const inInput =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      if (e.key === 'Escape') {
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
        if (l.selectedId) setSelectedId(null)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput && l.selectedId) {
        onRemove(l.selectedId)
        setSelectedId(null)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, preview, clearCreation, onRemove])

  // 선택된 그림(현재 심볼) 찾기.
  const selected = useMemo(
    () => drawings.find((d) => d.id === selectedId) ?? null,
    [drawings, selectedId],
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
