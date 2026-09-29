import { notifySettingsChanged } from './syncBus'
import { DRAWING_PALETTE, withAlpha } from './theme'
import { parseLineAlertOptions, type LineAlertOptions } from './alertRules'

/** 그릴 수 있는 도구의 종류 — TradingView 왼쪽 툴바 순서를 따른다. */
export type DrawingKind =
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

/** 커서(선택/이동)용 도구. */
export type CursorTool = 'cross' | 'dot' | 'arrow' | 'eraser'

/** 왼쪽 툴바에서 고를 수 있는 모든 도구. */
export type DrawingTool = CursorTool | DrawingKind | 'measure' | 'zoom'

/** 눌러도 아무것도 만들거나 지우지 않는 기본 커서(십자선·점·화살표). 지우개는 누른 그림을 지우므로 빠진다. */
export function isPointerTool(tool: DrawingTool): boolean {
  return tool === 'cross' || tool === 'dot' || tool === 'arrow'
}

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
  /** 고정 범위 볼륨 프로파일의 가격 행 수. 없으면 24. */
  vpRows?: number
  /** 고정 범위 볼륨 프로파일의 가치 영역 비율(%). 없으면 70. */
  vpValueArea?: number
  /** 폴리라인이 첫 점으로 닫혔는지(닫히면 안을 채운다). */
  closed?: boolean
  /** 앵커 VWAP 의 표준편차 밴드 수(0 = 끔, 1 = ±1σ, 2 = ±1σ·±2σ). 없으면 0. */
  vwapBands?: 0 | 1 | 2
  /** 바 패턴이 복사한 봉: 첫 봉 시가 기준 상대값 [시, 고, 저, 종]. */
  bars?: number[][]
}

