import { useState } from 'react'
import type { Interval } from '../lib/binance'
import { CHART_TYPES, type ChartType } from '../lib/chartTypes'
import { INTERVALS } from '../lib/intervals'
import { DRAWING_LABELS, type DrawingKind, type DrawingTool } from '../lib/drawings'
import type { LayoutMode } from '../lib/layoutConfig'
import { Dialog } from './ui/Dialog'
import { Icon } from './Icon'

export interface QuickSearchDialogProps {
  open: boolean
  onClose: () => void
  onTool: (tool: DrawingTool) => void
  onChartType: (t: ChartType) => void
  onInterval: (iv: Interval) => void
  onOpenIndicators: () => void
  onSettings: () => void
  onSnapshot: () => void
  onFullscreen: () => void
  onLayout: (mode: LayoutMode) => void
  onTheme: (theme: 'dark' | 'light') => void
}

interface Command {
  id: string
  group: string
  label: string
  run: () => void
}

export function QuickSearchDialog(props: QuickSearchDialogProps) {
  const { open, onClose } = props
  const [query, setQuery] = useState('')

  const commands: Command[] = []
  for (const kind of Object.keys(DRAWING_LABELS) as DrawingKind[]) {
    commands.push({ id: `tool-${kind}`, group: '그리기 도구', label: DRAWING_LABELS[kind], run: () => props.onTool(kind) })
  }
  for (const t of CHART_TYPES) {
    commands.push({ id: `type-${t.id}`, group: '차트 유형', label: t.label, run: () => props.onChartType(t.id) })
  }
  for (const iv of INTERVALS) {
    commands.push({ id: `iv-${iv.id}`, group: '시간 간격', label: iv.label, run: () => props.onInterval(iv.id) })
  }
  commands.push({ id: 'ind', group: '작업', label: '지표 열기', run: props.onOpenIndicators })
  commands.push({ id: 'settings', group: '작업', label: '차트 설정', run: props.onSettings })
  commands.push({ id: 'snapshot', group: '작업', label: '스냅샷 이미지 다운로드', run: props.onSnapshot })
  commands.push({ id: 'fullscreen', group: '작업', label: '전체 화면', run: props.onFullscreen })
  commands.push({ id: 'layout-1', group: '레이아웃', label: '단일 차트', run: () => props.onLayout(1) })
  commands.push({ id: 'layout-2', group: '레이아웃', label: '2분할', run: () => props.onLayout(2) })
  commands.push({ id: 'layout-4', group: '레이아웃', label: '4분할', run: () => props.onLayout(4) })
  commands.push({ id: 'theme-dark', group: '테마', label: '다크 테마', run: () => props.onTheme('dark') })
  commands.push({ id: 'theme-light', group: '테마', label: '라이트 테마', run: () => props.onTheme('light') })

  const q = query.trim().toLowerCase()
  const filtered = q ? commands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)) : commands

  const runFirst = () => {
    const first = filtered[0]
    if (first) {
      first.run()
      onClose()
      setQuery('')
    }
  }

  const header = (
    <div className="tv-search">
      <Icon name="search" size={18} />
      <input
        type="text"
        placeholder="명령 검색 (도구, 지표, 시간 간격…)"
        value={query}
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            runFirst()
          }
        }}
      />
    </div>
  )

  // Group consecutive rows under their group heading.
  const rows: { label: string; command?: Command }[] = []
  let lastGroup = ''
  for (const c of filtered) {
    if (c.group !== lastGroup) {
      rows.push({ label: c.group })
      lastGroup = c.group
    }
    rows.push({ label: c.label, command: c })
  }

  return (
    <Dialog open={open} onClose={onClose} title="빠른 검색" width={520} height={520} header={header} className="tv-quick">
      <div className="tv-quick-list">
        {filtered.length === 0 && <p className="tv-quick-empty">일치하는 명령이 없습니다.</p>}
        {rows.map((r, i) =>
          r.command ? (
            <button
              key={r.command.id}
              type="button"
              className="tv-quick-item"
              onClick={() => {
                r.command!.run()
                onClose()
                setQuery('')
              }}
            >
              {r.label}
            </button>
          ) : (
            <div key={`g-${r.label}-${i}`} className="tv-quick-group">
              {r.label}
            </div>
          ),
        )}
      </div>
    </Dialog>
  )
}
