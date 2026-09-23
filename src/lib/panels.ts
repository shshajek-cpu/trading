import type { IconName } from '../components/Icon'

/** 설정 묶음 하나. 데스크톱에선 오른쪽 서랍, 모바일에선 아래 시트로 같은 내용이 열린다. */
export type PanelId =
  | 'watchlist'
  | 'mtf'
  | 'indicators'
  | 'drawings'
  | 'pins'
  | 'discover'
  | 'alerts'
  | 'sync'

export interface PanelMeta {
  id: PanelId
  /** 버튼과 서랍 제목에 함께 쓰는 이름 — 두 곳의 말이 어긋나지 않게 한 곳에서 관리한다. */
  label: string
  icon: IconName
  /** 서랍 제목 아래 한 줄 설명. */
  hint: string
}

export const PANELS: PanelMeta[] = [
  { id: 'watchlist', label: '종목', icon: 'watchlist', hint: '관심 종목을 모아 보고 눌러서 바꿉니다' },
  { id: 'mtf', label: '주기', icon: 'timeframe', hint: '같은 종목을 네 칸에 다른 주기로 띄웁니다' },
  { id: 'indicators', label: '지표', icon: 'indicator', hint: '이동평균·RSI·MACD·거래량을 켜고 끕니다' },
  { id: 'drawings', label: '선', icon: 'line', hint: '수평선을 긋고 통과 알림을 겁니다' },
  { id: 'pins', label: '핀', icon: 'pin', hint: '좋아 보이는 자리를 찍어 내 규칙을 만듭니다' },
  { id: 'discover', label: '탐색', icon: 'discover', hint: '과거를 훑어 통했던 자리의 공통점을 찾습니다' },
  { id: 'alerts', label: '알림', icon: 'bell', hint: '목표 가격에 닿으면 알려 줍니다' },
  { id: 'sync', label: '동기화', icon: 'sync', hint: '코드 하나로 다른 기기와 설정을 맞춥니다' },
]

export const PANEL_MAP: Record<PanelId, PanelMeta> = Object.fromEntries(
  PANELS.map((p) => [p.id, p]),
) as Record<PanelId, PanelMeta>
