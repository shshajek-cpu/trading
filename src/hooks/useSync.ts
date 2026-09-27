import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createLiveStore } from '../lib/liveStore'
import { onSettingsChanged } from '../lib/syncBus'
import { PERSONAL_SYNC_CODE } from '../lib/syncCode'
import { SYNCED_KEYS, canonicalSnapshot, hashText, mergeSnapshots, type Snapshot } from '../lib/syncMerge'

/** 이 기기의 동기화 코드. 옛 버전 탭은 이 키가 바뀌면 따라간다 — 늘 개인 공간 코드로 맞춰 둔다. */
const CODE_KEY = 'trading.syncCode'
/** 마지막으로 맞춘 서버 기록의 시각(at). 올릴 때 baseAt 으로 보내 서버가 엇갈린 저장을 가린다. */
const STAMP_KEY = 'trading.syncStamp'
/** 마지막으로 서버와 맞춘(올리거나 받은) 스냅샷 — 두 기기가 따로 바꿨을 때 합치는 기준. */
const BASE_KEY = 'trading.syncBase'
/** BASE_KEY 정규형의 지문. 지금 설정의 지문과 다르면 아직 안 올린 변경이 있다. */
const HASH_KEY = 'trading.syncHash'
/** 서버 설정으로 덮어쓴 탭이 다른 탭에 새로고침을 알리는 채널 — 다른 탭이 메모리의 옛 설정을 도로 저장하지 않게. */
const CHANNEL = 'trading.sync'

const API = `/api/settings?code=${encodeURIComponent(PERSONAL_SYNC_CODE)}`

/** 설정이 바뀐 뒤 올리기까지 기다리는 시간 — 저장 폭주를 막는다. */
const DEBOUNCE_MS = 2500
/** 화면이 보이는 동안 서버를 확인하는 간격. 새것이 없으면 서버는 시각만 돌려준다(KV 읽기 1번). */
const POLL_MS = 15_000
/** 자동 확인(열기·탭 복귀·주기)끼리 이보다 가까우면 건너뛴다. */
const CHECK_GAP_MS = 5_000
/** keepalive 요청 본문 한도(브라우저 64KB). 넘으면 보통 요청으로 보낸다. */
const KEEPALIVE_MAX = 60_000
/** 요청 제한 시간 — 응답 없는 요청 하나가 줄을 막아 동기화가 멈추지 않게. */
const REQUEST_TIMEOUT_MS = 20_000
/** 올리는 사이 다른 기기가 또 저장하면(409) 다시 받아 합쳐 올린다 — 그 횟수 한도. 넘으면 다음 확인 때 다시 한다. */
const MERGE_ROUNDS = 3
/** '받아왔습니다' 안내 최소 간격. */
const NOTICE_GAP_MS = 60_000

export type SyncStatus = 'synced' | 'syncing' | 'offline'
/** lastAt = 서버와 마지막으로 맞춘 이 기기 시각(0 = 아직). message = 오프라인일 때 자세한 이유. */
export interface SyncState {
  status: SyncStatus
  lastAt: number
  message: string
}
export type SyncResult = { ok: true } | { ok: false; message: string }
/** 서버 설정으로 덮어쓰기 결과: 받아서 적용함(새로고침 필요) · 서버에 기록 없음 · 실패. */
export type PullResult = 'pulled' | 'empty' | 'error'

/** 저장 버튼 툴팁·동기화 창이 같이 쓰는 상태 문구. */
export function syncStatusText(s: SyncState): string {
  if (s.status === 'syncing') return '동기화 중…'
  if (s.status === 'offline') return '오프라인 — 연결되면 다시 시도'
  return s.lastAt ? `동기화됨 · 마지막 ${new Date(s.lastAt).toTimeString().slice(0, 8)}` : '동기화됨'
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

function snapshot(): Snapshot {
  const out: Snapshot = {}
  for (const k of SYNCED_KEYS) {
    const v = readKey(k)
    if (v !== null) out[k] = v
  }
  return out
}

/** 받은 값에서 동기화 대상 문자열만 고른다. 객체가 아니면 null. */
function toSnapshot(value: unknown): Snapshot | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as Record<string, unknown>
  const out: Snapshot = {}
  for (const k of SYNCED_KEYS) {
    const v = obj[k]
    if (typeof v === 'string') out[k] = v
  }
  return out
}

function readBase(): Snapshot | null {
  const raw = readKey(BASE_KEY)
  if (raw === null) return null
  try {
    return toSnapshot(JSON.parse(raw))
  } catch {
    return null
  }
}

/** 키별 [원문, 정규형] — 바뀌지 않은 설정은 확인할 때마다 다시 파싱하지 않는다. */
const canonMemo = new Map<string, [string, string]>()

