import { useCallback, useState } from 'react'
import type { Interval } from '../lib/binance'
import { isInterval, DEFAULT_FAVORITE_INTERVALS } from '../lib/intervals'
import type { MagnetMode } from '../lib/drawings'

/**
 * Device-local UI preferences: drawing toggles and favorite intervals.
 * Deliberately NOT in the sync set — these are per-device ergonomics, not shared config.
 */
export interface UiPrefs {
  magnet: MagnetMode
  stayInDrawingMode: boolean
  drawingsLocked: boolean
  drawingsHidden: boolean
  favoriteIntervals: Interval[]
}

const STORAGE_KEY = 'trading.uiPrefs.v1'

const DEFAULTS: UiPrefs = {
  magnet: 'off',
  stayInDrawingMode: false,
  drawingsLocked: false,
  drawingsHidden: false,
  favoriteIntervals: DEFAULT_FAVORITE_INTERVALS,
}

function load(): UiPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<UiPrefs>
    const favs = Array.isArray(parsed.favoriteIntervals)
      ? parsed.favoriteIntervals.filter(isInterval)
      : DEFAULTS.favoriteIntervals
    return {
      magnet: parsed.magnet === 'weak' || parsed.magnet === 'strong' ? parsed.magnet : 'off',
      stayInDrawingMode: typeof parsed.stayInDrawingMode === 'boolean' ? parsed.stayInDrawingMode : false,
      drawingsLocked: typeof parsed.drawingsLocked === 'boolean' ? parsed.drawingsLocked : false,
      drawingsHidden: typeof parsed.drawingsHidden === 'boolean' ? parsed.drawingsHidden : false,
      favoriteIntervals: favs.length > 0 ? favs : DEFAULTS.favoriteIntervals,
    }
  } catch {
    return DEFAULTS
  }
}

export function useUiPrefs() {
  const [prefs, setPrefs] = useState<UiPrefs>(load)

  const patch = useCallback((next: Partial<UiPrefs>) => {
    setPrefs((prev) => {
      const merged = { ...prev, ...next }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      } catch {
        /* quota errors keep the in-memory value */
      }
      return merged
    })
  }, [])

  const toggleFavorite = useCallback(
    (interval: Interval) => {
      setPrefs((prev) => {
        const has = prev.favoriteIntervals.includes(interval)
        const favoriteIntervals = has
          ? prev.favoriteIntervals.filter((i) => i !== interval)
          : [...prev.favoriteIntervals, interval]
        const merged = { ...prev, favoriteIntervals }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
        } catch {
          /* ignore */
        }
        return merged
      })
    },
    [],
  )

  return { prefs, patch, toggleFavorite }
}
