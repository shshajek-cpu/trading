import { useMemo } from 'react'
import { DRAWING_LABELS, type Drawing } from '../lib/drawings'
import { ToolIcon, type IconName } from '../chart/drawing/toolIcons'
import './ObjectTree.css'

export interface ObjectTreeProps {
  symbol: string
  drawings: Drawing[]
  indicators: { id: string; name: string; visible: boolean }[]
  onUpdateDrawing: (id: string, patch: Partial<Omit<Drawing, 'id'>>) => void
  onRemoveDrawing: (id: string) => void
  onToggleIndicator: (id: string) => void
  onRemoveIndicator: (id: string) => void
}

export function ObjectTree({
  symbol,
  drawings,
  indicators,
  onUpdateDrawing,
  onRemoveDrawing,
  onToggleIndicator,
  onRemoveIndicator,
}: ObjectTreeProps) {
  const mine = useMemo(
    () => drawings.filter((d) => d.symbol === symbol),
    [drawings, symbol],
  )

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
            return (
              <div key={d.id} className="tv-objtree-row">
                <span className="tv-objtree-icon">
                  <ToolIcon name={iconName} size={18} />
                </span>
                <span className="tv-objtree-name">{DRAWING_LABELS[d.kind]}</span>
                {d.kind === 'horizontal' && (
                  <button
                    type="button"
                    className={`tv-objtree-act${d.alert ? ' on' : ''}`}
                    title="알림"
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
                  title="숨기기"
                  aria-label="숨기기"
                  aria-pressed={d.hidden}
                  onClick={() => onUpdateDrawing(d.id, { hidden: !d.hidden })}
                >
                  <ToolIcon name={d.hidden ? 'hideAll' : 'eye'} size={16} />
                </button>
                <button
                  type="button"
                  className={`tv-objtree-act${d.locked ? ' on' : ''}`}
                  title="잠금"
                  aria-label="잠금"
                  aria-pressed={d.locked}
                  onClick={() => onUpdateDrawing(d.id, { locked: !d.locked })}
                >
                  <ToolIcon name={d.locked ? 'lock' : 'unlock'} size={16} />
                </button>
                <button
                  type="button"
                  className="tv-objtree-act"
                  title="삭제"
                  aria-label="삭제"
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
                title="숨기기"
                aria-label="숨기기"
                aria-pressed={!ind.visible}
                onClick={() => onToggleIndicator(ind.id)}
              >
                <ToolIcon name={ind.visible ? 'eye' : 'hideAll'} size={16} />
              </button>
              <button
                type="button"
                className="tv-objtree-act"
                title="삭제"
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
