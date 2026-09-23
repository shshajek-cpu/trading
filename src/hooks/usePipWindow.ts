import { useCallback, useEffect, useRef, useState } from 'react'

/** 본 창 <html> 에서 미니창으로 그대로 옮길 속성(테마·언어). */
const MIRRORED_ATTRS = ['data-theme', 'lang']

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
    doc.title = `${document.title} 미니창`

    // 본체의 스타일을 전부 복사한다 — 미니창이 사이트와 똑같이 보이는 핵심.
    // <link> 는 절대 주소로 다시 만든다(미니창 문서는 about:blank 라 상대 주소가 어긋날 수 있다).
    for (const sheet of Array.from(document.styleSheets)) {
      const owner = sheet.ownerNode
      if (owner instanceof HTMLLinkElement) {
        const link = doc.createElement('link')
        link.rel = 'stylesheet'
        link.href = owner.href
        doc.head.append(link)
      } else if (owner instanceof HTMLStyleElement) {
        doc.head.append(owner.cloneNode(true))
      }
    }

    // 테마(data-theme)·언어를 본 창과 맞추고, 바뀌면 따라간다. 없으면 색 토큰이 기본값으로만 보인다.
    const sync = () => {
      for (const name of MIRRORED_ATTRS) {
        const value = document.documentElement.getAttribute(name)
        if (value === null) doc.documentElement.removeAttribute(name)
        else doc.documentElement.setAttribute(name, value)
      }
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: MIRRORED_ATTRS })

    const root = doc.createElement('div')
    root.className = 'pip-root'
    doc.body.className = 'pip-body'
    doc.body.append(root)

    win.addEventListener('pagehide', () => {
      observer.disconnect()
      pipRef.current = null
      setContainer(null)
    })
    setContainer(root)
  }, [supported, close])

  // 언마운트 시 미니창 닫기
  useEffect(() => close, [close])

  return { supported, open: container !== null, container, toggle }
}
