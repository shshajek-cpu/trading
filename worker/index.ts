/**
 * 가격 알림 감시기 (Cron).
 *
 * 앱이 꺼져 있어도 알림이 가야 하므로 서버가 대신 시세를 본다.
 * 바이낸스·Bybit 는 데이터센터 IP 를 막아서(403) 같은 USDT 무기한 선물 시세를 gate.io 에서 읽는다.
 * 가격차는 0.01% 미만이라 알림 용도에 충분하다.
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
  /** 알림 id → 직전 관측가. 심볼별로 두면 새 알림이 남의 관측값에 막힌다. */
  seen: Record<string, number>
  firedIds: string[]
}

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

/**
 * 알림을 울려야 하는지 본다.
 *
 * 기준점을 잡았을 때 이미 조건을 넘어서있으면 교차를 기다려도 오지 않는다.
 * 그런 건 등록 직후 한 번 알려주는 게 맞다 — 사용자는 "그 값이 되면"을 원한 것이다.
 */
function shouldFire(alert: WatchAlert, prev: number | undefined, now: number): boolean {
  const meets = alert.condition === 'above' ? now >= alert.price : now <= alert.price
  if (!meets) return false
  // 직전에도 이미 만족하고 있었다면 새로 울릴 일이 아니다(중복 방지).
  if (prev === undefined) return true
  const metBefore = alert.condition === 'above' ? prev >= alert.price : prev <= alert.price
  return !metBefore
}

async function checkAll(env: Env): Promise<void> {
  const prices = await fetchPrices()
  const list = await env.SETTINGS.list({ prefix: 'w:' })

  for (const key of list.keys) {
    const record = await env.SETTINGS.get<WatchRecord>(key.name, 'json')
    if (!record || record.subs.length === 0 || record.alerts.length === 0) continue

    const fired = new Set(record.firedIds)
    const seen: Record<string, number> = { ...record.seen }
    const hits: WatchAlert[] = []

    const alive = new Set(record.alerts.map((a) => a.id))
    for (const alert of record.alerts) {
      const now = prices.get(alert.symbol)
      if (now === undefined) continue
      if (!fired.has(alert.id) && shouldFire(alert, seen[alert.id], now)) {
        hits.push(alert)
        fired.add(alert.id)
      }
      seen[alert.id] = now
    }
    // 지운 알림의 흔적은 남기지 않는다.
    for (const id of Object.keys(seen)) if (!alive.has(id)) delete seen[id]

    if (hits.length > 0) {
      const dead: string[] = []
      for (const alert of hits) {
        const price = prices.get(alert.symbol) ?? alert.price
        const payload = JSON.stringify({
          title: `${alert.symbol} ${alert.condition === 'above' ? '▲' : '▼'} ${alert.price}`,
          body: `현재가 ${price}`,
          tag: alert.id,
        })
        for (const sub of record.subs) {
          const r = await sendPush(sub, payload, {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT || 'mailto:noreply@example.com',
          })
          // 404/410 은 구독이 죽은 것 — 다음부터 빼둔다.
          if (!r.ok && (r.status === 404 || r.status === 410)) dead.push(sub.endpoint)
        }
      }
      if (dead.length > 0) record.subs = record.subs.filter((s) => !dead.includes(s.endpoint))
    }

    await env.SETTINGS.put(
      key.name,
      JSON.stringify({ ...record, seen, firedIds: [...fired] } satisfies WatchRecord),
    )
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(checkAll(env))
  },

  /** 수동 점검용 — 크론을 기다리지 않고 바로 돌려본다. */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/run') {
      try {
        await checkAll(env)
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
        seen: rec?.seen ?? {},
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
