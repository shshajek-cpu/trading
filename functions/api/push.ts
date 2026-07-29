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

export interface WatchRecord {
  subs: PushSubscriptionRecord[]
  alerts: {
    id: string
    symbol: string
    condition: 'above' | 'below'
    price: number
  }[]
  /** 마지막으로 관측한 가격 — 교차 판정 기준점. */
  seen: Record<string, number>
  firedIds: string[]
}

function bad(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS })
}

/** 감시 대상 목록을 통째로 갈아끼운다. 클라이언트가 진실의 원본이다. */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const code = new URL(request.url).searchParams.get('code')
  if (!code || !CODE_RE.test(code)) return bad('동기화 코드가 올바르지 않습니다', 400)

  let body: Partial<WatchRecord>
  try {
    body = (await request.json()) as Partial<WatchRecord>
  } catch {
    return bad('JSON 이 아닙니다', 400)
  }

  const prev = await env.SETTINGS.get<WatchRecord>(`w:${code}`, 'json')

  // 구독은 누적하되 같은 endpoint 는 하나만 남긴다(기기 여러 대 지원).
  const subs = [...(prev?.subs ?? []), ...(body.subs ?? [])]
  const uniqueSubs = [...new Map(subs.map((s) => [s.endpoint, s])).values()]

  const alerts = body.alerts ?? []
  const alive = new Set(alerts.map((a) => a.id))

  const record: WatchRecord = {
    subs: uniqueSubs.slice(0, 10),
    alerts: alerts.slice(0, 100),
    // 사라진 알림의 흔적은 같이 지운다.
    seen: prev?.seen ?? {},
    firedIds: (prev?.firedIds ?? []).filter((id) => alive.has(id)),
  }

  await env.SETTINGS.put(`w:${code}`, JSON.stringify(record))
  return new Response(JSON.stringify({ ok: true, watching: alerts.length }), {
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
  return new Response(
    JSON.stringify({
      subscribed: (record?.subs.length ?? 0) > 0,
      watching: record?.alerts.length ?? 0,
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

  record.subs = endpoint ? record.subs.filter((s) => s.endpoint !== endpoint) : []
  await env.SETTINGS.put(`w:${code}`, JSON.stringify(record))
  return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS })
}
