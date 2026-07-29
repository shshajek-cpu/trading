import { useCallback, useEffect, useState } from 'react'
import type { FeatureSet } from '../lib/features'
import { loadPins, savePins, type Pin, type PinSide } from '../lib/pins'
import { onSettingsChanged } from '../lib/syncBus'

export function usePins() {
  const [pins, setPins] = useState<Pin[]>(loadPins)

  // 다른 기기에서 내려받으면 저장소가 바뀐다. 다시 읽어 화면을 맞춘다.
  useEffect(() => onSettingsChanged(() => setPins(loadPins())), [])

  const add = useCallback(
    (input: {
      symbol: string
      interval: string
      time: number
      price: number
      side: PinSide
      features: FeatureSet
      note?: string
    }) => {
      setPins((prev) => {
        // 같은 캔들에 두 번 찍으면 덮어쓴다 — 방향만 바꾸는 경우가 잦다.
        const dup = prev.findIndex(
          (p) => p.symbol === input.symbol && p.interval === input.interval && p.time === input.time,
        )
        const pin: Pin = {
          ...input,
          id: dup >= 0 ? prev[dup].id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          created: Date.now(),
        }
        const next = dup >= 0 ? prev.map((p, i) => (i === dup ? pin : p)) : [...prev, pin]
        savePins(next)
        return next
      })
    },
    [],
  )

  const remove = useCallback((id: string) => {
    setPins((prev) => {
      const next = prev.filter((p) => p.id !== id)
      savePins(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setPins(() => {
      savePins([])
      return []
    })
  }, [])

  return { pins, add, remove, clear }
}
