/**
 * 웹푸시 구독 등록/해제.
 *
 * 앱을 닫아도 알림이 오게 하려면 브라우저 푸시 서비스에 보낼 주소(subscription)를
 * 서버가 들고 있어야 한다. 동기화 코드를 그대로 열쇠로 쓴다.
 * 무엇을 감시할지는 여기서 받지 않는다 — 감시기(worker/index.ts)가 동기화 설정(s:<code>)에서 매분 뽑는다.
 *
 *   GET    /api/push?key=1                     → 구독을 만들 때 쓰는 VAPID 공개키
 *   GET    /api/push?code=xxx[&endpoint=…]     → 구독 여부, 이 기기 등록 여부, 서버가 울렸고 아직 아무 기기도 받지 않은 id
 *   PUT    /api/push?code=xxx  { subs?, ack? } → 구독 등록, 서버가 울린 알림을 받았다는 확인
 *   DELETE /api/push?code=xxx&endpoint=…       → 이 기기 구독 해제(endpoint 가 없으면 모든 기기)
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

/** 한 코드에 둘 수 있는 구독(기기) 수. */
const SUBS_MAX = 10

export interface PushSubscriptionRecord {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** 감시기가 적어 둔 기준 쪽과 그것을 확인한 시각(ms). 감시기(worker/index.ts)와 모양이 같아야 한다. */
export interface SideMark {
  side: 'above' | 'below'
  at: number
}

/**
 * 코드마다의 감시 기록(w:<code>). 구독은 여기서, 나머지는 감시기가 쓴다 — 감시기(worker/index.ts)와 모양이 같아야 한다.
 * 예전 기록의 기기별 감시 목록(alertsBy·linesBy·alerts 등)은 다음에 쓸 때 빠진다. 예전 앱이 PUT 에 함께 보내는
 * 감시 목록(alerts·lines)은 받기만 하고 버린다.
 */
export interface WatchRecord {
  subs: PushSubscriptionRecord[]
  /** 수평선마다 감시기가 처음 잡은 기준 쪽. */
  lineMarks?: Record<string, SideMark>
  /** 걸린 교차 알림이 기다리는 쪽. */
  armMarks?: Record<string, SideMark>
  /** 지표 알림(봉마다·봉 마감 시)마다 감시기가 마지막으로 푸시한 봉의 시작 시각(초). */
  barMarks?: Record<string, number>
  /** 감시기가 울렸고 아직 확인되지 않은 알림·수평선·지표 알림('한 번만') id. 감시기는 여기 있는 동안 다시 울리지 않는다. */
  firedIds: string[]
  /** 앱이 받았다고 알린 시각(ms, id 별). 감시기는 이 뒤에 설정이 저장되면 확인된 것으로 보고 firedIds 에서 뺀다. */
  acks?: Record<string, number>
}

/** 감시기(worker/index.ts)가 매분 읽는 감시 대상 코드 목록. 두 곳의 키 이름이 같아야 한다. */
const INDEX_KEY = 'w-index'

/**
 * 구독이 있는 코드만 색인에 둔다. 바뀔 때만 쓴다(무료 플랜 KV 쓰기 한도 아끼기).
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

/**
 * 지금 모양의 기록을 만든다. 예전 필드는 빠지고 기준 쪽·발동 흔적은 그대로 잇는다.
 * 키 순서는 감시기가 쓰는 것과 같다 — 내용이 같으면 문자열도 같아 다시 쓰지 않는다.
 */
function buildRecord(prev: WatchRecord | null, subs: PushSubscriptionRecord[], acks: Record<string, number>): WatchRecord {
  return {
    subs,
    ...(prev?.lineMarks ? { lineMarks: prev.lineMarks } : {}),
    ...(prev?.armMarks ? { armMarks: prev.armMarks } : {}),
    ...(prev?.barMarks ? { barMarks: prev.barMarks } : {}),
    firedIds: prev?.firedIds ?? [],
    ...(Object.keys(acks).length > 0 ? { acks } : {}),
  }
}

/** 서버가 울렸고 아직 아무 기기도 받았다고 알리지 않은 id. 앱이 로컬에서 끄는 데 쓴다 — 받은 것은 다시 주지 않는다(다시 켠 것을 또 끄지 않게). */
function unacked(record: WatchRecord | null): string[] {
  const acks = record?.acks ?? {}
  return (record?.firedIds ?? []).filter((id) => acks[id] === undefined)
}

/** 구독을 더하고, 앱이 받았다고 알린 발동에 그 시각을 적는다. */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const code = new URL(request.url).searchParams.get('code')
  if (!code || !CODE_RE.test(code)) return bad('동기화 코드가 올바르지 않습니다', 400)

  // 예전 앱은 감시 목록(alerts·lines)도 함께 보낸다 — 감시 목록은 동기화 설정에서 뽑으므로 읽지 않는다.
  let body: { subs?: PushSubscriptionRecord[]; ack?: unknown }
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
  const uniqueSubs = [...new Map(subs.map((s) => [s.endpoint, s])).values()].slice(0, SUBS_MAX)

  // 받았다는 확인은 처음 받은 시각만 둔다. 감시기는 이 뒤에 저장된 설정을 보고 firedIds 에서 뺀다.
  const acks: Record<string, number> = { ...(prev?.acks ?? {}) }
  if (Array.isArray(body.ack)) {
    const firedIds = prev?.firedIds ?? []
    const now = Date.now()
    for (const id of body.ack) {
      if (typeof id === 'string' && firedIds.includes(id) && acks[id] === undefined) acks[id] = now
    }
  }

  const record = buildRecord(prev, uniqueSubs, acks)
  const next = JSON.stringify(record)
  // 같은 내용을 다시 올리면 쓰지 않는다 — 무료 플랜 KV 쓰기 한도(하루 1,000회) 아끼기.
  if (next !== prevRaw) await env.SETTINGS.put(key, next)
  await syncIndex(env, code, record.subs.length > 0)
  return new Response(JSON.stringify({ ok: true, firedIds: unacked(record) }), { headers: JSON_HEADERS })
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
      // endpoint 를 주면 그 기기가 등록돼 있는지 알려 준다 — 앱이 구독을 다시 쓰지 않고 확인만 하는 데 쓴다.
      registered: endpoint ? (record?.subs ?? []).some((s) => s.endpoint === endpoint) : undefined,
      // 앱을 열거나 탭으로 돌아올 때 서버가 먼저 울린 알림을 로컬에서 끄는 데 쓴다.
      firedIds: unacked(record),
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

  // endpoint 를 주면 그 기기만, 없으면 모든 기기의 구독을 지운다.
  const endpoint = url.searchParams.get('endpoint')
  const subs = endpoint ? prev.subs.filter((s) => s.endpoint !== endpoint) : []
  const next = JSON.stringify(buildRecord(prev, subs, prev.acks ?? {}))
  if (next !== prevRaw) await env.SETTINGS.put(key, next)
  await syncIndex(env, code, subs.length > 0)
  return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS })
}
