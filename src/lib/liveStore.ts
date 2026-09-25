import { useSyncExternalStore } from 'react'

/**
 * 시세 틱마다 바뀌는 값을 React 상태 밖에 두는 작은 저장소.
 * App 상태로 두면 틱마다 화면 전체가 다시 그려진다 — 값을 쓰는 컴포넌트만 useLiveStore 로 구독해 그 자리만 다시 그린다.
 */
export interface LiveStore<T> {
  get: () => T
  /** 같은 값(Object.is)이면 아무도 깨우지 않는다. */
  set: (next: T) => void
  subscribe: (listener: () => void) => () => void
}

export function createLiveStore<T>(initial: T): LiveStore<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return
      value = next
      for (const l of listeners) l()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * 저장소 값을 구독한다. select 는 원시값이나 저장소 안의 값(같은 참조)을 돌려줘야 한다 —
 * 매번 새 객체를 만들면 렌더가 끝나지 않는다.
 */
export function useLiveStore<T>(store: LiveStore<T>): T
export function useLiveStore<T, S>(store: LiveStore<T>, select: (value: T) => S): S
export function useLiveStore<T, S>(store: LiveStore<T>, select?: (value: T) => S): T | S {
  return useSyncExternalStore(store.subscribe, () => (select ? select(store.get()) : store.get()))
}
