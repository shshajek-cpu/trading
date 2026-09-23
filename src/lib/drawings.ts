import { notifySettingsChanged } from './syncBus'
import { DRAWING_PALETTE } from './theme'

/** 그릴 수 있는 도구의 종류 — TradingView 왼쪽 툴바 순서를 따른다. */
export type DrawingKind =
  | 'trend' | 'ray' | 'infoLine' | 'extended' | 'trendAngle'
  | 'horizontal' | 'horizontalRay' | 'vertical' | 'crossLine'
  | 'parallelChannel' | 'fibRetracement'
  | 'rectangle' | 'ellipse' | 'triangle' | 'brush'
  | 'text' | 'arrowLine' | 'arrowMarkUp' | 'arrowMarkDown'
  | 'longPosition' | 'shortPosition' | 'priceRange' | 'dateRange' | 'datePriceRange'

/** 커서(선택/이동)용 도구. */
export type CursorTool = 'cross' | 'dot' | 'arrow' | 'eraser'

/** 왼쪽 툴바에서 고를 수 있는 모든 도구. */
export type DrawingTool = CursorTool | DrawingKind | 'measure' | 'zoom'

/** 자석(스냅) 강도. */
export type MagnetMode = 'off' | 'weak' | 'strong'

/** 그림의 앵커 한 점 — 시각(unix 초, 미래일 수 있음)과 가격. */
export interface DrawingPoint {
  time: number
  price: number
}

export interface DrawingStyle {
  color: string
  lineWidth: 1 | 2 | 3 | 4
  lineStyle: 'solid' | 'dashed' | 'dotted'
  fillColor?: string
  text?: string
  fontSize?: number
  extendLeft?: boolean
  extendRight?: boolean
}

export interface Drawing {
  id: string
  symbol: string
  kind: DrawingKind
  points: DrawingPoint[]
  style: DrawingStyle
  locked: boolean
  hidden: boolean
  /** 수평선 교차 알림 (기존 기능). 가격이 선의 어느 쪽에 있는지는 저장하지 않는다(틱마다 바뀌는 실행 상태). */
  alert: boolean
  fired: boolean
  createdAt: number
}

export type NewDrawing = Pick<Drawing, 'symbol' | 'kind' | 'points' | 'style'> &
  Partial<Pick<Drawing, 'alert'>>

/** TradingView 어휘를 따른 한국어 이름. */
export const DRAWING_LABELS: Record<DrawingKind, string> = {
  trend: '추세선',
  ray: '레이',
  infoLine: '정보 라인',
  extended: '연장 라인',
  trendAngle: '추세 각도',
  horizontal: '수평선',
  horizontalRay: '수평 레이',
  vertical: '수직선',
  crossLine: '교차선',
  parallelChannel: '평행 채널',
  fibRetracement: '피보나치 되돌림',
  rectangle: '사각형',
  ellipse: '타원',
  triangle: '삼각형',
  brush: '브러시',
  text: '텍스트',
  arrowLine: '화살표',
  arrowMarkUp: '위 화살표 표시',
  arrowMarkDown: '아래 화살표 표시',
  longPosition: '롱 포지션',
  shortPosition: '숏 포지션',
  priceRange: '가격 범위',
  dateRange: '날짜 범위',
  datePriceRange: '날짜와 가격 범위',
}

/** 왼쪽 툴바의 한 도구 항목. 단축키 라벨은 lib/shortcuts 의 (바꿀 수 있는) 설정에서 온다. */
export interface ToolItem {
  tool: DrawingKind | CursorTool
  label: string
  /** 툴팁에 보일 한 줄 설명. */
  desc: string
}

/** 플라이아웃 안의 한 구획(예: 선, 채널). */
export interface ToolSection {
  title?: string
  items: ToolItem[]
}

/** 왼쪽 툴바의 한 그룹 버튼(마지막 사용 도구를 보여준다). */
export interface ToolGroup {
  id: string
  label: string
  sections: ToolSection[]
}

