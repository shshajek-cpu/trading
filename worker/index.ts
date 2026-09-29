/**
 * 가격·수평선·지표 알림 감시기 (Cron, 1분마다).
 *
 * 앱이 꺼져 있어도 알림이 가야 하므로 서버가 대신 시세를 본다.
 * 감시 목록은 모든 기기가 함께 쓰는 동기화 설정(s:<code>)에서 매분 새로 뽑는다 — 어느 기기에서 만들거나 고치거나 옮긴
 * 알림이든 설정이 동기화되면 그대로 감시한다. /api/push 는 푸시를 보낼 구독만 w:<code> 에 둔다.
 *
 * 시세는 앱과 같은 바이낸스 USDT-M 1분봉을 먼저 읽는다. 바이낸스가 데이터센터 IP·지역을 막거나(403/451)
 * 요청 한도에 걸리면(418/429) 이번 호출 동안은 다시 부르지 않고 같은 무기한 선물의 gate.io 1분봉으로 대신한다
 * (가격차는 0.01% 미만). 봉을 못 읽은 종목은 gate.io 전체 시세의 현재가 하나로 본다.
 *
 * 현재가 하나만 보면 두 점검 사이에 닿았다 돌아온 가격을 놓친다. 그래서 봉마다 시가·고가·저가·종가를
 * 시간순 경로로 펼쳐(pathSince) 앱과 같은 규칙으로 한 점씩 판정한다.
 * 지난 점검 시각은 따로 적지 않는다 — 가격 알림은 만들거나 고치거나 다시 켠 시각(createdAt·updatedAt) 뒤의 봉만,
 * 수평선은 기준 쪽을 잡은 시각(SideMark.at) 뒤의 봉만 본다. 그래서 알림을 만들거나 고치기 전의 움직임으로는 울리지 않는다.
 *
 * 울린 알림은 앱이 확인할 때까지 firedIds 에 두고 다시 울리지 않는다. 동기화 설정에서 감시 대상이 아니게 됐거나
 * (가격 알림을 껐다·지웠다, 수평선이 울렸다·알림을 껐다·지웠다) 앱이 받았다고 알린(acks) 뒤에 설정이 다시 저장됐으면
 * 확인된 것으로 보고 뺀다. 그 뒤 다시 켜면 다시 울린다.
 *
 * 지표 알림(indicatorAlerts.ts)은 (종목, 주기)마다 과거 봉을 읽어 앱과 같은 계산·판정으로 본다. '한 번만' 알림은
 * 가격 알림처럼 firedIds 로, '봉마다'·'봉 마감 시' 알림은 알림마다 마지막으로 푸시한 봉(barMarks)으로 한 봉에 한 번만 보낸다.
 *
 * 한 호출은 두 단계로 돈다. 1단계에서 가격·수평선을 판정해 보내고 기록까지 적은 뒤, 2단계에서 지표 봉을 읽고 계산해
 * 울린 것이 있을 때만 한 번 더 적는다. 지표 계산이 CPU 한도(무료 플랜 약 10ms)를 넘겨 호출이 끊겨도 1단계 결과는 남는다.
 * 지표 봉은 한 호출에 INDICATOR_FEEDS_PER_RUN(3) 묶음만 읽는다 — 묶음이 N 개면 분마다 돌아가며 보므로 묶음마다
 * ceil(N/3) 분에 한 번 판정한다(그만큼 늦게 울리고, 1m 처럼 짧은 주기는 그 사이에 지나간 교차·닫힌 봉을 놓칠 수 있다).
 *
 * Workers 무료 플랜 한도 안에서 돈다:
 * - KV(하루 목록 조회 1,000회·쓰기 1,000회): 매분 목록을 조회하지 않고 감시 대상 코드 목록 키(`w-index`)와
 *   코드마다 구독 기록(w:)·동기화 설정(s:) 두 개만 읽는다. 목록 조회는 정각마다 한 번(하루 24회) 색인을 다시 맞출 때만 쓴다.
 * - 기록은 바뀐 것이 있을 때만 한다 — 푸시를 보냈을 때, 교차 알림이 걸리거나 수평선의 기준 쪽을 처음 잡았을 때,
 *   감시에서 빠진 항목의 기준·봉 기록을 지울 때, firedIds 가 바뀔 때. 조용한 분에는 쓰지 않는다. 두 단계가 한 기록을 모두
 *   적어야 하면(드물다) 같은 키는 초당 한 번만 쓸 수 있어 2단계가 1초 남짓 기다렸다 적는다(CPU 는 쓰지 않는다).
 * - 외부 요청(호출 하나당 50회): 봉 조회(가격 시세·지표 봉 합계)는 CANDLE_FETCH_MAX 번까지만 하고, 지표 봉 몫(이번 분에
 *   고른 묶음 수)을 남긴다. 넘는 가격 종목은 전체 시세 한 번으로 보고, 못 읽은 지표 봉은 다음 차례에 읽는다.
 *   푸시 발송도 이 한도에 들어가므로, 넘칠 것 같은 알림은 발동으로 적지 않고 다음 분으로 미룬다.
 */
