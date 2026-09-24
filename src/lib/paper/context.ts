import { createContext, useContext, useSyncExternalStore } from 'react'
import type { PaperApi, PaperLive } from './types'

/** App 이 `usePaperTrading` 결과를 넣어 두는 곳. 주문창·거래 패널·차트 선이 여기서 읽는다. */
export const PaperContext = createContext<PaperApi | null>(null)

export function usePaper(): PaperApi {
  const api = useContext(PaperContext)
  if (!api) throw new Error('PaperContext 밖에서 usePaper 를 불렀습니다')
  return api
}

/**
 * 시세로 바뀌는 값을 고른다. 선택 함수는 스냅샷 안의 값(같은 참조)이나 원시값을 돌려줘야 한다 —
 * 매번 새 객체를 만들면 렌더가 끝나지 않는다.
 */
export function usePaperLive<T>(select: (live: PaperLive) => T): T {
  const { live } = usePaper()
  return useSyncExternalStore(live.subscribe, () => select(live.get()))
}
