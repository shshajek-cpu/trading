/**
 * 웹푸시 구독 등록/해제.
 *
 * 앱을 닫아도 알림이 오게 하려면 브라우저 푸시 서비스에 보낼 주소(subscription)를
 * 서버가 들고 있어야 한다. 동기화 코드를 그대로 열쇠로 쓴다.
 */

interface Env {
  SETTINGS: KVNamespace
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
}

const CODE_RE = /^[a-zA-Z0-9-]{6,64}$/

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

/** 기기 하나가 올릴 수 있는 알림·수평선 수, 메모 길이. 앱(usePushAlerts)도 메모를 같은 길이로 자른다. */
const LIST_MAX = 100
const MESSAGE_MAX = 200

export interface PushSubscriptionRecord {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface WatchAlert {
  id: string
  symbol: string
  condition: 'above' | 'below'
  price: number
  /** 사용자 메모. 푸시 본문에 붙는다. */
  message?: string
}

/** 수평선 알림. 감시기가 처음 본 현재가 쪽을 기준으로, 가격이 선을 지나 반대쪽으로 가면 울린다. */
export interface WatchLine {
  id: string
  symbol: string
  price: number
}

/**
 * 기기별 알림을 각 기기 구독 endpoint 로 나눠 담는다(alertsBy). 한 동기화 코드를
 * 여러 기기가 공유해도 서로의 알림을 덮어쓰지 않는다.
 * `alerts` 는 버킷 구조 도입 전의 레거시 평면 목록으로, 아무 기기의 첫 PUT 까지만 남는다.
 * 수평선은 `linesBy` 에 따로 둔다 — 이 필드를 모르는 예전 감시기가 수평선을 가격 알림으로 잘못 울리지 않게.
 */
export interface WatchRecord {
  subs: PushSubscriptionRecord[]
  alertsBy: Record<string, WatchAlert[]>
  alerts?: WatchAlert[]
  linesBy?: Record<string, WatchLine[]>
  /** 수평선마다 감시기가 처음 본 현재가 쪽. 키는 lineKey — 선을 옮기면 기준을 새로 잡는다. */
  lineSides?: Record<string, 'above' | 'below'>
  firedIds: string[]
}

/** alertsBy 버킷과 레거시 목록을 합쳐 알림 id 로 중복을 제거한다. 감시기가 보는 감시 목록. */
export function unionAlerts(record: Pick<WatchRecord, 'alertsBy' | 'alerts'>): WatchAlert[] {
  const byId = new Map<string, WatchAlert>()
  for (const list of Object.values(record.alertsBy ?? {})) {
    for (const a of list) byId.set(a.id, a)
  }
  for (const a of record.alerts ?? []) if (!byId.has(a.id)) byId.set(a.id, a)
  return [...byId.values()]
}

/** 기기별 수평선 버킷을 합쳐 id 로 중복을 제거한다. */
export function unionLines(record: Pick<WatchRecord, 'linesBy'>): WatchLine[] {
  const byId = new Map<string, WatchLine>()
  for (const list of Object.values(record.linesBy ?? {})) {
    for (const l of list) byId.set(l.id, l)
  }
  return [...byId.values()]
}

/** lineSides 키. 감시기(worker/index.ts)와 형식이 같아야 한다. */
export function lineKey(line: WatchLine): string {
  return `${line.id}@${line.price}`
}

/** 감시기(worker/index.ts)가 매분 읽는 감시 대상 코드 목록. 두 곳의 키 이름이 같아야 한다. */
const INDEX_KEY = 'w-index'

/**
 * 구독과 알림이 모두 있는 코드만 색인에 둔다. 바뀔 때만 쓴다(무료 플랜 KV 쓰기 한도 아끼기).
 * 동시에 두 코드가 바뀌어 한쪽이 빠져도 감시기가 정각마다 목록 조회로 색인을 바로잡는다.
 */
async function syncIndex(env: Env, code: string, watching: boolean): Promise<void> {
  const index = (await env.SETTINGS.get<string[]>(INDEX_KEY, 'json')) ?? []
  const has = index.includes(code)
  if (watching === has) return
  const next = watching ? [...index, code].sort() : index.filter((c) => c !== code)
  await env.SETTINGS.put(INDEX_KEY, JSON.stringify(next))
}

function bad(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS })
}

