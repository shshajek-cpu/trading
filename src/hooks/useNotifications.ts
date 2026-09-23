import { useCallback, useEffect, useState } from 'react'

type Permission = NotificationPermission | 'unsupported'

const readPermission = (): Permission =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission

export function useNotifications() {
  const [permission, setPermission] = useState<Permission>(readPermission)

  // 권한은 다른 경로(푸시 켜기·브라우저 사이트 설정)로도 바뀐다 — 앱으로 돌아올 때 다시 읽는다.
  useEffect(() => {
    const sync = () => setPermission(readPermission())
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  /** 권한 요청 — 사용자가 누른 순간에만 불러야 한다(사파리는 그 밖의 요청을 거절한다). */
  const requestPermission = useCallback(async (): Promise<Permission> => {
    if (typeof Notification === 'undefined') return 'unsupported'
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      return result
    } catch {
      const now = readPermission()
      setPermission(now)
      return now
    }
  }, [])

  /**
   * 시스템 알림을 띄운다. 권한이 없으면 false 를 반환하니 호출측이 토스트로 대체하면 된다.
   * 안드로이드 크롬·iOS 홈 화면 앱은 페이지의 `new Notification` 을 막는다 — 서비스 워커로 띄운다.
   * 같은 `tag` 는 OS 가 하나로 합친다(푸시 알림과 겹칠 때도).
   */
  const notify = useCallback((title: string, body: string, tag?: string): boolean => {
    if (readPermission() !== 'granted') return false
    const options: NotificationOptions = tag ? { body, tag } : { body }
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      void navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(title, options))
        .catch(() => showInPage(title, options))
      return true
    }
    return showInPage(title, options)
  }, [])

  return { permission, notify, requestPermission }
}

function showInPage(title: string, options: NotificationOptions): boolean {
  try {
    new Notification(title, options)
    return true
  } catch {
    return false
  }
}
