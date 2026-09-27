import { useState } from 'react'
import { useLiveStore, type LiveStore } from '../lib/liveStore'
import { syncStatusText, type PullResult, type SyncResult, type SyncState } from '../hooks/useSync'
import { Icon } from './Icon'

interface SyncPanelProps {
  state: LiveStore<SyncState>
  onSyncNow: () => Promise<SyncResult>
  onReplaceLocal: () => Promise<PullResult>
  onReplaceServer: () => Promise<SyncResult>
}

/** 늘 켜진 동기화의 상태와 복구 버튼. 코드 입력은 없다 — 모든 기기가 같은 개인 공간을 쓴다. */
export function SyncPanel({ state, onSyncNow, onReplaceLocal, onReplaceServer }: SyncPanelProps) {
  const sync = useLiveStore(state)
  // 복구 결과 안내(서버에 기록 없음 등). 상태 줄은 useSync 가 맡는다.
  const [note, setNote] = useState('')
  const busy = sync.status === 'syncing'

  return (
    <section className="panel sync-panel">
      <div className="sync-head">
        <span className={`tv-sync-dot ${sync.status}`} aria-hidden="true" />
        항상 동기화
      </div>
      <div className={`sync-status ${sync.status}`} role="status">
        {syncStatusText(sync)}
        {sync.status === 'offline' && sync.message && ` · ${sync.message}`}
      </div>

      <p className="hint">
        레이아웃·지표·그린 선·알림·관심 목록이 이 앱을 여는 모든 기기에서 자동으로 맞춰집니다. 두 기기에서 따로 바꿔도
        멈추지 않고 합쳐서 저장합니다.
      </p>

      <button
        type="button"
        className="cta sync-now"
        disabled={busy}
        onClick={() => {
          setNote('')
          void onSyncNow()
        }}
      >
        <Icon name="sync" size={16} />
        지금 동기화
      </button>

      <div className="sync-recover">
        <div className="sync-recover-title">복구</div>
        <p className="hint">평소에는 쓸 일이 없습니다. 설정이 꼬였을 때 한쪽 것으로 통째로 맞춥니다.</p>
        <div className="sync-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm('서버 설정으로 이 기기를 덮어씁니다. 이 기기에서 아직 올리지 않은 변경은 사라집니다. 계속할까요?')) {
                return
              }
              setNote('')
              void onReplaceLocal().then((result) => {
                // 받은 설정은 새로 읽어야 화면에 반영된다.
                if (result === 'pulled') window.location.reload()
                else if (result === 'empty') setNote('서버에 저장된 설정이 없습니다')
              })
            }}
          >
            <Icon name="arrowDown" size={15} />
            서버 설정으로 이 기기 덮어쓰기
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm('이 기기 설정으로 서버를 덮어씁니다. 다른 기기에서 바꿔 올린 설정은 이 기기 것으로 바뀝니다. 계속할까요?')) {
                return
              }
              setNote('')
              void onReplaceServer().then((result) => {
                if (result.ok) setNote('서버를 이 기기 설정으로 덮어썼습니다')
              })
            }}
          >
            <Icon name="arrowUp" size={15} />
            이 기기 설정으로 서버 덮어쓰기
          </button>
        </div>
        {note && (
          <div className="sync-status" role="status">
            {note}
          </div>
        )}
      </div>
    </section>
  )
}
