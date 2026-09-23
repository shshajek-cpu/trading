import type { IconName } from '../components/Icon'

/**
 * 폰 앱의 최상위 화면.
 *
 * 데스크톱은 넓어서 차트 옆에 도구를 늘어놓아도 되지만, 폰은 한 화면에 한 가지 일만 해야 한다.
 * 그래서 '설정 묶음 8개를 시트로 여는' 방식 대신, 실제 앱들처럼 화면 자체를 나눈다.
 */
export type MobileTab = 'chart' | 'markets' | 'alerts' | 'more'

export interface MobileTabMeta {
  id: MobileTab
  label: string
  icon: IconName
}

export const MOBILE_TABS: MobileTabMeta[] = [
  { id: 'markets', label: '관심종목', icon: 'watchlist' },
  { id: 'chart', label: '차트', icon: 'candles' },
  { id: 'alerts', label: '알림', icon: 'bell' },
  { id: 'more', label: '메뉴', icon: 'more' },
]

/**
 * '더보기' 화면에서 여는 상세 페이지.
 * 탭 아래 한 겹으로 쌓이며, 뒤로가기로 되돌아온다.
 */
export type MobilePage = 'indicators' | 'drawings' | 'pins' | 'discover' | 'sync' | 'mtf'

export interface MobilePageMeta {
  id: MobilePage
  label: string
  icon: IconName
  hint: string
  /** 묶음 제목 — 더보기 화면에서 줄을 나눈다. */
  group: '차트 도구' | '분석' | '기기'
}

export const MOBILE_PAGES: MobilePageMeta[] = [
  {
    id: 'indicators',
    label: '지표',
    icon: 'indicator',
    hint: '이동평균 · RSI · MACD · 거래량',
    group: '차트 도구',
  },
  {
    id: 'drawings',
    label: '수평선',
    icon: 'line',
    hint: '선을 긋고 통과 알림 걸기',
    group: '차트 도구',
  },
  {
    id: 'mtf',
    label: '여러 주기',
    icon: 'timeframe',
    hint: '한 종목을 네 주기로 한눈에',
    group: '차트 도구',
  },
  {
    id: 'pins',
    label: '매매 핀',
    icon: 'pin',
    hint: '좋아 보이는 자리를 찍어 규칙 만들기',
    group: '분석',
  },
  {
    id: 'discover',
    label: '자동 탐색',
    icon: 'discover',
    hint: '과거에 통했던 자리의 공통점 찾기',
    group: '분석',
  },
  {
    id: 'sync',
    label: '기기 동기화',
    icon: 'sync',
    hint: '코드 하나로 설정 옮기기',
    group: '기기',
  },
]

export const MOBILE_PAGE_MAP: Record<MobilePage, MobilePageMeta> = Object.fromEntries(
  MOBILE_PAGES.map((p) => [p.id, p]),
) as Record<MobilePage, MobilePageMeta>
