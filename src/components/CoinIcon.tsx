import { useEffect, useState } from 'react'
import { coinCode, shortSymbol } from '../lib/symbols'
import './widgets/widgets.css'

interface CoinIconProps {
  /** 앱 심볼 id(BTCUSDT, UPBIT:KRW-BTC, YF:AAPL …). */
  symbol: string
  size?: number
}

const CDN = 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color'

/** 코드에서 안정적인 색상(hue)을 뽑는다. 폴백 원의 배경색으로 쓴다. */
function hueOf(code: string): number {
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 360
  return h
}

/**
 * 심볼 아이콘. 코인은 CC0 cryptocurrency-icons(CDN)를 <img> 로 부르고, 없거나 못 받으면(또는 주식·지수·환율이면)
 * 첫 글자를 담은 색 원으로 대체한다.
 */
export function CoinIcon({ symbol, size = 18 }: CoinIconProps) {
  const code = coinCode(symbol)
  const [failed, setFailed] = useState(false)

  // 심볼이 바뀌면 다시 시도한다.
  useEffect(() => setFailed(false), [code])

  if (failed || !code) {
    const label = (code ?? shortSymbol(symbol)).replace(/^\^/, '')
    return (
      <span
        className="coin-icon coin-icon-fallback"
        style={{
          width: size,
          height: size,
          background: `hsl(${hueOf(label)} 55% 42%)`,
          fontSize: Math.round(size * 0.5),
        }}
        aria-hidden="true"
      >
        {label.charAt(0)}
      </span>
    )
  }

  return (
    <img
      className="coin-icon"
      src={`${CDN}/${code.toLowerCase()}.svg`}
      width={size}
      height={size}
      loading="lazy"
      alt=""
      aria-hidden="true"
      onError={() => setFailed(true)}
    />
  )
}
