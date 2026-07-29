import { useCallback, useEffect, useState } from 'react'

type Permission = NotificationPermission | 'unsupported'

export function useNotifications() {
  const [permission, setPermission] = useState<Permission>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )

  useEffect(() => {
    if (permission === 'unsupported' || permission !== 'default') return
    let cancelled = false
    void Notification.requestPermission().then((result) => {
      if (!cancelled) setPermission(result)
    })
    return () => {
      cancelled = true
    }
  }, [permission])

  /** 시스템 알림을 띄운다. 권한이 없으면 false 를 반환하니 호출측이 토스트로 대체하면 된다. */
  const notify = useCallback(
    (title: string, body: string): boolean => {
      if (permission !== 'granted') return false
      try {
        new Notification(title, { body })
        return true
      } catch {
        return false
      }
    },
    [permission],
  )

  return { permission, notify }
}
