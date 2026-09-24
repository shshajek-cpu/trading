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
 *   수평선 알림만 예외로, 새로 등록된 선의 기준 쪽(현재가가 선 위인지 아래인지)을 처음 볼 때 한 번 기록한다.
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
  /** 사용자 메모. 푸시 본문에 붙인다. */
  message?: string
}

/** 수평선 알림. 처음 본 현재가 쪽(lineSides)을 기준으로, 가격이 선을 지나 반대쪽으로 가면 울린다. */
interface WatchLine {
  id: string
  symbol: string
  price: number
}

type Side = 'above' | 'below'

interface WatchRecord {
  subs: PushSubscription[]
  // 기기별 알림 버킷. /api/push 가 각 기기 endpoint 로 나눠 담는다.
  alertsBy?: Record<string, WatchAlert[]>
  // 버킷 도입 전 레거시 평면 목록. 감시기는 건드리지 않고 첫 PUT 에서 정리된다.
  alerts?: WatchAlert[]
  // 기기별 수평선 버킷. 예전 기록에는 없다.
  linesBy?: Record<string, WatchLine[]>
  // 수평선마다 처음 본 현재가 쪽. 키는 lineKey — /api/push 와 형식이 같아야 한다.
  lineSides?: Record<string, Side>
  firedIds: string[]
}

/** alertsBy 버킷과 레거시 목록을 합쳐 알림 id 로 중복을 제거한다. */
function unionAlerts(record: WatchRecord): WatchAlert[] {
  const byId = new Map<string, WatchAlert>()
  for (const list of Object.values(record.alertsBy ?? {})) {
    for (const a of list) byId.set(a.id, a)
  }
  for (const a of record.alerts ?? []) if (!byId.has(a.id)) byId.set(a.id, a)
  return [...byId.values()]
}

/** 기기별 수평선 버킷을 합쳐 id 로 중복을 제거한다. */
function unionLines(record: WatchRecord): WatchLine[] {
  const byId = new Map<string, WatchLine>()
  for (const list of Object.values(record.linesBy ?? {})) {
    for (const l of list) byId.set(l.id, l)
  }
  return [...byId.values()]
}

/** lineSides 키. 선을 옮기면(가격이 바뀌면) 기준 쪽을 새로 잡는다. /api/push 와 형식이 같아야 한다. */
function lineKey(line: WatchLine): string {
  return `${line.id}@${line.price}`
}

/** 감시할 동기화 코드 목록. /api/push 가 구독·알림이 바뀔 때 맞춘다. */
const INDEX_KEY = 'w-index'

const TICKERS_URL = 'https://api.gateio.ws/api/v4/futures/usdt/tickers'

/**
 * gate.io 는 BTC_USDT 형식이다. 밑줄을 빼 바이낸스 표기(BTCUSDT)로 맞춘다.
 * gate 는 1000 배 계약을 따로 상장하지 않고 원 코인만 둔다(PEPE_USDT 등).
 * 그래서 바이낸스 1000PEPEUSDT 같은 표기도 찾을 수 있게 ×1000 값을 함께 넣는다.
 */
async function fetchPrices(): Promise<Map<string, number>> {
  const res = await fetch(TICKERS_URL, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`시세 조회 실패 ${res.status}`)
  const list = (await res.json()) as { contract: string; last: string }[]
  const map = new Map<string, number>()
  for (const t of list) {
    const p = Number(t.last)
    if (!Number.isFinite(p)) continue
    const symbol = t.contract.replace('_', '')
    map.set(symbol, p)
    if (symbol.endsWith('USDT')) {
      const coin = symbol.slice(0, -'USDT'.length)
      map.set(`1000${coin}USDT`, p * 1000)
    }
  }
  return map
}

/** 조건을 만족하면 울린다. 한 번 울린 알림은 firedIds 에 남아 다시 울리지 않는다. */
function meets(alert: WatchAlert, now: number): boolean {
  return alert.condition === 'above' ? now >= alert.price : now <= alert.price
}

/** 이번 분에 보낼 푸시 하나. */
interface Hit {
  id: string
  payload: string
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
      if (record && record.subs.length > 0 && unionAlerts(record).length + unionLines(record).length > 0) {
        codes.push(key.name.slice(2))
      }
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
    if (!record || record.subs.length === 0) continue
    const alerts = unionAlerts(record)
    const lines = unionLines(record)
    if (alerts.length === 0 && lines.length === 0) continue

