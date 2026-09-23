/**
 * 가격 알림 감시기 (Cron, 1분마다).
 *
 * 앱이 꺼져 있어도 알림이 가야 하므로 서버가 대신 시세를 본다.
 * 바이낸스·Bybit 는 데이터센터 IP 를 막아서(403) 같은 USDT 무기한 선물 시세를 gate.io 에서 읽는다.
 * 가격차는 0.01% 미만이라 알림 용도에 충분하다.
 *
 * Workers 무료 플랜 KV 한도(하루 목록 조회 1,000회·쓰기 1,000회) 안에서 돈다:
 * - 매분 목록을 조회하지 않고 감시 대상 코드 목록 키(`w-index`) 하나만 읽는다.
 *   목록 조회는 정각마다 한 번(하루 24회) 색인을 다시 맞출 때만 쓴다.
 * - 기록은 알림이 실제로 울렸을 때만 한다(예전에는 매분 모든 코드를 다시 썼다).
 */
import { sendPush, type PushSubscription } from './webpush'

interface Env {
  SETTINGS: KVNamespace
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
}

interface WatchAlert {
  id: string
  symbol: string
  condition: 'above' | 'below'
  price: number
}

interface WatchRecord {
  subs: PushSubscription[]
  alerts: WatchAlert[]
  firedIds: string[]
}

/** 감시할 동기화 코드 목록. /api/push 가 구독·알림이 바뀔 때 맞춘다. */
const INDEX_KEY = 'w-index'

const TICKERS_URL = 'https://api.gateio.ws/api/v4/futures/usdt/tickers'

/** gate.io 는 BTC_USDT 형식이다. 밑줄을 빼 바이낸스 표기로 맞춘다. */
async function fetchPrices(): Promise<Map<string, number>> {
  const res = await fetch(TICKERS_URL, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`시세 조회 실패 ${res.status}`)
  const list = (await res.json()) as { contract: string; last: string }[]
  const map = new Map<string, number>()
  for (const t of list) {
    const p = Number(t.last)
    if (Number.isFinite(p)) map.set(t.contract.replace('_', ''), p)
  }
  return map
}

/** 조건을 만족하면 울린다. 한 번 울린 알림은 firedIds 에 남아 다시 울리지 않는다. */
function meets(alert: WatchAlert, now: number): boolean {
  return alert.condition === 'above' ? now >= alert.price : now <= alert.price
}

/**
 * 목록 조회로 감시 대상 색인을 다시 만든다(색인이 없을 때, 그리고 정각마다 — 동시 수정으로 어긋난 색인을 바로잡는다).
 * 구독과 알림이 모두 있는 코드만 넣어 매분 읽을 기록 수를 줄인다.
 */
