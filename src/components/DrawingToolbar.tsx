import { useEffect, useMemo, useRef, useState } from 'react'
import {
  TOOL_GROUPS,
  type DrawingTool,
  type MagnetMode,
  type ToolGroup,
} from '../lib/drawings'
import { Popover, MenuSection, MenuItem } from './ui/Popover'
import { ToolIcon, type IconName } from '../chart/drawing/toolIcons'
import './DrawingToolbar.css'
import { tip } from '../lib/tooltip'

export interface DrawingToolbarProps {
  tool: DrawingTool
  onToolChange: (t: DrawingTool) => void
  magnet: MagnetMode
  onMagnetChange: (m: MagnetMode) => void
  stayInDrawingMode: boolean
  onStayChange: (v: boolean) => void
  locked: boolean
  onLockedChange: (v: boolean) => void
  hidden: boolean
  onHiddenChange: (v: boolean) => void
  onRemoveDrawings: () => void
  onRemoveIndicators: () => void
  /** 도구별 단축키 라벨(사용자가 바꾼 키 반영). */
  toolShortcuts: Partial<Record<DrawingTool, string>>
}

const LAST_USED_KEY = 'trading.drawingToolbar.v1'

function loadLastUsed(): Record<string, DrawingTool> {
  try {
    const raw = localStorage.getItem(LAST_USED_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, DrawingTool>
    }
  } catch {
    /* 무시 */
  }
  return {}
}

/** 끌 것이 없는 기본 커서들 — 그 밖의 도구(그리기·지우개)는 한 번 더 누르면 꺼진다. */
const POINTERS: readonly DrawingTool[] = ['cross', 'dot', 'arrow']

const MAGNET_LABEL: Record<MagnetMode, string> = {
  off: '끄기',
  weak: '약한 자석',
  strong: '강한 자석',
}

