import type { IconName } from '../components/Icon'

/** Right-side widget identifiers and their tab metadata. Shared by WidgetBar + drawer. */
export type WidgetId = 'watchlist' | 'trade' | 'alerts' | 'objectTree' | 'mtf' | 'pins' | 'discover' | 'sync'

export const WIDGET_TABS: { id: WidgetId; label: string; icon: IconName; desc: string }[] = [
  { id: 'watchlist', label: '관심 목록', icon: 'watchlist', desc: '자주 보는 종목과 시세. 종목을 누르면 그 차트로 바뀝니다.' },
  { id: 'trade', label: '거래', icon: 'trade', desc: '모의 선물거래 주문창. OKX 규칙(롱/숏 모드·교차/격리·레버리지)으로 바이낸스 시세에 가상 주문을 넣습니다.' },
  { id: 'alerts', label: '알림', icon: 'bell', desc: '만든 가격·지표·수평선 알림 목록과 앱을 꺼도 오는 푸시 알림 설정.' },
  { id: 'objectTree', label: '객체 트리', icon: 'objectTree', desc: '이 종목 차트에 그린 선과 넣은 지표 목록. 숨기기·잠금·설정·삭제.' },
  { id: 'mtf', label: '멀티 타임프레임', icon: 'mtf', desc: '같은 종목을 여러 봉 주기로 나란히 봅니다.' },
  { id: 'pins', label: '핀', icon: 'pin', desc: '봉에 롱·숏·패스 핀을 찍어 기록하고, 모인 핀의 지표에서 공통 규칙을 찾습니다.' },
  { id: 'discover', label: '탐색', icon: 'discover', desc: '과거에 목표 수익에 닿았던 자리들의 공통점을 찾아 봅니다.' },
  { id: 'sync', label: '동기화', icon: 'sync', desc: '동기화 코드로 다른 기기와 설정·그림·알림을 주고받습니다.' },
]
