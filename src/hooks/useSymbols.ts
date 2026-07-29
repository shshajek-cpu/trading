import { useEffect, useState } from 'react'
import { fetchExchangeInfo } from '../lib/binance'

/** 거래중인 USDT 선물 심볼 이름 목록. 실패 시 기본 심볼만 돌려준다. */
export function useSymbols(fallback: string): string[] {
  const [symbols, setSymbols] = useState<string[]>([fallback])

  useEffect(() => {
    const controller = new AbortController()
    fetchExchangeInfo(controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return
        const names = list.map((s) => s.symbol).sort((a, b) => a.localeCompare(b))
        if (names.length > 0) setSymbols(names)
      })
      .catch(() => {
        /* 목록을 못 받아도 fallback 심볼로 차트는 동작한다. */
      })
    return () => controller.abort()
  }, [])

  return symbols
}