/** TradingView 왼쪽 툴바 구조. 각 그룹의 첫 도구가 기본 대표 도구다. */
export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'cursor',
    label: '커서',
    sections: [
      {
        items: [
          { tool: 'cross', label: '십자선', desc: '기본 커서. 끌어서 차트를 옮기고, 십자선으로 가격·시각을 읽습니다.' },
          { tool: 'dot', label: '점', desc: '십자선 대신 작은 점 커서를 씁니다.' },
          { tool: 'arrow', label: '화살표', desc: '십자선 없이 보통 화살표 커서를 씁니다.' },
          { tool: 'eraser', label: '지우개', desc: '누른 그림을 지웁니다.' },
        ],
      },
    ],
  },
  {
    id: 'lines',
    label: '추세선 도구',
    sections: [
      {
        title: '선',
        items: [
          { tool: 'trend', label: '추세선', desc: '두 점을 찍어 선을 긋습니다.' },
          { tool: 'ray', label: '레이', desc: '첫 점에서 두 번째 점 쪽으로 끝없이 뻗는 선입니다.' },
          { tool: 'infoLine', label: '정보 라인', desc: '추세선에 가격 변화·봉 수·각도를 함께 표시합니다.' },
          { tool: 'extended', label: '연장 라인', desc: '두 점을 지나 양쪽으로 끝없이 뻗는 선입니다.' },
          { tool: 'trendAngle', label: '추세 각도', desc: '추세선에 기울기 각도를 표시합니다.' },
          { tool: 'horizontal', label: '수평선', desc: '한 가격에 가로선을 긋습니다. 가격이 지나가면 알림을 걸 수 있습니다.' },
          { tool: 'horizontalRay', label: '수평 레이', desc: '찍은 점에서 오른쪽으로만 뻗는 가로선입니다.' },
          { tool: 'vertical', label: '수직선', desc: '한 시각에 세로선을 긋습니다.' },
          { tool: 'crossLine', label: '교차선', desc: '한 점을 지나는 가로선과 세로선을 함께 긋습니다.' },
        ],
      },
      {
        title: '채널',
        items: [{ tool: 'parallelChannel', label: '평행 채널', desc: '추세선과 나란한 선을 하나 더 그어 채널을 만듭니다.' }],
      },
    ],
  },
  {
    id: 'fib',
    label: '피보나치',
    sections: [
      {
        items: [
          {
            tool: 'fibRetracement',
            label: '피보나치 되돌림',
            desc: '두 점 사이에 0.236·0.382·0.5·0.618·0.786 되돌림 가격선을 긋습니다.',
          },
        ],
      },
    ],
  },
  {
    id: 'shapes',
    label: '기하 도형',
    sections: [
      {
        items: [
          { tool: 'rectangle', label: '사각형', desc: '가격·시간 구간을 사각형으로 표시합니다.' },
          { tool: 'ellipse', label: '타원', desc: '구간을 타원으로 표시합니다.' },
          { tool: 'triangle', label: '삼각형', desc: '세 점을 찍어 삼각형을 그립니다.' },
          { tool: 'brush', label: '브러시', desc: '누른 채 끌어 자유롭게 그립니다.' },
        ],
      },
    ],
  },
  {
    id: 'annotation',
    label: '주석',
    sections: [
      {
        items: [
          { tool: 'text', label: '텍스트', desc: '차트에 글자를 적습니다.' },
          { tool: 'arrowLine', label: '화살표', desc: '두 점을 잇는 화살표를 그립니다.' },
          { tool: 'arrowMarkUp', label: '위 화살표 표시', desc: '봉 아래에 위쪽 화살표 표시를 붙입니다.' },
          { tool: 'arrowMarkDown', label: '아래 화살표 표시', desc: '봉 위에 아래쪽 화살표 표시를 붙입니다.' },
        ],
      },
    ],
  },
  {
    id: 'forecast',
    label: '예측·측정',
    sections: [
      {
        items: [
          { tool: 'longPosition', label: '롱 포지션', desc: '매수 진입가·목표가·손절가를 정해 손익과 손익비를 봅니다.' },
          { tool: 'shortPosition', label: '숏 포지션', desc: '매도 진입가·목표가·손절가를 정해 손익과 손익비를 봅니다.' },
          { tool: 'priceRange', label: '가격 범위', desc: '두 가격 사이의 차이와 % 를 잽니다.' },
          { tool: 'dateRange', label: '날짜 범위', desc: '두 시각 사이의 기간과 봉 수를 잽니다.' },
          { tool: 'datePriceRange', label: '날짜와 가격 범위', desc: '가격 차이·% 와 기간·봉 수를 함께 잽니다.' },
        ],
      },
    ],
  },
]

/** 유효한 그림 종류 판정용 정적 표. */
const DRAWING_KINDS: Record<DrawingKind, true> = {
  trend: true, ray: true, infoLine: true, extended: true, trendAngle: true,
  horizontal: true, horizontalRay: true, vertical: true, crossLine: true,
  parallelChannel: true, fibRetracement: true,
  rectangle: true, ellipse: true, triangle: true, brush: true,
  text: true, arrowLine: true, arrowMarkUp: true, arrowMarkDown: true,
  longPosition: true, shortPosition: true, priceRange: true, dateRange: true, datePriceRange: true,
}

export const DRAWINGS_STORAGE_KEY = 'trading.drawings.v2'
const LEGACY_KEY = 'trading.drawings.v1'

