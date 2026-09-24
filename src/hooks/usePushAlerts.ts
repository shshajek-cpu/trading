import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PriceAlert } from './usePriceAlerts'

export type PushState = 'unsupported' | 'off' | 'on' | 'working' | 'error'

/** 서버가 대신 감시할 수평선 알림. 가격이 선을 지나가면 울린다. */
export interface LineWatch {
  id: string
  symbol: string
  price: number
}

/** 푸시 본문에 붙는 메모 길이 한도. 서버(/api/push)도 같은 길이로 자른다. */
const MESSAGE_MAX = 200

/**
 * 이 기기 구독이 서버의 어느 코드에, 어떤 감시 목록으로 올라가 있는지.
 * 코드를 바꾸거나 동기화를 끄면 옛 코드 쪽 등록을 지우는 데 쓰고,
 * 목록이 그대로면 다시 쓰지 않는 데 쓴다(무료 플랜 KV 쓰기 한도 아끼기).
 */
const REG_KEY = 'trading.pushReg'

interface Registration {
  code: string
  /** 마지막으로 올린 감시 목록(JSON). */
  watch: string
}

function readReg(): Registration | null {
  try {
    const raw = localStorage.getItem(REG_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<Registration>
    return typeof v.code === 'string' && typeof v.watch === 'string' ? { code: v.code, watch: v.watch } : null
  } catch {
    return null
  }
}

function writeReg(reg: Registration | null): void {
  try {
    if (reg) localStorage.setItem(REG_KEY, JSON.stringify(reg))
    else localStorage.removeItem(REG_KEY)
  } catch {
    /* 저장 실패는 무시 — 다음 등록 때 다시 쓴다 */
  }
}

/** 아이폰은 홈 화면에 추가하지 않으면 푸시가 원천적으로 막힌다. 미리 알려줘야 한다. */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  return ios && !standalone
}

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

/** 네트워크 끊김(TypeError 'Failed to fetch')은 영어 원문 대신 한국어로 알린다. */
function errorText(error: unknown, fallback: string): string {
  if (error instanceof TypeError) return '서버에 연결하지 못했습니다'
  return error instanceof Error ? error.message : fallback
}

/** 서버에 올리는 감시 목록. 켜진 가격 알림(메모 포함)과 아직 안 울린 수평선 알림. */
interface WatchPayload {
  alerts: { id: string; symbol: string; condition: PriceAlert['condition']; price: number; message?: string }[]
  lines: LineWatch[]
}

function buildWatch(alerts: PriceAlert[], lines: LineWatch[]): WatchPayload {
  return {
    alerts: alerts
      .filter((alert) => alert.active)
      .map(({ id, symbol, condition, price, message }) => {
        const note = message?.trim().slice(0, MESSAGE_MAX)
        return note ? { id, symbol, condition, price, message: note } : { id, symbol, condition, price }
      }),
    lines: lines
      .filter((line) => Number.isFinite(line.price))
      .map(({ id, symbol, price }) => ({ id, symbol, price })),
  }
}

/** 서버 응답. 서버가 먼저 울린 알림·수평선 id 를 돌려준다(로컬에서 끄는 데 쓴다). */
interface SaveWatchResult {
  firedIds?: string[]
}

