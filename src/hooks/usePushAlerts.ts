import { useCallback, useEffect, useRef, useState } from 'react'
import type { ServerFire } from '../lib/alertLog'

export type PushState = 'unsupported' | 'off' | 'on' | 'working' | 'error'

/**
 * 이 기기 구독이 서버의 어느 코드에 어떤 주소(endpoint)로 올라가 있는지.
 * 코드가 바뀌거나 브라우저 구독이 새로 만들어지면 옛 등록을 지우는 데 쓴다 — 남겨 두면 같은 알림이 두 번 오거나
 * 서버가 죽은 주소로 보낸다. 무엇을 감시할지는 서버(감시기)가 동기화 설정에서 직접 읽으므로 여기 두지 않는다.
 */
const REG_KEY = 'trading.pushReg'

interface Registration {
  code: string
  /** 예전 앱이 적은 기록에는 없다. */
  endpoint?: string
}

function readReg(): Registration | null {
  try {
    const raw = localStorage.getItem(REG_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<Registration>
    if (typeof v.code !== 'string') return null
    return typeof v.endpoint === 'string' ? { code: v.code, endpoint: v.endpoint } : { code: v.code }
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

/**
 * 서버 응답. 서버가 먼저 울렸고 아직 아무 기기도 받지 않은 한 번만 알림·선·지표 알림 id, 서버가 최근에 보낸 푸시(fires —
 * 「매번」 알림 포함, 알림 기록에 쓴다), endpoint 를 주면 이 기기가 등록돼 있는지.
 */
interface PushStatus {
  registered?: boolean
  firedIds?: string[]
  fires?: ServerFire[]
}

const pushUrl = (code: string) => `/api/push?code=${encodeURIComponent(code)}`

/** 이 기기 구독을 등록한다. 같은 구독이 이미 있으면 서버는 다시 쓰지 않는다. */
async function saveSub(code: string, sub: PushSubscription, signal?: AbortSignal): Promise<PushStatus> {
  const res = await fetch(pushUrl(code), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subs: [toRecord(sub)] }),
    signal,
  })
  if (!res.ok) throw new Error(`서버 등록 실패 ${res.status}`)
  return (await res.json()) as PushStatus
}

/** 쓰지 않고 읽기만 한다 — 서버가 먼저 울린 id 와, endpoint 를 주면 이 기기가 등록돼 있는지. */
async function readStatus(code: string, endpoint: string | null, signal?: AbortSignal): Promise<PushStatus> {
  const query = endpoint ? `&endpoint=${encodeURIComponent(endpoint)}` : ''
  const res = await fetch(`${pushUrl(code)}${query}`, { signal })
  if (!res.ok) throw new Error(`서버 조회 실패 ${res.status}`)
  return (await res.json()) as PushStatus
}