export function DrawingToolbar({
  tool,
  onToolChange,
  magnet,
  onMagnetChange,
  stayInDrawingMode,
  onStayChange,
  locked,
  onLockedChange,
  hidden,
  onHiddenChange,
  onRemoveDrawings,
  onRemoveIndicators,
  toolShortcuts,
}: DrawingToolbarProps) {
  const [lastUsed, setLastUsed] = useState<Record<string, DrawingTool>>(loadLastUsed)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [magnetOpen, setMagnetOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)

  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const magnetRef = useRef<HTMLButtonElement>(null)
  const removeRef = useRef<HTMLButtonElement>(null)

  const groupTools = useMemo(() => {
    const map: Record<string, DrawingTool[]> = {}
    for (const g of TOOL_GROUPS) {
      map[g.id] = g.sections.flatMap((s) => s.items.map((i) => i.tool))
    }
    return map
  }, [])

  const representative = (g: ToolGroup): DrawingTool => {
    const stored = lastUsed[g.id]
    if (stored && groupTools[g.id].includes(stored)) return stored
    return g.sections[0].items[0].tool
  }

  const rememberTool = (groupId: string, t: DrawingTool) => {
    setLastUsed((prev) => {
      if (prev[groupId] === t) return prev
      const next = { ...prev, [groupId]: t }
      try {
        localStorage.setItem(LAST_USED_KEY, JSON.stringify(next))
      } catch {
        /* 무시 */
      }
      return next
    })
  }

  const pickTool = (groupId: string, t: DrawingTool) => {
    rememberTool(groupId, t)
    onToolChange(t)
    setOpenGroup(null)
  }

  // 단축키·Esc·그리기 완료로 도구가 바뀌어도 그 묶음의 대표 아이콘을 맞춘다.
  // (예: 지우개를 쓰다 Esc 로 십자선에 돌아오면 커서 버튼도 십자선이어야 한다.)
  useEffect(() => {
    const group = TOOL_GROUPS.find((g) => groupTools[g.id].includes(tool))
    if (group) rememberTool(group.id, tool)
    // rememberTool 은 상태 갱신 함수만 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, groupTools])

  const magnetOn = magnet !== 'off'

  return (
    <div className="tv-drawbar" role="toolbar" aria-label="그리기 도구">
      <div className="tv-drawbar-scroll">
        {TOOL_GROUPS.map((g) => {
          const rep = representative(g)
          const active = groupTools[g.id].includes(tool)
          const multi = groupTools[g.id].length > 1
          const repItem = g.sections.flatMap((s) => s.items).find((i) => i.tool === rep)
          return (
            <div key={g.id} className="tv-drawbar-group">
              <button
                ref={(el) => {
                  btnRefs.current[g.id] = el
                }}
                type="button"
                className={`tv-drawbar-btn${active ? ' active' : ''}`}
                {...tip(
                  repItem?.label ?? g.label,
                  multi ? `${repItem?.desc ?? ''} 오른쪽 아래 ▸ 를 누르면 같은 묶음의 다른 도구를 고릅니다.` : repItem?.desc,
                  toolShortcuts[rep],
                  'right',
                )}
                aria-label={g.label}
                // 켜 둔 도구를 한 번 더 누르면 끄고 십자선으로 돌아간다.
                onClick={() => (active && !POINTERS.includes(tool) ? onToolChange('cross') : pickTool(g.id, rep))}
              >
                <ToolIcon name={rep as IconName} />
                {multi && (
                  <span
                    className="tv-drawbar-arrow"
                    role="button"
                    tabIndex={-1}
                    aria-label={`${g.label} 더보기`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenGroup(g.id)
                    }}
                  >
                    <ToolIcon name="flyout" size={12} />
                  </span>
                )}
              </button>
              <Popover
                anchor={btnRefs.current[g.id]}
                open={openGroup === g.id}
                onClose={() => setOpenGroup(null)}
                placement="right-start"
              >
                {g.sections.map((sec, si) => (
                  <MenuSection key={si} title={sec.title}>
                    {sec.items.map((item) => (
                      <MenuItem
                        key={item.tool}
                        icon={<ToolIcon name={item.tool as IconName} size={20} />}
                        label={item.label}
                        shortcut={toolShortcuts[item.tool]}
                        active={tool === item.tool}
                        onSelect={() => pickTool(g.id, item.tool)}
                      />
                    ))}
                  </MenuSection>
                ))}
              </Popover>
            </div>
          )
        })}

        <div className="tv-drawbar-sep" />

        <button
          type="button"
          className={`tv-drawbar-btn${tool === 'measure' ? ' active' : ''}`}
          {...tip('측정', '끌어서 두 지점 사이의 가격 변화·% ·봉 수·기간을 잽니다. 십자선에서 Shift+끌기로도 됩니다.', undefined, 'right')}
          aria-label="측정"
          onClick={() => onToolChange(tool === 'measure' ? 'cross' : 'measure')}
        >
          <ToolIcon name="measure" />
        </button>
        <button
          type="button"
          className={`tv-drawbar-btn${tool === 'zoom' ? ' active' : ''}`}
          {...tip('확대', '끌어서 고른 시간 구간만 크게 봅니다.', undefined, 'right')}
          aria-label="확대"
          onClick={() => onToolChange(tool === 'zoom' ? 'cross' : 'zoom')}
        >
          <ToolIcon name="zoom" />
        </button>

        <div className="tv-drawbar-sep" />

        <div className="tv-drawbar-group">
          <button
            ref={magnetRef}
            type="button"
            className={`tv-drawbar-btn${magnetOn ? ' active' : ''}`}
            {...tip(
              `자석: ${MAGNET_LABEL[magnet]}`,
              '그림 점을 가까운 봉의 시가·고가·저가·종가에 붙입니다. 약한 자석은 가까울 때만 붙습니다.',
              undefined,
              'right',
            )}
            aria-label="자석"
            onClick={() => setMagnetOpen(true)}
          >
            <ToolIcon name={magnet === 'strong' ? 'magnetStrong' : 'magnet'} />
            <span className="tv-drawbar-arrow" aria-hidden="true">
              <ToolIcon name="flyout" size={12} />
            </span>
          </button>
          <Popover
            anchor={magnetRef.current}
            open={magnetOpen}
            onClose={() => setMagnetOpen(false)}
            placement="right-start"
          >
            <MenuSection title="자석">
              {(['off', 'weak', 'strong'] as MagnetMode[]).map((m) => (
                <MenuItem
                  key={m}
                  icon={<ToolIcon name={m === 'strong' ? 'magnetStrong' : 'magnet'} size={20} />}
                  label={MAGNET_LABEL[m]}
                  active={magnet === m}
                  onSelect={() => {
                    onMagnetChange(m)
                    setMagnetOpen(false)
                  }}
                />
              ))}
            </MenuSection>
          </Popover>
        </div>

        <button
          type="button"
          className={`tv-drawbar-btn${stayInDrawingMode ? ' active' : ''}`}
          {...tip('그리기 모드 유지', '켜면 그림 하나를 다 그린 뒤에도 같은 도구가 남아 계속 그릴 수 있습니다.', undefined, 'right')}
          aria-label="그리기 모드 유지"
          aria-pressed={stayInDrawingMode}
          onClick={() => onStayChange(!stayInDrawingMode)}
        >
          <ToolIcon name="stay" />
        </button>
        <button
          type="button"
          className={`tv-drawbar-btn${locked ? ' active' : ''}`}
          {...tip('모든 그림 잠금', '그린 선이 실수로 움직이거나 지워지지 않게 모두 고정합니다.', undefined, 'right')}
          aria-label="모든 그림 잠금"
          aria-pressed={locked}
          onClick={() => onLockedChange(!locked)}
        >
          <ToolIcon name={locked ? 'lock' : 'unlock'} />
        </button>
        <button
          type="button"
          className={`tv-drawbar-btn${hidden ? ' active' : ''}`}
          {...tip('모든 그림 숨기기', '그린 선을 지우지 않고 모두 안 보이게 합니다.', undefined, 'right')}
          aria-label="모든 그림 숨기기"
          aria-pressed={hidden}
          onClick={() => onHiddenChange(!hidden)}
        >
          <ToolIcon name={hidden ? 'hideAll' : 'eye'} />
        </button>

        <div className="tv-drawbar-group">
          <button
            ref={removeRef}
            type="button"
            className="tv-drawbar-btn"
            {...tip('삭제', '이 종목의 그림이나 지표를 한꺼번에 지웁니다.', undefined, 'right')}
            aria-label="삭제"
            onClick={() => setRemoveOpen(true)}
          >
            <ToolIcon name="remove" />
          </button>
          <Popover
            anchor={removeRef.current}
            open={removeOpen}
            onClose={() => setRemoveOpen(false)}
            placement="right-start"
          >
            <MenuSection>
              <MenuItem
                icon={<ToolIcon name="trash" size={20} />}
                label="그림 삭제"
                onSelect={() => {
                  onRemoveDrawings()
                  setRemoveOpen(false)
                }}
              />
              <MenuItem
                icon={<ToolIcon name="indicator" size={20} />}
                label="지표 삭제"
                onSelect={() => {
                  onRemoveIndicators()
                  setRemoveOpen(false)
                }}
              />
              <MenuItem
                icon={<ToolIcon name="remove" size={20} />}
                label="그림과 지표 삭제"
                onSelect={() => {
                  onRemoveDrawings()
                  onRemoveIndicators()
                  setRemoveOpen(false)
                }}
              />
            </MenuSection>
          </Popover>
        </div>
      </div>
    </div>
  )
}
