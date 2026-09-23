import { useEffect, useState } from 'react'
import { Dialog } from './ui/Dialog'
import { DEFAULT_CHART_SETTINGS, TIMEZONES, type ChartSettings } from '../lib/chartSettings'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  settings: ChartSettings
  onChange: (next: ChartSettings) => void
}

type Tab = 'symbol' | 'status' | 'scale' | 'canvas' | 'timezone'

const TABS: { id: Tab; label: string }[] = [
  { id: 'symbol', label: '심볼' },
  { id: 'status', label: '상태 줄' },
  { id: 'scale', label: '스케일' },
  { id: 'canvas', label: '캔버스' },
  { id: 'timezone', label: '시간대' },
]

const GRID_OPTIONS: { id: ChartSettings['grid']; label: string }[] = [
  { id: 'both', label: '가로·세로' },
  { id: 'vertical', label: '세로만' },
  { id: 'horizontal', label: '가로만' },
  { id: 'none', label: '없음' },
]

export function SettingsDialog({ open, onClose, settings, onChange }: SettingsDialogProps) {
  const [tab, setTab] = useState<Tab>('symbol')
  const [draft, setDraft] = useState<ChartSettings>(settings)

  // Reopening starts from the live settings; edits are only committed on 확인.
  useEffect(() => {
    if (open) setDraft(settings)
  }, [open, settings])

  const set = <K extends keyof ChartSettings>(key: K, value: ChartSettings[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const footer = (
    <>
      <button type="button" className="tv-btn" onClick={() => setDraft(DEFAULT_CHART_SETTINGS)}>
        기본값
      </button>
      <span className="tv-settings-spacer" />
      <button type="button" className="tv-btn" onClick={onClose}>
        취소
      </button>
      <button
        type="button"
        className="tv-btn primary"
        onClick={() => {
          onChange(draft)
          onClose()
        }}
      >
        확인
      </button>
    </>
  )

  return (
    <Dialog open={open} onClose={onClose} title="차트 설정" width={620} height={480} footer={footer} className="tv-settings">
      <div className="tv-settings-layout">
        <nav className="tv-settings-tabs" aria-label="설정 탭">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tv-settings-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="tv-settings-body">
          {tab === 'symbol' && (
            <>
              <label className="tv-field">
                <span className="tv-field-label">상승 색</span>
                <input
                  className="tv-color"
                  type="color"
                  value={draft.upColor}
                  onChange={(e) => set('upColor', e.target.value)}
                />
              </label>
              <label className="tv-field">
                <span className="tv-field-label">하락 색</span>
                <input
                  className="tv-color"
                  type="color"
                  value={draft.downColor}
                  onChange={(e) => set('downColor', e.target.value)}
                />
              </label>
            </>
          )}

          {tab === 'status' && (
            <>
              <label className="tv-field">
                <span className="tv-field-label">OHLC 값 표시</span>
                <input
                  className="tv-switch"
                  type="checkbox"
                  checked={draft.showLegendOhlc}
                  onChange={(e) => set('showLegendOhlc', e.target.checked)}
                />
              </label>
              <label className="tv-field">
                <span className="tv-field-label">지표 범례 표시</span>
                <input
                  className="tv-switch"
                  type="checkbox"
                  checked={draft.showIndicatorLegend}
                  onChange={(e) => set('showIndicatorLegend', e.target.checked)}
                />
              </label>
            </>
          )}

          {tab === 'scale' && (
            <>
              <label className="tv-field">
                <span className="tv-field-label">봉 마감 카운트다운</span>
                <input
                  className="tv-switch"
                  type="checkbox"
                  checked={draft.showCountdown}
                  onChange={(e) => set('showCountdown', e.target.checked)}
                />
              </label>
              <label className="tv-field">
                <span className="tv-field-label">현재가 라벨</span>
                <input
                  className="tv-switch"
                  type="checkbox"
                  checked={draft.showLastPriceLabel}
                  onChange={(e) => set('showLastPriceLabel', e.target.checked)}
                />
              </label>
            </>
          )}

          {tab === 'canvas' && (
            <>
              <label className="tv-field">
                <span className="tv-field-label">격자</span>
                <select
                  className="tv-input"
                  value={draft.grid}
                  onChange={(e) => set('grid', e.target.value as ChartSettings['grid'])}
                >
                  {GRID_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tv-field">
                <span className="tv-field-label">십자선</span>
                <select
                  className="tv-input"
                  value={draft.crosshair}
                  onChange={(e) => set('crosshair', e.target.value as ChartSettings['crosshair'])}
                >
                  <option value="normal">일반</option>
                  <option value="magnet">자석</option>
                </select>
              </label>
              <label className="tv-field">
                <span className="tv-field-label">워터마크</span>
                <input
                  className="tv-switch"
                  type="checkbox"
                  checked={draft.showWatermark}
                  onChange={(e) => set('showWatermark', e.target.checked)}
                />
              </label>
              <label className="tv-field">
                <span className="tv-field-label">테마</span>
                <select
                  className="tv-input"
                  value={draft.theme}
                  onChange={(e) => set('theme', e.target.value as ChartSettings['theme'])}
                >
                  <option value="dark">다크</option>
                  <option value="light">라이트</option>
                </select>
              </label>
            </>
          )}

          {tab === 'timezone' && (
            <label className="tv-field">
              <span className="tv-field-label">시간대</span>
              <select
                className="tv-input"
                value={draft.timezone}
                onChange={(e) => set('timezone', e.target.value)}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.id} value={tz.id}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
    </Dialog>
  )
}
