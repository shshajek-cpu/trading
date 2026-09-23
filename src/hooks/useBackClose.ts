import { useEffect, useRef } from 'react'

/**
 * 안드로이드 뒤로가기(또는 브라우저 뒤로)와 Esc 로 열린 것을 닫는다.
 *
 * 앱에서는 무언가 열려 있을 때 뒤로가기를 누르면 그것만 닫히는 게 당연하다.
 * 열릴 때 가짜 방문 기록을 하나 쌓고, 뒤로가기가 그 기록을 소비하게 둔다.
 *
 * 여러 개가 겹치거나 이어서 열린다(메뉴 서랍 → 관심 목록 전체 화면). 그래서
 * - 뒤로가기와 Esc 는 맨 위에 열린 것 하나만 닫는다(스택). 각자 Esc 를 들으면 한 번에 다 닫힌다.
 * - 하나가 닫히면서 같은 순간 다른 것이 열리면, 닫힌 쪽 기록을 되돌리지 않고 새로 열린 쪽이
 *   그대로 물려받는다. `history.back()` 은 비동기라, 되돌린 뒤 새로 쌓으면 순서가 꼬여
 *   다음 뒤로가기가 앱을 빠져나가 버린다.
 * - 코드로 닫혀 우리가 직접 되돌릴 때 생기는 popstate 는 다른 오버레이를 닫지 않게 건너뛴다.
 */
interface Entry {
  popped: boolean
  close: () => void
}

const stack: Entry[] = []
/** 닫혔지만 아직 되돌리지 않은 기록 수. 같은 커밋에서 열리는 쪽이 먼저 가져간다. */
let releasable = 0
let flushScheduled = false
let ignoredPops = 0
let listening = false

function onPopState(): void {
  if (ignoredPops > 0) {
    ignoredPops--
    return
  }
  const top = stack.pop()
  if (!top) return
  top.popped = true
  top.close()
}

/** 안쪽 입력칸이 Esc 를 이미 썼으면(preventDefault) 건드리지 않는다. */
function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  const top = stack[stack.length - 1]
  if (!top) return
  // 차트 단축키(Esc = 그리기 취소)까지 가지 않게 여기서 끝낸다.
  e.stopPropagation()
  top.close()
}

/** 대화상자·시트·서랍 중 하나라도 열려 있는지 — 열려 있으면 차트 단축키를 멈춘다. */
export function hasOpenOverlay(): boolean {
  return stack.length > 0
}

// 오버레이가 열린 채 새로고침(직접·새 버전 적용)되면 가짜 기록이 하나 남는다. 다음에 여는 오버레이가
// 새로 쌓지 않고 그 기록을 물려받게 한다 — 안 그러면 뒤로가기 한 번이 헛돌 기록이 계속 쌓인다.
let orphan = typeof window !== 'undefined' && (window.history.state as { overlay?: boolean } | null)?.overlay === true

function scheduleRelease(): void {
  if (flushScheduled) return
  flushScheduled = true
  // React 는 한 커밋 안에서 정리(닫힘)를 모두 끝낸 뒤 새 이펙트(열림)를 돌린다.
  // 그 다음에 남은 것만 실제로 되돌린다.
  queueMicrotask(() => {
    flushScheduled = false
    while (releasable > 0) {
      releasable--
      ignoredPops++
      window.history.back()
    }
  })
}

export function useBackClose(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    if (!listening) {
      window.addEventListener('popstate', onPopState)
      document.addEventListener('keydown', onKeyDown)
      listening = true
    }

    const entry: Entry = { popped: false, close: () => onCloseRef.current() }
    if (releasable > 0) {
      // 방금 닫힌 오버레이의 기록을 그대로 물려받는다.
      releasable--
      window.history.replaceState({ overlay: true }, '')
    } else if (orphan && stack.length === 0 && (window.history.state as { overlay?: boolean } | null)?.overlay) {
      orphan = false
      window.history.replaceState({ overlay: true }, '')
    } else {
      window.history.pushState({ overlay: true }, '')
    }
    stack.push(entry)

    return () => {
      const index = stack.indexOf(entry)
      if (index >= 0) stack.splice(index, 1)
      if (!entry.popped) {
        releasable++
        scheduleRelease()
      }
    }
  }, [open])
}