import {
  describeIndicatorAlert,
  formatAlertValue,
  INDICATOR_ALERTS_STORAGE_KEY,
  parseIndicatorAlerts,
  type IndicatorAlert,
} from '../src/lib/indicatorAlerts'
import { dueBar, feedKey, historyFor, judgeIndicatorAlert, loadFeeds, pickFeeds, type Feed } from './indicatorAlerts'
import { loadQuotes, newBudget, SUBREQUEST_MAX, type Budget, type PriceSource, type Quote } from './market'
import { sendPush, type PushSubscription } from './webpush'
import {
  alertKey,
  barsNeeded,
  judgeLine,
  judgePrice,
  lineKey,
  readAlerts,
  readLines,
  timeReached,
  type RuleMark,
  type WatchLine,
} from './alertJudge'
import {
  describeLineAlert,
  describePriceAlert,
  isChannelKind,
  isExpired,
  isMoveKind,
  type PriceAlert,
} from '../src/lib/alertRules'

interface Env {
  SETTINGS: KVNamespace
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
}

/** 서버가 보낸 푸시 하나 — 앱이 /api/push 로 받아 알림 기록에 적는다(lib/alertLog 의 ServerFire 와 모양이 같아야 한다). */
interface ServerFire {
  id: string
  at: number
  symbol: string
  text: string
}

/** fires 에 남기는 최근 발송 수. 앱은 이 가운데 아직 적지 않은 것만 기록에 더한다. */
const FIRES_MAX = 20

/**
 * 코드마다의 감시 기록(w:<code>). 구독은 /api/push 가, 나머지는 감시기가 쓴다 — 두 곳의 모양이 같아야 한다.
 * 예전 기록의 기기별 감시 목록(alertsBy·linesBy·alerts)과 옛 판정 기록(lineMarks·armMarks)은 읽지 않고, 다음에 쓸 때 빠진다.
 */
interface WatchRecord {
  subs: PushSubscription[]
  /**
   * 가격·선 알림마다의 판정 기록(걸렸는지·기다리는 쪽·「매번」의 마지막 발동). 키는 alertKey·lineKey — 알림을 고치거나
   * 다시 켜거나 선을 옮기면 키가 달라져 새로 시작한다.
   */
  ruleMarks?: Record<string, RuleMark>
  /** 지표 알림('봉마다'·'봉 마감 시')마다 마지막으로 푸시한 봉의 시작 시각(초). 한 봉에 한 번만 보낸다. */
  barMarks?: Record<string, number>
  /** 감시기가 울렸고 앱이 아직 확인하지 않은 한 번만 알림·선·지표 알림 id. 여기 있는 동안은 다시 울리지 않는다. */
  firedIds: string[]
  /** 앱이 받았다고 알린 시각(ms, id 별). 이 뒤에 저장된 설정은 그 확인을 반영한 것으로 본다. */
  acks?: Record<string, number>
  /**
   * 최근에 보낸 푸시(최신이 앞, FIRES_MAX 개). 앱이 알림 기록에 적는다 — 「매번」 알림은 firedIds 에 남지 않아 앱은 이것으로만
   * 서버 발송을 안다. 보낸 분에만 바뀌므로 쓰기가 늘지 않는다.
   */
  fires?: ServerFire[]
}

