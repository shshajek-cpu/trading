import { useCallback, useEffect, useRef, useState } from 'react'
import { onSettingsChanged } from '../lib/syncBus'
import { randomCode } from '../lib/syncCode'

/** 동기화 대상 — 기기마다 달라야 하는 것(패널 접힘 등)은 넣지 않는다. */
const SYNCED_KEYS = [
  'trading.layout.v1',
  'trading.indicators.v3',
  'trading.indicatorTemplates.v1',
  'trading.drawings.v2',
  'trading.priceAlerts.v1',
  'trading.indicatorAlerts.v1',
  'trading.panes.v1',
  'trading.chartSettings.v1',
  'trading.watchlist.v1',
]

const CODE_KEY = 'trading.syncCode'
/** 마지막으로 맞춘 서버 기록의 시각(at). 올릴 때 baseAt 으로 보내 서버가 충돌을 가린다. */
const STAMP_KEY = 'trading.syncStamp'
/** 마지막으로 서버와 맞춘(올리거나 내려받은) 로컬 설정의 지문. 지금 설정과 다르면 아직 안 올린 변경이 있다. */
const HASH_KEY = 'trading.syncHash'
/** 내려받은 탭이 다른 탭에 새로고침을 알리는 채널 — 다른 탭이 메모리의 옛 설정을 도로 저장하지 않게. */
const CHANNEL = 'trading.sync'

/** 설정이 바뀐 뒤 올리기까지 기다리는 시간 — 저장 폭주를 막는다. */
const DEBOUNCE_MS = 2500
/** 탭으로 돌아올 때 서버를 확인하는 최소 간격. */
const CHECK_GAP_MS = 15_000
/** keepalive 요청 본문 한도(브라우저 64KB). 넘으면 보통 요청으로 보낸다. */
const KEEPALIVE_MAX = 60_000

const CONFLICT_MESSAGE =
  '다른 기기에서 설정이 바뀌어 자동 저장을 멈췄습니다. 동기화 창에서 내려받기(이 기기 변경 버림) 또는 지금 올리기(다른 기기 변경 덮어씀)를 고르세요.'

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error'
/** 내려받기 결과: 받아서 적용함 · 서버에 기록 없음 · 실패(네트워크 등). */
export type PullResult = 'pulled' | 'empty' | 'error'
/** 올리기 결과. conflict = 다른 기기가 먼저 저장해 서버가 거부함(409). */
export type SaveResult = { ok: true } | { ok: false; conflict: boolean; message: string }

/** force = 서버 값을 무조건 덮어씀(지금 올리기) · auto = 자동 올리기(충돌은 onNotice 로 알림) · save = 저장 버튼(결과는 부른 쪽이 알림). */
type PushMode = 'force' | 'auto' | 'save'

function snapshot(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of SYNCED_KEYS) {
    const v = localStorage.getItem(k)
    if (v !== null) out[k] = v
  }
  return out
}

/** 받은 설정을 로컬에 덮어쓰고, 값이 실제로 바뀐 키를 돌려준다. */
function apply(data: Record<string, unknown>): string[] {
  const changed: string[] = []
  for (const k of SYNCED_KEYS) {
    const v = data[k]
    if (typeof v !== 'string' || localStorage.getItem(k) === v) continue
    localStorage.setItem(k, v)
    changed.push(k)
  }
  return changed
}

/**
 * 이 탭의 설정 훅들에 바뀐 키를 알린다. 각 훅은 다른 탭의 변경을 받으려고 storage 이벤트를 듣는데,
 * 브라우저는 쓴 탭 자신에게는 보내지 않는다 — 같은 모양의 이벤트를 직접 보내 새로고침 없이 화면에 반영한다.
 * (다른 탭에는 브라우저가 진짜 storage 이벤트를 보낸다.)
 */
function announce(keys: string[]): void {
  for (const key of keys) {
    window.dispatchEvent(
      new StorageEvent('storage', { key, newValue: localStorage.getItem(key), storageArea: localStorage, url: location.href }),
    )
  }
}

function snapshotString(): string {
  return JSON.stringify(snapshot())
}

/** 설정 문자열의 짧은 지문(FNV-1a 32비트 + 길이). 같은지 비교에만 쓴다. */
function hashOf(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${(h >>> 0).toString(36)}-${text.length}`
}

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** null 이면 지운다. 저장 실패는 무시한다. */
function writeKey(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* 저장 실패는 무시 */
  }
}

function readStamp(): number {
  const v = Number(readKey(STAMP_KEY))
  return Number.isFinite(v) ? v : 0
}

/** fetch 실패(TypeError 'Failed to fetch')는 영어 원문 대신 한국어로 알린다. */
function failText(error: unknown, offline: string, label: string): string {
  if (error instanceof TypeError) return offline
  return `${label}: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
}

