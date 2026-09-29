import { REPEAT_LABELS, type RepeatMode } from '../lib/alertRules'
import type { TimingDraft } from '../lib/alertTimingDraft'

interface AlertTimingFieldsProps {
  draft: TimingDraft
  onChange: (next: TimingDraft) => void
  /** 트리거(한 번만/매번) 칸을 보일지. 지표 알림은 자기 트리거를, 수직선은 한 번만 쓴다. */
  repeat: boolean
  /** 「매번」일 때 다시 걸리는 거리(%) 칸을 보일지 — 이동 % 조건은 울린 뒤부터 새로 재므로 없다. */
  hysteresis: boolean
}

/** 알림 창(가격·지표·선 알림)이 함께 쓰는 트리거·재알림·만료 칸. */
export function AlertTimingFields({ draft, onChange, repeat, hysteresis }: AlertTimingFieldsProps) {
  const set = (patch: Partial<TimingDraft>) => onChange({ ...draft, ...patch })
  return (
    <>
      {repeat && (
        <label className="ca-field">
          <span className="ca-label">트리거</span>
          <select
            className="tv-input ca-select"
            value={draft.repeat}
            onChange={(e) => set({ repeat: e.target.value as RepeatMode })}
          >
            {(Object.keys(REPEAT_LABELS) as RepeatMode[]).map((r) => (
              <option key={r} value={r}>
                {REPEAT_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      )}
      {repeat && draft.repeat === 'every' && hysteresis && (
        <label className="ca-field">
          <span className="ca-label">다시 걸리는 거리(%)</span>
          <input
            className="tv-input ca-value"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={draft.hysteresis}
            onChange={(e) => set({ hysteresis: e.target.value })}
          />
        </label>
      )}
      {repeat && draft.repeat === 'every' && (
        <label className="ca-field">
          <span className="ca-label">재알림 대기(분)</span>
          <input
            className="tv-input ca-value"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            placeholder="없음"
            value={draft.cooldown}
            onChange={(e) => set({ cooldown: e.target.value })}
          />
        </label>
      )}
      <label className="ca-field">
        <span className="ca-label">만료</span>
        <input className="tv-switch" type="checkbox" checked={draft.expires} onChange={(e) => set({ expires: e.target.checked })} />
      </label>
      {draft.expires && (
        <label className="ca-field">
          <span className="ca-label">만료 시각</span>
          <input
            className="tv-input ca-date"
            type="datetime-local"
            value={draft.expiresAt}
            onChange={(e) => set({ expiresAt: e.target.value })}
          />
        </label>
      )}
    </>
  )
}