export interface Drawing {
  id: string
  symbol: string
  kind: DrawingKind
  points: DrawingPoint[]
  style: DrawingStyle
  locked: boolean
  hidden: boolean
  /** 가격 알림(수평선·추세선·레이·채널·사각형 등 lib/alertRules 의 lineAlertMode). 판정 상태는 저장하지 않는다(틱마다 바뀌는 실행 상태). */
  alert: boolean
  fired: boolean
  /** 알림 조건·반복·만료·메모(선택). 없으면 교차·한 번만·만료 없음. */
  alertOpts?: LineAlertOptions
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
  regressionTrend: '회귀 추세',
  pitchfork: '피치포크',
  fibRetracement: '피보나치 되돌림',
  fibExtension: '추세 기반 피보나치 확장',
  fibTimeZone: '피보나치 타임 존',
  rectangle: '사각형',
  ellipse: '타원',
  triangle: '삼각형',
  brush: '브러시',
  text: '텍스트',
  note: '노트',
  arrowLine: '화살표',
  arrowMarkUp: '위 화살표 표시',
  arrowMarkDown: '아래 화살표 표시',
  longPosition: '롱 포지션',
  shortPosition: '숏 포지션',
  priceRange: '가격 범위',
  dateRange: '날짜 범위',
  datePriceRange: '날짜와 가격 범위',
  fixedRangeVolumeProfile: '고정 범위 볼륨 프로파일',
  disjointChannel: '분리 채널',
  flatTopBottom: '플랫 톱/바텀',
  schiffPitchfork: '쉬프 피치포크',
  modifiedSchiffPitchfork: '수정 쉬프 피치포크',
  insidePitchfork: '인사이드 피치포크',
  fibChannel: '피보나치 채널',
  fibTimeTrend: '추세 기반 피보나치 시간',
  fibCircles: '피보나치 원',
  fibSpeedFan: '피보나치 속도 저항 팬',
  fibSpeedArcs: '피보나치 속도 저항 호',
  fibWedge: '피보나치 쐐기',
  fibSpiral: '피보나치 나선',
  pitchfan: '피치팬',
  gannBox: '갠 박스',
  gannSquareFixed: '갠 스퀘어 고정',
  gannFan: '갠 팬',
  rotatedRectangle: '회전 사각형',
  path: '경로',
  circle: '원',
  polyline: '폴리라인',
  arc: '호',
  curve: '곡선',
  doubleCurve: '이중 곡선',
  xabcd: 'XABCD 패턴',
  cypher: '사이퍼 패턴',
  abcd: 'ABCD 패턴',
  headShoulders: '헤드 앤 숄더',
  trianglePattern: '삼각형 패턴',
  threeDrives: '세 번의 드라이브 패턴',
  elliottImpulse: '엘리엇 충격파',
  elliottCorrection: '엘리엇 조정파',
  elliottTriangle: '엘리엇 삼각형 파동',
  elliottDoubleCombo: '엘리엇 이중 조합 파동',
  elliottTripleCombo: '엘리엇 삼중 조합 파동',
  cyclicLines: '주기선',
  timeCycles: '시간 주기',
  sineLine: '사인선',
  callout: '말풍선',
  priceLabel: '가격 라벨',
  priceNote: '가격 노트',
  signpost: '표지판',
  flagMark: '깃발 표시',
  comment: '코멘트',
  forecast: '예측',
  barsPattern: '바 패턴',
  projection: '프로젝션',
  anchoredVwap: '앵커 VWAP',
  anchoredVolumeProfile: '앵커 볼륨 프로파일',
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
        items: [
          { tool: 'parallelChannel', label: '평행 채널', desc: '추세선과 나란한 선을 하나 더 그어 채널을 만듭니다.' },
          {
            tool: 'regressionTrend',
            label: '회귀 추세',
            desc: '두 시각 사이 종가의 선형 회귀선과 ±2 표준편차 선을 긋습니다.',
          },
          {
            tool: 'flatTopBottom',
            label: '플랫 톱/바텀',
            desc: '추세선과 셋째 점 가격의 수평선 사이를 채널로 묶습니다.',
          },
          {
            tool: 'disjointChannel',
            label: '분리 채널',
            desc: '추세선과, 셋째 점에서 반대로 기운 선을 그어 벌어지거나 좁아지는 채널을 만듭니다.',
          },
        ],
      },
      {
        title: '피치포크',
        items: [
          {
            tool: 'pitchfork',
            label: '피치포크',
            desc: '세 점을 찍어 첫 점에서 나머지 두 점의 가운데를 지나는 중앙선과 나란한 두 갈래 선을 긋습니다.',
          },
          {
            tool: 'schiffPitchfork',
            label: '쉬프 피치포크',
            desc: '중앙선이 첫 점 시각, 1·2 점 가격의 가운데에서 시작하는 피치포크입니다.',
          },
          {
            tool: 'modifiedSchiffPitchfork',
            label: '수정 쉬프 피치포크',
            desc: '중앙선이 1·2 점의 시각·가격 가운데에서 시작하는 피치포크입니다.',
          },
          {
            tool: 'insidePitchfork',
            label: '인사이드 피치포크',
            desc: '1·2 점 가운데에서 시작해 두 갈래도 그 자리부터 펼쳐지는 피치포크입니다.',
          },
        ],
      },
    ],
  },
  {
    id: 'fib',
    label: '갠·피보나치',
    sections: [
      {
        title: '피보나치',
        items: [
          {
            tool: 'fibRetracement',
            label: '피보나치 되돌림',
            desc: '두 점 사이에 0.236·0.382·0.5·0.618·0.786 되돌림 가격선을 긋습니다.',
          },
          {
            tool: 'fibExtension',
            label: '추세 기반 피보나치 확장',
            desc: '세 점을 찍어 1→2 움직임을 3 에서 0.618·1·1.618·2.618 배로 이은 목표 가격선을 긋습니다.',
          },
          {
            tool: 'fibChannel',
            label: '피보나치 채널',
            desc: '추세선과 셋째 점으로 정한 폭을 1 로 보고 0.236~4.236 배 떨어진 나란한 선을 긋습니다.',
          },
          {
            tool: 'fibTimeZone',
            label: '피보나치 타임 존',
            desc: '두 점 사이 간격을 1 로 보고 1·2·3·5·8·13·21… 배 떨어진 시각에 세로선을 긋습니다.',
          },
          {
            tool: 'fibSpeedFan',
            label: '피보나치 속도 저항 팬',
            desc: '두 점이 만드는 상자의 피보나치 가격·시간 자리를 지나는 부채꼴 선을 긋습니다.',
          },
          {
            tool: 'fibTimeTrend',
            label: '추세 기반 피보나치 시간',
            desc: '1→2 기간을 셋째 점에서 0.382·0.618·1·1.618… 배 이은 시각에 세로선을 긋습니다.',
          },
          {
            tool: 'fibCircles',
            label: '피보나치 원',
            desc: '두 점을 지름으로 하는 원을 1 로 보고 피보나치 배수의 동심원을 그립니다.',
          },
          {
            tool: 'pitchfan',
            label: '피치팬',
            desc: '첫 점에서 2–3 선분의 양 끝·가운데·중간 자리를 지나는 부채꼴 선을 긋습니다.',
          },
          {
            tool: 'fibSpiral',
            label: '피보나치 나선',
            desc: '첫 점을 중심으로 둘째 점을 지나며 한 바퀴의 1/4 마다 1.618 배 커지는 나선을 그립니다.',
          },
          {
            tool: 'fibSpeedArcs',
            label: '피보나치 속도 저항 호',
            desc: '첫 점을 중심으로 두 점 거리의 피보나치 배수 반원을 그립니다.',
          },
          {
            tool: 'fibWedge',
            label: '피보나치 쐐기',
            desc: '첫 점에서 뻗은 두 선 사이에 피보나치 배수 반지름의 호를 그립니다.',
          },
        ],
      },
      {
        title: '갠',
        items: [
          {
            tool: 'gannBox',
            label: '갠 박스',
            desc: '두 점 상자를 0.25·0.382·0.5·0.618·0.75 가격·시간 레벨과 대각선으로 나눕니다.',
          },
          {
            tool: 'gannSquareFixed',
            label: '갠 스퀘어 고정',
            desc: '화면에서 정사각형으로 놓이는 갠 스퀘어 — 4등분 격자, 시작 모서리의 부채선과 호.',
          },
          {
            tool: 'gannFan',
            label: '갠 팬',
            desc: '첫 점에서 1×1(둘째 점)과 1×2·2×1… 1×8·8×1 각도로 뻗는 선을 긋습니다.',
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
          { tool: 'rotatedRectangle', label: '회전 사각형', desc: '두 점으로 한 변을, 셋째 점으로 폭을 정한 기울어진 사각형입니다.' },
          {
            tool: 'path',
            label: '경로',
            desc: '점을 이어 끝에 화살표가 달린 선을 그립니다. 마지막 점을 한 번 더 누르거나 Enter·Esc 로 마칩니다.',
          },
          { tool: 'circle', label: '원', desc: '가운데와 둘레의 한 점을 찍어 원을 그립니다.' },
          { tool: 'ellipse', label: '타원', desc: '구간을 타원으로 표시합니다.' },
          {
            tool: 'polyline',
            label: '폴리라인',
            desc: '점을 이어 꺾은선을 그립니다. 첫 점을 누르면 닫혀 안이 칠해지고, 마지막 점을 한 번 더 누르거나 Enter·Esc 로 마칩니다.',
          },
          { tool: 'triangle', label: '삼각형', desc: '세 점을 찍어 삼각형을 그립니다.' },
          { tool: 'arc', label: '호', desc: '시작·끝 점과 지나갈 점을 찍어 둥근 호를 그립니다.' },
          { tool: 'curve', label: '곡선', desc: '두 점을 잇는 곡선입니다. 가운데 손잡이를 끌어 휨을 바꿉니다.' },
          { tool: 'doubleCurve', label: '이중 곡선', desc: '두 점을 잇는 S 자 곡선입니다. 두 손잡이로 휨을 바꿉니다.' },
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
          {
            tool: 'note',
            label: '노트',
            desc: '배경과 테두리가 있는 메모 상자를 붙입니다. Enter 로 줄을 바꾸고, Ctrl+Enter 나 바깥을 눌러 마칩니다.',
          },
          {
            tool: 'callout',
            label: '말풍선',
            desc: '가리킬 점과 글 상자 자리를 찍어 꼬리가 달린 글 상자를 붙입니다. 두 번 누르면 글을 고칩니다.',
          },
          { tool: 'comment', label: '코멘트', desc: '누른 자리를 가리키는 말풍선 모양 메모를 붙입니다.' },
          { tool: 'priceLabel', label: '가격 라벨', desc: '누른 자리의 가격을 적은 꼬리표를 붙입니다.' },
          { tool: 'priceNote', label: '가격 노트', desc: '첫 점의 가격을 선 끝의 상자에 적습니다.' },
          { tool: 'signpost', label: '표지판', desc: '봉에 기둥을 세우고 그 위에 글 상자를 답니다.' },
          { tool: 'flagMark', label: '깃발 표시', desc: '누른 자리에 깃발을 꽂습니다.' },
          { tool: 'arrowLine', label: '화살표', desc: '두 점을 잇는 화살표를 그립니다.' },
          { tool: 'arrowMarkUp', label: '위 화살표 표시', desc: '봉 아래에 위쪽 화살표 표시를 붙입니다.' },
          { tool: 'arrowMarkDown', label: '아래 화살표 표시', desc: '봉 위에 아래쪽 화살표 표시를 붙입니다.' },
        ],
      },
    ],
  },
  {
    id: 'patterns',
    label: '패턴',
    sections: [
      {
        title: '차트 패턴',
        items: [
          {
            tool: 'xabcd',
            label: 'XABCD 패턴',
            desc: '다섯 점 X·A·B·C·D 를 찍어 하모닉 패턴과 되돌림·확장 비율을 표시합니다.',
          },
          {
            tool: 'cypher',
            label: '사이퍼 패턴',
            desc: '다섯 점으로 사이퍼 패턴(B 는 XA 되돌림, C 는 XA 확장, D 는 XC 되돌림)을 그립니다.',
          },
          { tool: 'abcd', label: 'ABCD 패턴', desc: '네 점 A·B·C·D 와 BC/AB·CD/BC 비율을 표시합니다.' },
          {
            tool: 'headShoulders',
            label: '헤드 앤 숄더',
            desc: '일곱 점(시작·왼쪽 어깨·목·머리·목·오른쪽 어깨·끝)으로 헤드 앤 숄더와 목선을 그립니다.',
          },
          {
            tool: 'trianglePattern',
            label: '삼각형 패턴',
            desc: '네 점 A·B·C·D 를 찍어 두 추세선이 만나는 삼각형 수렴을 그립니다.',
          },
          {
            tool: 'threeDrives',
            label: '세 번의 드라이브 패턴',
            desc: '일곱 점으로 세 번의 드라이브와 되돌림·확장 비율을 표시합니다.',
          },
        ],
      },
      {
        title: '엘리엇 파동',
        items: [
          { tool: 'elliottImpulse', label: '엘리엇 충격파', desc: '여섯 점으로 0-1-2-3-4-5 충격파를 그립니다.' },
          { tool: 'elliottCorrection', label: '엘리엇 조정파', desc: '네 점으로 0-A-B-C 조정파를 그립니다.' },
          { tool: 'elliottTriangle', label: '엘리엇 삼각형 파동', desc: '여섯 점으로 0-A-B-C-D-E 삼각형 파동을 그립니다.' },
          { tool: 'elliottDoubleCombo', label: '엘리엇 이중 조합 파동', desc: '네 점으로 0-W-X-Y 이중 조합 파동을 그립니다.' },
          {
            tool: 'elliottTripleCombo',
            label: '엘리엇 삼중 조합 파동',
            desc: '여섯 점으로 0-W-X-Y-X-Z 삼중 조합 파동을 그립니다.',
          },
        ],
      },
      {
        title: '주기',
        items: [
          { tool: 'cyclicLines', label: '주기선', desc: '두 점 사이 봉 수마다 오른쪽으로 세로선을 되풀이합니다.' },
          { tool: 'timeCycles', label: '시간 주기', desc: '두 점 간격을 지름으로 하는 반원을 양쪽으로 잇습니다.' },
          { tool: 'sineLine', label: '사인선', desc: '첫 점(마루)과 둘째 점(반주기 뒤 골)으로 사인 곡선을 그립니다.' },
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
          { tool: 'forecast', label: '예측', desc: '시작점과 목표점을 찍어 목표 시각까지 목표가에 닿았는지(성공·실패)를 봅니다.' },
          {
            tool: 'barsPattern',
            label: '바 패턴',
            desc: '두 점 사이 봉들을 복사해 바로 뒤에 흐린 패턴으로 붙입니다. 끌어서 옮기고 끝점으로 가로 폭을 바꿉니다.',
          },
          { tool: 'projection', label: '프로젝션', desc: '세 점으로 A→B 움직임에 대한 B→C 움직임의 비율(%)을 호와 함께 봅니다.' },
          { tool: 'priceRange', label: '가격 범위', desc: '두 가격 사이의 차이와 % 를 잽니다.' },
          { tool: 'dateRange', label: '날짜 범위', desc: '두 시각 사이의 기간과 봉 수를 잽니다.' },
          { tool: 'datePriceRange', label: '날짜와 가격 범위', desc: '가격 차이·% 와 기간·봉 수를 함께 잽니다.' },
        ],
      },
      {
        title: '거래량 기반',
        items: [
          {
            tool: 'anchoredVwap',
            label: '앵커 VWAP',
            desc: '누른 봉부터 지금까지의 거래량 가중 평균가(VWAP)를 긋습니다. ±1·2 표준편차 밴드를 켤 수 있고 새 봉마다 이어집니다.',
          },
          {
            tool: 'fixedRangeVolumeProfile',
            label: '고정 범위 볼륨 프로파일',
            desc: '두 시각 사이 봉들의 가격대별 거래량과 POC·가치 영역을 그 구간 안에 표시합니다.',
          },
          {
            tool: 'anchoredVolumeProfile',
            label: '앵커 볼륨 프로파일',
            desc: '누른 봉부터 지금까지의 가격대별 거래량과 POC·가치 영역을 표시합니다. 새 봉마다 늘어납니다.',
          },
        ],
      },
    ],
  },
]