export function useSync(opts?: { onNotice?: (message: string) => void }) {
  const [code, setCodeState] = useState<string>(() => readKey(CODE_KEY) ?? '')
  const [status, setStatus] = useState<SyncStatus>(code ? 'idle' : 'off')
  const [message, setMessage] = useState('')
  const codeRef = useRef(code)
  const noticeRef = useRef(opts?.onNotice)
  noticeRef.current = opts?.onNotice
  const timerRef = useRef(0)
  // 서버가 더 최신이라 409 로 막힌 상태. 내려받기나 수동 올리기 전까지 자동 올리기를 멈춘다.
  const blockedRef = useRef(false)
  // 막힌 사실을 이미 알렸는지 — 탭을 오갈 때마다 같은 안내를 띄우지 않게.
  const noticedRef = useRef(false)
  // 올리기는 한 줄로 세운다 — 겹쳐 보내면 뒤 요청이 앞 요청의 baseAt 으로 가 스스로 409 를 맞는다.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  // 지금 올리는 중인 설정의 지문. 숨김·페이지 닫기가 연달아 와도 같은 내용을 두 번 보내지 않게.
  const sendingRef = useRef('')
  const lastCheckRef = useRef(0)
  const channelRef = useRef<BroadcastChannel | null>(null)
  // 앱을 연 순간의 설정 지문. 열자마자 다른 곳이 설정을 다시 써도(저장 형식 정리, 알림에서 연 종목 등)
  // 첫 확인에서는 연 순간을 기준으로 '안 올린 변경'을 가린다. 앱을 연 뒤에 코드를 정했으면 기준이 없으니 쓰지 않는다.
  const [mountHash] = useState(() => (code ? hashOf(snapshotString()) : ''))
  const firstCheckRef = useRef(!!code)

  const block = useCallback((notice: boolean) => {
    blockedRef.current = true
    setStatus('error')
    setMessage(CONFLICT_MESSAGE)
    if (notice && !noticedRef.current) noticeRef.current?.(CONFLICT_MESSAGE)
    noticedRef.current = true
  }, [])

  /** 코드 상태만 바꾼다(저장소는 부른 쪽이 맡는다). */
  const adoptCode = useCallback((next: string) => {
    codeRef.current = next
    setCodeState(next)
    window.clearTimeout(timerRef.current)
    blockedRef.current = false
    noticedRef.current = false
    sendingRef.current = ''
    // 코드를 바꾼 뒤의 확인은 '연 순간' 기준이 아니라 지금의 맞춘 지문(HASH_KEY)과 비교한다.
    firstCheckRef.current = false
    setStatus(next ? 'idle' : 'off')
    setMessage('')
  }, [])

  /**
   * 서버에서 받은 설정을 로컬에 덮어쓰고 그 상태를 '맞춘 상태'로 기록한다.
   * live = 이 탭 화면에 바로 반영(자동 받기). 아니면 부른 쪽이 새로고침하고, 다른 탭도 새로고침시킨다(내려받기 버튼).
   */
  const applyPulled = useCallback((data: Record<string, unknown>, at: number, live = false) => {
    window.clearTimeout(timerRef.current)
    const changed = apply(data)
    writeKey(STAMP_KEY, String(at))
    writeKey(HASH_KEY, hashOf(snapshotString()))
    blockedRef.current = false
    noticedRef.current = false
    if (live) {
      announce(changed)
      return
    }
    // 다른 탭은 옛 설정을 메모리에 들고 있다 — 새로고침시켜 도로 저장하지 않게 한다.
    channelRef.current?.postMessage('pulled')
  }, [])

  /** 서버에서 받아 로컬에 덮어쓴다. 'pulled' 면 새로고침해야 화면에 반영된다. 'empty' = 서버에 기록 없음. */
  const pull = useCallback(
    async (c: string): Promise<PullResult> => {
      setStatus('syncing')
      try {
        const res = await fetch(`/api/settings?code=${encodeURIComponent(c)}`)
        const body = (await res.json().catch(() => ({}))) as {
          data?: Record<string, unknown>
          at?: number
          error?: string
        }
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        if (body.data) {
          applyPulled(body.data, body.at ?? 0)
          setStatus('idle')
          setMessage('불러왔습니다')
          return 'pulled'
        }
        setStatus('idle')
        setMessage('서버에 저장된 설정이 없습니다')
        return 'empty'
      } catch (e) {
        setStatus('error')
        setMessage(failText(e, '서버에 연결하지 못해 불러오지 못했습니다', '불러오기 실패'))
        return 'error'
      }
    },
    [applyPulled],
  )

  /** 로컬 설정을 서버에 올린다. 앞선 올리기가 끝난 뒤 그 시점의 설정으로 보낸다. */
  const doPush = useCallback(
    (c: string, mode: PushMode, keepalive = false): Promise<SaveResult> => {
      const run = async (): Promise<SaveResult> => {
        // 줄 서 있는 동안 코드가 바뀌었으면(동기화 끄기 등) 옛 코드로 보내지 않는다.
        if (codeRef.current !== c) return { ok: false, conflict: false, message: '동기화 코드가 바뀌었습니다' }
        const snap = snapshotString()
        // snap 은 이미 JSON 이다 — 100KB 가까운 설정을 두 번 직렬화하지 않고 그대로 끼운다.
        const body = `{"data":${snap},"baseAt":${readStamp()},"force":${mode === 'force'}}`
        setStatus('syncing')
        try {
          const res = await fetch(`/api/settings?code=${encodeURIComponent(c)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body,
            // 탭을 닫는 중에도 끝까지 가도록. 본문(바이트)이 한도를 넘으면 브라우저가 거부하므로 보통 요청으로 보낸다.
            keepalive: keepalive && new Blob([body]).size < KEEPALIVE_MAX,
          })
          // 그사이 코드가 바뀌었으면 옛 코드의 결과로 새 코드의 기록을 건드리지 않는다.
          if (codeRef.current !== c) return { ok: false, conflict: false, message: '동기화 코드가 바뀌었습니다' }
          if (res.status === 409) {
            // 다른 기기가 먼저 저장했다. 로컬을 덮어쓰지 않고 멈춘다.
            block(mode === 'auto')
            return { ok: false, conflict: true, message: CONFLICT_MESSAGE }
          }
          const reply = (await res.json().catch(() => ({}))) as { at?: number; error?: string }
          if (!res.ok) throw new Error(reply.error ?? `HTTP ${res.status}`)
          writeKey(STAMP_KEY, String(reply.at ?? Date.now()))
          // 보낸 내용을 기준으로 삼는다 — 요청 중에 바뀐 설정은 아직 안 올린 변경으로 남는다.
          writeKey(HASH_KEY, hashOf(snap))
          blockedRef.current = false
          noticedRef.current = false
          setStatus('idle')
          setMessage('저장했습니다')
          return { ok: true }
        } catch (e) {
          const text = failText(e, '서버에 연결하지 못해 저장하지 못했습니다', '저장 실패')
          setStatus('error')
          setMessage(text)
          return { ok: false, conflict: false, message: text }
        }
      }
      const next = queueRef.current.then(run)
      queueRef.current = next
      return next
    },
    [block],
  )

  /** 안 올린 변경이 있으면 바로 올린다. keepalive = 탭을 숨기거나 닫는 중. */
  const flush = useCallback(
    (keepalive: boolean) => {
      window.clearTimeout(timerRef.current)
      const c = codeRef.current
      if (!c || blockedRef.current) return // 충돌로 막힌 상태면 올리지 않는다
      const hash = hashOf(snapshotString())
      if (readKey(HASH_KEY) === hash || sendingRef.current === hash) return // 이미 맞췄거나 올리는 중
      sendingRef.current = hash
      void doPush(c, 'auto', keepalive).then(() => {
        if (sendingRef.current === hash) sendingRef.current = ''
      })
    },
    [doPush],
  )

  /**
   * 앱을 열거나 탭으로 돌아올 때 서버를 확인한다.
   * 서버가 더 새롭고 이 기기에 안 올린 변경이 없으면 받아서 바로 화면에 반영하고(새로고침 없이),
   * 안 올린 변경이 있으면 멈추고 알린다. 서버가 새롭지 않으면 안 올린 변경을 올린다.
   */
  const check = useCallback(async () => {
    const c = codeRef.current
    if (!c || document.visibilityState === 'hidden') return
    const now = Date.now()
    if (now - lastCheckRef.current < CHECK_GAP_MS) return
    lastCheckRef.current = now
    const first = firstCheckRef.current
    firstCheckRef.current = false
    await queueRef.current // 올리는 중인 요청이 끝난 뒤 판단한다

    const stamp = readStamp()
    let body: { data?: Record<string, unknown>; at?: number }
    try {
      const res = await fetch(`/api/settings?code=${encodeURIComponent(c)}&since=${stamp}`)
      if (!res.ok) return
      body = (await res.json()) as typeof body
    } catch {
      return // 확인은 조용히 — 다음에 다시 한다
    }
    if (codeRef.current !== c) return

    const at = typeof body.at === 'number' ? body.at : 0
    const snap = snapshotString()
    const synced = readKey(HASH_KEY)
    const dirty = synced !== hashOf(snap)

    if (!body.data || at <= stamp) {
      // 서버가 새롭지 않다. 서버가 비었으면(코드만 만들고 못 올림) 올리고, 안 올린 변경이 있어도 올린다.
      if (!body.data && at === 0) {
        if (!blockedRef.current) void doPush(c, 'auto')
      } else if (dirty) flush(false)
      return
    }

    // 서버가 더 새롭다. 내용이 이미 같으면(올렸는데 응답을 못 받은 경우 등) 시각만 맞춘다.
    if (JSON.stringify(body.data) === snap) {
      writeKey(STAMP_KEY, String(at))
      writeKey(HASH_KEY, hashOf(snap))
      blockedRef.current = false
      noticedRef.current = false
      setStatus('idle')
      setMessage('')
      return
    }
    // 첫 확인은 앱을 연 순간을 기준으로 본다 — 열자마자 생긴 자동 저장 때문에 받아오기를 못 하는 일이 없게.
    if (first ? synced !== mountHash : dirty) {
      block(true)
      return
    }
    try {
      applyPulled(body.data, at, true)
    } catch {
      return // 저장 공간 부족 등 — 그대로 둔다
    }
    setStatus('idle')
    setMessage('')
    noticeRef.current?.('다른 기기에서 바꾼 설정을 받아왔습니다')
  }, [applyPulled, block, doPush, flush, mountHash])

  // 다른 탭이 내려받으면 새로고침한다. 이 탭 메모리의 옛 설정(레이아웃·지표 등)이 받아 온 설정을 덮지 않게.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = (e: MessageEvent) => {
      if (e.data === 'pulled') window.location.reload()
    }
    channelRef.current = channel
    return () => {
      channelRef.current = null
      channel.close()
    }
  }, [])

  // 다른 탭에서 코드를 바꾸면 따라간다 — 옛 코드로 계속 올리지 않게.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CODE_KEY && (e.newValue ?? '') !== codeRef.current) adoptCode(e.newValue ?? '')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [adoptCode])

  // 앱을 열 때 서버를 확인한다.
  useEffect(() => {
    // 예전 버전은 지문을 두지 않았다. 한 번이라도 맞춘 적이 있으면 지금 상태를 맞춘 것으로 본다(예전 동작과 같다).
    if (codeRef.current && readKey(HASH_KEY) === null && readStamp() > 0) writeKey(HASH_KEY, mountHash)
    void check()
  }, [check, mountHash])

  // 설정이 바뀌면 조금 기다렸다가 한 번에 올린다. 탭을 숨기거나 닫으면 기다리지 않고 바로 올리고,
  // 탭으로 돌아오면 서버를 확인한다.
  useEffect(() => {
    if (!code) return
    const onChange = () => {
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => flush(false), DEBOUNCE_MS)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush(true)
      else void check()
    }
    const onPageHide = () => flush(true)
    const off = onSettingsChanged(onChange)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      off()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.clearTimeout(timerRef.current)
    }
  }, [code, flush, check])

  const setCode = useCallback(
    (next: string) => {
      if (next === codeRef.current) return
      writeKey(CODE_KEY, next || null)
      // 옛 코드 기준의 동기화 기록은 새 코드에 맞지 않는다 — 처음부터 맞춘다.
      writeKey(STAMP_KEY, null)
      writeKey(HASH_KEY, null)
      adoptCode(next)
    },
    [adoptCode],
  )

  // 지금 올리기 버튼: 무조건 덮어쓴다.
  const push = useCallback(
    async (c: string): Promise<void> => {
      await doPush(c, 'force')
    },
    [doPush],
  )

  /** 저장 버튼·Ctrl+S: 서버의 충돌 검사를 거쳐 올린다. 결과 안내는 부른 쪽이 한다. */
  const save = useCallback(async (): Promise<SaveResult> => {
    const c = codeRef.current
    if (!c) return { ok: false, conflict: false, message: '동기화 코드가 없습니다' }
    window.clearTimeout(timerRef.current)
    await queueRef.current // 올리는 중인 요청이 끝난 뒤 판단한다
    // 이미 서버와 같으면 올릴 것이 없다 — 쓰기 한도를 아끼고, 다른 기기의 더 새 설정도 건드리지 않는다.
    if (!blockedRef.current && readKey(HASH_KEY) === hashOf(snapshotString())) {
      setStatus('idle')
      setMessage('저장했습니다')
      return { ok: true }
    }
    // 충돌(409)이면 block 이 '알린 것'으로 표시해 자동 안내가 같은 내용을 한 번 더 띄우지 않는다.
    return doPush(c, 'save')
  }, [doPush])

  /** 새 코드를 만들어 켜고, 이 기기 설정을 올리기 시작한다(끝을 기다리지 않는다). */
  const createCode = useCallback((): string => {
    const next = randomCode()
    setCode(next)
    void doPush(next, 'auto')
    return next
  }, [setCode, doPush])

  return { code, setCode, status, message, pull, push, save, createCode }
}
