/**
 * 설정 동기화의 3-way 합치기. 브라우저 저장소·네트워크를 모르는 순수 함수만 둔다(따로 시험할 수 있게).
 *
 * 스냅샷 = localStorage 키 → 저장된 문자열(JSON). base = 마지막으로 서버와 맞춘(올리거나 받은) 스냅샷.
 * 두 기기가 같은 기준에서 따로 바꿨으면 한쪽을 버리지 않고 합친다 — 동기화가 충돌로 멈추는 일이 없게.
 */

export type Snapshot = Record<string, string>

/** 동기화 대상 — 기기마다 달라야 하는 것(패널 접힘 등)은 넣지 않는다. */
export const SYNCED_KEYS = [
  'trading.layout.v1',
  'trading.indicators.v3',
  'trading.indicatorTemplates.v1',
  'trading.drawings.v2',
  'trading.priceAlerts.v1',
  'trading.indicatorAlerts.v1',
  'trading.panes.v1',
  'trading.chartSettings.v1',
  'trading.watchlist.v1',
] as const

/**
 * 기준이 없을 때(이 기기가 처음 맞출 때) 합치는 방식. 여기 없는 키(레이아웃·지표·차트 설정 등)는 서버 것을 따른다 —
 * 새 기기의 기본값(기본 거래량 지표 등)이 쓰던 설정에 섞여 들어가지 않게.
 * byId = 사용자가 만든 것(그림·알림)은 id 로 모두 모은다 · list = 관심 목록은 서버 순서 뒤에 이 기기에만 있던 종목.
 */
const FIRST_SYNC: Partial<Record<string, 'byId' | 'list'>> = {
  'trading.drawings.v2': 'byId',
  'trading.priceAlerts.v1': 'byId',
  'trading.indicatorAlerts.v1': 'byId',
  'trading.watchlist.v1': 'list',
}

/* ── 정규형·지문 ───────────────────────────────────────────────────── */

/** 키를 정렬한 JSON — 속성 순서·공백이 달라도 같은 값이면 같은 문자열. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const parts: string[] = []
    for (const k of Object.keys(obj).sort()) {
      if (obj[k] !== undefined) parts.push(`${JSON.stringify(k)}:${stable(obj[k])}`)
    }
    return `{${parts.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function same(a: unknown, b: unknown): boolean {
  return a === b || stable(a) === stable(b)
}

const BAD = Symbol('unparsable')

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return BAD
  }
}

/** 저장된 문자열의 정규형. JSON 이 아니면 원문 그대로(앞에 JSON 에 나올 수 없는 글자를 붙여 구분한다). */
export function canonicalValue(raw: string): string {
  const v = parse(raw)
  return v === BAD ? `\u0000${raw}` : stable(v)
}

/**
 * 스냅샷 전체의 정규형. memo(키 → [원문, 정규형])를 주면 바뀌지 않은 값은 다시 파싱하지 않는다.
 * 없는 키는 빠진다 — 한쪽에만 있는 키도 차이로 잡힌다.
 */
export function canonicalSnapshot(snap: Snapshot, memo?: Map<string, [string, string]>): string {
  const parts: string[] = []
  for (const key of Object.keys(snap).sort()) {
    const raw = snap[key]
    const hit = memo?.get(key)
    let canon: string
    if (hit && hit[0] === raw) canon = hit[1]
    else {
      canon = canonicalValue(raw)
      memo?.set(key, [raw, canon])
    }
    parts.push(`${JSON.stringify(key)}:${canon}`)
  }
  return parts.join(',')
}