/** 유효한 그림 종류 판정용 정적 표. */
const DRAWING_KINDS: Record<DrawingKind, true> = {
  trend: true, ray: true, infoLine: true, extended: true, trendAngle: true,
  horizontal: true, horizontalRay: true, vertical: true, crossLine: true,
  parallelChannel: true, regressionTrend: true, pitchfork: true,
  fibRetracement: true, fibExtension: true, fibTimeZone: true,
  rectangle: true, ellipse: true, triangle: true, brush: true,
  text: true, note: true, arrowLine: true, arrowMarkUp: true, arrowMarkDown: true,
  longPosition: true, shortPosition: true, priceRange: true, dateRange: true, datePriceRange: true,
  fixedRangeVolumeProfile: true,
  disjointChannel: true, flatTopBottom: true, schiffPitchfork: true, modifiedSchiffPitchfork: true, insidePitchfork: true,
  fibChannel: true, fibTimeTrend: true, fibCircles: true, fibSpeedFan: true, fibSpeedArcs: true, fibWedge: true,
  fibSpiral: true, pitchfan: true, gannBox: true, gannSquareFixed: true, gannFan: true,
  rotatedRectangle: true, path: true, circle: true, polyline: true, arc: true, curve: true, doubleCurve: true,
  xabcd: true, cypher: true, abcd: true, headShoulders: true, trianglePattern: true, threeDrives: true,
  elliottImpulse: true, elliottCorrection: true, elliottTriangle: true, elliottDoubleCombo: true, elliottTripleCombo: true,
  cyclicLines: true, timeCycles: true, sineLine: true,
  callout: true, priceLabel: true, priceNote: true, signpost: true, flagMark: true, comment: true,
  forecast: true, barsPattern: true, projection: true, anchoredVwap: true, anchoredVolumeProfile: true,
}