/** 한 코드에서 이 기기(endpoint)의 구독을 지운다. */
async function removeSub(code: string, endpoint: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${pushUrl(code)}&endpoint=${encodeURIComponent(endpoint)}`, { method: 'DELETE', signal })
  if (!res.ok) throw new Error(`이전 등록 해제 실패 ${res.status}`)
}

/** 옛 코드나 옛 구독 주소로 남은 이 기기 등록을 지운다. 남겨 두면 같은 알림이 두 번 오거나 서버가 죽은 주소로 보낸다. */
async function dropStaleReg(code: string, endpoint: string | null, signal?: AbortSignal): Promise<void> {
  const prev = readReg()
  if (!prev) return
  if (prev.code === code && (prev.endpoint === undefined || prev.endpoint === endpoint)) return
  const stale = prev.endpoint ?? endpoint
  if (stale) await removeSub(prev.code, stale, signal)
  writeReg(null)
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

/** 서비스워커(sw-push.js)가 푸시를 받았다고 알린 뒤 서버를 다시 보기까지 기다리는 시간 — 감시기가 발동을 적을 틈. */
const PUSH_RECHECK_MS = 5000

/**
 * 앱을 닫아도 오는 알림.
 *
 * 브라우저 푸시는 서비스워커가 받아야 하고, 서버는 보낼 주소를 알아야 한다. 이 훅은 이 기기 구독만 등록한다 —
 * 감시할 알림은 서버(감시기)가 모든 기기가 함께 쓰는 동기화 설정에서 직접 읽는다.
 * 서버가 먼저 울린 알림은 앱을 열 때·탭으로 돌아올 때·푸시를 받았을 때 받아 와 onServerFired 로 넘기고(로컬에서도 끈다),
 * 받았다고 서버에 알린다. 서버가 최근에 보낸 푸시(fires)도 함께 넘겨 알림 기록에 적게 한다.
 * 코드를 바꾸면 옛 코드의 이 기기 등록을 지우고 새 코드로 옮긴다. 코드가 없으면 구독도 해제한다.
 */
export function usePushAlerts(code: string, onServerFired: (ids: string[], fires: ServerFire[]) => void) {
  const supported =
    typeof navigator !== 'undefined' &&
    typeof Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window

  const [state, setState] = useState<PushState>(supported ? 'off' : 'unsupported')
  const [message, setMessage] = useState('')

  // 켜기·끄기가 도는 동안에는 코드 변경 복구가 상태를 건드리지 않는다(권한 창이 떠 있는 동안 'off' 로 되돌리던 문제).
  const busyRef = useRef(false)
  // 참조를 고정해 effect 의존성이 흔들리지 않게 한다.
  const onServerFiredRef = useRef(onServerFired)
  onServerFiredRef.current = onServerFired

  // 서버가 먼저 울린 알림을 로컬에서도 꺼(앱을 다시 열 때 또 울리지 않게) 받았다고 서버에 알린다.
  // 서버는 받은 id 를 다시 주지 않는다 — 그 뒤 다시 켠 알림을 또 끄지 않고, 서버도 다시 감시한다.
  // 보낸 푸시 목록(fires)은 확인하지 않는다 — 기록 쪽이 같은 것을 두 번 적지 않는다.
  const applyFired = useCallback(
    (status: PushStatus) => {
      const firedIds = status.firedIds ?? []
      const fires = Array.isArray(status.fires) ? status.fires : []
      if (firedIds.length === 0 && fires.length === 0) return
      onServerFiredRef.current(firedIds, fires)
      if (firedIds.length === 0) return
      void fetch(pushUrl(code), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ack: firedIds }),
      }).catch(() => {
        /* 못 알려도 끈 알림이 설정으로 동기화되면 서버가 알아챈다 */
      })
    },
    [code],
  )

  // 코드가 정해지거나 바뀔 때: 옛 등록을 정리하고, 브라우저에 남은 구독을 현재 코드에 다시 묶는다.
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

        await dropStaleReg(code, sub?.endpoint ?? null, signal)

        if (!sub) {
          if (idle()) {
            setState('off')
            setMessage('')
          }
          return
        }

        if (!code) {
          // 동기화 코드 없이는 서버가 감시할 수 없다 — 구독도 해제해 푸시가 오지 않게 한다.
          await sub.unsubscribe()
          if (idle()) {
            setState('off')
            setMessage('')
          }
          return
        }

        // 서버에 이 기기가 있으면 읽기만 하고, 없으면(처음이거나 서버 기록이 비었으면) 등록한다.
        let status = await readStatus(code, sub.endpoint, signal)
        if (status.registered !== true) status = await saveSub(code, sub, signal)
        writeReg({ code, endpoint: sub.endpoint })
        if (idle()) {
          applyFired(status)
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
  }, [supported, code, applyFired])

  // 켜져 있는 동안 탭으로 돌아오거나 푸시를 받으면 서버가 먼저 울린 알림을 다시 받아 온다(읽기만 한다).
  useEffect(() => {
    if (!supported || state !== 'on' || !code) return
    let cancelled = false
    let timer: number | undefined
    const controller = new AbortController()
    const recheck = () => {
      if (cancelled || busyRef.current) return
      readStatus(code, null, controller.signal)
        .then((status) => {
          if (!cancelled) applyFired(status)
        })
        .catch(() => {
          /* 다음에 돌아올 때 다시 본다 */
        })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') recheck()
    }
    const onMessage = (e: MessageEvent) => {
      const data: unknown = e.data
      if (typeof data !== 'object' || data === null || !('type' in data) || data.type !== 'push') return
      window.clearTimeout(timer)
      timer = window.setTimeout(recheck, PUSH_RECHECK_MS)
    }
    document.addEventListener('visibilitychange', onVisibility)
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      navigator.serviceWorker.removeEventListener('message', onMessage)
    }
  }, [supported, state, code, applyFired])

  const enable = useCallback(
    async () => {
      if (!supported || busyRef.current) return
      if (!code) {
        setState('error')
        setMessage('동기화 코드가 없습니다')
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

        await dropStaleReg(code, sub.endpoint)
        const status = await saveSub(code, sub)
        writeReg({ code, endpoint: sub.endpoint })
        applyFired(status)
        setState('on')
        setMessage('앱을 닫아도 알림이 옵니다')
      } catch (error) {
        setState('error')
        setMessage(errorText(error, '설정 실패'))
      } finally {
        busyRef.current = false
      }
    },
    [supported, code, applyFired],
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
        if (registered) await removeSub(registered, sub.endpoint)
        await sub.unsubscribe()
      }
      writeReg(null)
      setState('off')
      setMessage('')
    } catch (error) {
      setState('error')
      setMessage(errorText(error, '해제 실패'))
    } finally {
      busyRef.current = false
    }
  }, [supported, code])

  return { state, message, enable, disable, supported }
}
