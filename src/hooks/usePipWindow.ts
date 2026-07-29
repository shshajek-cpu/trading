import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Document PiP 창을 열고, 본문 스타일시트를 복사한 뒤 포털 대상 엘리먼트를 돌려준다.
 * 내용물은 App 이 createPortal 로 실제 컴포넌트를 그대로 꽂는다 — 미니창은 본체의 미러다.
 */
export function usePipWindow() {
  const supported = typeof window !== 'undefined' && !!window.documentPictureInPicture
  const pipRef = useRef<Window | null>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)

  const close = useCallback(() => {
    pipRef.current?.close()
    pipRef.current = null
    setContainer(null)
  }, [])

  const toggle = useCallback(async () => {
    if (!supported) return
    if (pipRef.current && !pipRef.current.closed) {
      close()
      return
    }
    const api = window.documentPictureInPicture
    if (!api) return
    const win = await api.requestWindow({ width: 480, height: 320 })
    pipRef.current = win
    const doc = win.document

    // 본체의 스타일을 전부 복사한다 — 미니창이 사이트와 똑같이 보이는 핵심.
    for (const sheet of Array.from(document.styleSheets)) {
      const owner = sheet.ownerNode
      if (owner instanceof HTMLStyleElement || owner instanceof HTMLLinkElement) {
        doc.head.append(owner.cloneNode(true))
      }
    }

    doc.documentElement.style.height = '100%'
    doc.body.style.height = '100%'
    doc.body.style.margin = '0'

    const root = doc.createElement('div')
    root.className = 'pip-root'
    doc.body.append(root)

    win.addEventListener('pagehide', () => {
      pipRef.current = null
      setContainer(null)
    })
    setContainer(root)
  }, [supported, close])

  // 언마운트 시 미니창 닫기
  useEffect(() => close, [close])

  return { supported, open: container !== null, container, toggle }
}
