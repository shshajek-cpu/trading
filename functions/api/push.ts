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

export interface PushSubscriptionRecord {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface WatchAlert {
  id: string
  symbol: string
  condition: 'above' | 'below'
  price: number
}

/**
 * 기기별 알림을 각 기기 구독 endpoint 로 나눠 담는다(alertsBy). 한 동기화 코드를
 * 여러 기기가 공유해도 서로의 알림을 덮어쓰지 않는다.
 * `alerts` 는 버킷 구조 도입 전의 레거시 평면 목록으로, 아무 기기의 첫 PUT 까지만 남는다.
 */
export interface WatchRecord {
  subs: PushSubscriptionRecord[]
  alertsBy: Record<string, WatchAlert[]>
  alerts?: WatchAlert[]
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

/** 부르는 기기의 버킷만 갈아끼운다. 다른 기기의 알림은 그대로 둔다. */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const code = new URL(request.url).searchParams.get('code')
  if (!code || !CODE_RE.test(code)) return bad('동기화 코드가 올바르지 않습니다', 400)

  let body: { subs?: PushSubscriptionRecord[]; alerts?: WatchAlert[] }
  try {
    body = (await request.json()) as { subs?: PushSubscriptionRecord[]; alerts?: WatchAlert[] }
  } catch {
    return bad('JSON 이 아닙니다', 400)
  }

  const prev = await env.SETTINGS.get<WatchRecord>(`w:${code}`, 'json')

  // 구독은 누적하되 같은 endpoint 는 하나만 남긴다(기기 여러 대 지원).
  const subs = [...(prev?.subs ?? []), ...(body.subs ?? [])]
  const uniqueSubs = [...new Map(subs.map((s) => [s.endpoint, s])).values()].slice(0, 10)
  const liveEndpoints = new Set(uniqueSubs.map((s) => s.endpoint))

  // 레거시 평면 목록은 첫 PUT 에서 버킷 구조로 넘어가며 버려진다(alertsBy 만 넘긴다).
  const alertsBy: Record<string, WatchAlert[]> = { ...(prev?.alertsBy ?? {}) }
  const endpoint = body.subs?.[0]?.endpoint
  if (endpoint) alertsBy[endpoint] = (body.alerts ?? []).slice(0, 100)
  // 살아있는 구독의 버킷만 남긴다(사라진 기기 정리).
  for (const ep of Object.keys(alertsBy)) {
    if (!liveEndpoints.has(ep)) delete alertsBy[ep]
  }

  const union = unionAlerts({ alertsBy })
  const alive = new Set(union.map((a) => a.id))

  const record: WatchRecord = {
    subs: uniqueSubs,
    alertsBy,
    // 사라진 알림의 발동 흔적은 같이 지운다.
    firedIds: (prev?.firedIds ?? []).filter((id) => alive.has(id)),
  }

  await env.SETTINGS.put(`w:${code}`, JSON.stringify(record))
  await syncIndex(env, code, record.subs.length > 0 && union.length > 0)
  return new Response(JSON.stringify({ ok: true, watching: union.length, firedIds: record.firedIds }), {
    headers: JSON_HEADERS,
  })
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

  const record = await env.SETTINGS.get<WatchRecord>(`w:${code}`, 'json')
  const union = record ? unionAlerts(record) : []
  return new Response(
    JSON.stringify({
      subscribed: (record?.subs.length ?? 0) > 0,
      watching: union.length,
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

  const endpoint = url.searchParams.get('endpoint')
  const record = await env.SETTINGS.get<WatchRecord>(`w:${code}`, 'json')
  if (!record) return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS })

  if (endpoint) {
    record.subs = record.subs.filter((s) => s.endpoint !== endpoint)
    if (record.alertsBy) delete record.alertsBy[endpoint]
  } else {
    record.subs = []
    record.alertsBy = {}
  }
  await env.SETTINGS.put(`w:${code}`, JSON.stringify(record))
  await syncIndex(env, code, record.subs.length > 0 && unionAlerts(record).length > 0)
  return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS })
}
