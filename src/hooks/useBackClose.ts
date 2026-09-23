import { useEffect, useRef } from 'react'

/**
 * 안드로이드 뒤로가기(또는 브라우저 뒤로)로 열린 것을 닫는다.
 *
 * 앱에서는 무언가 열려 있을 때 뒤로가기를 누르면 그것만 닫히는 게 당연하다.
 * 열릴 때 가짜 방문 기록을 하나 쌓고, 뒤로가기가 그 기록을 소비하게 둔다.
 *
 * 여러 개가 겹쳐 열릴 수 있다(메뉴 서랍 → 관심 목록 전체 화면). 그래서
 * - 뒤로가기는 맨 위에 열린 것 하나만 닫는다(스택).
 * - X 버튼 등으로 닫혀 우리가 직접 `history.back()` 을 부를 때 생기는 popstate 는
 *   다른 오버레이를 닫지 않도록 건너뛴다. 서랍이 닫히면서 부른 back() 이
 *   같은 순간 새로 열린 관심 목록을 닫아 버리던 문제를 막는다.
 */
interface Entry {
  popped: boolean
  close: () => void
}

const stack: Entry[] = []
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

export function useBackClose(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    if (!listening) {
      window.addEventListener('popstate', onPopState)
      listening = true
    }

    const entry: Entry = { popped: false, close: () => onCloseRef.current() }
    window.history.pushState({ overlay: true }, '')
    stack.push(entry)

    return () => {
      const index = stack.indexOf(entry)
      if (index >= 0) stack.splice(index, 1)
      // 뒤로가기가 아니라 코드로 닫혔다면 쌓아둔 기록을 우리가 걷어낸다.
      // 그때 생기는 popstate 는 사용자의 뒤로가기가 아니므로 무시한다.
      if (!entry.popped) {
        ignoredPops++
        window.history.back()
      }
    }
  }, [open])
}
