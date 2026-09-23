import type { ReactElement } from 'react'

/** 우리가 직접 그린 TradingView 풍의 얇은 선 아이콘. 28×28 viewBox, 1px 계열 획. */
export type IconName =
  | 'cross' | 'dot' | 'arrow' | 'eraser'
  | 'trend' | 'ray' | 'infoLine' | 'extended' | 'trendAngle'
  | 'horizontal' | 'horizontalRay' | 'vertical' | 'crossLine'
  | 'parallelChannel' | 'fibRetracement'
  | 'rectangle' | 'ellipse' | 'triangle' | 'brush'
  | 'text' | 'arrowLine' | 'arrowMarkUp' | 'arrowMarkDown'
  | 'longPosition' | 'shortPosition' | 'priceRange' | 'dateRange' | 'datePriceRange'
  | 'measure' | 'zoom'
  | 'magnet' | 'magnetStrong' | 'stay' | 'lockAll' | 'hideAll' | 'remove'
  | 'bell' | 'lock' | 'unlock' | 'eye' | 'eyeOff' | 'trash' | 'clone'
  | 'palette' | 'fill' | 'lineWidth' | 'lineStyle' | 'grip' | 'flyout' | 'indicator'

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function paths(name: IconName): ReactElement {
  switch (name) {
    case 'cross':
      return <><line x1="14" y1="4" x2="14" y2="24" {...S} /><line x1="4" y1="14" x2="24" y2="14" {...S} /></>
    case 'dot':
      return <><line x1="14" y1="5" x2="14" y2="11" {...S} /><line x1="14" y1="17" x2="14" y2="23" {...S} /><line x1="5" y1="14" x2="11" y2="14" {...S} /><line x1="17" y1="14" x2="23" y2="14" {...S} /><circle cx="14" cy="14" r="1.6" fill="currentColor" /></>
    case 'arrow':
      return <path d="M7 5 L7 21 L11 17 L14 23 L16.5 22 L13.5 16 L19 16 Z" {...S} />
    case 'eraser':
      return <><path d="M6 18 L15 9 L21 15 L14 22 L9 22 Z" {...S} /><line x1="9" y1="22" x2="22" y2="22" {...S} /></>
    case 'trend':
      return <><line x1="5" y1="22" x2="23" y2="6" {...S} /><circle cx="5" cy="22" r="1.8" fill="currentColor" /><circle cx="23" cy="6" r="1.8" fill="currentColor" /></>
    case 'ray':
      return <><line x1="5" y1="22" x2="24" y2="6" {...S} /><circle cx="5" cy="22" r="1.8" fill="currentColor" /></>
    case 'infoLine':
      return <><line x1="5" y1="22" x2="23" y2="6" {...S} /><path d="M16 10 h5 v5" {...S} /></>
    case 'extended':
      return <line x1="3" y1="24" x2="25" y2="4" {...S} />
    case 'trendAngle':
      return <><line x1="6" y1="21" x2="23" y2="8" {...S} /><line x1="6" y1="21" x2="21" y2="21" {...S} /><path d="M16 21 A6 6 0 0 0 14 16.5" {...S} /></>
    case 'horizontal':
      return <line x1="4" y1="14" x2="24" y2="14" {...S} />
    case 'horizontalRay':
      return <><line x1="6" y1="14" x2="24" y2="14" {...S} /><circle cx="6" cy="14" r="1.8" fill="currentColor" /></>
    case 'vertical':
      return <line x1="14" y1="4" x2="14" y2="24" {...S} />
    case 'crossLine':
      return <><line x1="4" y1="14" x2="24" y2="14" {...S} /><line x1="14" y1="4" x2="14" y2="24" {...S} /></>
    case 'parallelChannel':
      return <><line x1="4" y1="20" x2="22" y2="8" {...S} /><line x1="6" y1="24" x2="24" y2="12" {...S} /></>
    case 'fibRetracement':
      return <><line x1="5" y1="7" x2="23" y2="7" {...S} /><line x1="5" y1="12" x2="23" y2="12" {...S} /><line x1="5" y1="16" x2="23" y2="16" {...S} /><line x1="5" y1="21" x2="23" y2="21" {...S} /></>
    case 'rectangle':
      return <rect x="5" y="8" width="18" height="12" rx="1" {...S} />
    case 'ellipse':
      return <ellipse cx="14" cy="14" rx="9" ry="6.5" {...S} />
    case 'triangle':
      return <path d="M14 6 L23 21 L5 21 Z" {...S} />
    case 'brush':
      return <path d="M5 22 C9 18 9 10 14 10 C18 10 16 16 21 14" {...S} />
    case 'text':
      return <><line x1="7" y1="8" x2="21" y2="8" {...S} /><line x1="14" y1="8" x2="14" y2="21" {...S} /></>
    case 'arrowLine':
      return <><line x1="5" y1="22" x2="22" y2="7" {...S} /><path d="M22 7 L16 8 M22 7 L21 13" {...S} /></>
    case 'arrowMarkUp':
      return <path d="M14 5 L20 13 L16 13 L16 23 L12 23 L12 13 L8 13 Z" {...S} />
    case 'arrowMarkDown':
      return <path d="M14 23 L8 15 L12 15 L12 5 L16 5 L16 15 L20 15 Z" {...S} />
    case 'longPosition':
      return <><rect x="6" y="14" width="16" height="7" rx="1" {...S} /><rect x="6" y="7" width="16" height="7" rx="1" stroke="currentColor" fill="none" strokeWidth={1.4} strokeDasharray="2 2" /></>
    case 'shortPosition':
      return <><rect x="6" y="7" width="16" height="7" rx="1" {...S} /><rect x="6" y="14" width="16" height="7" rx="1" stroke="currentColor" fill="none" strokeWidth={1.4} strokeDasharray="2 2" /></>
    case 'priceRange':
      return <><line x1="14" y1="5" x2="14" y2="23" {...S} /><path d="M14 5 L11 9 M14 5 L17 9 M14 23 L11 19 M14 23 L17 19" {...S} /></>
    case 'dateRange':
      return <><line x1="5" y1="14" x2="23" y2="14" {...S} /><path d="M5 14 L9 11 M5 14 L9 17 M23 14 L19 11 M23 14 L19 17" {...S} /></>
    case 'datePriceRange':
      return <><rect x="6" y="7" width="16" height="14" rx="1" {...S} /><path d="M10 11 L18 17 M10 17 L18 11" stroke="currentColor" fill="none" strokeWidth={1} /></>
    case 'measure':
      return <><rect x="5" y="9" width="18" height="10" rx="1" {...S} /><line x1="10" y1="9" x2="10" y2="13" {...S} /><line x1="14" y1="9" x2="14" y2="14" {...S} /><line x1="18" y1="9" x2="18" y2="13" {...S} /></>
    case 'zoom':
      return <><circle cx="12" cy="12" r="6" {...S} /><line x1="16.5" y1="16.5" x2="23" y2="23" {...S} /><line x1="12" y1="9.5" x2="12" y2="14.5" {...S} /><line x1="9.5" y1="12" x2="14.5" y2="12" {...S} /></>
    case 'magnet':
      return <><path d="M8 6 L8 15 A6 6 0 0 0 20 15 L20 6" {...S} /><line x1="8" y1="6" x2="12" y2="6" {...S} /><line x1="16" y1="6" x2="20" y2="6" {...S} /><line x1="8" y1="22" x2="12" y2="22" {...S} /><line x1="16" y1="22" x2="20" y2="22" {...S} /></>
    case 'magnetStrong':
      return <><path d="M8 6 L8 15 A6 6 0 0 0 20 15 L20 6" fill="currentColor" opacity="0.25" /><path d="M8 6 L8 15 A6 6 0 0 0 20 15 L20 6" {...S} /></>
    case 'stay':
      return <><path d="M6 20 L6 8 L14 8 L18 12 L22 8 L22 20 Z" {...S} /></>
    case 'lockAll':
    case 'lock':
      return <><rect x="7" y="13" width="14" height="9" rx="1.5" {...S} /><path d="M10 13 v-3 a4 4 0 0 1 8 0 v3" {...S} /></>
    case 'unlock':
      return <><rect x="7" y="13" width="14" height="9" rx="1.5" {...S} /><path d="M10 13 v-3 a4 4 0 0 1 7 -2.5" {...S} /></>
    case 'hideAll':
    case 'eyeOff':
      return <><path d="M5 14 C8 9 20 9 23 14 C22 16 20 18 17.5 19" {...S} /><line x1="5" y1="6" x2="23" y2="22" {...S} /></>
    case 'eye':
      return <><path d="M4 14 C8 8 20 8 24 14 C20 20 8 20 4 14 Z" {...S} /><circle cx="14" cy="14" r="2.5" {...S} /></>
    case 'remove':
    case 'trash':
      return <><path d="M8 9 L20 9 L19 22 L9 22 Z" {...S} /><line x1="6" y1="9" x2="22" y2="9" {...S} /><path d="M11 9 L11 6 L17 6 L17 9" {...S} /></>
    case 'bell':
      return <><path d="M9 18 L19 18 A5 5 0 0 1 14 14 L14 11 A4 4 0 0 0 9 11 A5 5 0 0 1 9 18" {...S} /><path d="M12 20 a2 2 0 0 0 4 0" {...S} /></>
    case 'clone':
      return <><rect x="6" y="6" width="12" height="12" rx="1.5" {...S} /><rect x="11" y="11" width="11" height="11" rx="1.5" {...S} /></>
    case 'palette':
      return <><circle cx="14" cy="14" r="8" {...S} /><circle cx="14" cy="14" r="2" fill="currentColor" /></>
    case 'fill':
      return <><path d="M7 13 L13 7 L20 14 L13 21 Z" {...S} /><path d="M20 14 c2 2 2 4 0 4 s-2 -2 0 -4" fill="currentColor" stroke="none" /></>
    case 'lineWidth':
      return <><line x1="5" y1="9" x2="23" y2="9" stroke="currentColor" strokeWidth={1} /><line x1="5" y1="14" x2="23" y2="14" stroke="currentColor" strokeWidth={2} /><line x1="5" y1="19" x2="23" y2="19" stroke="currentColor" strokeWidth={3.5} /></>
    case 'lineStyle':
      return <line x1="5" y1="14" x2="23" y2="14" stroke="currentColor" strokeWidth={1.6} strokeDasharray="4 3" strokeLinecap="round" />
    case 'grip':
      return <><circle cx="11" cy="9" r="1.2" fill="currentColor" /><circle cx="17" cy="9" r="1.2" fill="currentColor" /><circle cx="11" cy="14" r="1.2" fill="currentColor" /><circle cx="17" cy="14" r="1.2" fill="currentColor" /><circle cx="11" cy="19" r="1.2" fill="currentColor" /><circle cx="17" cy="19" r="1.2" fill="currentColor" /></>
    case 'flyout':
      return <path d="M11 8 L16 14 L11 20" {...S} />
    case 'indicator':
      return <path d="M5 18 L10 12 L14 15 L19 7 L23 11" {...S} />
    default:
      return <rect x="6" y="6" width="16" height="16" rx="2" {...S} />
  }
}

export function ToolIcon({ name, size = 28 }: { name: IconName; size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      {paths(name)}
    </svg>
  )
}
