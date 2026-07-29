import { useMemo, useState } from 'react'
import { FEATURE_LABELS, formatFeature, type FeatureSet } from '../lib/features'
import { SIDE_COLORS, SIDE_LABELS, type Pin, type PinSide } from '../lib/pins'
import { deriveRule, describeRule, MIN_PINS, scoreAgainst } from '../lib/pinRules'

interface PinPanelProps {
  pins: Pin[]
  pinMode: boolean
  pinSide: PinSide
  onPinModeChange: (on: boolean) => void
  onPinSideChange: (side: PinSide) => void
  onRemove: (id: string) => void
  onClear: () => void
  /** 현재 차트 맨 끝 시점의 지표 — 지금 점수를 매기는 데 쓴다. */
  liveFeatures: FeatureSet | null
  symbol: string
}

const SIDES: PinSide[] = ['long', 'short', 'skip']

export function PinPanel({
  pins,
  pinMode,
  pinSide,
  onPinModeChange,
  onPinSideChange,
  onRemove,
  onClear,
  liveFeatures,
  symbol,
}: PinPanelProps) {
  const [tab, setTab] = useState<'record' | 'rule'>('record')

  const counts = useMemo(
    () => ({
      long: pins.filter((p) => p.side === 'long').length,
      short: pins.filter((p) => p.side === 'short').length,
      skip: pins.filter((p) => p.side === 'skip').length,
    }),
    [pins],
  )

  const longRule = useMemo(() => deriveRule(pins, 'long'), [pins])
  const shortRule = useMemo(() => deriveRule(pins, 'short'), [pins])

  const longScore = longRule && liveFeatures ? scoreAgainst(longRule, liveFeatures) : null
  const shortScore = shortRule && liveFeatures ? scoreAgainst(shortRule, liveFeatures) : null

  const recent = useMemo(() => [...pins].sort((a, b) => b.created - a.created).slice(0, 12), [pins])

  return (
    <section className="panel pin-panel">
      <h2>매매 핀</h2>

      <div className="pin-tabs">
        <button
          type="button"
          className={tab === 'record' ? 'active' : undefined}
          onClick={() => setTab('record')}
        >
          기록 {pins.length > 0 && <em>{pins.length}</em>}
        </button>
        <button
          type="button"
          className={tab === 'rule' ? 'active' : undefined}
          onClick={() => setTab('rule')}
        >
          내 지표
        </button>
      </div>

      {tab === 'record' && (
        <>
          <button
            type="button"
            className={`pin-toggle ${pinMode ? 'on' : ''}`}
            onClick={() => onPinModeChange(!pinMode)}
          >
            {pinMode ? '핀 찍는 중 — 차트를 클릭하세요' : '핀 찍기 시작'}
          </button>

          <div className="pin-sides">
            {SIDES.map((s) => (
              <button
                key={s}
                type="button"
                className={pinSide === s ? 'active' : undefined}
                style={pinSide === s ? { borderColor: SIDE_COLORS[s], color: SIDE_COLORS[s] } : undefined}
                onClick={() => onPinSideChange(s)}
              >
                {SIDE_LABELS[s]}
              </button>
            ))}
          </div>

          <p className="hint">
            오른쪽(미래)을 보지 말고, <b>그 자리까지만 보고 판단</b>해 찍으세요. 결과를 알고 고르면
            규칙이 실전에서 듣지 않습니다.
          </p>

          <div className="pin-counts">
            {SIDES.map((s) => (
              <span key={s} style={{ color: SIDE_COLORS[s] }}>
                {SIDE_LABELS[s]} {counts[s]}
              </span>
            ))}
          </div>

          <ul className="pin-list">
            {recent.map((pin) => (
              <li key={pin.id}>
                <span className="pin-dot" style={{ background: SIDE_COLORS[pin.side] }} />
                <span className="pin-meta">
                  {pin.symbol.replace('USDT', '')} {pin.interval}
                  <em>{new Date(pin.time * 1000).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</em>
                </span>
                <span className="pin-rsi">RSI {pin.features.rsi14.toFixed(0)}</span>
                <button type="button" className="pin-del" onClick={() => onRemove(pin.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>

          {pins.length > 0 && (
            <button type="button" className="pin-clear" onClick={onClear}>
              전부 지우기
            </button>
          )}
        </>
      )}

      {tab === 'rule' && (
        <>
          {!longRule && !shortRule && (
            <p className="hint">
              방향별로 <b>{MIN_PINS}개 이상</b> 찍으면 공통 조건을 뽑아 보여줍니다. 지금 롱{' '}
              {counts.long}개 · 숏 {counts.short}개입니다.
            </p>
          )}

          {(longScore !== null || shortScore !== null) && (
            <div className="pin-score">
              <span className="pin-score-title">{symbol.replace('USDT', '')} 지금</span>
              {longScore !== null && (
                <span className="pin-score-val" style={{ color: SIDE_COLORS.long }}>
                  롱 {longScore}점
                </span>
              )}
              {shortScore !== null && (
                <span className="pin-score-val" style={{ color: SIDE_COLORS.short }}>
                  숏 {shortScore}점
                </span>
              )}
            </div>
          )}

          {[longRule, shortRule].map(
            (rule) =>
              rule && (
                <div key={rule.side} className="pin-rule">
                  <h3 style={{ color: SIDE_COLORS[rule.side] }}>
                    {SIDE_LABELS[rule.side]} 조건
                    <em>표본 {rule.sampleCount}개</em>
                  </h3>
                  <ul>
                    {describeRule(rule).map((line) => (
                      <li key={line.text}>
                        <span>{line.text}</span>
                        <em title="반대 방향을 걸러내는 비율">{line.separation}%</em>
                      </li>
                    ))}
                  </ul>
                  {rule.sampleCount < 20 && (
                    <p className="warn">
                      표본이 적어 아직 믿기 어렵습니다. 20개 이상 모으세요.
                    </p>
                  )}
                </div>
              ),
          )}

          {liveFeatures && (
            <details className="pin-now">
              <summary>지금 지표 값</summary>
              <ul>
                {(Object.keys(FEATURE_LABELS) as (keyof FeatureSet)[]).map((k) => (
                  <li key={k}>
                    <span>{FEATURE_LABELS[k]}</span>
                    <b>{formatFeature(k, liveFeatures[k])}</b>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}
