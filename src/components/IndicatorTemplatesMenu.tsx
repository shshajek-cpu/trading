import { useState } from 'react'
import {
  fromTemplateEntry,
  loadTemplates,
  saveTemplates,
  toTemplateEntry,
  type IndicatorInstance,
  type IndicatorTemplate,
} from '../lib/indicatorConfig'
import './indicators.css'

interface IndicatorTemplatesMenuProps {
  indicators: IndicatorInstance[]
  onApply: (next: IndicatorInstance[]) => void
  onClose: () => void
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `tpl-${Date.now().toString(36)}`
  }
}

/** 지표 템플릿 저장/적용/삭제. 셸의 Popover 안에 렌더된다. */
export function IndicatorTemplatesMenu({ indicators, onApply, onClose }: IndicatorTemplatesMenuProps) {
  const [templates, setTemplates] = useState<IndicatorTemplate[]>(loadTemplates)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const persist = (next: IndicatorTemplate[]) => {
    setTemplates(next)
    saveTemplates(next)
  }

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    persist([...templates, { id: newId(), name: trimmed, indicators: indicators.map(toTemplateEntry) }])
    setName('')
    setNaming(false)
  }

  const apply = (tpl: IndicatorTemplate) => {
    onApply(tpl.indicators.map(fromTemplateEntry))
    onClose()
  }

  return (
    <div className="tpl-menu">
      {naming ? (
        <div className="tpl-save-row">
          <input
            type="text"
            className="tv-input"
            placeholder="템플릿 이름"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') setNaming(false)
            }}
          />
          <button type="button" className="tv-btn primary" onClick={save}>
            저장
          </button>
        </div>
      ) : (
        <button type="button" className="tpl-add" onClick={() => setNaming(true)}>
          + 템플릿 저장
        </button>
      )}

      {templates.length > 0 && <div className="tpl-divider" />}

      {templates.map((tpl) => (
        <div className="tpl-row" key={tpl.id}>
          <button type="button" className="tpl-apply" onClick={() => apply(tpl)}>
            {tpl.name}
            <em>{tpl.indicators.length}개 지표</em>
          </button>
          <button
            type="button"
            className="tpl-del"
            title="삭제"
            onClick={() => persist(templates.filter((t) => t.id !== tpl.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