/** 스냅샷의 정규형 지문. 속성 순서·공백만 다른 재저장은 같은 지문이라 올리지 않는다. */
function hashOf(snap: Snapshot): string {
  return hashText(canonicalSnapshot(snap, canonMemo))
}

/** 서버와 맞춘 상태를 기록한다. 기준 스냅샷을 못 쓰면(저장 공간 부족) 지운다 — 옛 기준으로 합치는 것보다 첫 동기화 규칙이 낫다. */
function writeBase(snap: Snapshot, at: number): void {
  writeKey(STAMP_KEY, String(at))
  writeKey(HASH_KEY, hashOf(snap))
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(snap))
  } catch {
    writeKey(BASE_KEY, null)
  }
}

function clearBase(): void {
  writeKey(STAMP_KEY, null)
  writeKey(HASH_KEY, null)
  writeKey(BASE_KEY, null)
}

/**
 * 이 기기를 개인 공간 코드로 맞춘다. 다른 코드나 '동기화 끔'에서 넘어왔으면 그 기록은 버리고 처음 맞추듯 합친다.
 * 예전 버전은 맞춘 설정 없이 원문 지문만 두었다 — 지금 설정이 그 지문과 같으면 그때 맞춘 그대로라 기준으로 삼는다.
 */
function preparePersonalSpace(): void {
  if (readKey(CODE_KEY) !== PERSONAL_SYNC_CODE) {
    writeKey(CODE_KEY, PERSONAL_SYNC_CODE)
    clearBase()
    return
  }
  if (readKey(BASE_KEY) !== null) return
  const stamp = readStamp()
  const snap = snapshot()
  if (stamp > 0 && readKey(HASH_KEY) === hashText(JSON.stringify(snap))) writeBase(snap, stamp)
  else clearBase()
}