/** 동기화 설정에서 감시 목록을 꺼내는 키. 앱의 localStorage 키(syncMerge.SYNCED_KEYS)와 같아야 한다. */
const PRICE_ALERTS_KEY = 'trading.priceAlerts.v1'
const DRAWINGS_KEY = 'trading.drawings.v2'

/** 푸시 본문에 붙이는 메모 길이 한도. */
const MESSAGE_MAX = 200

/** 동기화 설정의 저장 시각(ms)과 거기서 뽑은 감시 목록(켜졌고 만료되지 않은 것). */
interface Watch {
  at: number
  alerts: PriceAlert[]
  lines: WatchLine[]
  /** 켜진 지표 알림. */
  indicators: IndicatorAlert[]
}

/** 설정 한 키(JSON 문자열)의 목록. 없거나 깨졌으면 빈 목록. */
function readList(data: Record<string, unknown>, key: string): unknown[] {
  const raw = data[key]
  if (typeof raw !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 동기화 설정을 읽어 감시 목록을 뽑는다. 기록이 없거나 깨졌으면 null — 그 코드는 이번 분에 건너뛴다(확인 흔적도 그대로 둔다). */
async function readWatch(env: Env, code: string): Promise<Watch | null> {
  const raw = await env.SETTINGS.get(`s:${code}`)
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || !('data' in parsed)) return null
  const { data } = parsed
  if (typeof data !== 'object' || data === null) return null
  // 설정 API(/api/settings)가 저장하는 모양: localStorage 키 → 저장된 문자열. 값은 readList 가 하나씩 검사한다.
  const snapshot = data as Record<string, unknown>
  const at = 'at' in parsed ? parsed.at : undefined
  const now = Date.now()
  return {
    at: typeof at === 'number' ? at : 0,
    // 모양 검사는 앱(lib/alertRules)과 같다. 꺼졌거나 만료된 알림은 감시하지 않는다.
    alerts: readAlerts(readList(snapshot, PRICE_ALERTS_KEY), now),
    lines: readLines(readList(snapshot, DRAWINGS_KEY), now),
    // 모양 검사는 앱(indicatorAlerts.parseIndicatorAlerts)과 같다. 없거나 깨졌으면 빈 목록.
    indicators: parseIndicatorAlerts(snapshot[INDICATOR_ALERTS_STORAGE_KEY]).filter((a) => a.active && !isExpired(a, now)),
  }
}

/** 감시할 동기화 코드 목록 — 구독이 있는 코드. /api/push 가 구독이 바뀔 때 맞춘다. */
const INDEX_KEY = 'w-index'

const MINUTE_MS = 60_000
/** KV 는 같은 키에 초당 한 번까지 쓴다. 1단계가 적은 기록을 2단계가 다시 적을 때는 이만큼 기다린다(CPU 는 쓰지 않는다). */
const KEY_WRITE_GAP_MS = 1_100

/** gate ×1000 환산에서 생기는 부동소수 꼬리(12.344999999…)를 떼어 보인다. */
function formatPrice(price: number): string {
  return String(Number(price.toPrecision(10)))
}

/** 푸시 본문의 가격 줄. 어느 시세로 판정했는지(대체 시세면 그렇다고)와, 닿았다 돌아왔으면 닿은 가격도 보인다. */
function priceNote(quote: Quote, hit: number): string {
  const last = quote.bars[quote.bars.length - 1].c
  const source = quote.source === 'gate' ? 'gate.io 대체 시세 ' : quote.source === 'binance' ? '바이낸스 ' : ''
  return hit === last
    ? `${source}현재가 ${formatPrice(last)}`
    : `${source}${formatPrice(hit)} 도달 · 현재가 ${formatPrice(last)}`
}

/**
 * 이번 분에 보낼 푸시 하나. 보내면: bar 가 있으면 봉마다 울리는 지표 알림 — barMarks 에 그 봉을, mark 가 있으면 「매번」 알림 —
 * ruleMarks 에 그 기록을, 둘 다 없으면 한 번만 알림 — firedIds 에 적는다. text 는 알림 기록(fires)에 남길 한 줄.
 */
interface Hit {
  id: string
  payload: string
  symbol: string
  text: string
  bar?: number
  mark?: { key: string; value: RuleMark }
}

/** 푸시 한 건. 로컬 시스템 알림과 같은 태그(price-·line-·ind-)를 써 OS 가 하나로 합치고, 누르면 그 종목 차트를 연다(sw-push.js). */
function pushHit(id: string, symbol: string, title: string, body: string, tag: string, text: string): Hit {
  return { id, symbol, text, payload: JSON.stringify({ title, body, tag, symbol }) }
}

/** 이번 분에 볼 코드 하나. */
interface Entry {
  key: string
  record: WatchRecord
  watch: Watch
  /** 확인된 발동을 뺀 firedIds 와, 그 가운데 앱이 받았다고 알린 것의 시각. */
  firedIds: string[]
  acks: Record<string, number>
}

/**
 * 앱이 확인한 발동을 firedIds 에서 뺀다. 설정에서 감시 대상이 아니게 됐거나(가격 알림 끔·지움, 수평선 울림·알림 끔·지움),
 * 앱이 받았다고 알린 뒤에 설정이 다시 저장됐으면 확인된 것이다 — 그래도 켜져 있으면 다시 켠 것이라 다시 감시한다.
 */
function unackedFired(record: WatchRecord, watch: Watch): Pick<Entry, 'firedIds' | 'acks'> {
  const live = new Set([...watch.alerts, ...watch.lines, ...watch.indicators].map((w) => w.id))
  const prev = record.acks ?? {}
  const firedIds = record.firedIds.filter((id) => {
    const ackedAt = prev[id]
    return live.has(id) && !(ackedAt !== undefined && watch.at > ackedAt)
  })
  const acks: Record<string, number> = {}
  for (const id of firedIds) if (prev[id] !== undefined) acks[id] = prev[id]
  return { firedIds, acks }
}

/** 지금 감시하는 항목(keys)의 기록만 남긴다. 지운 것이 있으면 pruned — 기록해야 옛 기록이 되살아나지 않는다. */
function liveMarks<T>(marks: Record<string, T> | undefined, keys: string[]): { marks: Record<string, T>; pruned: boolean } {
  const out: Record<string, T> = {}
  for (const k of keys) {
    const mark = marks?.[k]
    if (mark !== undefined) out[k] = mark
  }
  return { marks: out, pruned: Object.keys(marks ?? {}).length !== Object.keys(out).length }
}

/** 봉마다 울리는 지표 알림이 이 봉(시작 시각, 초)에서 이미 울렸다 — 감시기가 푸시했거나(barMarks) 앱이 울렸다(lastBar). */
function alreadyPushed(alert: IndicatorAlert, barMarks: Record<string, number> | undefined, bar: number): boolean {
  return alert.trigger !== 'once' && (barMarks?.[alert.id] === bar || alert.lastBar === bar)
}

/** 지표 알림 푸시. 문구·태그는 앱(App.handleIndicatorFire)과 같고, gate.io 봉으로 계산했으면 그렇다고 덧붙인다. */
function indicatorHit(alert: IndicatorAlert, value: number, source: PriceSource): Hit {
  const text =
    alert.message ||
    `${alert.symbol} ${alert.interval} ${describeIndicatorAlert(alert)} (현재 ${formatAlertValue(value)})`
  const body = source === 'gate' ? `${text}\ngate.io 대체 시세로 계산` : text
  return pushHit(alert.id, alert.symbol, '지표 알림', body, `ind-${alert.id}`, text)
}

/** 이번에 보낸 푸시를 최근 발송 목록 앞에 붙인다(FIRES_MAX 개까지). 보낸 것이 없으면 그대로. */
function withFires(prev: ServerFire[] | undefined, sent: Hit[], at: number): ServerFire[] | undefined {
  if (sent.length === 0) return prev
  return [...sent.map((h) => ({ id: h.id, at, symbol: h.symbol, text: h.text })), ...(prev ?? [])].slice(0, FIRES_MAX)
}

/**
 * 목록 조회로 감시 대상 색인을 다시 만든다(색인이 없을 때, 그리고 정각마다 — 동시 수정으로 어긋난 색인을 바로잡는다).
 * 구독이 있는 코드만 넣는다 — 무엇을 감시할지는 매분 동기화 설정에서 뽑는다.
 */
async function rebuildIndex(env: Env, current: string[] | null): Promise<string[]> {
  const codes: string[] = []
  let cursor: string | undefined
  do {
    const page = await env.SETTINGS.list({ prefix: 'w:', cursor })
    for (const key of page.keys) {
      const record = await env.SETTINGS.get<WatchRecord>(key.name, 'json')
      if (record && record.subs.length > 0) codes.push(key.name.slice(2))
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

  // 기록을 먼저 모두 읽어 이번 분에 볼 종목을 모은다 — 여러 코드가 같은 종목을 봐도 한 번만 조회한다.
  const entries: Entry[] = []
  for (const code of codes) {
    const key = `w:${code}`
    const record = await env.SETTINGS.get<WatchRecord>(key, 'json')
    // 구독이 없으면 보낼 곳이 없다 — 설정은 읽지 않는다.
    if (!record || record.subs.length === 0) continue
    const watch = await readWatch(env, code)
    if (watch) entries.push({ key, record, watch, ...unackedFired(record, watch) })
  }
  if (entries.length === 0) return

  const budget = newBudget()
  const now = Date.now()
  // 이번 분에 볼 지표 봉 묶음(INDICATOR_FEEDS_PER_RUN 개까지, 분마다 돌아가며). 이번 봉에 이미 울린 봉마다 알림은 빼고 고른다.
  const specs = pickFeeds(
    entries.flatMap(({ record, watch, firedIds }) =>
      watch.indicators.filter((a) => {
        const bar = dueBar(a, now)
        return !firedIds.includes(a.id) && bar !== null && !alreadyPushed(a, record.barMarks, bar)
      }),
    ),
    Math.floor(now / MINUTE_MS),
  )
  const symbols = entries.flatMap(({ watch, firedIds }) =>
    [...watch.alerts, ...watch.lines.filter((l) => l.mode !== 'time')]
      .filter((w) => !firedIds.includes(w.id))
      .map((w) => w.symbol),
  )
  // 이동 % 알림은 그 시간 창만큼의 1분봉이 든다(종목마다 가장 긴 창).
  const need = barsNeeded(entries.flatMap(({ watch, firedIds }) => watch.alerts.filter((a) => !firedIds.includes(a.id))))
  // 가격 시세가 봉 조회를 다 써 지표 봉이 영영 밀리지 않게 그 몫을 남긴다(넘는 가격 종목은 현재가로 본다).
  const quotes = await loadQuotes(symbols, budget, specs.length, (s) => need.get(s) ?? 0)

  // 1단계: 가격·선 알림 판정·발송·기록을 먼저 끝낸다 — 지표 계산 중에 CPU 한도로 호출이 끊겨도 이 결과는 남는다.
  const stages: { record: WatchRecord; wrote: boolean }[] = []
  for (const entry of entries) stages.push(await checkPrices(env, entry, quotes, budget))
  if (specs.length === 0) return

  // 2단계: 지표 알림. 봉을 읽고 계산해, 울린 것이 있을 때만 한 번 더 적는다.
  const feeds = await loadFeeds(specs, budget)
  for (const [i, entry] of entries.entries()) await checkIndicators(env, entry, stages[i], feeds, budget)
}

/**
 * 푸시를 보낸다. 외부 요청 한도를 넘길 알림은 보내지 않는다 — 발동으로 적지 않고 다음 분으로 미룬다(기준도 그대로 둔다).
 * 보낸 알림과 죽은 구독(404/410 — 다음부터 뺀다)을 돌려준다.
 */
async function deliver(
  env: Env,
  subs: PushSubscription[],
  hits: Hit[],
  budget: Budget,
): Promise<{ sent: Hit[]; dead: Set<string> }> {
  const sent: Hit[] = []
  const dead = new Set<string>()
  for (const hit of hits) {
    const targets = subs.filter((s) => !dead.has(s.endpoint))
    if (budget.used + targets.length > SUBREQUEST_MAX) continue
    sent.push(hit)
    for (const sub of targets) {
      budget.used++
      // 한 기기의 발송 실패(네트워크 등)가 나머지 기기와 발동 기록을 막지 않게 한다.
      // 기록이 안 남으면 매분 같은 알림이 다시 울린다.
      try {
        const r = await sendPush(sub, hit.payload, {
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
          subject: env.VAPID_SUBJECT || 'mailto:noreply@example.com',
        })
        if (!r.ok && (r.status === 404 || r.status === 410)) dead.add(sub.endpoint)
      } catch (e) {
        console.error('push failed', sub.endpoint, e)
      }
    }
  }
  return { sent, dead }
}

/** 가격 알림 푸시. 가격 하나 조건은 넘어간 쪽 화살표와 가격, 채널·이동 % 조건은 조건 설명을 제목으로 한다. */
function priceHit(alert: PriceAlert, quote: Quote, price: number, target: string | null): Hit {
  const kind = alert.kind ?? 'cross'
  const title =
    isChannelKind(kind) || isMoveKind(kind)
      ? `${alert.symbol} ${describePriceAlert(alert, formatPrice)}`
      : `${alert.symbol} ${target === 'down' ? '▼' : '▲'} ${alert.price}`
  const note = priceNote(quote, price)
  const message = alert.message?.trim().slice(0, MESSAGE_MAX)
  return pushHit(alert.id, alert.symbol, title, message ? `${message}\n${note}` : note, `price-${alert.id}`, message || title)
}

/** 선 알림 푸시. 수직선(시각 알림)은 가격 줄 대신 시각이 됐다고 적는다. */
function lineHit(line: WatchLine, note: string): Hit {
  const title = `${line.symbol} ${describeLineAlert(line.geometry, line.opts)}`
  const message = line.opts?.message?.trim().slice(0, MESSAGE_MAX)
  return pushHit(line.id, line.symbol, title, message ? `${message}\n${note}` : note, `line-${line.id}`, message || title)
}

/**
 * 1단계: 가격·선 알림을 판정해 보내고, 확인된 발동·감시에서 빠진 항목의 판정·봉 기록 정리와 함께 적는다.
 * 바뀐 것이 없으면 쓰지 않는다. 2단계가 이어 쓸 지금 기록과 적었는지를 돌려준다.
 */
async function checkPrices(
  env: Env,
  entry: Entry,
  quotes: Map<string, Quote>,
  budget: Budget,
): Promise<{ record: WatchRecord; wrote: boolean }> {
  const { key, record, watch } = entry
  const fired = new Set(entry.firedIds)
  const now = Date.now()
  // 울렸고 아직 확인되지 않은 것은 판정하지 않는다(「매번」 알림은 firedIds 에 들어가지 않는다).
  const alerts = watch.alerts.filter((a) => !fired.has(a.id))
  const lines = watch.lines.filter((l) => !fired.has(l.id))
  // 확인된 발동을 뺐으면 적는다.
  let dirty =
    entry.firedIds.length !== record.firedIds.length ||
    Object.keys(entry.acks).length !== Object.keys(record.acks ?? {}).length
  // 감시에서 빠졌거나(울림·끔·지움·만료) 고치고 옮겨 키가 바뀐 항목의 판정 기록은 지워 적는다 — 옛 기록으로 곧바로 울리지 않게.
  const { marks: ruleMarks, pruned: rulePruned } = liveMarks(record.ruleMarks, [
    ...alerts.map(alertKey),
    ...lines.filter((l) => l.mode !== 'time').map(lineKey),
  ])
  // 봉 기록은 켜진 봉마다·봉 마감 시 지표 알림 것만 남긴다.
  const { marks: barMarks, pruned: barPruned } = liveMarks(
    record.barMarks,
    watch.indicators.filter((a) => a.trigger !== 'once').map((a) => a.id),
  )
  if (rulePruned || barPruned) dirty = true

  const hits: Hit[] = []
  for (const alert of alerts) {
    const quote = quotes.get(alert.symbol)
    if (!quote) continue
    const ak = alertKey(alert)
    const verdict = judgePrice(alert, ruleMarks[ak], quote.bars)
    if (!verdict) continue
    if (!('fire' in verdict)) {
      ruleMarks[ak] = verdict.mark
      dirty = true
      continue
    }
    const hit = priceHit(alert, quote, verdict.fire.price, verdict.fire.target)
    hits.push(verdict.mark ? { ...hit, mark: { key: ak, value: verdict.mark } } : hit)
  }

  for (const line of lines) {
    if (line.mode === 'time') {
      // 수직선: 감시 시작 뒤에 그 시각이 지났으면 한 번 울린다(시세가 필요 없다).
      if (timeReached(line, now)) hits.push(lineHit(line, '설정한 시각이 됐습니다'))
      continue
    }
    const quote = quotes.get(line.symbol)
    if (!quote) continue
    const lk = lineKey(line)
    const verdict = judgeLine(line, ruleMarks[lk], quote.bars, watch.at)
    if (!verdict) continue
    if (!('fire' in verdict)) {
      ruleMarks[lk] = verdict.mark
      dirty = true
      continue
    }
    const hit = lineHit(line, priceNote(quote, verdict.fire.price))
    hits.push(verdict.mark ? { ...hit, mark: { key: lk, value: verdict.mark } } : hit)
  }

  const { sent, dead } = await deliver(env, record.subs, hits, budget)
  for (const hit of sent) {
    if (hit.mark) ruleMarks[hit.mark.key] = hit.mark.value
    else fired.add(hit.id)
  }
  if (sent.length > 0) dirty = true
  // 울린 한 번만 알림은 판정 기록을 지운다 — 확인된 뒤 다시 켜면 그때 새로 시작한다.
  for (const alert of alerts) if (fired.has(alert.id)) delete ruleMarks[alertKey(alert)]
  for (const line of lines) if (fired.has(line.id)) delete ruleMarks[lineKey(line)]

  // 예전 기록의 기기별 목록·옛 판정 기록은 여기서 빠진다. 키 순서는 /api/push 와 같게 둔다(같은 내용이면 다시 쓰지 않게).
  const fires = withFires(record.fires, sent, now)
  const next: WatchRecord = {
    subs: record.subs.filter((s) => !dead.has(s.endpoint)),
    ruleMarks,
    barMarks,
    firedIds: [...fired],
    ...(Object.keys(entry.acks).length > 0 ? { acks: entry.acks } : {}),
    ...(fires && fires.length > 0 ? { fires } : {}),
  }
  // 바뀐 것이 없으면 아무것도 쓰지 않는다 — 무료 한도의 대부분이 여기서 아껴진다.
  if (dirty) await env.SETTINGS.put(key, JSON.stringify(next))
  return { record: next, wrote: dirty }
}

/**
 * 2단계: 이번 분에 읽은 지표 봉(feeds)으로 지표 알림을 판정해 보낸다. 봉을 못 읽은(차례가 아닌) 알림은 다음 차례에 본다.
 * 보낸 것이 있을 때만 1단계가 남긴 기록에 발동('한 번만')·봉 기록('봉마다'·'봉 마감 시')을 더해 적는다.
 */
async function checkIndicators(
  env: Env,
  entry: Entry,
  { record, wrote }: { record: WatchRecord; wrote: boolean },
  feeds: Map<string, Feed>,
  budget: Budget,
): Promise<void> {
  const fired = new Set(record.firedIds)
  const barMarks = { ...record.barMarks }
  const now = Date.now()
  const hits: Hit[] = []
  for (const alert of entry.watch.indicators) {
    if (fired.has(alert.id)) continue
    // 이번 분에 읽은 묶음이 아니거나, 이 알림에 모자란 봉 수로 읽었으면(고른 뒤에 봉이 바뀌어 새로 볼 차례가 된 알림) 다음 차례에 본다.
    const feed = feeds.get(feedKey(alert))
    if (!feed || historyFor(alert.indicator) > feed.bars) continue
    // 이번 봉에 이미 울린 봉마다 알림은 계산하지 않는다.
    const due = dueBar(alert, now)
    if (due === null || alreadyPushed(alert, barMarks, due)) continue
    const judged = judgeIndicatorAlert(alert, feed, now)
    if (!judged?.met || alreadyPushed(alert, barMarks, judged.bar)) continue
    const hit = indicatorHit(alert, judged.value, feed.source)
    hits.push(alert.trigger === 'once' ? hit : { ...hit, bar: judged.bar })
  }
  if (hits.length === 0) return

  const { sent, dead } = await deliver(env, record.subs, hits, budget)
  if (sent.length === 0) return
  for (const hit of sent) {
    if (hit.bar === undefined) fired.add(hit.id)
    else barMarks[hit.id] = hit.bar
  }
  // Promise.withResolvers 는 ES2024 라 워커 타입 검사(es2022)에 없어 생성자 꼴로 기다린다.
  if (wrote) await new Promise((resolve) => setTimeout(resolve, KEY_WRITE_GAP_MS))
  await env.SETTINGS.put(
    entry.key,
    JSON.stringify({
      ...record,
      subs: record.subs.filter((s) => !dead.has(s.endpoint)),
      barMarks,
      firedIds: [...fired],
      fires: withFires(record.fires, sent, now),
    } satisfies WatchRecord),
  )
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
      const watch = await readWatch(env, code)
      const items = watch ? [...watch.alerts, ...watch.lines.filter((l) => l.mode !== 'time')] : []
      const indicators = watch?.indicators ?? []
      // 크론과 같이 이번 분의 차례인 묶음만 읽는다(CPU 한도). 다른 묶음은 ?turn=<분 번호> 로 본다.
      const now = Date.now()
      const turn = Number(url.searchParams.get('turn') ?? Math.floor(now / MINUTE_MS))
      const specs = pickFeeds(indicators, Number.isFinite(turn) ? turn : 0)
      const budget = newBudget()
      const need = barsNeeded(watch?.alerts ?? [])
      const quotes = await loadQuotes(items.map((w) => w.symbol), budget, specs.length, (s) => need.get(s) ?? 0)
      const feeds = await loadFeeds(specs, budget)
      return Response.json({
        subs: rec?.subs.length ?? 0,
        watched: ((await env.SETTINGS.get<string[]>(INDEX_KEY, 'json')) ?? []).includes(code),
        // 감시 목록을 뽑은 동기화 설정(s:<code>)의 저장 시각. null 이면 설정이 없거나 깨졌다.
        settingsAt: watch?.at ?? null,
        // 동기화 설정에서 뽑은 감시 목록(켜졌고 만료되지 않은 것). 선은 since(감시 시작)·mode(level·band·time) 포함.
        alerts: watch?.alerts ?? [],
        lines: watch?.lines ?? [],
        // 판정 기록(키 alertKey·lineKey) — target: 기다리는 목표(null = 아직 안 걸림), firedAt: 「매번」의 마지막 발동.
        ruleMarks: rec?.ruleMarks ?? {},
        barMarks: rec?.barMarks ?? {},
        firedIds: rec?.firedIds ?? [],
        acks: rec?.acks ?? {},
        fires: rec?.fires ?? [],
        // 판정에 쓰는 시세(출처와 1분봉).
        quotes: Object.fromEntries(quotes),
        // 켜진 지표 알림과 지금 봉으로 계산한 값. feed 가 null 이면 봉을 읽지 않았다(이번 분 차례가 아님·요청 한도·gate 에 없는 종목 등).
        // judged: 판정한 봉(시작 시각, 초)·지표 값·조건 충족. null 이면 판정할 봉이나 값이 없다.
        indicators: indicators.map((a) => {
          const feed = feeds.get(feedKey(a))
          return {
            id: a.id,
            symbol: a.symbol,
            interval: a.interval,
            trigger: a.trigger,
            describe: describeIndicatorAlert(a),
            createdAt: a.createdAt,
            // 이 알림에 드는 봉 수(historyFor)와 묶음에서 읽은 봉.
            history: historyFor(a.indicator),
            feed: feed ? { source: feed.source, candles: feed.candles.length, last: feed.candles.at(-1) } : null,
            judged: feed ? judgeIndicatorAlert(a, feed, now) : null,
            // 감시기 상태: 울리고 아직 확인되지 않음(once), 마지막으로 푸시한 봉(perBar·perBarClose), 앱이 마지막으로 울린 봉.
            fired: rec?.firedIds.includes(a.id) ?? false,
            pushedBar: rec?.barMarks?.[a.id] ?? null,
            appLastBar: a.lastBar ?? null,
            dueBar: dueBar(a, now),
          }
        }),
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
