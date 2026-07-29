import { useCallback, useEffect, useRef, useState } from 'react'
import type { PriceAlert } from './usePriceAlerts'

export type PushState = 'unsupported' | 'off' | 'on' | 'working' | 'error'

const b64uToBytes = (s: string): Uint8Array => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function toRecord(sub: PushSubscription) {
  const json = sub.toJSON()
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  }
}

/**
 * 앱을 닫아도 오는 알림.
 *
 * 브라우저 푸시는 서비스워커가 받아야 하고, 서버는 보낼 주소를 알아야 한다.
 * 어느 기기의 알림인지 묶으려면 동기화 코드가 필요하다.
 */
export function usePushAlerts(code: string, alerts: PriceAlert[]) {
  const supported =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

  const [state, setState] = useState<PushState>(supported ? 'off' : 'unsupported')
  const [message, setMessage] = useState('')
  const timerRef = useRef(0)

  // 이미 구독돼 있는지 확인한다.
  useEffect(() => {
    if (!supported || !code) return
    void navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setState(sub ? 'on' : 'off')
    })
  }, [supported, code])

  const enable = useCallback(async () => {
    if (!supported || !code) return
    setState('working')
    setMessage('')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState('error')
        setMessage('브라우저에서 알림을 허용해 주세요')
        return
      }

      const { publicKey } = (await fetch('/api/push?key=1').then((r) => r.json())) as {
        publicKey: string
      }
      if (!publicKey) throw new Error('서버에 푸시 키가 없습니다')

      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64uToBytes(publicKey) as BufferSource,
        }))

      const res = await fetch(`/api/push?code=${encodeURIComponent(code)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subs: [toRecord(sub)], alerts: [] }),
      })
      if (!res.ok) throw new Error(`등록 실패 ${res.status}`)

      setState('on')
      setMessage('앱을 닫아도 알림이 옵니다')
    } catch (e) {
      setState('error')
      setMessage(e instanceof Error ? e.message : '설정 실패')
    }
  }, [supported, code])

  const disable = useCallback(async () => {
    if (!supported || !code) return
    setState('working')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch(
          `/api/push?code=${encodeURIComponent(code)}&endpoint=${encodeURIComponent(sub.endpoint)}`,
          { method: 'DELETE' },
        )
        await sub.unsubscribe()
      }
      setState('off')
      setMessage('')
    } catch (e) {
      setState('error')
      setMessage(e instanceof Error ? e.message : '해제 실패')
    }
  }, [supported, code])

  // 감시 목록을 서버와 맞춘다 — 알림을 고치면 서버도 따라와야 한다.
  useEffect(() => {
    if (state !== 'on' || !code) return
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      const watch = alerts
        .filter((a) => a.active)
        .map((a) => ({ id: a.id, symbol: a.symbol, condition: a.condition, price: a.price }))
      void fetch(`/api/push?code=${encodeURIComponent(code)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subs: [], alerts: watch }),
      })
    }, 1500)
    return () => window.clearTimeout(timerRef.current)
  }, [state, code, alerts])

  return { state, message, enable, disable, supported }
}