async function rebuildIndex(env: Env, current: string[] | null): Promise<string[]> {
  const codes: string[] = []
  let cursor: string | undefined
  do {
    const page = await env.SETTINGS.list({ prefix: 'w:', cursor })
    for (const key of page.keys) {
      const record = await env.SETTINGS.get<WatchRecord>(key.name, 'json')
      if (record && record.subs.length > 0 && record.alerts.length > 0) codes.push(key.name.slice(2))
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  codes.sort()
  if (!current || current.join(',') !== codes.join(',')) {
    await env.SETTINGS.put(INDEX_KEY, JSON.stringify(codes))
  }
  return codes
}

async function checkAll(env: Env, rebuild: boolean): Promise<void> {
  const stored = await env.SETTINGS.get<string[]>(INDEX_KEY, 'json')
  const codes = rebuild || !stored ? await rebuildIndex(env, stored) : stored
  if (codes.length === 0) return
  const prices = await fetchPrices()

  for (const code of codes) {
    const key = `w:${code}`
    const record = await env.SETTINGS.get<WatchRecord>(key, 'json')
    if (!record || record.subs.length === 0 || record.alerts.length === 0) continue

    const fired = new Set(record.firedIds)
    const hits = record.alerts.filter((alert) => {
      const now = prices.get(alert.symbol)
      return now !== undefined && !fired.has(alert.id) && meets(alert, now)
    })
    // 울릴 것이 없으면 아무것도 쓰지 않는다 — 무료 한도의 대부분이 여기서 아껴진다.
    if (hits.length === 0) continue

    const dead: string[] = []
    for (const alert of hits) {
      fired.add(alert.id)
      const price = prices.get(alert.symbol) ?? alert.price
      const payload = JSON.stringify({
        title: `${alert.symbol} ${alert.condition === 'above' ? '▲' : '▼'} ${alert.price}`,
        body: `현재가 ${price}`,
        tag: alert.id,
      })
      for (const sub of record.subs) {
        // 한 기기의 발송 실패(네트워크 등)가 나머지 기기와 발동 기록을 막지 않게 한다.
        // 기록이 안 남으면 매분 같은 알림이 다시 울린다.
        try {
          const r = await sendPush(sub, payload, {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT || 'mailto:noreply@example.com',
          })
          // 404/410 은 구독이 죽은 것 — 다음부터 빼둔다.
          if (!r.ok && (r.status === 404 || r.status === 410)) dead.push(sub.endpoint)
        } catch (e) {
          console.error('push failed', sub.endpoint, e)
        }
      }
    }

    await env.SETTINGS.put(
      key,
      JSON.stringify({
        subs: record.subs.filter((s) => !dead.includes(s.endpoint)),
        alerts: record.alerts,
        firedIds: [...fired],
      } satisfies WatchRecord),
    )
  }
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // 정각에만 목록 조회로 색인을 다시 맞춘다(하루 24회 — 무료 한도 1,000회의 2.4%).
    const rebuild = new Date(event.scheduledTime).getUTCMinutes() === 0
    ctx.waitUntil(checkAll(env, rebuild))
  },

  /** 수동 점검용 — 크론을 기다리지 않고 바로 돌려본다. */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/run') {
      try {
        await checkAll(env, url.searchParams.get('rebuild') === '1')
        return new Response('ok')
      } catch (e) {
        return new Response(e instanceof Error ? e.message : String(e), { status: 500 })
      }
    }

    // 상태 들여다보기 — 알림이 안 오는 이유를 찾을 때 쓴다.
    if (url.pathname === '/debug') {
      const code = url.searchParams.get('code')
      if (!code) return new Response('code 가 필요합니다', { status: 400 })
      const rec = await env.SETTINGS.get<WatchRecord>(`w:${code}`, 'json')
      const prices = await fetchPrices()
      return Response.json({
        subs: rec?.subs.length ?? 0,
        alerts: rec?.alerts ?? [],
        watched: ((await env.SETTINGS.get<string[]>(INDEX_KEY, 'json')) ?? []).includes(code),
        firedIds: rec?.firedIds ?? [],
        livePrices: Object.fromEntries(
          (rec?.alerts ?? []).map((a) => [a.symbol, prices.get(a.symbol) ?? null]),
        ),
      })
    }

    // 실제 발속 경로를 그대로 한 번 통과시킨다.
    if (url.pathname === '/test-push') {
      const code = url.searchParams.get('code')
      if (!code) return new Response('code 가 필요합니다', { status: 400 })
      const rec = await env.SETTINGS.get<WatchRecord>(`w:${code}`, 'json')
      if (!rec || rec.subs.length === 0) return new Response('국독이 없습니다', { status: 404 })
      const results = []
      for (const sub of rec.subs) {
        const r = await sendPush(
          sub,
          JSON.stringify({ title: '테스트 알림', body: '발속 경로가 정상입니다', tag: 'test' }),
          {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT || 'mailto:noreply@example.com',
          },
        )
        results.push(r)
      }
      return Response.json(results)
    }

    return new Response('price alert watcher')
  },
}
