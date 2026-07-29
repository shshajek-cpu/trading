/**
 * 설정 동기화 API (Cloudflare Pages Functions).
 * 계정 없이 쓰므로 사용자가 직접 정한 "동기화 코드"를 열쇠로 삼는다.
 *
 *   GET  /api/settings?code=xxx  → 저장된 설정
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
  return new Response(value ?? '{}', { headers: JSON_HEADERS })
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const code = readCode(request)
  if (!code) return bad('동기화 코드 형식이 올바르지 않습니다', 400)

  const body = await request.text()
  if (body.length > MAX_BYTES) return bad('설정이 너무 큽니다', 413)

  // 저장 전에 JSON 인지 확인 — 깨진 값이 들어가면 다른 기기가 복원에 실패한다.
  try {
    JSON.parse(body)
  } catch {
    return bad('JSON 이 아닙니다', 400)
  }

  await env.SETTINGS.put(`s:${code}`, body)
  return new Response(JSON.stringify({ ok: true, at: Date.now() }), { headers: JSON_HEADERS })
}