export const DRAWINGS_STORAGE_KEY = 'trading.drawings.v2'
const LEGACY_KEY = 'trading.drawings.v1'

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
    case 'fibExtension':
    case 'fibTimeZone':
      return { ...base, lineWidth: 1 }
    case 'pitchfork':
    case 'regressionTrend':
      // 채움은 고를 수 있다(선택 도구 막대에서 "채우지 않음").
      return { ...base, lineWidth: 1, fillColor: withAlpha(color, 0.12) }
    case 'fixedRangeVolumeProfile':
      return { ...base, lineWidth: 1, vpRows: 24, vpValueArea: 70 }
    case 'text':
      return { ...base, text: '', fontSize: 14 }
    case 'note':
      return { ...base, lineWidth: 1, text: '', fontSize: 14, fillColor: withAlpha(color, 0.2) }
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
    case 'disjointChannel':
    case 'flatTopBottom':
    case 'rotatedRectangle':
    case 'circle':
    case 'arc':
    case 'polyline':
      return { ...base, lineWidth: 1, fillColor: withAlpha(color, 0.2) }
    case 'schiffPitchfork':
    case 'modifiedSchiffPitchfork':
    case 'insidePitchfork':
    case 'pitchfan':
      return { ...base, lineWidth: 1, fillColor: withAlpha(color, 0.12) }
    case 'gannBox':
    case 'gannSquareFixed':
      return { ...base, lineWidth: 1, fillColor: withAlpha(color, 0.06) }
    case 'fibChannel':
    case 'fibTimeTrend':
    case 'fibCircles':
    case 'fibSpeedFan':
    case 'fibSpeedArcs':
    case 'fibWedge':
    case 'fibSpiral':
    case 'gannFan':
      return { ...base, lineWidth: 1 }
    case 'xabcd':
    case 'cypher':
    case 'headShoulders':
    case 'trianglePattern':
    case 'projection':
      return { ...base, fillColor: withAlpha(color, 0.2) }
    case 'cyclicLines':
    case 'timeCycles':
    case 'sineLine':
    case 'priceNote':
    case 'forecast':
    case 'barsPattern':
      return { ...base, lineWidth: 1 }
    case 'callout':
    case 'comment':
      return { ...base, lineWidth: 1, text: '', fontSize: 14, fillColor: withAlpha(color, 0.2) }
    case 'signpost':
      return { ...base, lineWidth: 1, text: '', fontSize: 13, fillColor: withAlpha(color, 0.2) }
    case 'anchoredVwap':
      return { ...base, vwapBands: 0, fillColor: withAlpha(color, 0.08) }
    case 'anchoredVolumeProfile':
      return { ...base, lineWidth: 1, vpRows: 24, vpValueArea: 70 }
    default:
      return base
  }
}

