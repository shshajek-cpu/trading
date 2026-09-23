import { useCallback, useState } from 'react'
import type { Candle } from '../lib/binance'
import { fetchKlines, type Interval } from '../lib/binance'
import {
  DEFAULT_CONFIG,
  describeBand,
  discover,
  judge,
  matchesBands,
  type DiscoverConfig,
  type DiscoverResult,
} from '../lib/discover'
import type { FeatureSet } from '../lib/features'
import { SIDE_COLORS } from '../lib/pins'
import { intlZone } from '../lib/timezone'

interface DiscoverPanelProps {
  symbol: string
  interval: Interval
  liveFeatures: FeatureSet | null
  /** 차트 시간대 — 훑은 기간의 날짜를 차트와 같게 보여준다. */
  timezone: string
}

/** 몇 번에 나눠 과거를 받을지. 1000개씩이라 5면 5000봉. */
const CHUNKS = 5

export function DiscoverPanel({ symbol, interval, liveFeatures, timezone }: DiscoverPanelProps) {
  const [cfg, setCfg] = useState<DiscoverConfig>(DEFAULT_CONFIG)
  const [result, setResult] = useState<DiscoverResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scannedRange, setScannedRange] = useState<string>('')

  const run = useCallback(async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      // 통계를 내려면 캔들이 많아야 한다. 나눠서 과거로 거슬러 받는다.
      let all: Candle[] = []
      let endTime: number | undefined
      for (let i = 0; i < CHUNKS; i++) {
        const part = await fetchKlines(symbol, interval, 1000, undefined, endTime)
        if (part.length === 0) break
        all = [...part, ...all]
        endTime = part[0].time * 1000 - 1
      }
      if (all.length < 500) {
        setError('과거 데이터가 모자랍니다. 다른 주기로 시도해 보세요.')
        return
      }
      const day = (t: number) => new Date(t * 1000).toLocaleDateString('ko-KR', { timeZone: intlZone(timezone) })
      const from = day(all[0].time)
      const to = day(all[all.length - 1].time)
      setScannedRange(`${from} ~ ${to} · ${all.length.toLocaleString()}봉`)

      const found = discover(all, cfg)
      if (!found) {
        setError('쓸 만한 조건을 찾지 못했습니다. 목표를 낮추거나 기간을 늘려 보세요.')
        return
      }
      setResult(found)
    } catch {
      setError('데이터를 불러오지 못했습니다. 잠시 후 다시 시도하세요.')
    } finally {
      setBusy(false)
    }
  }, [symbol, interval, cfg, timezone])

  const verdict = result ? judge(result) : null
  const matchNow = result && liveFeatures ? matchesBands(result.bands, liveFeatures) : false

  return (
    <section className="panel discover-panel">
      <p className="hint">
        과거를 훑어 <b>실제로 통했던 자리</b>의 공통점을 찾습니다. 사람이 고르지 않으므로 결과를
        알고 찍는 편향이 없습니다.
      </p>

      <div className="disc-sides">
        {(['long', 'short'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={cfg.side === s ? 'active' : undefined}
            style={cfg.side === s ? { borderColor: SIDE_COLORS[s], color: SIDE_COLORS[s] } : undefined}
            onClick={() => setCfg((c) => ({ ...c, side: s }))}
          >
            {s === 'long' ? '롱 자리 찾기' : '숏 자리 찾기'}
          </button>
        ))}
      </div>

      <div className="disc-fields">
        <label>
          목표 %
          <input
            type="number"
            min={0.3}
            max={20}
            step={0.1}
            value={cfg.target}
            onChange={(e) => setCfg((c) => ({ ...c, target: Number(e.target.value) }))}
          />
        </label>
        <label>
          손절 %
          <input
            type="number"
            min={0.2}
            max={20}
            step={0.1}
            value={cfg.stop}
            onChange={(e) => setCfg((c) => ({ ...c, stop: Number(e.target.value) }))}
          />
        </label>
        <label>
          몇 봉 안
          <input
            type="number"
            min={5}
            max={200}
            step={5}
            value={cfg.horizon}
            onChange={(e) => setCfg((c) => ({ ...c, horizon: Number(e.target.value) }))}
          />
        </label>
      </div>

      <button type="button" className="cta disc-run" disabled={busy} onClick={() => void run()}>
        {busy ? '훑는 중…' : `${symbol.replace('USDT', '')} ${interval} 훑어보기`}
      </button>

      {error && <p className="disc-error">{error}</p>}

      {result && verdict && (
        <div className="disc-result">
          <div className={`disc-verdict ${verdict.verdict}`}>
            <strong>{verdict.label}</strong>
            <span>{verdict.reason}</span>
          </div>

          <p className="disc-range">{scannedRange}</p>

          <div className="disc-bands">
            <h3>조건</h3>
            <ul>
              {result.bands.map((b) => (
                <li key={b.key}>{describeBand(b)}</li>
              ))}
            </ul>
          </div>

          <table className="disc-table">
            <thead>
              <tr>
                <th />
                <th>신호</th>
                <th>승률</th>
                <th>평균</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>학습(앞 70%)</th>
                <td>{result.train.signals}</td>
                <td>{result.train.winRate.toFixed(1)}%</td>
                <td>{result.train.avgReturn.toFixed(2)}%</td>
              </tr>
              <tr className="disc-test">
                <th>시험(뒤 30%)</th>
                <td>{result.test.signals}</td>
                <td>{result.test.winRate.toFixed(1)}%</td>
                <td>{result.test.avgReturn.toFixed(2)}%</td>
              </tr>
              <tr className="disc-base">
                <th>아무 때나</th>
                <td>—</td>
                <td>{result.baseRate.toFixed(1)}%</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>

          {liveFeatures && (
            <p className={`disc-now ${matchNow ? 'hit' : ''}`}>
              {matchNow ? '지금 이 조건에 맞습니다' : '지금은 조건에 맞지 않습니다'}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
