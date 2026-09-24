/**
 * 모의 선물거래 계좌 동기화 API (Cloudflare Pages Functions).
 * 계정 없이 쓰므로 사용자가 직접 정한 "동기화 코드"를 열쇠로 삼는다.
 *
 *   GET /api/paper?code=xxx&v=N
 *     - 행이 없으면            { version: 0 }
 *     - 행이 있고 version==N 이면 { same: true, version }
 *     - 그 외                  { version, state, updatedAt }
 *   PUT /api/paper?code=xxx  body { baseVersion, state }
 *     - baseVersion 이 서버 version 과 같을 때만 저장(version+1)
 *     - baseVersion 0 = 처음 만들기(이미 있으면 409)
 *     - 충돌이면 409 { version, state }
 */

interface Env {
  PAPER: D1Database
}

/** 남의 것을 넘겨짚기 어렵도록 형식을 제한한다. */
const CODE_RE = /^[a-zA-Z0-9-]{6,64}$/
const MAX_BYTES = 1_500_000

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

function bad(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function readCode(request: Request): string | null {
  const code = new URL(request.url).searchParams.get('code')
  return code && CODE_RE.test(code) ? code : null
}

interface Row {
  version: number
  state: string
  updated_at: number
}

/** 저장된 문자열을 안전하게 파싱한다. 깨졌으면 null. */
function parseState(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const code = readCode(request)
  if (!code) return bad('동기화 코드 형식이 올바르지 않습니다', 400)

  const row = await env.PAPER.prepare('SELECT version, state, updated_at FROM paper_accounts WHERE code = ?')
    .bind(code)
    .first<Row>()
  if (!row) return json({ version: 0 })

  const vParam = new URL(request.url).searchParams.get('v')
  if (vParam !== null && Number(vParam) === row.version) {
    return json({ same: true, version: row.version })
  }
  return json({ version: row.version, state: parseState(row.state), updatedAt: row.updated_at })
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const code = readCode(request)
  if (!code) return bad('동기화 코드 형식이 올바르지 않습니다', 400)

  const raw = await request.text()
  if (raw.length > MAX_BYTES) return bad('계좌 상태가 너무 큽니다', 413)

  let incoming: { baseVersion?: unknown; state?: unknown }
  try {
    incoming = JSON.parse(raw) as { baseVersion?: unknown; state?: unknown }
  } catch {
    return bad('JSON 이 아닙니다', 400)
  }

  const baseVersion = typeof incoming.baseVersion === 'number' ? incoming.baseVersion : NaN
  if (!Number.isInteger(baseVersion) || baseVersion < 0) return bad('baseVersion 이 올바르지 않습니다', 400)

  const state = incoming.state
  if (state === null || typeof state !== 'object' || Array.isArray(state) || !('v' in state) || state.v !== 1) {
    return bad('계좌 상태가 올바르지 않습니다', 400)
  }

  const stateStr = JSON.stringify(state)
  const now = Date.now()

  if (baseVersion === 0) {
    // 처음 만들기 — 이미 있으면 아무것도 바꾸지 않는다.
    const res = await env.PAPER.prepare(
      'INSERT INTO paper_accounts (code, version, state, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(code) DO NOTHING',
    )
      .bind(code, stateStr, now)
      .run()
    if (res.meta.changes === 1) return json({ version: 1 })
    // 이미 존재 → 현재 상태를 돌려주며 충돌.
    const row = await env.PAPER.prepare('SELECT version, state FROM paper_accounts WHERE code = ?')
      .bind(code)
      .first<Row>()
    return json({ version: row?.version ?? 0, state: row ? parseState(row.state) : undefined }, 409)
  }

  // 낙관적 잠금: 버전이 일치할 때만 version+1 로 저장한다.
  const res = await env.PAPER.prepare(
    'UPDATE paper_accounts SET version = version + 1, state = ?, updated_at = ? WHERE code = ? AND version = ?',
  )
    .bind(stateStr, now, code, baseVersion)
    .run()
  if (res.meta.changes === 1) return json({ version: baseVersion + 1 })

  // 실패 → 현재 상태를 돌려주며 충돌(행이 없거나 버전이 다름).
  const row = await env.PAPER.prepare('SELECT version, state FROM paper_accounts WHERE code = ?')
    .bind(code)
    .first<Row>()
  return json({ version: row?.version ?? 0, state: row ? parseState(row.state) : undefined }, 409)
}