/**
 * 글을 적는 그림의 인라인 편집기: `multiline` 이면 여러 줄(Ctrl+Enter 완료), `anchor` 는 편집기를 띄울 점 번호.
 * 점이 하나인 종류는 누르면 편집기를 열고 글을 적어야 만들어진다. 말풍선처럼 점이 둘이면 두 점을 찍은 뒤 연다.
 */
export const TEXT_EDITORS: Partial<Record<DrawingKind, { multiline: boolean; anchor: number }>> = {
  text: { multiline: false, anchor: 0 },
  note: { multiline: true, anchor: 0 },
  callout: { multiline: true, anchor: 1 },
  comment: { multiline: true, anchor: 0 },
  signpost: { multiline: false, anchor: 0 },
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
      return Array.isArray(parsed) ? parsed.filter(isDrawing).map(dropRuntimeFields).map(sanitizeAlertOpts) : []
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

/** 선 알림 설정을 검사해 틀린 필드는 버린다 — 그림은 그대로 살린다. 워커도 같은 검사(parseLineAlertOptions)를 쓴다. */
function sanitizeAlertOpts(d: Drawing): Drawing {
  if (!('alertOpts' in d)) return d
  const { alertOpts, ...rest } = d
  const opts = parseLineAlertOptions(alertOpts)
  return opts ? { ...rest, alertOpts: opts } : rest
}
