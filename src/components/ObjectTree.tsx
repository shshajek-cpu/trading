import { useMemo } from 'react'
import { DRAWING_LABELS, type Drawing, type DrawingKind } from '../lib/drawings'
import { ToolIcon, type IconName } from '../chart/drawing/toolIcons'
import { formatPrice } from '../chart/format'
import { intlZone } from '../lib/timezone'
import { tip } from '../lib/tooltip'
import { Icon } from './Icon'
import './ObjectTree.css'

export interface ObjectTreeProps {
  symbol: string
  drawings: Drawing[]
  indicators: { id: string; name: string; visible: boolean }[]
  onUpdateDrawing: (id: string, patch: Partial<Omit<Drawing, 'id'>>) => void
  onRemoveDrawing: (id: string) => void
  onToggleIndicator: (id: string) => void
  onRemoveIndicator: (id: string) => void
  onEditIndicator: (id: string) => void
  /** 그림 행을 누르면 — 차트에서 그 그림을 선택한다. */
  onSelectDrawing?: (id: string) => void
  /** 첫 점 시각을 보일 차트 시간대(settings.timezone). 없으면 브라우저 시간대. */
  timezone?: string
  /** 수평 계열 가격을 보일 소수 자릿수(심볼 정밀도). 없으면 가격 크기로 고른다. */
  pricePrecision?: number
  /** 모든 그림 잠금(왼쪽 막대). 켜져 있으면 개별 삭제를 막는다 — 차트의 삭제와 같은 규칙. */
  locked?: boolean
}

/** 가격이 곧 그림의 정체인 수평 계열 — 차트의 가격 라벨과 같은 묶음. */
const PRICE_KINDS: Partial<Record<DrawingKind, true>> = { horizontal: true, horizontalRay: true, crossLine: true }

export function ObjectTree({
  symbol,
  drawings,
  indicators,
  onUpdateDrawing,
  onRemoveDrawing,
  onToggleIndicator,
  onRemoveIndicator,
  onEditIndicator,
  onSelectDrawing,
  timezone = 'local',
  pricePrecision,
  locked = false,
}: ObjectTreeProps) {
  const mine = useMemo(
    () => drawings.filter((d) => d.symbol === symbol),
    [drawings, symbol],
  )

  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat('ko-KR', {
        timeZone: intlZone(timezone),
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    [timezone],
  )

  // 같은 종류가 여럿일 때 서로 가르는 값: 수평 계열은 가격, 그 밖에는 첫 점 시각.
  const detailOf = (d: Drawing): string => {
    const p = d.points[0]
    if (!p) return ''
    return PRICE_KINDS[d.kind] ? formatPrice(p.price, pricePrecision) : timeFmt.format(p.time * 1000)
  }

  const empty = mine.length === 0 && indicators.length === 0

  return (
    <div className="tv-objtree">
      <div className="tv-objtree-head">객체 트리</div>

      {empty && (
        <div className="tv-objtree-empty">
          이 심볼에 표시된 그림이나 지표가 없습니다.
          <br />
          왼쪽 도구로 그림을 그려 보세요.
        </div>
      )}

      {mine.length > 0 && (
        <section className="tv-objtree-section">
          <div className="tv-objtree-title">그림</div>
          {mine.map((d) => {
            const iconName = (d.kind === 'arrowLine' ? 'arrowLine' : d.kind) as IconName
            const label = DRAWING_LABELS[d.kind]
            const detail = detailOf(d)
            const frozen = locked || d.locked
            return (
              <div key={d.id} className="tv-objtree-row">
                <button
                  type="button"
                  className="tv-objtree-main"
                  disabled={!onSelectDrawing}
                  aria-label={detail ? `${label} ${detail} 선택` : `${label} 선택`}
                  onClick={() => onSelectDrawing?.(d.id)}
                >
                  <span className="tv-objtree-icon">
                    <ToolIcon name={iconName} size={18} />
                  </span>
                  <span className="tv-objtree-name">{label}</span>
                  {detail && <span className="tv-objtree-detail">{detail}</span>}
                </button>
                {d.kind === 'horizontal' && (
                  <button
                    type="button"
                    className={`tv-objtree-act${d.alert ? ' on' : ''}`}
                    {...tip(d.alert ? '알림 끄기' : '알림 켜기', '가격이 이 수평선을 지나가면 알려 줍니다.')}
                    aria-label="알림"
                    aria-pressed={d.alert}
                    onClick={() =>
                      onUpdateDrawing(d.id, d.alert ? { alert: false } : { alert: true, fired: false })
                    }
                  >
                    <ToolIcon name="bell" size={16} />
                  </button>
                )}
                <button
                  type="button"
                  className={`tv-objtree-act${d.hidden ? ' on' : ''}`}
                  {...tip(d.hidden ? '보이기' : '숨기기', d.hidden ? undefined : '그림을 지우지 않고 안 보이게 합니다.')}
                  aria-label="숨기기"
                  aria-pressed={d.hidden}
                  onClick={() => onUpdateDrawing(d.id, { hidden: !d.hidden })}
                >
                  <ToolIcon name={d.hidden ? 'hideAll' : 'eye'} size={16} />
                </button>
                <button
                  type="button"
                  className={`tv-objtree-act${d.locked ? ' on' : ''}`}
                  {...tip(d.locked ? '잠금 풀기' : '잠금', '이 그림을 실수로 움직이거나 지우지 못하게 고정합니다.')}
                  aria-label="잠금"
                  aria-pressed={d.locked}
                  onClick={() => onUpdateDrawing(d.id, { locked: !d.locked })}
                >
                  <ToolIcon name={d.locked ? 'lock' : 'unlock'} size={16} />
                </button>
                <button
                  type="button"
                  className="tv-objtree-act"
                  {...(frozen
                    ? tip('삭제', '잠긴 그림은 지울 수 없습니다. 먼저 잠금을 푸세요.')
                    : tip('삭제', '이 그림을 지웁니다.'))}
                  aria-label="삭제"
                  disabled={frozen}
                  onClick={() => onRemoveDrawing(d.id)}
                >
                  <ToolIcon name="trash" size={16} />
                </button>
              </div>
            )
          })}
        </section>
      )}

      {indicators.length > 0 && (
        <section className="tv-objtree-section">
          <div className="tv-objtree-title">지표</div>
          {indicators.map((ind) => (
            <div key={ind.id} className="tv-objtree-row">
              <span className="tv-objtree-icon">
                <ToolIcon name="indicator" size={18} />
              </span>
              <span className="tv-objtree-name">{ind.name}</span>
              <button
                type="button"
                className={`tv-objtree-act${ind.visible ? '' : ' on'}`}
                {...tip(ind.visible ? '숨기기' : '보이기', '지표는 모든 차트가 함께 씁니다.')}
                aria-label="숨기기"
                aria-pressed={!ind.visible}
                onClick={() => onToggleIndicator(ind.id)}
              >
                <ToolIcon name={ind.visible ? 'eye' : 'hideAll'} size={16} />
              </button>
              <button
                type="button"
                className="tv-objtree-act"
                {...tip('설정', '기간·색·선 굵기 등을 바꿉니다.')}
                aria-label="설정"
                onClick={() => onEditIndicator(ind.id)}
              >
                <Icon name="settings" size={16} />
              </button>
              <button
                type="button"
                className="tv-objtree-act"
                {...tip('삭제', '모든 차트에서 이 지표를 지웁니다.')}
                aria-label="삭제"
                onClick={() => onRemoveIndicator(ind.id)}
              >
                <ToolIcon name="trash" size={16} />
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