    const fired = new Set(record.firedIds)
    const hits: Hit[] = []
    for (const alert of alerts) {
      const now = prices.get(alert.symbol)
      if (now === undefined || fired.has(alert.id) || !meets(alert, now)) continue
      hits.push({
        id: alert.id,
        payload: JSON.stringify({
          title: `${alert.symbol} ${alert.condition === 'above' ? '▲' : '▼'} ${alert.price}`,
          body: alert.message ? `${alert.message}\n현재가 ${now}` : `현재가 ${now}`,
          // 로컬 시스템 알림과 같은 태그를 써 OS 가 하나로 합치게 한다.
          tag: `price-${alert.id}`,
          // 알림을 누르면 이 종목 차트를 연다(sw-push.js).
          symbol: alert.symbol,
        }),
      })
    }

    // 수평선: 처음 볼 때 현재가가 선의 어느 쪽인지 적어 두고, 반대쪽으로 넘어가면 울린다.
    // 기준 쪽은 새 선(또는 옮긴 선)을 처음 볼 때 한 번만 기록한다 — 매분 쓰지 않는다.
    const sides: Record<string, Side> = { ...(record.lineSides ?? {}) }
    let sidesChanged = false
    for (const line of lines) {
      const now = prices.get(line.symbol)
      if (now === undefined || fired.has(line.id)) continue
      const lk = lineKey(line)
      const before = sides[lk]
      // 앱(useDrawings)과 같은 기준: 선 이상이면 위, 미만이면 아래.
      const side: Side = now >= line.price ? 'above' : 'below'
      if (before === undefined) {
        sides[lk] = side
        sidesChanged = true
        continue
      }
      if (before === side) continue
      // 울린 선은 기준을 지운다 — 다시 켜면 그때 현재가로 새로 잡는다.
      delete sides[lk]
      hits.push({
        id: line.id,
        payload: JSON.stringify({
          title: `${line.symbol} 수평선 ${line.price} 통과`,
          body: `현재가 ${now}`,
          tag: `line-${line.id}`,
          symbol: line.symbol,
        }),
      })
    }
    // 울릴 것도, 새로 적을 기준도 없으면 아무것도 쓰지 않는다 — 무료 한도의 대부분이 여기서 아껴진다.
    if (hits.length === 0 && !sidesChanged) continue

    const dead = new Set<string>()
    for (const hit of hits) {
      fired.add(hit.id)
      for (const sub of record.subs) {
        if (dead.has(sub.endpoint)) continue
        // 한 기기의 발송 실패(네트워크 등)가 나머지 기기와 발동 기록을 막지 않게 한다.
        // 기록이 안 남으면 매분 같은 알림이 다시 울린다.
        try {
          const r = await sendPush(sub, hit.payload, {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT || 'mailto:noreply@example.com',
          })
          // 404/410 은 구독이 죽은 것 — 다음부터 빼둔다.
          if (!r.ok && (r.status === 404 || r.status === 410)) dead.add(sub.endpoint)
        } catch (e) {
          console.error('push failed', sub.endpoint, e)
        }
      }
    }

    // 죽은 구독은 그 버킷까지 지운다. 레거시 목록은 감시기가 건드리지 않는다(첫 PUT 에서 정리).
    const alertsBy = { ...(record.alertsBy ?? {}) }
    const linesBy = { ...(record.linesBy ?? {}) }
    for (const ep of dead) {
      delete alertsBy[ep]
      delete linesBy[ep]
    }
    await env.SETTINGS.put(
      key,
      JSON.stringify({
        subs: record.subs.filter((s) => !dead.has(s.endpoint)),
        alertsBy,
        ...(record.alerts ? { alerts: record.alerts } : {}),
        linesBy,
        lineSides: sides,
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
      const watch = rec ? unionAlerts(rec) : []
      const lines = rec ? unionLines(rec) : []
      const symbols = [...watch.map((a) => a.symbol), ...lines.map((l) => l.symbol)]
      return Response.json({
        subs: rec?.subs.length ?? 0,
        alerts: watch,
        lines,
        lineSides: rec?.lineSides ?? {},
        watched: ((await env.SETTINGS.get<string[]>(INDEX_KEY, 'json')) ?? []).includes(code),
        firedIds: rec?.firedIds ?? [],
        livePrices: Object.fromEntries(symbols.map((s) => [s, prices.get(s) ?? null])),
      })
    }

    // 실제 발송 경로를 그대로 한 번 통과시킨다.
    if (url.pathname === '/test-push') {
      const code = url.searchParams.get('code')
      if (!code) return new Response('code 가 필요합니다', { status: 400 })
      const rec = await env.SETTINGS.get<WatchRecord>(`w:${code}`, 'json')
      if (!rec || rec.subs.length === 0) return new Response('구독이 없습니다', { status: 404 })
      const results = []
      for (const sub of rec.subs) {
        const r = await sendPush(
          sub,
          JSON.stringify({ title: '테스트 알림', body: '발송 경로가 정상입니다', tag: 'test' }),
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
