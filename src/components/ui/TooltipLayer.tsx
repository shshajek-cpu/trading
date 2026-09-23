import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TipSide } from '../../lib/tooltip'
import './ui.css'

interface ShownTip {
  name: string
  desc?: string
  keys?: string
  side: TipSide
  rect: DOMRect
}

/** 처음 뜨기까지 기다리는 시간. 툴팁 하나가 뜬 뒤 이웃 버튼으로 옮기면 바로 뜬다(TradingView 와 같다). */
const DELAY_MS = 450
const WARM_MS = 700
const GAP = 8
const EDGE = 4

/**
 * `data-tip` 을 단 요소에 마우스를 올리면 이름·단축키·설명을 담은 툴팁을 띄운다. 앱에 하나만 둔다.
 * 손가락(터치)에는 띄우지 않는다 — 폰 화면은 버튼마다 글자가 붙어 있다.
 */
export function TooltipLayer() {
  const [shown, setShown] = useState<ShownTip | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer = 0
    let current: Element | null = null
    let visible = false
    let warmUntil = 0

    const read = (el: Element): ShownTip | null => {
      const name = el.getAttribute('data-tip')
      if (!name) return null
      const side = el.getAttribute('data-tip-side')
      return {
        name,
        desc: el.getAttribute('data-tip-desc') ?? undefined,
        keys: el.getAttribute('data-tip-key') ?? undefined,
        side: side === 'right' || side === 'left' ? side : 'bottom',
        rect: el.getBoundingClientRect(),
      }
    }

    const hide = () => {
      window.clearTimeout(timer)
      if (visible) warmUntil = Date.now() + WARM_MS
      visible = false
      current = null
      setShown(null)
    }

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const el = e.target instanceof Element ? e.target.closest('[data-tip]') : null
      if (el === current) return
      window.clearTimeout(timer)
      if (visible) warmUntil = Date.now() + WARM_MS
      visible = false
      setShown(null)
      current = el
      if (!el) return
      timer = window.setTimeout(
        () => {
          if (current !== el || !el.isConnected) return
          const next = read(el)
          if (!next) return
          visible = true
          setShown(next)
        },
        Date.now() < warmUntil ? 0 : DELAY_MS,
      )
    }

    const onOut = (e: PointerEvent) => {
      if (!current) return
      const to = e.relatedTarget
      if (to instanceof Node && current.contains(to)) return
      hide()
    }

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    // 누르거나 키를 치거나 굴리면 바로 치운다(메뉴·대화상자를 가리지 않게).
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', hide, true)
    window.addEventListener('wheel', hide, { capture: true, passive: true })
    window.addEventListener('blur', hide)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', hide, true)
      window.removeEventListener('wheel', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  // 크기를 잰 뒤 자리를 정한다: 기본은 아래, 모자라면 위. 옆(왼쪽 툴바·오른쪽 위젯 탭)은 지정한 쪽.
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!shown || !box) {
      setPos(null)
      return
    }
    const { rect, side } = shown
    const w = box.offsetWidth
    const h = box.offsetHeight
    let left: number
    let top: number
    if (side === 'right' || side === 'left') {
      left = side === 'right' ? rect.right + GAP : rect.left - w - GAP
      top = rect.top + rect.height / 2 - h / 2
    } else {
      left = rect.left + rect.width / 2 - w / 2
      top = rect.bottom + GAP
      if (top + h > window.innerHeight - EDGE) top = rect.top - h - GAP
    }
    left = Math.min(Math.max(EDGE, left), window.innerWidth - w - EDGE)
    top = Math.min(Math.max(EDGE, top), window.innerHeight - h - EDGE)
    setPos({ left, top })
  }, [shown])

  if (!shown) return null
  return createPortal(
    <div
      ref={boxRef}
      className="tv-tooltip"
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
    >
      <div className="tv-tooltip-head">
        <span className="tv-tooltip-name">{shown.name}</span>
        {shown.keys && <kbd className="tv-tooltip-key">{shown.keys}</kbd>}
      </div>
      {shown.desc && <p className="tv-tooltip-desc">{shown.desc}</p>}
    </div>,
    document.body,
  )
}
