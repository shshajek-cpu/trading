import type { ReactNode } from 'react'

/**
 * 이모지 대신 쓰는 선 아이콘 묶음.
 * 이모지는 기기마다 모양·크기가 달라 줄이 흐트러진다. 굵기 1.6의 단일 획으로 통일한다.
 */
export type IconName =
  | 'watchlist'
  | 'timeframe'
  | 'indicator'
  | 'line'
  | 'pin'
  | 'discover'
  | 'bell'
  | 'sync'
  | 'layout1'
  | 'layout2'
  | 'layout4'
  | 'pip'
  | 'undo'
  | 'trash'
  | 'close'
  | 'chevron'
  | 'settings'
  | 'more'
  | 'plus'
  | 'check'
  | 'copy'
  | 'arrowUp'
  | 'arrowDown'
  | 'pen'
  | 'equalize'
  | 'bellOff'
  | 'refresh'
  | 'candles'
  | 'star'
  | 'starFill'
  | 'search'
  | 'back'
  | 'expand'
  | 'crosshair'

const PATHS: Record<IconName, ReactNode> = {
  watchlist: (
    <>
      <path d="M9 6h12" />
      <path d="M9 12h12" />
      <path d="M9 18h12" />
      <circle cx="4" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  timeframe: (
    <>
      <path d="M12 3 3 7.5 12 12l9-4.5z" />
      <path d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </>
  ),
  indicator: <path d="M3 13h3.2l2.6-7.5 4 15 2.6-7.5H21" />,
  line: (
    <>
      <path d="M3 12h18" />
      <circle cx="8" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s6.5-5.7 6.5-11a6.5 6.5 0 1 0-13 0c0 5.3 6.5 11 6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  discover: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-3.9-3.9" />
      <path d="M8.5 12.2 10.7 9l2.2 3.6L15 10" />
    </>
  ),
  bell: (
    <>
      <path d="M18.5 8.5a6.5 6.5 0 0 0-13 0c0 6.5-2.5 7.5-2.5 7.5h18s-2.5-1-2.5-7.5z" />
      <path d="M13.8 20a2.1 2.1 0 0 1-3.6 0" />
    </>
  ),
  bellOff: (
    <>
      <path d="M18.5 8.5a6.5 6.5 0 0 0-9.7-5.6" />
      <path d="M5.5 8.5c0 6.5-2.5 7.5-2.5 7.5h13" />
      <path d="M13.8 20a2.1 2.1 0 0 1-3.6 0" />
      <path d="m3 3 18 18" />
    </>
  ),
  sync: (
    <>
      <path d="M20.5 4v5.5H15" />
      <path d="M3.5 20v-5.5H9" />
      <path d="M4.2 10a8 8 0 0 1 13.2-3.1l3.1 2.6" />
      <path d="M19.8 14a8 8 0 0 1-13.2 3.1L3.5 14.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.5 5v5h-5" />
      <path d="M19.9 10a8 8 0 1 0 .3 4.6" />
    </>
  ),
  layout1: <rect x="3.5" y="4.5" width="17" height="15" rx="2.6" />,
  layout2: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.6" />
      <path d="M12 4.5v15" />
    </>
  ),
  layout4: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.6" />
      <path d="M12 4.5v15" />
      <path d="M3.5 12h17" />
    </>
  ),
  pip: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.6" />
      <rect x="11.5" y="11.5" width="7" height="5" rx="1.4" />
    </>
  ),
  undo: (
    <>
      <path d="M3.5 6v5.5H9" />
      <path d="M4.2 11.5A8 8 0 1 1 6 17" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
      <path d="m6.5 6.5 1 12.6A1.6 1.6 0 0 0 9.1 20.5h5.8a1.6 1.6 0 0 0 1.6-1.4l1-12.6" />
    </>
  ),
  close: <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />,
  chevron: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  settings: (
    <>
      <path d="M3.5 8h9M16.5 8h4M3.5 16h3.5M11 16h9.5" />
      <circle cx="14.5" cy="8" r="2.3" />
      <circle cx="9" cy="16" r="2.3" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  copy: (
    <>
      <rect x="9" y="9" width="11.5" height="11.5" rx="2.4" />
      <path d="M5.5 15A2 2 0 0 1 3.5 13V5.5a2 2 0 0 1 2-2H13a2 2 0 0 1 2 2" />
    </>
  ),
  arrowUp: <path d="M12 20V4.5M5.5 11 12 4.5 18.5 11" />,
  arrowDown: <path d="M12 4v15.5M18.5 13 12 19.5 5.5 13" />,
  pen: (
    <>
      <path d="M16.8 3.6a2.3 2.3 0 0 1 3.6 2.9L8.4 19.4l-4.9 1.1 1.1-4.9z" />
      <path d="m14.5 5.9 3.6 3.6" />
    </>
  ),
  equalize: (
    <>
      <path d="M8 3.5H5.5a2 2 0 0 0-2 2V8" />
      <path d="M16 3.5h2.5a2 2 0 0 1 2 2V8" />
      <path d="M8 20.5H5.5a2 2 0 0 1-2-2V16" />
      <path d="M16 20.5h2.5a2 2 0 0 0 2-2V16" />
    </>
  ),
  candles: (
    <>
      <path d="M7 3v3.5M7 17.5V21" />
      <rect x="4.5" y="6.5" width="5" height="11" rx="1.2" />
      <path d="M17 5v2.5M17 15.5V19" />
      <rect x="14.5" y="7.5" width="5" height="8" rx="1.2" />
    </>
  ),
  star: (
    <path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.8l5.9-.8z" />
  ),
  starFill: (
    <path
      d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.8l5.9-.8z"
      fill="currentColor"
    />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-3.9-3.9" />
    </>
  ),
  back: <path d="M19 12H5.5M11 5.5 4.5 12l6.5 6.5" />,
  expand: (
    <>
      <path d="M14.5 3.5h6v6" />
      <path d="M9.5 20.5h-6v-6" />
      <path d="M20.5 3.5 13 11" />
      <path d="M3.5 20.5 11 13" />
    </>
  ),
  crosshair: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" />
    </>
  ),
}

interface IconProps {
  name: IconName
  /** 화면에 그려질 한 변 길이(px). */
  size?: number
  className?: string
}

export function Icon({ name, size = 18, className }: IconProps) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