/** 문자열의 짧은 지문(FNV-1a 32비트 + 길이). 같은지 비교에만 쓴다. */
export function hashText(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${(h >>> 0).toString(36)}-${text.length}`
}

/* ── 값 합치기 ─────────────────────────────────────────────────────── */

type IdItem = { id: string } & Record<string, unknown>

/** 기준에 그 값이 없었다(둘 다 새로 넣음) — 어느 쪽이 바꿨는지 모르니 둘 다 바꾼 것으로 본다. */
const MISSING = Symbol('missing')

function isPlain(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function isIdList(list: unknown[]): list is IdItem[] {
  return list.every((v) => isPlain(v) && typeof v.id === 'string')
}

function isStringList(list: unknown[]): list is string[] {
  return list.every((v) => typeof v === 'string')
}

/**
 * 3-way 합치기. 한쪽만 바꿨으면 그쪽을, 둘 다 바꿨으면 모양에 따라 합친다:
 * id 가 있는 객체 목록은 id 별로 · 문자열 목록은 집합으로 · 객체는 속성별로 · 나머지(숫자·모양이 다름 등)는 이 기기 것.
 * 숫자 목록(패널 높이 비율 등)은 한 덩어리 값이라 집합으로 섞지 않는다.
 */
function merge3(base: unknown, local: unknown, server: unknown): unknown {
  if (same(local, server)) return local
  if (base !== MISSING) {
    if (same(local, base)) return server
    if (same(server, base)) return local
  }
  if (Array.isArray(local) && Array.isArray(server)) {
    const b: unknown[] = Array.isArray(base) ? base : []
    if (isIdList(local) && isIdList(server) && isIdList(b)) return mergeById(b, local, server)
    if (isStringList(local) && isStringList(server) && isStringList(b)) return mergeSet(b, local, server)
    return local
  }
  if (isPlain(local) && isPlain(server)) return mergeObject(isPlain(base) ? base : {}, local, server)
  return local
}

/**
 * id 별 합치기: 어느 쪽에서든 새로 생긴 것은 남기고, 어느 쪽에서든 지운 것은 뺀다. 같은 항목을 둘 다 고쳤으면 이 기기 것.
 * 순서는 이 기기 순서, 그 뒤에 서버에서만 새로 생긴 것(서버 순서).
 */
function mergeById(base: IdItem[], local: IdItem[], server: IdItem[]): IdItem[] {
  const b = new Map(base.map((it) => [it.id, it]))
  const s = new Map(server.map((it) => [it.id, it]))
  const out: IdItem[] = []
  const seen = new Set<string>()
  for (const item of local) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    const theirs = s.get(item.id)
    const before = b.get(item.id)
    if (theirs === undefined) {
      if (before === undefined) out.push(item) // 이 기기에서 새로 만들었다(기준에 있었으면 서버가 지운 것)
      continue
    }
    // 이 기기가 그대로 두었으면 서버의 고친 것, 아니면(둘 다 고쳤어도) 이 기기 것.
    out.push(before !== undefined && same(item, before) ? theirs : item)
  }
  for (const item of server) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    if (!b.has(item.id)) out.push(item) // 서버에서 새로 생겼다(기준에 있었으면 이 기기가 지운 것)
  }
  return out
}

/** 문자열 집합 합치기(관심 목록 등): 한쪽에서 넣은 것은 남기고 뺀 것은 뺀다. 이 기기 순서, 그 뒤에 서버에서 새로 넣은 것. */
function mergeSet(base: string[], local: string[], server: string[]): string[] {
  const b = new Set(base)
  const s = new Set(server)
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of local) {
    if (seen.has(v) || (b.has(v) && !s.has(v))) continue // 서버에서 뺐다
    seen.add(v)
    out.push(v)
  }
  for (const v of server) {
    if (seen.has(v) || b.has(v)) continue // 이 기기에 이미 있거나 이 기기에서 뺐다
    seen.add(v)
    out.push(v)
  }
  return out
}

/** 속성별 3-way. 한쪽에서 지운 속성은 다른 쪽이 그대로 두었을 때만 지운다(둘 다 손댔으면 이 기기 것). */
function mergeObject(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  server: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(local)) {
    const inBase = Object.hasOwn(base, k)
    if (Object.hasOwn(server, k)) out[k] = merge3(inBase ? base[k] : MISSING, local[k], server[k])
    else if (!inBase || !same(local[k], base[k])) out[k] = local[k] // 이 기기가 넣었거나 고쳤다
  }
  for (const k of Object.keys(server)) {
    if (!Object.hasOwn(local, k) && !Object.hasOwn(base, k)) out[k] = server[k] // 서버가 새로 넣었다
  }
  return out
}

/** 기준이 있는 키: 3-way. 한쪽이라도 JSON 이 아니면 이 기기 것. */
function mergeRaw(base: string, local: string, server: string): string {
  const cl = canonicalValue(local)
  const cs = canonicalValue(server)
  if (cl === cs) return local
  const cb = canonicalValue(base)
  if (cl === cb) return server
  if (cs === cb) return local
  const l = parse(local)
  const s = parse(server)
  if (l === BAD || s === BAD) return local
  const b = parse(base)
  return JSON.stringify(merge3(b === BAD ? MISSING : b, l, s))
}

/**
 * 기준이 없는 키: 설정은 서버 것, 사용자가 만든 것(그림·알림·관심 목록)은 합친다 — 서버 순서 뒤에 이 기기에만 있는 것.
 * id 가 같으면 서버 것(기준이 없어 누가 고쳤는지 모른다 — 쓰던 공간을 믿는다).
 */
function firstSyncRaw(key: string, local: string, server: string): string {
  if (canonicalValue(local) === canonicalValue(server)) return local
  const rule = FIRST_SYNC[key]
  if (!rule) return server
  const l = parse(local)
  const s = parse(server)
  if (s === BAD) return local
  if (!Array.isArray(l) || !Array.isArray(s)) return server
  if (rule === 'byId' && isIdList(l) && isIdList(s)) {
    const ids = new Set(s.map((it) => it.id))
    return JSON.stringify([...s, ...l.filter((it) => !ids.has(it.id))])
  }
  if (rule === 'list' && isStringList(l) && isStringList(s)) return JSON.stringify([...new Set([...s, ...l])])
  return server
}

/**
 * 이 기기(local)와 서버(server)의 스냅샷을 base 를 기준으로 합친다. base 가 null 이면 이 기기의 첫 동기화.
 * 한쪽에만 있는 키는 다른 쪽 것을 쓴다 — 없는 키는 '지웠다'가 아니라 '모른다'(예전 앱은 일부 키를 올리지 않았다).
 * 기준에 없던 키는 그 키만 첫 동기화 규칙으로 합친다.
 */
export function mergeSnapshots(base: Snapshot | null, local: Snapshot, server: Snapshot): Snapshot {
  const out: Snapshot = {}
  for (const key of new Set([...Object.keys(local), ...Object.keys(server)])) {
    const l = local[key]
    const s = server[key]
    if (l === undefined) out[key] = s
    else if (s === undefined) out[key] = l
    else {
      const b = base?.[key]
      out[key] = b === undefined ? firstSyncRaw(key, l, s) : mergeRaw(b, l, s)
    }
  }
  return out
}
