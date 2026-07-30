import { useState } from 'react'
import { randomCode } from '../lib/syncCode'
import type { SyncStatus } from '../hooks/useSync'

interface SyncPanelProps {
  code: string
  status: SyncStatus
  message: string
  onSetCode: (code: string) => void
  onPull: (code: string) => Promise<boolean>
  onPush: (code: string) => Promise<void>
}

const STATUS_LABEL: Record<SyncStatus, string> = {
  off: '꺼짐',
  idle: '켜짐',
  syncing: '동기화 중…',
  error: '오류',
}

export function SyncPanel({ code, status, message, onSetCode, onPull, onPush }: SyncPanelProps) {
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)

  const connect = (value: string) => {
    const v = value.trim()
    if (!/^[a-zA-Z0-9-]{6,64}$/.test(v)) return
    onSetCode(v)
    setDraft('')
  }

  return (
    <section className="panel sync-panel">
      <h2>기기 간 동기화</h2>

      {code ? (
        <>
          <div className="sync-code-row">
            <code className="sync-code">{code}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(code).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                })
              }}
            >
              {copied ? '복사됨' : '복사'}
            </button>
          </div>

          <p className="hint">
            다른 기기에서 이 코드를 넣으면 지표·그린 선·알림·레이아웃이 따라옵니다.
          </p>

          <div className="sync-actions">
            <button type="button" onClick={() => void onPush(code)} disabled={status === 'syncing'}>
              ↑ 지금 올리기
            </button>
            <button
              type="button"
              onClick={() => {
                void onPull(code).then((ok) => {
                  // 불러온 설정은 새로 읽어야 화면에 반영된다.
                  if (ok) window.location.reload()
                })
              }}
              disabled={status === 'syncing'}
            >
              ↓ 내려받기
            </button>
          </div>

          <div className={`sync-status ${status}`}>
            {STATUS_LABEL[status]}
            {message && ` · ${message}`}
          </div>

          <button type="button" className="sync-off" onClick={() => onSetCode('')}>
            동기화 끄기
          </button>
        </>
      ) : (
        <>
          <p className="hint">
            코드를 만들어 다른 기기에 입력하면 설정이 공유됩니다. 계정은 필요 없습니다.
          </p>
          <button type="button" className="sync-new" onClick={() => connect(randomCode())}>
            새 코드 만들기
          </button>
          <form
            className="sync-join"
            onSubmit={(e) => {
              e.preventDefault()
              connect(draft)
            }}
          >
            <input
              type="text"
              value={draft}
              placeholder="기존 코드 입력"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" disabled={draft.trim().length < 6}>
              연결
            </button>
          </form>
        </>
      )}
    </section>
  )
}
