/** 사람이 옮겨 적기 쉬운 코드를 만든다 — 헷갈리는 0/O/1/l 은 뺐다. */
export function randomCode(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  const pick = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((n) => chars[n % chars.length])
    .join('')
  return `${pick.slice(0, 4)}-${pick.slice(4, 8)}-${pick.slice(8, 12)}`
}
