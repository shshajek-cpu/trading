/**
 * 버튼 툴팁. 요소에 data 속성으로 이름·설명·단축키를 달면 `TooltipLayer` 가 마우스를 올렸을 때 띄운다.
 * (브라우저 기본 title 툴팁은 늦게 뜨고 설명을 담기 어렵다.)
 *
 *   <button {...tip('리플레이', '과거 시점부터 봉을 하나씩 다시 재생', 'Alt+R')}>
 */
export type TipSide = 'bottom' | 'right' | 'left'

export interface TipAttrs {
  'data-tip': string
  'data-tip-desc'?: string
  'data-tip-key'?: string
  'data-tip-side'?: TipSide
}

export function tip(name: string, desc?: string, key?: string, side?: TipSide): TipAttrs {
  const attrs: TipAttrs = { 'data-tip': name }
  if (desc) attrs['data-tip-desc'] = desc
  if (key) attrs['data-tip-key'] = key
  if (side) attrs['data-tip-side'] = side
  return attrs
}
