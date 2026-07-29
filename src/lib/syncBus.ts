const EVENT = 'trading:settings-changed'

/** 설정을 바꾼 쪽에서 부르면 동기화가 예약된다. */
export function notifySettingsChanged(): void {
  window.dispatchEvent(new Event(EVENT))
}

export function onSettingsChanged(handler: () => void): () => void {
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
