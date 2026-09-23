import type { ReactNode } from 'react'

/**
 * Own hand-drawn line-icon set — never TradingView's assets. Every glyph is drawn on a
 * 28×28 grid with a thin 1.5px single stroke so the toolbar reads as one weight.
 */
export type IconName =
  // shell / toolbar
  | 'menu'
  | 'compare'
  | 'indicator'
  | 'template'
  | 'alarm'
  | 'replay'
  | 'undo'
  | 'redo'
  | 'layout1'
  | 'layout2'
  | 'layout4'
  | 'save'
  | 'search'
  | 'settings'
  | 'fullscreen'
  | 'fullscreenExit'
  | 'camera'
  | 'pip'
  | 'equalize'
  // widget tabs
  | 'watchlist'
  | 'bell'
  | 'bellOff'
  | 'objectTree'
  | 'mtf'
  | 'pin'
  | 'discover'
  | 'sync'
  // chart types
  | 'typeBars'
  | 'typeCandles'
  | 'typeHollow'
  | 'typeVolumeCandles'
  | 'typeLine'
  | 'typeLineMarkers'
  | 'typeStepLine'
  | 'typeArea'
  | 'typeHlcArea'
  | 'typeBaseline'
  | 'typeColumns'
  | 'typeHighLow'
  | 'typeHeikinAshi'
  // generic
  | 'chevron'
  | 'chevronRight'
  | 'close'
  | 'check'
  | 'copy'
  | 'plus'
  | 'trash'
  | 'star'
  | 'starFill'
  | 'eye'
  | 'eyeOff'
  | 'lock'
  | 'unlock'
  | 'calendar'
  | 'clock'
  | 'download'
  | 'clipboard'
  | 'refresh'
  | 'arrowUp'
  | 'arrowDown'
  | 'moon'
  | 'keyboard'
  | 'install'
  | 'more'
  // mobile app shell
  | 'pencil'
  | 'chart'
  | 'info'
  | 'share'
  | 'statusLine'

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

/** A candlestick: wick line + body rect. `f` fills the body (bullish/bearish solid). */
function candle(x: number, top: number, bottom: number, bodyTop: number, bodyBottom: number, f: boolean) {
  return (
    <>
      <line x1={x} y1={top} x2={x} y2={bottom} {...S} />
      <rect x={x - 2.4} y={bodyTop} width={4.8} height={bodyBottom - bodyTop} rx={0.5} stroke="currentColor" strokeWidth={1.4} fill={f ? 'currentColor' : 'none'} />
    </>
  )
}

