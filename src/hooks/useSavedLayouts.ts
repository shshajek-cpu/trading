import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSavedLayouts, SAVED_LAYOUTS_KEY, saveSavedLayouts, type SavedLayout } from '../lib/layoutConfig'

/** 「내 레이아웃」 목록(동기화 키). 다른 탭·동기화가 바꾸면 storage 이벤트로 다시 읽는다. */
export function useSavedLayouts() {
  const [list, setList] = useState<SavedLayout[]>(loadSavedLayouts)
  const listRef = useRef(list)
  listRef.current = list

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SAVED_LAYOUTS_KEY) setList(loadSavedLayouts())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const commit = useCallback((next: SavedLayout[]) => {
    listRef.current = next
    setList(next)
    saveSavedLayouts(next)
  }, [])

  const add = useCallback((layout: SavedLayout) => commit([...listRef.current, layout]), [commit])
  const rename = useCallback(
    (id: string, name: string) => commit(listRef.current.map((l) => (l.id === id ? { ...l, name } : l))),
    [commit],
  )
  const remove = useCallback((id: string) => commit(listRef.current.filter((l) => l.id !== id)), [commit])

  return { list, add, rename, remove }
}