function readRecord(raw: string | null): WatchRecord | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as WatchRecord
  } catch {
    // 깨진 기록은 없는 것과 같게 본다
    return null
  }
}

/** 들어온 알림 목록을 검사해 모양이 맞는 것만 남긴다. 메모는 잘라 둔다. */
function readAlerts(input: unknown): WatchAlert[] {
  if (!Array.isArray(input)) return []
  const out: WatchAlert[] = []
  for (const value of input) {
    if (out.length >= LIST_MAX) break
    if (typeof value !== 'object' || value === null) continue
    const { id, symbol, condition, price, message } = value as Record<string, unknown>
    if (typeof id !== 'string' || typeof symbol !== 'string') continue
    if (condition !== 'above' && condition !== 'below') continue
    if (typeof price !== 'number' || !Number.isFinite(price)) continue
    const note = typeof message === 'string' ? message.trim().slice(0, MESSAGE_MAX) : ''
    out.push(note ? { id, symbol, condition, price, message: note } : { id, symbol, condition, price })
  }
  return out
}

function readLines(input: unknown): WatchLine[] {
  if (!Array.isArray(input)) return []
  const out: WatchLine[] = []
  for (const value of input) {
    if (out.length >= LIST_MAX) break
    if (typeof value !== 'object' || value === null) continue
    const { id, symbol, price } = value as Record<string, unknown>
    if (typeof id !== 'string' || typeof symbol !== 'string') continue
    if (typeof price !== 'number' || !Number.isFinite(price)) continue
    out.push({ id, symbol, price })
  }
  return out
}

/**
 * 살아 있는 구독의 버킷만 남기고, 사라진 알림·수평선의 발동 흔적과 기준 쪽을 정리해 기록을 만든다.
 * 감시할 것이 있는지(watching)도 함께 돌려준다.
 */
function buildRecord(
  prev: WatchRecord | null,
  subs: PushSubscriptionRecord[],
  alertsBy: Record<string, WatchAlert[]>,
  linesBy: Record<string, WatchLine[]>,
): { record: WatchRecord; watching: boolean } {
  const live = new Set(subs.map((s) => s.endpoint))
  for (const ep of Object.keys(alertsBy)) if (!live.has(ep)) delete alertsBy[ep]
  for (const ep of Object.keys(linesBy)) if (!live.has(ep)) delete linesBy[ep]

  const alerts = unionAlerts({ alertsBy })
  const lines = unionLines({ linesBy })
  const alive = new Set([...alerts.map((a) => a.id), ...lines.map((l) => l.id)])
  const liveKeys = new Set(lines.map(lineKey))
  const lineSides: Record<string, 'above' | 'below'> = {}
  for (const [key, side] of Object.entries(prev?.lineSides ?? {})) if (liveKeys.has(key)) lineSides[key] = side

  return {
    record: {
      subs,
      alertsBy,
      linesBy,
      lineSides,
      // 사라진 알림의 발동 흔적은 같이 지운다.
      firedIds: (prev?.firedIds ?? []).filter((id) => alive.has(id)),
    },
    watching: subs.length > 0 && alive.size > 0,
  }
}