/** 받은 설정을 로컬에 쓰고, 값이 실제로 바뀐 키를 돌려준다. 없는 키는 건드리지 않는다. */
function apply(data: Snapshot): string[] {
  const changed: string[] = []
  for (const k of SYNCED_KEYS) {
    const v = data[k]
    if (v === undefined || readKey(k) === v) continue
    try {
      localStorage.setItem(k, v)
      changed.push(k)
    } catch {
      /* 저장 공간 부족 — 이 키는 다음에 다시 맞춘다 */
    }
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

/** 서버 기록을 받는다. since 를 주면 그보다 새것이 없을 때 data 없이 시각만 온다. at = 0 이면 서버에 기록이 없다. */
async function getRemote(since?: number): Promise<{ data: Snapshot | null; at: number }> {
  const res = await fetch(since === undefined ? API : `${API}&since=${since}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const body = (await res.json().catch(() => ({}))) as { data?: unknown; at?: unknown; error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return { data: toSnapshot(body.data), at: typeof body.at === 'number' ? body.at : 0 }
}

/** 스냅샷을 올린다. 서버 기록 시각을 돌려주고, 다른 기기가 먼저 저장했으면(409, force 가 아닐 때) 'conflict'. */
async function putRemote(snap: Snapshot, force: boolean, keepalive: boolean): Promise<number | 'conflict'> {
  const body = `{"data":${JSON.stringify(snap)},"baseAt":${readStamp()},"force":${force}}`
  const res = await fetch(API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
    // 탭을 닫는 중에도 끝까지 가도록. 본문(바이트)이 한도를 넘으면 브라우저가 거부하므로 보통 요청으로 보낸다.
    keepalive: keepalive && new Blob([body]).size < KEEPALIVE_MAX,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (res.status === 409 && !force) return 'conflict'
  const reply = (await res.json().catch(() => ({}))) as { at?: number; error?: string }
  if (!res.ok) throw new Error(reply.error ?? `HTTP ${res.status}`)
  return reply.at ?? Date.now()
}

/** 저장 버튼 등이 실패를 알릴 때 쓰는 오프라인 문구. */
const OFFLINE_TEXT = '오프라인 — 연결되면 다시 시도합니다'

/** 서버가 알려 준 오류(HTTP 등)의 문구. 연결 실패(TypeError 'Failed to fetch')·시간 초과는 null — 오프라인 표시로 충분하다. */
function serverError(error: unknown): string | null {
  if (error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError')) return null
  return `서버 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
}

/**
 * 늘 켜진 설정 동기화. 모든 기기가 개인 공간 하나(PERSONAL_SYNC_CODE)를 쓴다.
 * 바꾼 설정은 조금 모아 올리고, 화면이 보이는 동안 15초마다(그리고 열 때·돌아올 때) 서버를 확인한다.
 * 두 기기가 같은 기준에서 따로 바꿨으면 멈추지 않고 합쳐서(syncMerge) 이 기기에 반영한 뒤 올린다.
 */
export function useSync(opts?: { onNotice?: (message: string) => void }) {
  const [state] = useState(() => {
    preparePersonalSpace()
    return createLiveStore<SyncState>({ status: 'syncing', lastAt: 0, message: '' })
  })
  const noticeRef = useRef(opts?.onNotice)
  noticeRef.current = opts?.onNotice
  const timerRef = useRef(0)
  // 요청은 한 줄로 세운다 — 겹쳐 보내면 뒤 요청이 앞 요청의 baseAt 으로 가 스스로 409 를 맞는다.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  // 줄 서 있지만 아직 시작하지 않은 맞추기. 그사이 온 요청(확인·올리기)은 여기에 합친다.
  const jobRef = useRef<{ flags: { fetch: boolean; keepalive: boolean }; promise: Promise<SyncResult> } | null>(null)
  const lastCheckRef = useRef(0)
  const lastNoticeRef = useRef(0)
  const channelRef = useRef<BroadcastChannel | null>(null)

  /** 상태를 알린다. synced 는 마지막으로 맞춘 시각도 새로 적는다. */
  const report = useCallback(
    (status: SyncStatus, message = '') => {
      const prev = state.get()
      if (status !== 'synced' && prev.status === status && prev.message === message) return
      state.set({ status, lastAt: status === 'synced' ? Date.now() : prev.lastAt, message })
    },
    [state],
  )

  /** 요청 실패: 오프라인으로 표시하고(서버 오류면 그 문구도), 부른 쪽이 알릴 결과를 돌려준다. */
  const fail = useCallback(
    (error: unknown): SyncResult => {
      const detail = serverError(error)
      report('offline', detail ?? '')
      return { ok: false, message: detail ?? OFFLINE_TEXT }
    },
    [report],
  )

  const enqueue = useCallback(<T>(task: () => Promise<T>): Promise<T> => {
    const next = queueRef.current.then(task)
    queueRef.current = next.catch(() => undefined)
    return next
  }, [])

  /**
   * 서버의 더 새 기록을 이 기기에 합쳐 반영한다(새로고침 없이). 기준은 그 서버 기록이 된다 —
   * 합친 결과에 이 기기 변경이 남아 있으면 기준과 달라 이어서 올린다.
   */
  const incorporate = useCallback((server: Snapshot, at: number) => {
    const merged = mergeSnapshots(readBase(), snapshot(), server)
    const changed = apply(merged)
    writeBase(server, at)
    if (changed.length === 0) return
    announce(changed)
    const now = Date.now()
    if (now - lastNoticeRef.current < NOTICE_GAP_MS) return
    lastNoticeRef.current = now
    noticeRef.current?.('다른 기기에서 바꾼 설정을 받아왔습니다')
  }, [])

  /**
   * 서버와 맞춘다. fetchFirst = 먼저 서버를 확인해 더 새 기록이 있으면 합쳐 반영한다.
   * 그다음 기준과 다른(안 올린) 변경이 있을 때만 올린다. 그사이 다른 기기가 저장했으면(409) 다시 받아 합쳐 올린다.
   */
  const reconcile = useCallback(
    async (fetchFirst: boolean, keepalive: boolean): Promise<SyncResult> => {
      let fetchNow = fetchFirst
      try {
        for (let round = 0; round < MERGE_ROUNDS; round++) {
          let serverEmpty = false
          if (fetchNow) {
            const stamp = readStamp()
            const remote = await getRemote(stamp)
            if (remote.data && remote.at > stamp) incorporate(remote.data, remote.at)
            serverEmpty = remote.at === 0
          }
          const snap = snapshot()
          // 서버가 비었으면(처음이거나 기록이 지워짐) 맞춘 기록과 같아도 올린다. 올릴 것이 아예 없으면 그대로 둔다.
          const upload = serverEmpty ? Object.keys(snap).length > 0 : readKey(HASH_KEY) !== hashOf(snap)
          if (!upload) {
            if (fetchNow) report('synced')
            return { ok: true }
          }
          report('syncing')
          const at = await putRemote(snap, false, keepalive)
          if (at === 'conflict') {
            fetchNow = true
            continue
          }
          // 보낸 내용을 기준으로 삼는다 — 요청 중에 바뀐 설정은 아직 안 올린 변경으로 남는다.
          writeBase(snap, at)
          report('synced')
          return { ok: true }
        }
        return { ok: false, message: '다른 기기와 저장이 엇갈려 잠시 뒤 다시 맞춥니다' }
      } catch (e) {
        return fail(e)
      }
    },
    [fail, incorporate, report],
  )

  /** 맞추기를 줄 세운다. 아직 시작 안 한 맞추기가 있으면 거기에 합친다(확인·keepalive 는 하나라도 원하면 켠다). */
  const request = useCallback(
    (fetchFirst: boolean, keepalive: boolean): Promise<SyncResult> => {
      const waiting = jobRef.current
      if (waiting) {
        waiting.flags.fetch ||= fetchFirst
        waiting.flags.keepalive ||= keepalive
        return waiting.promise
      }
      const flags = { fetch: fetchFirst, keepalive }
      const promise = enqueue(() => {
        jobRef.current = null // 시작했다 — 이제부터 온 요청은 다음 차례로
        return reconcile(flags.fetch, flags.keepalive)
      })
      jobRef.current = { flags, promise }
      return promise
    },
    [enqueue, reconcile],
  )

  /** 안 올린 변경이 있으면 바로 올린다(없으면 요청하지 않는다). keepalive = 탭을 숨기거나 닫는 중. */
  const flush = useCallback(
    (keepalive: boolean) => {
      window.clearTimeout(timerRef.current)
      void request(false, keepalive)
    },
    [request],
  )

  /** 서버를 확인한다. 화면이 숨었으면 하지 않는다. immediate = 최소 간격을 무시(열 때·다시 연결됐을 때). */
  const check = useCallback(
    (immediate: boolean) => {
      if (document.visibilityState === 'hidden') return
      const now = Date.now()
      if (!immediate && now - lastCheckRef.current < CHECK_GAP_MS) return
      lastCheckRef.current = now
      void request(true, false)
    },
    [request],
  )

  // 다른 탭이 서버 설정으로 덮어쓰면 새로고침한다. 이 탭 메모리의 옛 설정(레이아웃·지표 등)이 받아 온 설정을 덮지 않게.
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

  // 열 때 확인하고, 보이는 동안 주기적으로 확인한다. 설정이 바뀌면 조금 기다렸다가 한 번에 올리고,
  // 탭을 숨기거나 닫으면 기다리지 않고 바로 올린다. 탭으로 돌아오거나 다시 연결되면 확인한다.
  useEffect(() => {
    const onChange = () => {
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => flush(false), DEBOUNCE_MS)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush(true)
      else check(false)
    }
    const onPageHide = () => flush(true)
    const onOnline = () => check(true)
    const poll = window.setInterval(() => check(false), POLL_MS)
    const off = onSettingsChanged(onChange)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('online', onOnline)
    check(true)
    return () => {
      off()
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('online', onOnline)
      window.clearTimeout(timerRef.current)
    }
  }, [check, flush])

  /** 지금 동기화(저장 버튼·Ctrl+S·동기화 창): 서버를 확인해 합치고, 안 올린 변경을 올린다. */
  const syncNow = useCallback((): Promise<SyncResult> => {
    window.clearTimeout(timerRef.current)
    lastCheckRef.current = Date.now()
    report('syncing')
    return request(true, false)
  }, [report, request])

  /** 복구: 서버 설정으로 이 기기를 덮어쓴다(안 올린 변경은 버린다). 'pulled' 면 부른 쪽이 새로고침한다. */
  const replaceLocal = useCallback(
    (): Promise<PullResult> =>
      enqueue(async () => {
        window.clearTimeout(timerRef.current)
        report('syncing')
        try {
          const remote = await getRemote()
          if (!remote.data || remote.at === 0) {
            report('synced')
            return 'empty'
          }
          apply(remote.data)
          writeBase(remote.data, remote.at)
          report('synced')
          // 다른 탭은 옛 설정을 메모리에 들고 있다 — 새로고침시켜 도로 저장하지 않게 한다.
          channelRef.current?.postMessage('pulled')
          return 'pulled'
        } catch (e) {
          fail(e)
          return 'error'
        }
      }),
    [enqueue, fail, report],
  )

  /** 복구: 이 기기 설정으로 서버를 덮어쓴다(다른 기기의 안 올린 변경은 그 기기에서 다시 합쳐진다). */
  const replaceServer = useCallback(
    (): Promise<SyncResult> =>
      enqueue(async () => {
        window.clearTimeout(timerRef.current)
        report('syncing')
        try {
          const snap = snapshot()
          const at = await putRemote(snap, true, false)
          if (at === 'conflict') throw new Error('HTTP 409')
          writeBase(snap, at)
          report('synced')
          return { ok: true } as const
        } catch (e) {
          return fail(e)
        }
      }),
    [enqueue, fail, report],
  )

  return useMemo(
    () => ({ code: PERSONAL_SYNC_CODE, state, syncNow, replaceLocal, replaceServer }),
    [state, syncNow, replaceLocal, replaceServer],
  )
}