const PATHS: Record<IconName, ReactNode> = {
  menu: (
    <>
      <line x1={5} y1={9} x2={23} y2={9} {...S} />
      <line x1={5} y1={14} x2={23} y2={14} {...S} />
      <line x1={5} y1={19} x2={23} y2={19} {...S} />
    </>
  ),
  compare: (
    <>
      <circle cx={14} cy={14} r={9} {...S} />
      <line x1={14} y1={9.5} x2={14} y2={18.5} {...S} />
      <line x1={9.5} y1={14} x2={18.5} y2={14} {...S} />
    </>
  ),
  indicator: <text x={14} y={20} textAnchor="middle" fontSize={19} fontStyle="italic" fontFamily="serif" fill="currentColor">ƒ</text>,
  template: (
    <>
      <rect x={5} y={6} width={18} height={16} rx={2} {...S} />
      <line x1={5} y1={11} x2={23} y2={11} {...S} />
      <line x1={11} y1={11} x2={11} y2={22} {...S} />
    </>
  ),
  alarm: (
    <>
      <circle cx={14} cy={15} r={7} {...S} />
      <line x1={14} y1={15} x2={14} y2={11} {...S} />
      <line x1={14} y1={15} x2={17} y2={16} {...S} />
      <line x1={7} y1={6} x2={4} y2={9} {...S} />
      <line x1={21} y1={6} x2={24} y2={9} {...S} />
    </>
  ),
  replay: (
    <>
      <path d="M9 14 L18 9 L18 19 Z" {...S} />
      <line x1={7} y1={8} x2={7} y2={20} {...S} />
    </>
  ),
  undo: (
    <>
      <path d="M8 10 L4 14 L8 18" {...S} />
      <path d="M4 14 H16 a6 6 0 0 1 6 6" {...S} />
    </>
  ),
  redo: (
    <>
      <path d="M20 10 L24 14 L20 18" {...S} />
      <path d="M24 14 H12 a6 6 0 0 0 -6 6" {...S} />
    </>
  ),
  layout1: <rect x={5} y={6} width={18} height={16} rx={1.5} {...S} />,
  layout2: (
    <>
      <rect x={5} y={6} width={18} height={16} rx={1.5} {...S} />
      <line x1={14} y1={6} x2={14} y2={22} {...S} />
    </>
  ),
  layout4: (
    <>
      <rect x={5} y={6} width={18} height={16} rx={1.5} {...S} />
      <line x1={14} y1={6} x2={14} y2={22} {...S} />
      <line x1={5} y1={14} x2={23} y2={14} {...S} />
    </>
  ),
  save: (
    <>
      <path d="M6 6 h12 l4 4 v12 a0 0 0 0 1 0 0 H6 Z" {...S} />
      <rect x={9} y={6} width={7} height={5} {...S} />
      <rect x={9} y={15} width={10} height={7} {...S} />
    </>
  ),
  search: (
    <>
      <circle cx={12.5} cy={12.5} r={6.5} {...S} />
      <line x1={17.5} y1={17.5} x2={22} y2={22} {...S} />
    </>
  ),
  settings: (
    <>
      <circle cx={14} cy={14} r={3.2} {...S} />
      <path d="M14 4 v3 M14 21 v3 M4 14 h3 M21 14 h3 M7 7 l2 2 M19 19 l2 2 M21 7 l-2 2 M9 19 l-2 2" {...S} />
    </>
  ),
  fullscreen: (
    <>
      <path d="M5 10 V5 h5 M23 10 V5 h-5 M5 18 v5 h5 M23 18 v5 h-5" {...S} />
    </>
  ),
  fullscreenExit: (
    <>
      <path d="M10 5 v5 H5 M18 5 v5 h5 M10 23 v-5 H5 M18 23 v-5 h5" {...S} />
    </>
  ),
  camera: (
    <>
      <path d="M4 10 h4 l2-2.5 h6 l2 2.5 h4 v11 H4 Z" {...S} />
      <circle cx={14} cy={15} r={4} {...S} />
    </>
  ),
  pip: (
    <>
      <rect x={4} y={7} width={20} height={14} rx={2} {...S} />
      <rect x={13} y={13} width={8} height={6} rx={1} stroke="currentColor" strokeWidth={1.4} fill="currentColor" />
    </>
  ),
  equalize: (
    <>
      <line x1={5} y1={14} x2={23} y2={14} {...S} />
      <path d="M11 9 L6 14 L11 19 M17 9 L22 14 L17 19" {...S} />
    </>
  ),
  watchlist: (
    <>
      <line x1={6} y1={8} x2={22} y2={8} {...S} />
      <line x1={6} y1={14} x2={22} y2={14} {...S} />
      <line x1={6} y1={20} x2={16} y2={20} {...S} />
    </>
  ),
  bell: (
    <>
      <path d="M14 5 a6 6 0 0 1 6 6 v4 l2 3 H6 l2-3 v-4 a6 6 0 0 1 6-6 Z" {...S} />
      <path d="M11.5 21 a2.5 2.5 0 0 0 5 0" {...S} />
    </>
  ),
  bellOff: (
    <>
      <path d="M14 5 a6 6 0 0 1 6 6 v4 l2 3 H6 l2-3 v-4 a6 6 0 0 1 6-6 Z" {...S} />
      <path d="M11.5 21 a2.5 2.5 0 0 0 5 0" {...S} />
      <line x1={5} y1={5} x2={23} y2={23} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </>
  ),
  objectTree: (
    <>
      <rect x={5} y={6} width={5} height={4} rx={1} {...S} />
      <path d="M12 8 h4 M12 14 h4 M12 20 h4 M12 8 v12" {...S} />
      <rect x={17} y={6} width={6} height={4} rx={1} {...S} />
      <rect x={17} y={12} width={6} height={4} rx={1} {...S} />
      <rect x={17} y={18} width={6} height={4} rx={1} {...S} />
    </>
  ),
  mtf: (
    <>
      <rect x={5} y={6} width={7} height={7} rx={1} {...S} />
      <rect x={16} y={6} width={7} height={7} rx={1} {...S} />
      <rect x={5} y={16} width={7} height={7} rx={1} {...S} />
      <rect x={16} y={16} width={7} height={7} rx={1} {...S} />
    </>
  ),
  pin: (
    <>
      <path d="M14 4 l3 6 4 1 -6 5 1 7 -6-4 -6 4 1-7 -6-5 4-1 Z" transform="scale(0.62) translate(8.5 6)" {...S} />
    </>
  ),
  discover: (
    <>
      <circle cx={14} cy={14} r={9} {...S} />
      <path d="M18 10 L12.5 12.5 L10 18 L15.5 15.5 Z" stroke="currentColor" strokeWidth={1.4} fill="none" strokeLinejoin="round" />
    </>
  ),
  sync: (
    <>
      <path d="M7 12 a7 7 0 0 1 12-3 M21 8 v3 h-3" {...S} />
      <path d="M21 16 a7 7 0 0 1-12 3 M7 20 v-3 h3" {...S} />
    </>
  ),
  typeBars: (
    <>
      <path d="M10 7 v14 M7 10 h3 M10 15 h3" {...S} />
      <path d="M18 9 v11 M15 12 h3 M18 17 h3" {...S} />
    </>
  ),
  typeCandles: (
    <>
      {candle(10, 6, 22, 10, 17, false)}
      {candle(18, 8, 21, 11, 18, true)}
    </>
  ),
  typeHollow: (
    <>
      {candle(10, 6, 22, 10, 17, false)}
      {candle(18, 8, 21, 11, 18, false)}
    </>
  ),
  typeVolumeCandles: (
    <>
      {candle(10, 6, 20, 9, 16, true)}
      {candle(18, 7, 21, 10, 17, false)}
      <line x1={5} y1={23} x2={23} y2={23} {...S} />
    </>
  ),
  typeLine: <polyline points="5,18 10,12 14,15 19,7 23,11" {...S} />,
  typeLineMarkers: (
    <>
      <polyline points="5,18 10,12 14,15 19,7 23,11" {...S} />
      <circle cx={10} cy={12} r={1.6} fill="currentColor" stroke="none" />
      <circle cx={19} cy={7} r={1.6} fill="currentColor" stroke="none" />
    </>
  ),
  typeStepLine: <polyline points="5,18 10,18 10,12 15,12 15,15 20,15 20,8 23,8" {...S} />,
  typeArea: (
    <>
      <path d="M5 18 L10 12 L14 15 L19 8 L23 11 V22 H5 Z" fill="currentColor" opacity={0.2} stroke="none" />
      <polyline points="5,18 10,12 14,15 19,8 23,11" {...S} />
    </>
  ),
  typeHlcArea: (
    <>
      <path d="M5 16 L11 11 L17 14 L23 9 V22 H5 Z" fill="currentColor" opacity={0.2} stroke="none" />
      <polyline points="5,16 11,11 17,14 23,9" {...S} />
    </>
  ),
  typeBaseline: (
    <>
      <line x1={5} y1={14} x2={23} y2={14} stroke="currentColor" strokeWidth={1} strokeDasharray="2 2" />
      <polyline points="5,17 10,10 14,13 19,8 23,12" {...S} />
    </>
  ),
  typeColumns: (
    <>
      <rect x={6} y={12} width={3.5} height={10} fill="currentColor" stroke="none" />
      <rect x={12.5} y={8} width={3.5} height={14} fill="currentColor" stroke="none" />
      <rect x={19} y={14} width={3.5} height={8} fill="currentColor" stroke="none" />
    </>
  ),
  typeHighLow: (
    <>
      <line x1={9} y1={7} x2={9} y2={20} {...S} />
      <line x1={14} y1={10} x2={14} y2={22} {...S} />
      <line x1={19} y1={6} x2={19} y2={18} {...S} />
    </>
  ),
  typeHeikinAshi: (
    <>
      {candle(10, 7, 21, 10, 17, true)}
      {candle(18, 9, 22, 12, 19, true)}
    </>
  ),
  chevron: <path d="M8 11 L14 17 L20 11" {...S} />,
  chevronRight: <path d="M11 8 L17 14 L11 20" {...S} />,
  close: <path d="M7 7 L21 21 M21 7 L7 21" {...S} />,
  check: <path d="M6 14 L12 20 L22 8" {...S} />,
  copy: (
    <>
      <rect x={5} y={5} width={12} height={12} rx={2} {...S} />
      <rect x={11} y={11} width={12} height={12} rx={2} {...S} />
    </>
  ),
  plus: <path d="M14 6 v16 M6 14 h16" {...S} />,
  trash: (
    <>
      <path d="M6 8 h16 M10 8 V5 h8 V8 M8 8 l1 15 h10 l1-15" {...S} />
    </>
  ),
  star: <path d="M14 4 l3 6.5 7 .8 -5.2 4.8 1.4 7-6.2-3.6 -6.2 3.6 1.4-7 -5.2-4.8 7-.8 Z" {...S} />,
  starFill: <path d="M14 4 l3 6.5 7 .8 -5.2 4.8 1.4 7-6.2-3.6 -6.2 3.6 1.4-7 -5.2-4.8 7-.8 Z" fill="currentColor" stroke="none" />,
  eye: (
    <>
      <path d="M4 14 C7 8 21 8 24 14 C21 20 7 20 4 14 Z" {...S} />
      <circle cx={14} cy={14} r={3} {...S} />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 14 C7 8 21 8 24 14 C22.5 17 20 18.6 17.5 19.4" {...S} />
      <line x1={5} y1={6} x2={23} y2={22} {...S} />
    </>
  ),
  lock: (
    <>
      <rect x={7} y={13} width={14} height={9} rx={2} {...S} />
      <path d="M10 13 v-3 a4 4 0 0 1 8 0 v3" {...S} />
    </>
  ),
  unlock: (
    <>
      <rect x={7} y={13} width={14} height={9} rx={2} {...S} />
      <path d="M10 13 v-3 a4 4 0 0 1 8 0" {...S} />
    </>
  ),
  calendar: (
    <>
      <rect x={5} y={7} width={18} height={16} rx={2} {...S} />
      <path d="M5 11 h18 M10 5 v4 M18 5 v4" {...S} />
    </>
  ),
  clock: (
    <>
      <circle cx={14} cy={14} r={9} {...S} />
      <path d="M14 9 v5 l3.5 2" {...S} />
    </>
  ),
  download: (
    <>
      <path d="M14 5 v11 M9 12 l5 5 5-5" {...S} />
      <path d="M6 21 h16" {...S} />
    </>
  ),
  clipboard: (
    <>
      <rect x={7} y={6} width={14} height={17} rx={2} {...S} />
      <rect x={11} y={4} width={6} height={4} rx={1} {...S} />
    </>
  ),
  refresh: (
    <>
      <path d="M22 9 a9 9 0 1 0 1 6" {...S} />
      <path d="M22 5 v4 h-4" {...S} />
    </>
  ),
  arrowUp: <path d="M14 21 V7 M8 13 l6-6 6 6" {...S} />,
  arrowDown: <path d="M14 7 v14 M8 15 l6 6 6-6" {...S} />,
  moon: <path d="M20 16 a8 8 0 1 1-8-11 6.5 6.5 0 0 0 8 11 Z" {...S} />,
  keyboard: (
    <>
      <rect x={4} y={8} width={20} height={13} rx={2} {...S} />
      <path d="M8 12 h0 M12 12 h0 M16 12 h0 M20 12 h0 M8 16 h0 M20 16 h0 M11 16 h6" {...S} />
    </>
  ),
  install: (
    <>
      <rect x={8} y={4} width={12} height={20} rx={2.5} {...S} />
      <path d="M14 9 v7 M11 13 l3 3 3-3" {...S} />
    </>
  ),
  more: (
    <>
      <circle cx={7} cy={14} r={1.6} fill="currentColor" stroke="none" />
      <circle cx={14} cy={14} r={1.6} fill="currentColor" stroke="none" />
      <circle cx={21} cy={14} r={1.6} fill="currentColor" stroke="none" />
    </>
  ),
  pencil: (
    <>
      <path d="M6 22 l1.2-4.6 L18.4 6.2 a2 2 0 0 1 2.8 0 l0.6 0.6 a2 2 0 0 1 0 2.8 L10.6 20.8 Z" {...S} />
      <path d="M16.6 8 l3.4 3.4" {...S} />
    </>
  ),
  chart: (
    <>
      <rect x={4.5} y={5.5} width={19} height={17} rx={3} {...S} />
      <path d="M8 17 l4-4.5 3 2.5 5-6" {...S} />
    </>
  ),
  info: (
    <>
      <circle cx={14} cy={14} r={9} {...S} />
      <path d="M14 13 v6 M14 9.5 v0.2" {...S} />
    </>
  ),
  share: (
    <>
      <path d="M14 4.5 v12 M9.5 9 L14 4.5 18.5 9" {...S} />
      <path d="M8 13 H6.5 v10 h15 v-10 H20" {...S} />
    </>
  ),
  // 범례(상태 줄): 동그라미 하나 + 글자 두 줄.
  statusLine: (
    <>
      <circle cx={7.5} cy={10} r={2.5} {...S} />
      <path d="M12.5 10 H23 M5 17.5 H23" {...S} />
    </>
  ),
}

interface IconProps {
  name: IconName
  size?: number
  className?: string
}

export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 28 28"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
