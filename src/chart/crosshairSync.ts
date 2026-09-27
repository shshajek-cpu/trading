/**
 * 분할 칸끼리 십자선 맞추기 — 모듈 단위 발행·구독.
 * 마우스가 움직일 때마다 오가므로 React 상태를 거치지 않고, 메시지도 객체로 만들지 않고 인자로 넘긴다.
 * time 은 unix 초, 커서가 차트를 떠나면 null.
 * price 는 커서가 가격 칸(0번 pane)에 있을 때 그 가격, 보조 지표 칸이면 null.
 * symbol 은 보낸 칸의 종목 — 같은 종목 칸만 가로선을 그 가격에 맞춘다.
 */
export type CrosshairListener = (sourceId: string, time: number | null, price: number | null, symbol: string) => void

const listeners = new Set<CrosshairListener>()

/** sourceId 칸의 십자선이 옮겨졌다고 알린다. 받는 쪽이 자기 메시지는 거른다. */
export function publishCrosshair(sourceId: string, time: number | null, price: number | null, symbol: string): void {
  for (const listener of listeners) listener(sourceId, time, price, symbol)
}

/** 구독. 돌려준 함수를 부르면 해지한다. */
export function subscribeCrosshair(listener: CrosshairListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
