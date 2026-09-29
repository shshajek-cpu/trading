/**
 * 야후 파이낸스 프록시 (Cloudflare Pages Functions).
 * 브라우저는 CORS 로 야후를 바로 못 부르므로 같은 출처에서 대신 받아 준다. 비밀 값은 없다.
 *
 *   GET /api/yahoo?type=chart&symbol=AAPL&interval=1d&period1=..&period2=..&includePrePost=false
 *   GET /api/yahoo?type=chart&symbol=AAPL&interval=1d&range=1d
 *   GET /api/yahoo?type=search&q=samsung
 *
 * 검사·야후 주소는 src/lib/market/yahooProxy.ts(개발 서버와 같이 쓴다). 성공·404·422 는 야후 주소를 열쇠로
 * 엣지 캐시에 ttl 초 두어, 여러 사람이 같은 종목을 봐도 야후에는 한 번만 묻는다.
 */
import { fetchYahoo, yahooUpstream } from '../../src/lib/market/yahooProxy'

// Workers 런타임의 기본 캐시(caches.default). 표준 CacheStorage 타입에는 없어 여기서 알려 준다.
declare global {
  interface CacheStorage {
    readonly default: Cache
  }
}

/** 캐시해도 되는 야후 응답(있는 값·없는 종목·보관 한도 밖). 429·5xx 는 곧 달라지므로 두지 않는다. */
const CACHEABLE: Record<number, true> = { 200: true, 404: true, 422: true }

function respond(status: number, body: string, ttl: number): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': CACHEABLE[status] && ttl > 0 ? `public, max-age=${ttl}` : 'no-store',
    },
  })
}

export const onRequestGet: PagesFunction = async ({ request, waitUntil }) => {
  const params = new URL(request.url).searchParams
  const up = yahooUpstream(params, Date.now() / 1000)
  if ('error' in up) return respond(400, JSON.stringify({ error: up.error }), 0)

  const cache = caches.default
  const key = new Request(up.url, { method: 'GET' })
  const hit = await cache.match(key)
  if (hit) return hit

  const { status, body, ttl } = await fetchYahoo(params)
  const res = respond(status, body, ttl)
  if (CACHEABLE[status] && ttl > 0) waitUntil(cache.put(key, res.clone()))
  return res
}
