import { useEffect, useRef } from 'react'

/**
 * 안드로이드 뒤로가기(또는 브라우저 뒤로) 로 열린 것을 닫는다.
 *
 * 앱에서는 무언가 열려 있을 때 뒤로가기를 누르면 그것만 닫히는 게 당연하다.
 * 이 처리가 없으면 시트가 열린 채로 뒤로가기를 눌렀을 때 앱이 통째로 꺼져
 * 사용자가 보던 화면을 잃는다.
 *
 * 방법: 열릴 때 가짜 방문 기록을 하나 쌓고, 뒤로가기가 그 기록을 소비하게 둔다.
 * 화면 주소는 그대로라 새로고침하거나 공유해도 달라지는 것이 없다.
 */
export function useBackClose(open: boolean, onClose: () => void): void {
  // 우리가 쌓은 기록인지 표시해 둔다 — 남의 기록까지 건드리면 안 된다.
  const pushedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    window.history.pushState({ overlay: true }, '')
    pushedRef.current = true

    const onPop = () => {
      // 뒤로가기가 우리 기록을 이미 걷어냈다. 다시 부르지 않도록 표시만 끄고 닫는다.
      pushedRef.current = false
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPop)

    return () => {
      window.removeEventListener('popstate', onPop)
      // 뒤로가기가 아니라 X 버튼 등으로 닫혔다면 쌓아둔 기록을 우리가 걷어낸다.
      // 안 그러면 기록이 쌓여 뒤로가기를 여러 번 눌러야 앱을 벗어난다.
      if (pushedRef.current) {
        pushedRef.current = false
        window.history.back()
      }
    }
  }, [open])
}
