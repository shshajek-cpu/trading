import { useCallback, useEffect, useState } from 'react'

/** 크롬 계열이 설치 가능할 때 던져 주는 이벤트. 표준 타입에 아직 없어 직접 적는다. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'trading.installHint.dismissed.v1'

/** 이미 홈 화면 아이콘으로 열고 있는지. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  )
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

/**
 * '홈 화면에 추가' 안내.
 *
 * 브라우저 탭으로 열면 주소창이 화면을 깎아먹고, 알림도 아이폰에서는 아예 못 받는다.
 * 앱처럼 쓰려면 홈 화면에 추가해야 하는데 사용자는 그걸 모른다 — 그래서 한 번 알려 준다.
 *
 * 안드로이드/크롬: 버튼 한 번으로 바로 설치된다.
 * 아이폰: 브라우저가 설치 창을 안 열어 줘서 '공유 → 홈 화면에 추가' 를 글로 안내한다.
 */
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // 기본 배너를 막고 우리 안내로 대신한다 — 우리가 시점을 고를 수 있어야 한다.
      e.preventDefault()
      setPromptEvent(e as InstallPromptEvent)
    }
    const onInstalled = () => setInstalled(true)

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = useCallback(() => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* 저장 못 해도 이번 세션에는 안 뜬다 */
    }
  }, [])

  const install = useCallback(async () => {
    if (!promptEvent) return
    await promptEvent.prompt()
    await promptEvent.userChoice
    setPromptEvent(null)
  }, [promptEvent])

  // 아이폰은 설치 창이 없으므로 글 안내를, 나머지는 이벤트가 왔을 때만 보여준다.
  const ios = isIos()
  const canShow = !installed && !dismissed && (ios ? true : promptEvent !== null)

  return { canShow, ios, install, dismiss, installable: promptEvent !== null }
}
