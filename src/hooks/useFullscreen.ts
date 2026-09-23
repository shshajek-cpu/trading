import { useCallback, useEffect, useState } from 'react'

/** Fullscreen API wrapper for the 전체 화면 toggle (Shift+F). Falls back to no-op when unsupported. */
export function useFullscreen() {
  const [active, setActive] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement))

  useEffect(() => {
    const onChange = () => setActive(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      /* some browsers reject without a user gesture — ignore */
    }
  }, [])

  return { active, toggle, supported: typeof document !== 'undefined' && Boolean(document.documentElement.requestFullscreen) }
}
