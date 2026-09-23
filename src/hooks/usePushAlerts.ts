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


async function saveWatch(
  code: string,
  alerts: PriceAlert[],
  sub?: PushSubscription,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/push?code=${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subs: sub ? [toRecord(sub)] : [],
      alerts: alerts
        .filter((alert) => alert.active)
        .map(({ id, symbol, condition, price }) => ({ id, symbol, condition, price })),
    }),
    signal,
  })
  if (!res.ok) throw new Error(`서버 등록 실패 ${res.status}`)
}

async function getPublicKey(): Promise<Uint8Array> {
  const res = await fetch('/api/push?key=1')
  if (!res.ok) throw new Error(`푸시 키 조회 실패 ${res.status}`)
  const { publicKey } = (await res.json()) as { publicKey?: string }
  if (!publicKey) throw new Error('서버에 푸시 키가 없습니다')
  return b64uToBytes(publicKey)
}

function usesApplicationServerKey(sub: PushSubscription, key: Uint8Array): boolean {
  const current = sub.options.applicationServerKey
  if (!current) return false
  const bytes = new Uint8Array(current)
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index])
}


/**
 * 앱을 닫아도 오는 알림.
 *
 * 브라우저 푸시는 서비스워커가 받아야 하고, 서버는 보낼 주소를 알아야 한다.
 * 어느 기기의 알림인지 묶으려면 동기화 코드가 필요하다.
 */
export function usePushAlerts(code: string, alerts: PriceAlert[]) {
  const supported =
    typeof navigator !== 'undefined' &&
    typeof Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window

  const [state, setState] = useState<PushState>(supported ? 'off' : 'unsupported')
  const [message, setMessage] = useState('')
  const timerRef = useRef(0)
  const alertsRef = useRef(alerts)
  alertsRef.current = alerts

  // 브라우저에 남아 있는 구독도 현재 코드의 서버 레코드에 다시 묶는다.
  // KV 가 비었거나 동기화 코드를 바꾼 뒤에도 새로 구독할 필요 없이 복구된다.
  useEffect(() => {
    if (!supported) return
    if (!code) {
      setState('off')
      setMessage('')
      return
    }

    let cancelled = false
    const controller = new AbortController()
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (cancelled) return
        if (!sub) {
          setState('off')
          setMessage('')
          return
        }
        await saveWatch(code, alertsRef.current, sub, controller.signal)
        if (!cancelled) {
          setState('on')
          setMessage('')
        }
      } catch (error) {
        if (
          !cancelled &&
          !(error instanceof DOMException && error.name === 'AbortError')
        ) {
          setState('error')
          setMessage(error instanceof Error ? error.message : '구독 복구 실패')
        }
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [supported, code])

  const enable = useCallback(
    async (codeOverride?: string) => {
      if (!supported) return
      const targetCode = codeOverride ?? code
      if (!targetCode) {
        setState('error')
        setMessage('동기화 코드를 만들지 못했습니다')
        return
      }

      setState('working')
      setMessage('')
      try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          setState('error')
          setMessage('브라우저에서 알림을 허용해 주세요')
          return
        }

        const publicKey = await getPublicKey()
        const reg = await navigator.serviceWorker.ready
        let sub = await reg.pushManager.getSubscription()
        if (sub && !usesApplicationServerKey(sub, publicKey)) {
          await sub.unsubscribe()
          sub = null
        }
        sub ??= await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey as BufferSource,
        })

        // 구독과 현재 감시 목록을 한 요청으로 저장해야 앱을 바로 닫아도 빠지지 않는다.
        await saveWatch(targetCode, alerts, sub)
        setState('on')
        setMessage('앱을 닫아도 알림이 옵니다')
      } catch (error) {
        setState('error')
        setMessage(error instanceof Error ? error.message : '설정 실패')
      }
    },
    [supported, code, alerts],
  )

  const disable = useCallback(async () => {
    if (!supported) return
    setState('working')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        if (code) {
          const res = await fetch(
            `/api/push?code=${encodeURIComponent(code)}&endpoint=${encodeURIComponent(sub.endpoint)}`,
            { method: 'DELETE' },
          )
          if (!res.ok) throw new Error(`해제 실패 ${res.status}`)
        }
        await sub.unsubscribe()
      }
      setState('off')
      setMessage('')
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : '해제 실패')
    }
  }, [supported, code])

  // 감시 목록을 서버와 맞춘다 — 알림을 고치면 서버도 따라와야 한다.
  useEffect(() => {
    if (state !== 'on' || !code) return
    let cancelled = false
    const controller = new AbortController()
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      void saveWatch(code, alerts, undefined, controller.signal).catch((error: unknown) => {
        if (
          !cancelled &&
          !(error instanceof DOMException && error.name === 'AbortError')
        ) {
          setState('error')
          setMessage(error instanceof Error ? error.message : '알림 목록 동기화 실패')
        }
      })
    }, 1500)
    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timerRef.current)
    }
  }, [state, code, alerts])

  return { state, message, enable, disable, supported }
}
