/**
 * 설정 동기화 API (Cloudflare Pages Functions).
 * 계정 없이 쓰므로 사용자가 직접 정한 "동기화 코드"를 열쇠로 삼는다.
 *
 *   GET  /api/settings?code=xxx  → 저장된 설정 { at, data }
 *   GET  /api/settings?code=xxx&since=123 → 서버 기록이 since 보다 새로울 때만 data 를 싣는다(아니면 { at })
 *   PUT  /api/settings?code=xxx  → 설정 저장
 */

interface Env {
  SETTINGS: KVNamespace
}

/** 남의 것을 넘겨짚기 어렵도록 형식을 제한한다. */
const CODE_RE = /^[a-zA-Z0-9-]{6,64}$/
const MAX_BYTES = 100_000

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

function bad(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS })
}

function readCode(request: Request): string | null {
  const code = new URL(request.url).searchParams.get('code')
  return code && CODE_RE.test(code) ? code : null
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const code = readCode(request)
  if (!code) return bad('동기화 코드 형식이 올바르지 않습니다', 400)

  // 저장된 모양 그대로 돌려준다: { at, data }
  const value = await env.SETTINGS.get(`s:${code}`)
  // 앱이 열리거나 탭으로 돌아올 때 확인하는 요청 — 새것이 없으면 시각만 보내 폰 데이터를 아낀다.
  const since = Number(new URL(request.url).searchParams.get('since') ?? NaN)
  if (value && Number.isFinite(since)) {
    const at = recordAt(value)
    if (at <= since) return new Response(JSON.stringify({ at }), { headers: JSON_HEADERS })
  }
  return new Response(value ?? '{}', { headers: JSON_HEADERS })
}

function recordAt(raw: string | null): number {
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw) as { at?: unknown }
    return typeof parsed.at === 'number' ? parsed.at : 0
  } catch {
    // 깨진 기록은 없는 것과 같게 본다
    return 0
  }
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const code = readCode(request)
  if (!code) return bad('동기화 코드 형식이 올바르지 않습니다', 400)

  const raw = await request.text()
  if (raw.length > MAX_BYTES) return bad('설정이 너무 큽니다', 413)

  // 저장 전에 JSON 인지 확인 — 깨진 값이 들어가면 다른 기기가 복원에 실패한다.
  let incoming: { data?: unknown; baseAt?: unknown; force?: unknown }
  try {
    incoming = JSON.parse(raw)
  } catch {
    return bad('JSON 이 아닙니다', 400)
  }

  const key = `s:${code}`

  // 낙관적 잠금: baseAt(신형 클라이언트)이 있고 force 가 아니면,
  // 서버 기록이 더 최신일 때 거부한다. baseAt 이 없으면(구형 캐시) 예전처럼 덮어쓴다.
  const force = incoming.force === true
  const baseAt = typeof incoming.baseAt === 'number' ? incoming.baseAt : null
  if (!force && baseAt !== null) {
    const storedAt = recordAt(await env.SETTINGS.get(key))
    if (storedAt > baseAt) {
      return new Response(JSON.stringify({ error: '다른 기기가 먼저 저장했습니다', at: storedAt }), {
        status: 409,
        headers: JSON_HEADERS,
      })
    }
  }

  // 항상 { at, data } 형태로만 저장한다 — baseAt/force 같은 제어 필드는 남기지 않는다.
  const at = Date.now()
  const data = 'data' in incoming ? incoming.data : incoming
  await env.SETTINGS.put(key, JSON.stringify({ at, data }))
  return new Response(JSON.stringify({ ok: true, at }), { headers: JSON_HEADERS })
}
