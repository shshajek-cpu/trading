import type { IconName } from '../components/Icon'

/** Right-side widget identifiers and their tab metadata. Shared by WidgetBar + drawer. */
export type WidgetId = 'watchlist' | 'alerts' | 'objectTree' | 'mtf' | 'pins' | 'discover' | 'sync'

export const WIDGET_TABS: { id: WidgetId; label: string; icon: IconName }[] = [
  { id: 'watchlist', label: '관심 목록', icon: 'watchlist' },
  { id: 'alerts', label: '알림', icon: 'bell' },
  { id: 'objectTree', label: '객체 트리', icon: 'objectTree' },
  { id: 'mtf', label: '멀티 타임프레임', icon: 'mtf' },
  { id: 'pins', label: '핀', icon: 'pin' },
  { id: 'discover', label: '탐색', icon: 'discover' },
  { id: 'sync', label: '동기화', icon: 'sync' },
]
