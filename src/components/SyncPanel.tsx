import { useState } from 'react'
import { randomCode } from '../lib/syncCode'
import type { PullResult, SyncStatus } from '../hooks/useSync'
import { Icon } from './Icon'

interface SyncPanelProps {
  code: string
  status: SyncStatus
  message: string
  onSetCode: (code: string) => void
  onPull: (code: string) => Promise<PullResult>
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

  // 새 코드: 이 기기 설정을 서버에 올려 시작한다.
  const createNew = () => {
    const v = randomCode()
    onSetCode(v)
    void onPush(v)
  }

  // 기존 코드에 연결: 서버에 기록이 있으면 내려받고, 없으면 이 기기 설정을 올린다.
  const join = (value: string) => {
    const v = value.trim()
    if (!/^[a-zA-Z0-9-]{6,64}$/.test(v)) return
    if (!window.confirm('기존 코드에 연결하면 이 기기의 설정이 서버 설정으로 대체될 수 있습니다. 계속할까요?')) return
    setDraft('')
    onSetCode(v)
    void onPull(v).then((result) => {
      // 서버에 기록이 있으면 내려받은 뒤 새로 읽어야 화면에 반영된다.
      if (result === 'pulled') window.location.reload()
      // 기록이 없을 때만 이 기기 설정을 올린다 — 받기에 실패했는데 올리면 서버 기록을 덮는다.
      else if (result === 'empty') void onPush(v)
    })
  }

  return (
    <section className="panel sync-panel">
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
              <Icon name={copied ? 'check' : 'copy'} size={15} />
              {copied ? '복사됨' : '복사'}
            </button>
          </div>

          <p className="hint">
            다른 기기에서 이 코드를 넣으면 지표·그린 선·알림·레이아웃이 따라옵니다.
          </p>

          <div className="sync-actions">
            <button type="button" onClick={() => void onPush(code)} disabled={status === 'syncing'}>
              <Icon name="arrowUp" size={15} />
              지금 올리기
            </button>
            <button
              type="button"
              onClick={() => {
                void onPull(code).then((result) => {
                  // 불러온 설정은 새로 읽어야 화면에 반영된다.
                  if (result === 'pulled') window.location.reload()
                })
              }}
              disabled={status === 'syncing'}
            >
              <Icon name="arrowDown" size={15} />
              내려받기
            </button>
          </div>

          <div className={`sync-status ${status}`}>
            {STATUS_LABEL[status]}
            {message && ` · ${message}`}
          </div>

          <button type="button" className="ghost-btn sync-off" onClick={() => onSetCode('')}>
            동기화 끄기
          </button>
        </>
      ) : (
        <>
          <p className="hint">
            코드를 만들어 다른 기기에 입력하면 설정이 공유됩니다. 계정은 필요 없습니다.
          </p>
          <button type="button" className="cta sync-new" onClick={createNew}>
            <Icon name="plus" size={16} />
            새 코드 만들기
          </button>
          <form
            className="inline-form sync-join"
            onSubmit={(e) => {
              e.preventDefault()
              join(draft)
            }}
          >
            <input
              type="text"
              value={draft}
              placeholder="기존 코드 입력"
              aria-label="기존 코드 입력"
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
