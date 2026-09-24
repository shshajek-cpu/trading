/**
 * 여러 칸의 크로스헤어 시각 맞추기 — 모듈 단위 발행·구독.
 * 마우스가 움직일 때마다 오가므로 React 상태를 거치지 않고, 메시지도 객체로 만들지 않고 인자로 넘긴다.
 * time 은 unix 초, 커서가 차트를 떠나면 null.
 */
export type CrosshairListener = (sourceId: string, time: number | null) => void

const listeners = new Set<CrosshairListener>()

/** sourceId 칸의 크로스헤어가 time 으로 옮겨졌다고 알린다. 받는 쪽이 자기 메시지는 거른다. */
export function publishCrosshair(sourceId: string, time: number | null): void {
  for (const listener of listeners) listener(sourceId, time)
}

/** 구독. 돌려준 함수를 부르면 해지한다. */
export function subscribeCrosshair(listener: CrosshairListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
