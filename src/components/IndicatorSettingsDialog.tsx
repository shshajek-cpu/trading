import { useEffect, useState } from 'react'
import { Dialog } from './ui/Dialog'
import { INDICATOR_DEFS, indicatorTitle, type IndicatorInstance, type IndicatorParamDef } from '../lib/indicatorConfig'
import './indicators.css'

interface IndicatorSettingsDialogProps {
  /** 편집할 지표. null 이면 닫혀 있다. */
  instance: IndicatorInstance | null
  onChange: (next: IndicatorInstance) => void
  onClose: () => void
}

type Tab = 'inputs' | 'style'

/**
 * TradingView 지표 설정: 입력 · 스타일 탭, 기본값 · 취소 · 확인.
 * 바꾸는 즉시 차트에 반영하고(미리보기), 취소하면 연 순간의 설정으로 되돌린다.
 */
export function IndicatorSettingsDialog({ instance, onChange, onClose }: IndicatorSettingsDialogProps) {
  // 연 순간의 설정(취소 때 되돌린다)과 탭. 다른 지표를 열면 새로 잡는다 — 편집으로 instance 가
  // 바뀌어도 id 가 같으면 원본은 그대로 둔다(렌더 중 파생 상태 갱신).
  const openId = instance?.id ?? null
  const [session, setSession] = useState<{ id: string | null; original: IndicatorInstance | null; tab: Tab }>({
    id: openId,
    original: instance,
    tab: 'inputs',
  })
  if (session.id !== openId) setSession({ id: openId, original: instance, tab: 'inputs' })
  const tab = session.tab
  const setTab = (next: Tab) => setSession((s) => ({ ...s, tab: next }))

  if (!instance) return null
  const def = INDICATOR_DEFS[instance.kind]

  const cancel = () => {
    if (session.original) onChange(session.original)
    onClose()
  }

  const footer = (
    <>
      <button
        type="button"
        className="tv-btn"
        onClick={() =>
          onChange({
            ...instance,
            params: Object.fromEntries(def.params.map((p) => [p.key, p.default])),
            colors: [...def.colors],
          })
        }
      >
        기본값
      </button>
      <span className="tv-settings-spacer" />
      <button type="button" className="tv-btn" onClick={cancel}>
        취소
      </button>
      <button type="button" className="tv-btn primary" onClick={onClose}>
        확인
      </button>
    </>
  )

  return (
    <Dialog
      open
      onClose={cancel}
      title={indicatorTitle(instance)}
      width={380}
      footer={footer}
      header={
        <div className="seg-tabs" role="tablist" aria-label="지표 설정 탭">
          <button type="button" role="tab" aria-selected={tab === 'inputs'} className={tab === 'inputs' ? 'active' : undefined} onClick={() => setTab('inputs')}>
            입력
          </button>
          <button type="button" role="tab" aria-selected={tab === 'style'} className={tab === 'style' ? 'active' : undefined} onClick={() => setTab('style')}>
            스타일
          </button>
        </div>
      }
    >
      <div className="ind-settings">
        {tab === 'inputs' &&
          (def.params.length === 0 ? (
            <p className="ind-settings-empty">바꿀 입력값이 없습니다.</p>
          ) : (
            def.params.map((param) => (
              <ParamField
                key={`${instance.id}-${param.key}`}
                param={param}
                value={instance.params[param.key] ?? param.default}
                onCommit={(v) => onChange({ ...instance, params: { ...instance.params, [param.key]: v } })}
              />
            ))
          ))}

        {tab === 'style' && (
          <>
            {def.colors.map((fallback, idx) => (
              <label className="tv-field" key={`color-${idx}`}>
                <span className="tv-field-label">{def.colorLabels?.[idx] ?? `색 ${idx + 1}`}</span>
                <input
                  type="color"
                  className="tv-color"
                  value={instance.colors[idx] ?? fallback}
                  onChange={(e) => {
                    const colors = [...instance.colors]
                    colors[idx] = e.target.value
                    onChange({ ...instance, colors })
                  }}
                />
              </label>
            ))}
            <label className="tv-field">
              <span className="tv-field-label">차트에 표시</span>
              <input
                type="checkbox"
                className="tv-switch"
                checked={instance.visible}
                onChange={(e) => onChange({ ...instance, visible: e.target.checked })}
              />
            </label>
          </>
        )}
      </div>
    </Dialog>
  )
}

/**
 * 숫자 입력은 치는 동안 글자 그대로 둔다. 범위 안의 값이 되면 바로 반영하고, 칸을 떠날 때 범위로 맞춘다.
 * (한 글자마다 범위로 자르면 "14" 를 치려다 "1" 이 최솟값으로 바뀌어 원하는 값을 넣을 수 없다.)
 */
function ParamField({
  param,
  value,
  onCommit,
}: {
  param: IndicatorParamDef
  value: number
  onCommit: (v: number) => void
}) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)
  // 밖에서 값이 바뀌면(기본값 버튼 등) 따라간다. 치는 중에는 건드리지 않는다.
  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])

  if (param.kind === 'flag') {
    return (
      <label className="tv-field">
        <span className="tv-field-label">{param.label}</span>
        <input
          type="checkbox"
          className="tv-switch"
          checked={value !== 0}
          onChange={(e) => onCommit(e.target.checked ? 1 : 0)}
        />
      </label>
    )
  }

  const parsed = Number(text)
  const valid = text.trim() !== '' && Number.isFinite(parsed) && parsed >= param.min && parsed <= param.max

  return (
    <label className="tv-field">
      <span className="tv-field-label">{param.label}</span>
      <input
        type="number"
        inputMode="decimal"
        className={`tv-input ind-num${valid ? '' : ' invalid'}`}
        value={text}
        min={param.min}
        max={param.max}
        step={param.step ?? 1}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          const n = Number(next)
          if (next.trim() !== '' && Number.isFinite(n) && n >= param.min && n <= param.max) onCommit(n)
        }}
        onBlur={() => {
          setFocused(false)
          const n = Number(text)
          const fixed = text.trim() === '' || !Number.isFinite(n) ? value : Math.min(param.max, Math.max(param.min, n))
          setText(String(fixed))
          if (fixed !== value) onCommit(fixed)
        }}
      />
    </label>
  )
}