async function saveWatch(
  code: string,
  watch: WatchPayload,
  sub: PushSubscription,
  signal?: AbortSignal,
): Promise<SaveWatchResult> {
  const res = await fetch(`/api/push?code=${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subs: [toRecord(sub)], alerts: watch.alerts, lines: watch.lines }),
    signal,
  })
  if (!res.ok) throw new Error(`서버 등록 실패 ${res.status}`)
  return (await res.json()) as SaveWatchResult
}

/** 쓰지 않고 읽기만 한다 — 이 기기가 등록돼 있는지와 서버가 먼저 울린 id. */
async function readWatch(
  code: string,
  endpoint: string,
  signal?: AbortSignal,
): Promise<{ registered?: boolean; firedIds?: string[] }> {
  const res = await fetch(
    `/api/push?code=${encodeURIComponent(code)}&endpoint=${encodeURIComponent(endpoint)}`,
    { signal },
  )
  if (!res.ok) throw new Error(`서버 조회 실패 ${res.status}`)
  return (await res.json()) as { registered?: boolean; firedIds?: string[] }
}

/** 한 코드에서 이 기기(endpoint)의 구독과 감시 목록을 지운다. */
async function removeBucket(code: string, endpoint: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(
    `/api/push?code=${encodeURIComponent(code)}&endpoint=${encodeURIComponent(endpoint)}`,
    { method: 'DELETE', signal },
  )
  if (!res.ok) throw new Error(`이전 등록 해제 실패 ${res.status}`)
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
 * 코드를 바꾸면 옛 코드의 이 기기 등록을 지우고 새 코드로 옮긴다. 동기화를 끄면 구독도 해제한다.
 */
export function usePushAlerts(
  code: string,
  alerts: PriceAlert[],
  onServerFired: (ids: string[]) => void,
  lineAlerts: LineWatch[],
  onLinesFired: (ids: string[]) => void,
) {
  const supported =
    typeof navigator !== 'undefined' &&
    typeof Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window

  const [state, setState] = useState<PushState>(supported ? 'off' : 'unsupported')
  const [message, setMessage] = useState('')

  // 부르는 쪽이 렌더마다 새 배열을 넘겨도 내용이 같으면 서버에 다시 보내지 않도록 문자열로 비교한다.
  const watch = useMemo(() => buildWatch(alerts, lineAlerts), [alerts, lineAlerts])
  const watchKey = useMemo(() => JSON.stringify(watch), [watch])
  const watchRef = useRef(watch)
  watchRef.current = watch
  const watchKeyRef = useRef(watchKey)
  watchKeyRef.current = watchKey

  const alertsRef = useRef(alerts)
  alertsRef.current = alerts
  const linesRef = useRef(lineAlerts)
  linesRef.current = lineAlerts
  // 지금 이 기기의 구독. 디바운스 동기화 때 endpoint 를 알려 버킷을 맞춘다.
  const subRef = useRef<PushSubscription | null>(null)
  // 켜기·끄기가 도는 동안에는 코드 변경 복구가 상태를 건드리지 않는다(권한 창이 떠 있는 동안 'off' 로 되돌리던 문제).
  const busyRef = useRef(false)
  // 참조를 고정해 effect 의존성이 흔들리지 않게 한다.
  const onServerFiredRef = useRef(onServerFired)
  onServerFiredRef.current = onServerFired
  const onLinesFiredRef = useRef(onLinesFired)
  onLinesFiredRef.current = onLinesFired

  // 서버가 이미 울린 알림 중 로컬에서 아직 켜져 있는 것을 꺼 앱을 다시 열 때 중복 발동을 막는다.
  const notifyServerFired = useCallback((firedIds: string[] | undefined) => {
    if (!firedIds || firedIds.length === 0) return
    const fired = new Set(firedIds)
    const alertIds = alertsRef.current.filter((a) => a.active && fired.has(a.id)).map((a) => a.id)
    const lineIds = linesRef.current.filter((l) => fired.has(l.id)).map((l) => l.id)
    if (alertIds.length > 0) onServerFiredRef.current(alertIds)
    if (lineIds.length > 0) onLinesFiredRef.current(lineIds)
  }, [])

  // 코드가 정해지거나 바뀔 때: 옛 코드 등록을 정리하고, 브라우저에 남은 구독을 현재 코드에 다시 묶는다.
  // KV 가 비었거나 동기화 코드를 바꾼 뒤에도 새로 구독할 필요 없이 복구된다.
  useEffect(() => {
    if (!supported) return
    let cancelled = false
    const controller = new AbortController()
    const { signal } = controller
    const idle = () => !cancelled && !busyRef.current

    void (async () => {
      try {
        const reg = await navigator.serviceWorker.ready
        if (!idle()) return
        const sub = await reg.pushManager.getSubscription()
        if (!idle()) return

        // 옛 코드에 남은 이 기기 등록을 먼저 지운다. 남겨 두면 옛 코드로 계속 알림이 오고
        // (앱에서 지운 알림까지), 새 코드에도 등록되면 같은 알림이 두 번 온다.
        const prev = readReg()
        if (prev && prev.code !== code) {
          if (sub) await removeBucket(prev.code, sub.endpoint, signal)
          writeReg(null)
        }

        if (!sub) {
          subRef.current = null
          if (idle()) {
            setState('off')
            setMessage('')
          }
          return
        }

        if (!code) {
          // 동기화 코드 없이는 서버가 감시할 수 없다 — 구독도 해제해 푸시가 오지 않게 한다.
          await sub.unsubscribe()
          subRef.current = null
          if (idle()) {
            setState('off')
            setMessage('')
          }
          return
        }

        subRef.current = sub
        const key = watchKeyRef.current
        let firedIds: string[] | undefined
        let known = false
        const current = readReg()
        if (current && current.code === code && current.watch === key) {
          // 서버에 이미 같은 목록이 있으면 쓰지 않고 읽기만 한다.
          const status = await readWatch(code, sub.endpoint, signal)
          if (status.registered === true) {
            known = true
            firedIds = status.firedIds
          }
        }
        if (!known) {
          const result = await saveWatch(code, watchRef.current, sub, signal)
          writeReg({ code, watch: key })
          firedIds = result.firedIds
        }
        if (idle()) {
          notifyServerFired(firedIds)
          setState('on')
          setMessage('')
        }
      } catch (error) {
        // 정리(cleanup)에서 끊은 요청은 cancelled 라 idle() 이 거짓이다.
        if (idle()) {
          setState('error')
          setMessage(errorText(error, '구독 복구 실패'))
        }
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [supported, code, notifyServerFired])

  const enable = useCallback(
    async (codeOverride?: string) => {
      if (!supported || busyRef.current) return
      const targetCode = codeOverride ?? code
      if (!targetCode) {
        setState('error')
        setMessage('동기화 코드를 만들지 못했습니다')
        return
      }

      busyRef.current = true
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

        // 다른 코드에 남은 이 기기 등록은 지운다 — 두 코드로 같은 알림이 두 번 오지 않게.
        const prev = readReg()
        if (prev && prev.code !== targetCode) {
          await removeBucket(prev.code, sub.endpoint)
          writeReg(null)
        }

        subRef.current = sub
        // 구독과 현재 감시 목록을 한 요청으로 저장해야 앱을 바로 닫아도 빠지지 않는다.
        const key = watchKeyRef.current
        const result = await saveWatch(targetCode, watchRef.current, sub)
        writeReg({ code: targetCode, watch: key })
        notifyServerFired(result.firedIds)
        setState('on')
        setMessage('앱을 닫아도 알림이 옵니다')
      } catch (error) {
        setState('error')
        setMessage(errorText(error, '설정 실패'))
      } finally {
        busyRef.current = false
      }
    },
    [supported, code, notifyServerFired],
  )

  const disable = useCallback(async () => {
    if (!supported || busyRef.current) return
    busyRef.current = true
    setState('working')
    setMessage('')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const registered = readReg()?.code || code
        if (registered) await removeBucket(registered, sub.endpoint)
        await sub.unsubscribe()
      }
      writeReg(null)
      subRef.current = null
      setState('off')
      setMessage('')
    } catch (error) {
      setState('error')
      setMessage(errorText(error, '해제 실패'))
    } finally {
      busyRef.current = false
    }
  }, [supported, code])

  // 감시 목록을 서버와 맞춘다 — 알림을 고치면 서버도 따라와야 한다. 내용이 같으면 보내지 않는다.
  useEffect(() => {
    if (state !== 'on' || !code) return
    const payload = watchRef.current
    let cancelled = false
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const sub = subRef.current
      if (!sub || busyRef.current) return
      // 코드 변경 복구가 방금 같은 목록을 올렸으면 다시 쓰지 않는다.
      const sent = readReg()
      if (sent && sent.code === code && sent.watch === watchKey) return
      // 이 기기의 구독을 함께 보내 서버가 이 기기 버킷만 갱신하게 한다(다른 기기 알림 보존).
      void saveWatch(code, payload, sub, controller.signal)
        .then((result) => {
          writeReg({ code, watch: watchKey })
          if (!cancelled) notifyServerFired(result.firedIds)
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setState('error')
            setMessage(errorText(error, '알림 목록 동기화 실패'))
          }
        })
    }, 1500)
    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [state, code, watchKey, notifyServerFired])

  return { state, message, enable, disable, supported }
}