/** 부르는 기기의 버킷만 갈아끼운다. 다른 기기의 알림은 그대로 둔다. */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const code = new URL(request.url).searchParams.get('code')
  if (!code || !CODE_RE.test(code)) return bad('동기화 코드가 올바르지 않습니다', 400)

  let body: { subs?: PushSubscriptionRecord[]; alerts?: unknown; lines?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return bad('JSON 이 아닙니다', 400)
  }

  const key = `w:${code}`
  const prevRaw = await env.SETTINGS.get(key)
  const prev = readRecord(prevRaw)

  // 구독은 누적하되 같은 endpoint 는 하나만 남긴다(기기 여러 대 지원).
  const subs = [...(prev?.subs ?? []), ...(body.subs ?? [])]
  const uniqueSubs = [...new Map(subs.map((s) => [s.endpoint, s])).values()].slice(0, 10)

  // 레거시 평면 목록은 첫 PUT 에서 버킷 구조로 넘어가며 버려진다(alertsBy 만 넘긴다).
  const alertsBy: Record<string, WatchAlert[]> = { ...(prev?.alertsBy ?? {}) }
  const linesBy: Record<string, WatchLine[]> = { ...(prev?.linesBy ?? {}) }
  const endpoint = body.subs?.[0]?.endpoint
  if (endpoint) {
    alertsBy[endpoint] = readAlerts(body.alerts)
    // 수평선을 모르는 예전 앱은 lines 를 보내지 않는다 — 그때는 이 기기의 수평선 버킷을 그대로 둔다.
    if (Array.isArray(body.lines)) linesBy[endpoint] = readLines(body.lines)
  }

  const { record, watching } = buildRecord(prev, uniqueSubs, alertsBy, linesBy)
  const next = JSON.stringify(record)
  // 같은 내용을 다시 올리면 쓰지 않는다 — 무료 플랜 KV 쓰기 한도(하루 1,000회) 아끼기.
  if (next !== prevRaw) await env.SETTINGS.put(key, next)
  await syncIndex(env, code, watching)
  return new Response(
    JSON.stringify({
      ok: true,
      watching: unionAlerts(record).length + unionLines(record).length,
      firedIds: record.firedIds,
    }),
    { headers: JSON_HEADERS },
  )
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)

  // 클라이언트가 구독을 만들 때 필요한 공개키.
  if (url.searchParams.get('key') === '1') {
    return new Response(JSON.stringify({ publicKey: env.VAPID_PUBLIC_KEY ?? '' }), {
      headers: JSON_HEADERS,
    })
  }

  const code = url.searchParams.get('code')
  if (!code || !CODE_RE.test(code)) return bad('동기화 코드가 올바르지 않습니다', 400)

  const record = readRecord(await env.SETTINGS.get(`w:${code}`))
  const endpoint = url.searchParams.get('endpoint')
  return new Response(
    JSON.stringify({
      subscribed: (record?.subs.length ?? 0) > 0,
      // endpoint 를 주면 그 기기가 등록돼 있는지 알려 준다 — 앱이 같은 목록을 다시 쓰지 않고 확인만 하는 데 쓴다.
      registered: endpoint ? (record?.subs ?? []).some((s) => s.endpoint === endpoint) : undefined,
      watching: record ? unionAlerts(record).length + unionLines(record).length : 0,
      // 클라이언트가 앱을 열 때 서버가 먼저 울린 알림을 로컬에서 끄는 데 쓴다.
      firedIds: record?.firedIds ?? [],
    }),
    { headers: JSON_HEADERS },
  )
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (!code || !CODE_RE.test(code)) return bad('동기화 코드가 올바르지 않습니다', 400)

  const key = `w:${code}`
  const prevRaw = await env.SETTINGS.get(key)
  const prev = readRecord(prevRaw)
  if (!prev) return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS })

  // endpoint 를 주면 그 기기만, 없으면 모든 기기의 구독과 알림을 지운다.
  const endpoint = url.searchParams.get('endpoint')
  const subs = endpoint ? prev.subs.filter((s) => s.endpoint !== endpoint) : []
  const { record, watching } = buildRecord(prev, subs, { ...(prev.alertsBy ?? {}) }, { ...(prev.linesBy ?? {}) })
  const next = JSON.stringify(record)
  if (next !== prevRaw) await env.SETTINGS.put(key, next)
  await syncIndex(env, code, watching)
  return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS })
}
