import { useState } from 'react'
import type { Interval } from '../lib/binance'
import { CHART_TYPES, type ChartType } from '../lib/chartTypes'
import { INTERVALS } from '../lib/intervals'
import { DRAWING_LABELS, type DrawingKind, type DrawingTool } from '../lib/drawings'
import type { LayoutMode } from '../lib/layoutConfig'
import { ALL_INDICATOR_KINDS, INDICATOR_DEFS, type IndicatorKind } from '../lib/indicatorConfig'
import { describeSymbol, displaySymbol, type SymbolInfo } from '../lib/symbols'
import { rankSymbol } from '../hooks/useSymbols'
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
  /** 종목 검색 대상. 검색어를 쳤을 때만 '심볼' 묶음에 뜬다. */
  symbols?: SymbolInfo[]
  /** 종목을 고르면 지금 차트에 띄운다. */
  onPickSymbol?: (symbol: string) => void
  /** 지표를 고르면 지표 대화상자처럼 바로 추가한다(키는 INDICATOR_DEFS 의 종류). */
  onAddIndicator?: (kind: IndicatorKind) => void
}

interface Command {
  id: string
  group: string
  label: string
  run: () => void
  /** 낮을수록 위. 0 = 정확히 일치, 1 = 앞부분 일치, 2 = 중간 일치, 3 = 묶음 이름만 일치. */
  score: number
}

/** 심볼 묶음에 보여 줄 최대 행 수 — 나머지는 심볼 검색에서 본다. */
const MAX_SYMBOLS = 8

/** 이름 일치 점수. -1 이면 제외. */
function textScore(text: string, q: string): number {
  const t = text.toLowerCase()
  if (t === q) return 0
  if (t.startsWith(q)) return 1
  if (t.includes(q)) return 2
  return -1
}

export function QuickSearchDialog(props: QuickSearchDialogProps) {
  const { open, onClose, symbols, onPickSymbol, onAddIndicator } = props
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const commands: Omit<Command, 'score'>[] = []
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

  let filtered: Command[]
  if (!q) {
    // 검색어가 없으면 명령만 — 종목·지표 수백 줄로 목록이 묻히지 않게.
    filtered = commands.map((c) => ({ ...c, score: 0 }))
  } else {
    filtered = []
    for (const c of commands) {
      const s = textScore(c.label, q)
      if (s >= 0) filtered.push({ ...c, score: s })
      else if (c.group.toLowerCase().includes(q)) filtered.push({ ...c, score: 3 })
    }

    if (onAddIndicator) {
      const group = '지표 추가'
      const groupHit = group.includes(q)
      for (const kind of ALL_INDICATOR_KINDS) {
        const def = INDICATOR_DEFS[kind]
        const nameScore = textScore(def.name, q)
        const shortScore = textScore(def.shortName, q)
        const s = nameScore < 0 ? shortScore : shortScore < 0 ? nameScore : Math.min(nameScore, shortScore)
        if (s < 0 && !groupHit) continue
        const label = def.shortName && def.shortName !== def.name ? `${def.name} (${def.shortName})` : def.name
        filtered.push({ id: `add-ind-${kind}`, group, label, run: () => onAddIndicator(kind), score: s < 0 ? 3 : s })
      }
    }

    if (onPickSymbol && symbols) {
      const upper = q.toUpperCase()
      const hits: { info: SymbolInfo; rank: number }[] = []
      for (const info of symbols) {
        const rank = rankSymbol(info, upper)
        if (rank >= 0) hits.push({ info, rank })
      }
      // 같은 점수면 짧은 심볼(ETHUSDT)을 긴 것(ETHFIUSDT·분기물)보다 앞에.
      hits.sort((a, b) => a.rank - b.rank || a.info.symbol.length - b.info.symbol.length || a.info.symbol.localeCompare(b.info.symbol))
      for (const { info, rank } of hits.slice(0, MAX_SYMBOLS)) {
        filtered.push({
          id: `sym-${info.symbol}`,
          group: '심볼',
          label: `${displaySymbol(info.symbol, [info])} — ${describeSymbol(info.symbol, [info])}`,
          run: () => onPickSymbol(info.symbol),
          // 심볼 순위(정확·기초자산 0–1, 앞부분 2–3, 중간 4)를 명령 점수 눈금에 맞춘다.
          score: rank <= 1 ? 0 : rank <= 3 ? 1 : 2,
        })
      }
    }

    // 가장 잘 맞는 행이 있는 묶음부터, 묶음 안에서도 잘 맞는 순으로. 동점은 원래 순서(정렬은 안정적).
    // Enter 는 맨 위 행을 실행한다.
    const groupRank: Record<string, { best: number; first: number }> = {}
    filtered.forEach((c, i) => {
      const g = (groupRank[c.group] ??= { best: c.score, first: i })
      g.best = Math.min(g.best, c.score)
    })
    filtered.sort((a, b) => {
      const ga = groupRank[a.group]
      const gb = groupRank[b.group]
      return ga.best - gb.best || ga.first - gb.first || a.score - b.score
    })
  }

  const runCommand = (command: Command) => {
    command.run()
    onClose()
    setQuery('')
  }

  const header = (
    <div className="tv-search">
      <Icon name="search" size={18} />
      <input
        type="text"
        placeholder="기능·종목·지표 검색 (추세선, ETH, RSI…)"
        value={query}
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (filtered[0]) runCommand(filtered[0])
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
        {filtered.length === 0 && <p className="tv-quick-empty">일치하는 항목이 없습니다.</p>}
        {rows.map(({ label, command }, i) =>
          command ? (
            <button key={command.id} type="button" className="tv-quick-item" onClick={() => runCommand(command)}>
              {label}
            </button>
          ) : (
            <div key={`g-${label}-${i}`} className="tv-quick-group">
              {label}
            </div>
          ),
        )}
      </div>
    </Dialog>
  )
}
