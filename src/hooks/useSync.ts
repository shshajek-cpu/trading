import { useCallback, useEffect, useRef, useState } from 'react'
import { onSettingsChanged } from '../lib/syncBus'

/** 동기화 대상 — 기기마다 달라야 하는 것(패널 접힘 등)은 넣지 않는다. */
const SYNCED_KEYS = [
  'trading.layout.v1',
  'trading.indicators.v1',
  'trading.drawings.v1',
  'trading.priceAlerts.v1',
  'trading.panes.v1',
]

const CODE_KEY = 'trading.syncCode'
const STAMP_KEY = 'trading.syncStamp'

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error'

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

  /** 서버에서 받아 로컬에 덮어쓴다. 성공하면 새로고침해야 화면에 반영된다. */
  const pull = useCallback(
    async (c: string): Promise<boolean> => {
      setStatus('syncing')
      try {
        const res = await fetch(`/api/settings?code=${encodeURIComponent(c)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as { data?: Record<string, unknown>; at?: number }
        if (body.data) {
          apply(body.data)
          localStorage.setItem(STAMP_KEY, String(body.at ?? Date.now()))
          setStatus('idle')
          setMessage('불러왔습니다')
          return true
        }
        setStatus('idle')
        setMessage('서버에 저장된 설정이 없습니다')
        return false
      } catch (e) {
        setStatus('error')
        setMessage(e instanceof Error ? e.message : '불러오기 실패')
        return false
      }
    },
    [],
  )

  /** 지금 로컬 설정을 서버에 올린다. */
  const push = useCallback(async (c: string): Promise<void> => {
    setStatus('syncing')
    try {
      const at = Date.now()
      const res = await fetch(`/api/settings?code=${encodeURIComponent(c)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ at, data: snapshot() }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      localStorage.setItem(STAMP_KEY, String(at))
      setStatus('idle')
      setMessage('저장했습니다')
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : '저장 실패')
    }
  }, [])

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
      timerRef.current = window.setTimeout(() => void push(code), 2500)
    }
    const off = onSettingsChanged(onChange)
    return () => {
      off()
      window.clearTimeout(timerRef.current)
    }
  }, [code, push])

  return { code, setCode, status, message, pull, push }
}
