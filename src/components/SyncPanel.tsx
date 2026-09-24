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

/** 서버(/api/settings)가 받는 형식. 앱이 만드는 코드는 소문자라 입력도 소문자로 맞춘다. */
const CODE_RE = /^[a-z0-9-]{6,64}$/

export function SyncPanel({ code, status, message, onSetCode, onPull, onPush }: SyncPanelProps) {
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  // 연결 입력 안내(형식 오류·연결 취소·실패). 코드가 꺼지면 useSync 의 상태 문구도 지워지므로 여기서 들고 있는다.
  const [note, setNote] = useState('')

  // 새 코드: 이 기기 설정을 서버에 올려 시작한다.
  const createNew = () => {
    const v = randomCode()
    setNote('')
    onSetCode(v)
    void onPush(v)
  }

  // 기존 코드에 연결: 서버에 기록이 있으면 내려받고, 없으면 확인을 받은 뒤에만 이 기기 설정을 올린다.
  const join = (value: string) => {
    // 대문자로 치면 다른 KV 키가 되어 다른 기기와 갈린다 — 앱이 만드는 코드처럼 소문자로 맞춘다.
    const v = value.trim().toLowerCase()
    if (!CODE_RE.test(v)) {
      setNote('코드는 영문·숫자·하이픈(-) 6~64자입니다. 예: abcd-efgh-jkmn')
      return
    }
    if (!window.confirm('이 코드에 연결하면 이 기기의 설정이 서버에 저장된 설정으로 바뀝니다. 계속할까요?')) return
    setNote('')
    onSetCode(v)
    void onPull(v).then((result) => {
      // 서버에 기록이 있으면 내려받은 뒤 새로 읽어야 화면에 반영된다.
      if (result === 'pulled') {
        window.location.reload()
        return
      }
      // 기록이 없으면 코드를 잘못 쳤을 수 있다 — 묻지 않고 올리면 조용히 새 동기화 공간이 생긴다.
      if (result === 'empty' && window.confirm('이 코드로 저장된 설정이 없습니다. 이 기기 설정으로 새로 시작할까요?')) {
        void onPush(v)
        return
      }
      // 취소했거나 받기에 실패했으면 연결하지 않는다 — 실패했는데 올리면 서버 기록을 덮는다.
      onSetCode('')
      setDraft(v)
      setNote(
        result === 'empty'
          ? '연결하지 않았습니다. 코드를 다시 확인하세요.'
          : '서버에 연결하지 못했습니다. 잠시 뒤 다시 시도하세요.',
      )
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
            다른 기기에서 이 코드를 넣으면 지표·그린 선·알림·레이아웃이 따라옵니다. 바꾼 설정은 자동으로 올리고,
            앱을 열거나 돌아올 때 다른 기기에서 바꾼 설정을 받아옵니다.
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

          <div className={`sync-status ${status}`} role="status">
            {STATUS_LABEL[status]}
            {message && ` · ${message}`}
          </div>

          <p className="hint">
            <b>지금 올리기</b>는 이 기기 설정으로 서버를 덮어씁니다(다른 기기 변경은 사라짐).{' '}
            <b>내려받기</b>는 서버 설정을 가져옵니다(이 기기에서 아직 안 올린 변경은 사라짐).
          </p>

          <button
            type="button"
            className="ghost-btn sync-off"
            onClick={() => {
              if (window.confirm('동기화를 끄면 설정을 더 주고받지 않고, 앱을 꺼도 오던 알림도 꺼집니다. 끌까요?')) {
                onSetCode('')
              }
            }}
          >
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
              onChange={(e) => {
                setDraft(e.target.value)
                setNote('')
              }}
            />
            <button type="submit" disabled={draft.trim().length < 6}>
              연결
            </button>
          </form>
          {note && (
            <div className="sync-status error" role="alert">
              {note}
            </div>
          )}
        </>
      )}
    </section>
  )
}