/** #rrggbb + 알파(0~1) → rgba() 문자열. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 도구를 처음 골랐을 때의 기본 스타일. */
export function defaultStyle(kind: DrawingKind): DrawingStyle {
  const color = DRAWING_PALETTE[0]
  const base: DrawingStyle = { color, lineWidth: 2, lineStyle: 'solid' }
  switch (kind) {
    case 'rectangle':
    case 'ellipse':
    case 'triangle':
    case 'parallelChannel':
      return { ...base, lineWidth: 1, fillColor: withAlpha(color, 0.2) }
    case 'fibRetracement':
      return { ...base, lineWidth: 1 }
    case 'text':
      return { ...base, text: '', fontSize: 14 }
    case 'arrowMarkUp':
    case 'arrowMarkDown':
      return { ...base, text: '', fontSize: 12 }
    case 'longPosition':
      return { ...base, lineWidth: 1, color: '#089981', fillColor: withAlpha('#089981', 0.2) }
    case 'shortPosition':
      return { ...base, lineWidth: 1, color: '#f23645', fillColor: withAlpha('#f23645', 0.2) }
    case 'priceRange':
    case 'dateRange':
    case 'datePriceRange':
      return { ...base, lineWidth: 1, fillColor: withAlpha(color, 0.12) }
    case 'horizontal':
    case 'horizontalRay':
    case 'vertical':
    case 'crossLine':
      return { ...base, lineWidth: 1 }
    default:
      return base
  }
}

function isPoint(value: unknown): value is DrawingPoint {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  return (
    typeof p.time === 'number' && Number.isFinite(p.time) &&
    typeof p.price === 'number' && Number.isFinite(p.price)
  )
}

function isStyle(value: unknown): value is DrawingStyle {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return (
    typeof s.color === 'string' &&
    (s.lineWidth === 1 || s.lineWidth === 2 || s.lineWidth === 3 || s.lineWidth === 4) &&
    (s.lineStyle === 'solid' || s.lineStyle === 'dashed' || s.lineStyle === 'dotted')
  )
}

function isDrawing(value: unknown): value is Drawing {
  if (typeof value !== 'object' || value === null) return false
  const d = value as Record<string, unknown>
  return (
    typeof d.id === 'string' &&
    typeof d.symbol === 'string' &&
    typeof d.kind === 'string' && Object.hasOwn(DRAWING_KINDS, d.kind) &&
    Array.isArray(d.points) && d.points.length > 0 && d.points.every(isPoint) &&
    isStyle(d.style) &&
    typeof d.locked === 'boolean' &&
    typeof d.hidden === 'boolean' &&
    typeof d.alert === 'boolean' &&
    typeof d.fired === 'boolean' &&
    typeof d.createdAt === 'number'
  )
}

/** v1(수평선/추세선) 한 건을 v2 스키마로 옮긴다. 실패하면 null. */
function migrateLegacy(value: unknown): Drawing | null {
  if (typeof value !== 'object' || value === null) return null
  const d = value as Record<string, unknown>
  if (typeof d.id !== 'string' || typeof d.symbol !== 'string') return null
  const color = typeof d.color === 'string' ? d.color : DRAWING_PALETTE[0]
  const alert = typeof d.alert === 'boolean' ? d.alert : false
  const fired = typeof d.fired === 'boolean' ? d.fired : false
  const createdAt = typeof d.createdAt === 'number' ? d.createdAt : Date.now()

  if (d.kind === 'horizontal') {
    if (typeof d.price !== 'number' || !Number.isFinite(d.price)) return null
    return {
      id: d.id,
      symbol: d.symbol,
      kind: 'horizontal',
      points: [{ time: Math.floor(createdAt / 1000), price: d.price }],
      style: { color, lineWidth: 1, lineStyle: 'solid' },
      locked: false,
      hidden: false,
      alert,
      fired,
      createdAt,
    }
  }
  if (d.kind === 'trend') {
    if (!isPoint(d.from) || !isPoint(d.to)) return null
    return {
      id: d.id,
      symbol: d.symbol,
      kind: 'trend',
      points: [d.from, d.to],
      style: { color, lineWidth: 2, lineStyle: 'solid' },
      locked: false,
      hidden: false,
      alert: false,
      fired: false,
      createdAt,
    }
  }
  return null
}

export function loadDrawings(): Drawing[] {
  try {
    const raw = localStorage.getItem(DRAWINGS_STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(isDrawing).map(dropRuntimeFields) : []
    }
  } catch {
    /* v2 파싱 실패 → 마이그레이션 시도 */
  }

  // v2 가 없으면 v1 에서 옮겨 담고 v2 로 저장한다.
  try {
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (!legacy) return []
    const parsed: unknown = JSON.parse(legacy)
    if (!Array.isArray(parsed)) return []
    const migrated = parsed
      .map(migrateLegacy)
      .filter((d): d is Drawing => d !== null)
    if (migrated.length > 0) saveDrawings(migrated)
    return migrated
  } catch {
    return []
  }
}

export function saveDrawings(drawings: Drawing[]): void {
  try {
    localStorage.setItem(DRAWINGS_STORAGE_KEY, JSON.stringify(drawings))
    notifySettingsChanged()
  } catch {
    /* 저장 실패는 무시 */
  }
}

/** 예전 저장본에 있던 교차 판정 상태(`above`)를 떼어 낸다 — 지금은 메모리에서만 들고 다닌다. */
function dropRuntimeFields(d: Drawing): Drawing {
  if (!('above' in d)) return d
  const copy: Drawing & { above?: unknown } = { ...d }
  delete copy.above
  return copy
}
