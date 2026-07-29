/**
 * 웹푸시 발송 (Web Push Protocol, aes128gcm).
 *
 * 라이브러리(web-push)는 Node 전용이라 Workers 에서 못 쓴다. 필요한 부분만 WebCrypto 로 구현했다.
 */

const b64uToBytes = (s: string): Uint8Array => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const bytesToB64u = (b: ArrayBuffer | Uint8Array): string => {
  const arr = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  for (const byte of arr) s += String.fromCharCode(byte)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

/** VAPID 용 ES256 JWT. 푸시 서비스에 "누가 보내는지" 알린다. */
async function makeVapidJwt(audience: string, subject: string, privateKeyB64u: string, publicKeyB64u: string): Promise<string> {
  const header = bytesToB64u(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = bytesToB64u(
    new TextEncoder().encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: subject,
      }),
    ),
  )
  const unsigned = `${header}.${payload}`

  const pub = b64uToBytes(publicKeyB64u)
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: privateKeyB64u,
    x: bytesToB64u(pub.subarray(1, 33)),
    y: bytesToB64u(pub.subarray(33, 65)),
    ext: true,
  }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned),
  )
  return `${unsigned}.${bytesToB64u(sig)}`
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

export interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/**
 * 본문을 구독자 공개키로 암호화해 보낸다.
 * 반환값이 false 면 구독이 죽은 것이니 지워도 된다.
 */
export async function sendPush(
  sub: PushSubscription,
  payload: string,
  vapid: { publicKey: string; privateKey: string; subject: string },
): Promise<{ ok: boolean; status: number }> {
  const clientPub = b64uToBytes(sub.keys.p256dh)
  const authSecret = b64uToBytes(sub.keys.auth)

  // 이 메시지 전용 임시 키쌍.
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey))

  const clientKey = await crypto.subtle.importKey(
    'raw',
    clientPub as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, local.privateKey, 256),
  )

  const enc = new TextEncoder()
  // RFC8291: 공유비밀을 auth secret 으로 한 번 더 늘린다.
  const prkInfo = concat(enc.encode('WebPush: info\0'), clientPub, localPubRaw)
  const ikm = await hkdf(authSecret, shared, prkInfo, 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt'])
  // 패딩 구분자 0x02 를 붙여 암호화한다.
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, aesKey, plaintext as BufferSource),
  )

  // aes128gcm 헤더: salt(16) | rs(4) | idlen(1) | keyid
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  const body = concat(salt, rs, new Uint8Array([localPubRaw.length]), localPubRaw, ciphertext)

  const audience = new URL(sub.endpoint).origin
  const jwt = await makeVapidJwt(audience, vapid.subject, vapid.privateKey, vapid.publicKey)

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body: body as BodyInit,
  })

  return { ok: res.ok, status: res.status }
}
