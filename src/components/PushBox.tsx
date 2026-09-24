import { isIosSafari, type PushState } from '../hooks/usePushAlerts'
import { Icon } from './Icon'
import './widgets/widgets.css'

export interface PushProps {
  state: PushState
  message: string
  supported: boolean
  enable: (codeOverride?: string) => Promise<void>
  disable: () => Promise<void>
}

interface PushBoxProps {
  push: PushProps
  hasSyncCode: boolean
  onCreateSyncCode: () => string
}

/**
 * 앱을 닫아도 오는 알림 안내. 관심 목록·알림 위젯 상단에 앉는 납작한 카드.
 * 켜지 않으면 앱을 띄워둬야만 동작한다는 걸 못박아 알린다.
 */
export function PushBox({ push, hasSyncCode, onCreateSyncCode }: PushBoxProps) {
  if (!push.supported) {
    // 아이폰 사파리 탭에는 푸시 기능 자체가 없다. 홈 화면 앱으로 열면 된다는 걸 알려야 한다.
    if (!isIosSafari()) return null
    return (
      <div className="pb-box">
        <p className="pb-title">아이폰은 홈 화면 앱에서만 알림이 옵니다</p>
        <p className="pb-desc">
          Safari 아래 <b>공유</b> 버튼 → <b>홈 화면에 추가</b>를 누른 뒤, 그 아이콘으로 열어 알림을 켜세요.
        </p>
      </div>
    )
  }

  return (
    <div className={`pb-box${push.state === 'on' ? ' on' : ''}`}>
      {push.state === 'on' ? (
        <>
          <p className="pb-title">앱을 꺼도 알림이 옵니다</p>
          <p className="pb-desc">서버가 1분마다 가격·수평선 알림을 확인합니다. 폰이 잠겨 있어도 받습니다.</p>
          <button type="button" className="tv-btn pb-btn" onClick={() => void push.disable()}>
            끄기
          </button>
        </>
      ) : (
        <>
          <p className="pb-title">지금은 앱을 켜둬야만 알림이 옵니다</p>
          <p className="pb-desc">
            켜두면 앱을 닫아도 서버가 가격·수평선 알림을 대신 감시합니다. 지표 알림은 앱이 열려 있을 때만 울립니다.
          </p>
          <button
            type="button"
            className="tv-btn primary pb-btn"
            disabled={push.state === 'working'}
            onClick={() => {
              // 새 코드는 React 상태 반영을 기다리지 말고 같은 클릭에서 바로 등록에 쓴다.
              const code = hasSyncCode ? undefined : onCreateSyncCode()
              void push.enable(code)
            }}
          >
            <Icon name="bell" size={16} />
            {push.state === 'working' ? '처리 중…' : '앱 꺼도 알림 받기'}
          </button>
          {isIosSafari() && (
            <p className="pb-warn">
              아이폰은 <b>홈 화면에 추가</b>한 뒤 그 아이콘으로 열어야 알림이 옵니다.
            </p>
          )}
        </>
      )}
      {push.message && <p className="pb-msg">{push.message}</p>}
    </div>
  )
}
