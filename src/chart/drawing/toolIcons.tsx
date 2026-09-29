import type { ReactElement } from 'react'

/** 우리가 직접 그린 TradingView 풍의 얇은 선 아이콘. 28×28 viewBox, 1px 계열 획. */
export type IconName =
  | 'cross' | 'dot' | 'arrow' | 'eraser'
  | 'trend' | 'ray' | 'infoLine' | 'extended' | 'trendAngle'
  | 'horizontal' | 'horizontalRay' | 'vertical' | 'crossLine'
  | 'parallelChannel' | 'regressionTrend' | 'pitchfork'
  | 'fibRetracement' | 'fibExtension' | 'fibTimeZone'
  | 'rectangle' | 'ellipse' | 'triangle' | 'brush'
  | 'text' | 'note' | 'arrowLine' | 'arrowMarkUp' | 'arrowMarkDown'
  | 'longPosition' | 'shortPosition' | 'priceRange' | 'dateRange' | 'datePriceRange'
  | 'fixedRangeVolumeProfile'
  | 'disjointChannel' | 'flatTopBottom' | 'schiffPitchfork' | 'modifiedSchiffPitchfork' | 'insidePitchfork'
  | 'fibChannel' | 'fibTimeTrend' | 'fibCircles' | 'fibSpeedFan' | 'fibSpeedArcs' | 'fibWedge' | 'fibSpiral' | 'pitchfan'
  | 'gannBox' | 'gannSquareFixed' | 'gannFan'
  | 'rotatedRectangle' | 'path' | 'circle' | 'polyline' | 'arc' | 'curve' | 'doubleCurve'
  | 'xabcd' | 'cypher' | 'abcd' | 'headShoulders' | 'trianglePattern' | 'threeDrives'
  | 'elliottImpulse' | 'elliottCorrection' | 'elliottTriangle' | 'elliottDoubleCombo' | 'elliottTripleCombo'
  | 'cyclicLines' | 'timeCycles' | 'sineLine'
  | 'callout' | 'priceLabel' | 'priceNote' | 'signpost' | 'flagMark' | 'comment'
  | 'forecast' | 'barsPattern' | 'projection' | 'anchoredVwap' | 'anchoredVolumeProfile'
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
    case 'regressionTrend':
      return <><line x1="4" y1="14" x2="24" y2="5" {...S} /><line x1="4" y1="19" x2="24" y2="10" {...S} strokeDasharray="3 2.5" /><line x1="4" y1="24" x2="24" y2="15" {...S} /></>
    case 'pitchfork':
      return <><line x1="5" y1="14" x2="24" y2="14" {...S} /><line x1="11" y1="7" x2="11" y2="21" {...S} /><line x1="11" y1="7" x2="24" y2="7" {...S} /><line x1="11" y1="21" x2="24" y2="21" {...S} /><circle cx="5" cy="14" r="1.8" fill="currentColor" /></>
    case 'fibRetracement':
      return <><line x1="5" y1="7" x2="23" y2="7" {...S} /><line x1="5" y1="12" x2="23" y2="12" {...S} /><line x1="5" y1="16" x2="23" y2="16" {...S} /><line x1="5" y1="21" x2="23" y2="21" {...S} /></>
    case 'fibExtension':
      return <><path d="M4 23 L9 11 L13 17" {...S} strokeDasharray="2.5 2" /><line x1="13" y1="5" x2="24" y2="5" {...S} /><line x1="13" y1="10" x2="24" y2="10" {...S} /><line x1="13" y1="17" x2="24" y2="17" {...S} /></>
    case 'fibTimeZone':
      return <><line x1="4" y1="5" x2="4" y2="23" {...S} /><line x1="7" y1="5" x2="7" y2="23" {...S} /><line x1="10" y1="5" x2="10" y2="23" {...S} /><line x1="15" y1="5" x2="15" y2="23" {...S} /><line x1="23" y1="5" x2="23" y2="23" {...S} /></>
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
    case 'note':
      return <><path d="M6 6 H22 V17 L17 22 H6 Z" {...S} /><path d="M22 17 H17 V22" {...S} /><line x1="9.5" y1="11" x2="18.5" y2="11" {...S} /><line x1="9.5" y1="15" x2="15" y2="15" {...S} /></>
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
    case 'fixedRangeVolumeProfile':
      return <><rect x="4.5" y="5" width="19" height="18" rx="1" {...S} strokeDasharray="2 2" /><line x1="4.5" y1="9" x2="11" y2="9" {...S} strokeWidth={2.4} strokeLinecap="butt" /><line x1="4.5" y1="13" x2="17" y2="13" {...S} strokeWidth={2.4} strokeLinecap="butt" /><line x1="4.5" y1="17" x2="13" y2="17" {...S} strokeWidth={2.4} strokeLinecap="butt" /><line x1="4.5" y1="20.5" x2="8" y2="20.5" {...S} strokeWidth={2.4} strokeLinecap="butt" /></>
    case 'xabcd':
      return <><path d="M4 20 L9 8 L13 16 L19 6 L24 18" {...S} /><path d="M4 20 L13 16 M9 8 L19 6" {...S} strokeDasharray="2 2" /></>
    case 'cypher':
      return <><path d="M4 18 L9 7 L13 14 L18 4 L24 21" {...S} /><path d="M4 18 L13 14 L24 21" {...S} strokeDasharray="2 2" /></>
    case 'abcd':
      return <><path d="M5 21 L11 8 L16 15 L23 5" {...S} /><path d="M5 21 L16 15 M11 8 L23 5" {...S} strokeDasharray="2 2" /></>
    case 'headShoulders':
      return <><path d="M3 21 L7 13 L10 17 L14 6 L18 17 L21 13 L25 21" {...S} /><line x1="6" y1="17" x2="22" y2="17" {...S} strokeDasharray="2 2" /></>
    case 'trianglePattern':
      return <><path d="M4 6 L9 21 L14 9 L19 17" {...S} /><path d="M4 6 L24 13 M9 21 L24 15" {...S} strokeDasharray="2 2" /></>
    case 'threeDrives':
      return <path d="M3 23 L7 16 L10 19 L15 11 L18 15 L24 5" {...S} />
    case 'elliottImpulse':
      return <><path d="M3 22 L8 14 L11 18 L17 6 L20 11 L25 4" {...S} /><circle cx="17" cy="6" r="1.6" fill="currentColor" /></>
    case 'elliottCorrection':
      return <><path d="M4 6 L11 18 L16 11 L24 23" {...S} /><circle cx="11" cy="18" r="1.6" fill="currentColor" /></>
    case 'elliottTriangle':
      return <path d="M3 14 L7 5 L11 21 L15 8 L18 18 L21 11 L25 14" {...S} />
    case 'elliottDoubleCombo':
      return <><path d="M4 5 L10 16 L15 10 L24 22" {...S} /><circle cx="10" cy="16" r="1.6" fill="currentColor" /><circle cx="15" cy="10" r="1.6" fill="currentColor" /></>
    case 'elliottTripleCombo':
      return <><path d="M3 5 L7 13 L10 9 L14 17 L17 13 L24 23" {...S} /><circle cx="10" cy="9" r="1.4" fill="currentColor" /><circle cx="17" cy="13" r="1.4" fill="currentColor" /></>
    case 'cyclicLines':
      return <><line x1="5" y1="5" x2="5" y2="23" {...S} /><line x1="11" y1="5" x2="11" y2="23" {...S} /><line x1="17" y1="5" x2="17" y2="23" {...S} /><line x1="23" y1="5" x2="23" y2="23" {...S} /></>
    case 'timeCycles':
      return <><path d="M3 19 A4 4 0 0 1 11 19 A4 4 0 0 1 19 19 A4 4 0 0 1 27 19" {...S} /><line x1="2" y1="19" x2="26" y2="19" {...S} strokeDasharray="2 2" /></>
    case 'sineLine':
      return <path d="M3 14 Q7 3 11 14 T19 14 T27 14" {...S} />
    case 'callout':
      return <path d="M10 5 H24 V15 H15 L5 23 L12 15 H10 Z" {...S} />
    case 'priceLabel':
      return <><path d="M4 14 L9 8 H24 V20 H9 Z" {...S} /><line x1="12" y1="14" x2="20" y2="14" {...S} /></>
    case 'priceNote':
      return <><circle cx="6" cy="21" r="2" fill="currentColor" /><line x1="6" y1="21" x2="14" y2="12" {...S} /><rect x="14" y="7" width="10" height="7" rx="1" {...S} /></>
    case 'signpost':
      return <><rect x="6" y="5" width="16" height="8" rx="1.5" {...S} /><line x1="14" y1="13" x2="14" y2="23" {...S} /><circle cx="14" cy="23" r="1.6" fill="currentColor" /></>
    case 'flagMark':
      return <><line x1="8" y1="5" x2="8" y2="23" {...S} /><path d="M8 5 L21 9 L8 14" {...S} /></>
    case 'comment':
      return <path d="M5 6 H23 V17 H12 L7 22 V17 H5 Z" {...S} />
    case 'forecast':
      return <><line x1="6" y1="20" x2="21" y2="8" {...S} /><circle cx="6" cy="20" r="2.2" {...S} /><circle cx="21" cy="8" r="2.2" {...S} /></>
    case 'barsPattern':
      return <><line x1="7" y1="8" x2="7" y2="21" {...S} /><rect x="5" y="11" width="4" height="7" {...S} /><line x1="14" y1="5" x2="14" y2="18" {...S} strokeDasharray="2 2" /><rect x="12" y="8" width="4" height="6" {...S} strokeDasharray="2 2" /><line x1="21" y1="9" x2="21" y2="23" {...S} strokeDasharray="2 2" /><rect x="19" y="13" width="4" height="7" {...S} strokeDasharray="2 2" /></>
    case 'projection':
      return <><path d="M5 21 L12 7 L23 17 Z" {...S} /><path d="M19 4 A 11 11 0 0 1 23 17" {...S} strokeDasharray="2 2" /></>
    case 'anchoredVwap':
      return <><path d="M6 20 C10 11 15 17 24 7" {...S} /><circle cx="6" cy="20" r="2" fill="currentColor" /><path d="M6 14 C11 6 15 11 24 3" {...S} strokeDasharray="2 2" /></>
    case 'anchoredVolumeProfile':
      return <><line x1="5" y1="4" x2="5" y2="24" {...S} strokeDasharray="2 2" /><line x1="5" y1="8" x2="12" y2="8" {...S} strokeWidth={2.4} strokeLinecap="butt" /><line x1="5" y1="12" x2="20" y2="12" {...S} strokeWidth={2.4} strokeLinecap="butt" /><line x1="5" y1="16" x2="15" y2="16" {...S} strokeWidth={2.4} strokeLinecap="butt" /><line x1="5" y1="20" x2="9" y2="20" {...S} strokeWidth={2.4} strokeLinecap="butt" /></>
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
    case 'disjointChannel':
      return <><line x1="4" y1="11" x2="24" y2="5" {...S} /><line x1="4" y1="17" x2="24" y2="23" {...S} /></>
    case 'flatTopBottom':
      return <><line x1="4" y1="7" x2="24" y2="16" {...S} /><line x1="4" y1="21" x2="24" y2="21" {...S} /></>
    case 'schiffPitchfork':
      return <><line x1="5" y1="10" x2="24" y2="14" {...S} /><line x1="11" y1="7" x2="11" y2="21" {...S} /><line x1="11" y1="7" x2="24" y2="9.5" {...S} /><line x1="11" y1="21" x2="24" y2="18.5" {...S} /><line x1="5" y1="5" x2="5" y2="16" {...S} strokeDasharray="2 2" /><circle cx="5" cy="10" r="1.8" fill="currentColor" /></>
    case 'modifiedSchiffPitchfork':
      return <><line x1="7" y1="12" x2="24" y2="14" {...S} /><line x1="12" y1="7" x2="12" y2="21" {...S} /><line x1="12" y1="7" x2="24" y2="8.5" {...S} /><line x1="12" y1="21" x2="24" y2="19.5" {...S} /><line x1="3" y1="18" x2="11" y2="6" {...S} strokeDasharray="2 2" /><circle cx="7" cy="12" r="1.8" fill="currentColor" /></>
    case 'insidePitchfork':
      return <><line x1="6" y1="14" x2="24" y2="14" {...S} /><path d="M24 7 L10 7 L6 14 L10 21 L24 21" {...S} /><circle cx="6" cy="14" r="1.8" fill="currentColor" /></>
    case 'pitchfan':
      return <><line x1="4" y1="14" x2="24" y2="5" {...S} /><line x1="4" y1="14" x2="24" y2="14" {...S} /><line x1="4" y1="14" x2="24" y2="23" {...S} /><line x1="17" y1="8" x2="17" y2="20" {...S} /><circle cx="4" cy="14" r="1.8" fill="currentColor" /></>
    case 'fibChannel':
      return <><line x1="4" y1="12" x2="24" y2="4" {...S} /><line x1="4" y1="17" x2="24" y2="9" {...S} /><line x1="4" y1="20" x2="24" y2="12" {...S} /><line x1="4" y1="25" x2="24" y2="17" {...S} /></>
    case 'fibTimeTrend':
      return <><path d="M4 20 L9 10 L12 16" {...S} strokeDasharray="2.5 2" /><line x1="14" y1="5" x2="14" y2="23" {...S} /><line x1="18" y1="5" x2="18" y2="23" {...S} /><line x1="24" y1="5" x2="24" y2="23" {...S} /></>
    case 'fibCircles':
      return <><circle cx="14" cy="14" r="3.5" {...S} /><circle cx="14" cy="14" r="6.5" {...S} /><circle cx="14" cy="14" r="10" {...S} /></>
    case 'fibSpeedFan':
      return <><line x1="4" y1="24" x2="24" y2="4" {...S} /><line x1="4" y1="24" x2="24" y2="11" {...S} /><line x1="4" y1="24" x2="24" y2="17" {...S} /><line x1="4" y1="24" x2="11" y2="4" {...S} /><line x1="4" y1="24" x2="17" y2="4" {...S} /></>
    case 'fibSpeedArcs':
      return <><path d="M9 22 A5 5 0 0 1 19 22" {...S} /><path d="M5 22 A9 9 0 0 1 23 22" {...S} /><line x1="3" y1="22" x2="25" y2="22" {...S} strokeDasharray="2 2" /><circle cx="14" cy="22" r="1.8" fill="currentColor" /></>
    case 'fibWedge':
      return <><line x1="5" y1="22" x2="24" y2="6" {...S} /><line x1="5" y1="22" x2="24" y2="20" {...S} /><path d="M14 14.5 A10 10 0 0 1 15 21" {...S} /><path d="M20 9.5 A17 17 0 0 1 22 20.5" {...S} /><circle cx="5" cy="22" r="1.8" fill="currentColor" /></>
    case 'fibSpiral':
      return <path d="M14 14 C14 12 16 12 16 14 C16 17 12 17 11.5 14 C11 10 17 9 19 13 C21 18 15 22 10.5 20 C5 17.5 6 9 11 6.5 C16 4 23 6.5 24 12" {...S} />
    case 'gannBox':
      return <><rect x="4.5" y="5.5" width="19" height="17" {...S} /><line x1="4.5" y1="11" x2="23.5" y2="11" {...S} /><line x1="4.5" y1="17" x2="23.5" y2="17" {...S} /><line x1="11" y1="5.5" x2="11" y2="22.5" {...S} /><line x1="17" y1="5.5" x2="17" y2="22.5" {...S} /></>
    case 'gannSquareFixed':
      return <><rect x="5" y="5" width="18" height="18" {...S} /><line x1="5" y1="23" x2="23" y2="5" {...S} /><line x1="5" y1="23" x2="23" y2="14" {...S} /><line x1="5" y1="23" x2="14" y2="5" {...S} /><path d="M14 23 A9 9 0 0 0 5 14" {...S} /></>
    case 'gannFan':
      return <><line x1="4" y1="24" x2="24" y2="4" {...S} /><line x1="4" y1="24" x2="24" y2="14" {...S} /><line x1="4" y1="24" x2="24" y2="20" {...S} /><line x1="4" y1="24" x2="14" y2="4" {...S} /><line x1="4" y1="24" x2="8" y2="4" {...S} /></>
    case 'rotatedRectangle':
      return <path d="M4 16 L15 5 L24 14 L13 25 Z" {...S} />
    case 'path':
      return <><path d="M4 21 L10 9 L17 17 L23 7" {...S} /><path d="M23 7 L18 8.5 M23 7 L22.5 12" {...S} /></>
    case 'circle':
      return <><circle cx="14" cy="14" r="9" {...S} /><circle cx="14" cy="14" r="1.6" fill="currentColor" /></>
    case 'polyline':
      return <><path d="M4 20 L9 7 L16 15 L24 6 L21 22 Z" {...S} /></>
    case 'arc':
      return <><path d="M4 20 A11 11 0 0 1 24 20" {...S} /><circle cx="4" cy="20" r="1.8" fill="currentColor" /><circle cx="24" cy="20" r="1.8" fill="currentColor" /></>
    case 'curve':
      return <><path d="M4 21 Q14 0 24 21" {...S} /><circle cx="4" cy="21" r="1.8" fill="currentColor" /><circle cx="24" cy="21" r="1.8" fill="currentColor" /></>
    case 'doubleCurve':
      return <><path d="M4 14 Q9 2 14 14 Q19 26 24 14" {...S} /><circle cx="4" cy="14" r="1.8" fill="currentColor" /><circle cx="24" cy="14" r="1.8" fill="currentColor" /></>
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
