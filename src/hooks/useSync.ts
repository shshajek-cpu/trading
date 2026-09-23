import { useCallback, useEffect, useRef, useState } from 'react'
import { onSettingsChanged } from '../lib/syncBus'

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
const STAMP_KEY = 'trading.syncStamp'

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error'
/** 내려받기 결과: 받아서 적용함 · 서버에 기록 없음 · 실패(네트워크 등). */
export type PullResult = 'pulled' | 'empty' | 'error'

function snapshot(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of SYNCED_KEYS) {
    const v = localStorage.getItem(k)
    if (v !== null) out[k] = v
  }
  return out
}

function apply(data: Record<string, unknown>): void {
  for (const k of SYNCED_KEYS) {
    const v = data[k]
    if (typeof v === 'string') localStorage.setItem(k, v)
  }
}

function snapshotString(): string {
  return JSON.stringify(snapshot())
}

function readStamp(): number {
  const v = Number(localStorage.getItem(STAMP_KEY))
  return Number.isFinite(v) ? v : 0
}

function writeStamp(at: number): void {
  try {
    localStorage.setItem(STAMP_KEY, String(at))
  } catch {
    /* 저장 실패는 무시 */
  }
}

export function useSync() {
  const [code, setCodeState] = useState<string>(() => {
    try {
      return localStorage.getItem(CODE_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [status, setStatus] = useState<SyncStatus>(code ? 'idle' : 'off')
  const [message, setMessage] = useState('')
  const timerRef = useRef(0)
  // 마지막으로 동기화된(올리거나 내려받은) 로컬 스냅샷. 이것과 같으면 올릴 필요가 없다.
  const baselineRef = useRef<string>('')
  // 서버가 더 최신이라 409 로 막힌 상태. 내려받기나 수동 올리기 전까지 자동 올리기를 멈춘다.
  const blockedRef = useRef(false)

  // 마운트 시점의 로컬 상태를 기준으로 잡는다 — 단순 새로고침으로는 올리지 않게 한다.
  useEffect(() => {
    baselineRef.current = snapshotString()
  }, [])

  /** 서버에서 받아 로컬에 덮어쓴다. 'pulled' 면 새로고침해야 화면에 반영된다. 'empty' = 서버에 기록 없음. */
  const pull = useCallback(
    async (c: string): Promise<PullResult> => {
      setStatus('syncing')
      try {
        const res = await fetch(`/api/settings?code=${encodeURIComponent(c)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as { data?: Record<string, unknown>; at?: number }
        if (body.data) {
          apply(body.data)
          writeStamp(body.at ?? 0)
          // 방금 받은 값을 기준으로 삼는다 — 새로고침 직후 도로 올리지 않도록.
          baselineRef.current = snapshotString()
          blockedRef.current = false
          setStatus('idle')
          setMessage('불러왔습니다')
          return 'pulled'
        }
        setStatus('idle')
        setMessage('서버에 저장된 설정이 없습니다')
        return 'empty'
      } catch (e) {
        setStatus('error')
        setMessage(e instanceof Error ? e.message : '불러오기 실패')
        return 'error'
      }
    },
    [],
  )

  /** 로컬 설정을 서버에 올린다. force 면 서버 값을 무조건 덮어쓴다(수동 올리기). */
  const doPush = useCallback(async (c: string, force: boolean): Promise<boolean> => {
    setStatus('syncing')
    try {
      const res = await fetch(`/api/settings?code=${encodeURIComponent(c)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: snapshot(), baseAt: readStamp(), force }),
      })
      if (res.status === 409) {
        // 다른 기기가 먼저 저장했다. 로컬을 덮어쓰지 않고 멈춘다.
        blockedRef.current = true
        setStatus('error')
        setMessage('다른 기기에서 설정을 바꿨습니다. 내려받기로 먼저 받아오세요.')
        return false
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { at?: number }
      writeStamp(body.at ?? Date.now())
      baselineRef.current = snapshotString()
      blockedRef.current = false
      setStatus('idle')
      setMessage('저장했습니다')
      return true
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : '저장 실패')
      return false
    }
  }, [])

  // 수동 올리기 버튼: 무조건 덮어쓴다.
  const push = useCallback(
    async (c: string): Promise<void> => {
      await doPush(c, true)
    },
    [doPush],
  )

  const setCode = useCallback((next: string) => {
    setCodeState(next)
    try {
      if (next) localStorage.setItem(CODE_KEY, next)
      else localStorage.removeItem(CODE_KEY)
    } catch {
      /* 저장 실패는 무시 */
    }
    setStatus(next ? 'idle' : 'off')
    setMessage('')
  }, [])

  // 설정이 바뀌면 조금 기다렸다가 한 번에 올린다 — 저장 폭주를 막는다.
  useEffect(() => {
    if (!code) return
    const onChange = () => {
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        if (blockedRef.current) return // 충돌로 막힌 상태면 올리지 않는다
        if (snapshotString() === baselineRef.current) return // 실제로 바뀐 게 없으면 건너뛴다
        void doPush(code, false)
      }, 2500)
    }
    const off = onSettingsChanged(onChange)
    return () => {
      off()
      window.clearTimeout(timerRef.current)
    }
  }, [code, doPush])

  return { code, setCode, status, message, pull, push }
}
