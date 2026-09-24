/**
 * 모의 선물거래 훅 — PaperApi 를 구현한다. App 이 결과를 PaperContext 로 내려 준다.
 *
 * - 계좌는 ref(최신)와 state(렌더용)로 함께 들고, 바뀔 때마다 localStorage 에 저장한다.
 * - 시세는 결합 웹소켓 하나(체결 + 마크가@1s)로 받아 엔진에 흘려 지정가·조건부·TP/SL·강제 청산을 처리한다.
 * - 앱을 꺼 둔 동안(또는 재연결·탭 복귀)에는 REST 로 그 구간의 체결·봉·펀딩을 되짚는다.
 * - 동기화 코드가 있으면 D1 서버와 낙관적 잠금으로 계좌를 공유하고, 없으면 이 기기(localStorage)만 쓴다.
 */

import { useEffect, useRef, useState } from 'react'
import {
  createAccount,
  symbolsInUse,
  onTrade,
  onMark,
  onBar,
  applyFunding,
  markChecked,
  positionView,
  summarize,
  estimateOrder,
  maxOpenQty as engineMaxOpenQty,
} from '../lib/paper/engine'
import { applyCommand, type Command } from '../lib/paper/commands'
import { loadRules } from '../lib/paper/rules'
import {
  fetchAggTrades,
  fetchBookTicker,
  fetchFundingRates,
  fetchKlines,
  fetchMarkKlines,
  paperStreamUrl,
  rateLimitedUntil,
  RateLimitError,
  type AggTradeEvent,
  type Candle,
  type CombinedStreamMessage,
  type Interval,
  type MarkPriceEvent,
} from '../lib/binance'
import { ACTION_LABEL, fmtPrice, fmtQty, fmtUsdt, SIDE_LABEL } from '../components/trade/format'
import type { SymbolInfo } from '../lib/symbols'
import {
  DEFAULT_START_BALANCE,
  type AccountSummary,
  type Bar,
  type EngineEvent,
  type FundingEvent,
  type MarketSnap,
  type OrderEstimate,
  type PaperAccount,
  type PaperApi,
  type PaperLive,
  type PaperLiveStore,
  type PaperQuote,
  type PaperSyncMode,
  type PaperSyncStatus,
  type PositionView,
  type RulesOf,
  type SymbolRules,
} from '../lib/paper/types'

export interface UsePaperTradingOptions {
  /** 동기화 코드. 비어 있으면 이 기기(localStorage)만 쓴다. */
  code: string
  symbols: SymbolInfo[]
  /** 시스템 알림. 표시했으면 true. */
  notify: (title: string, body: string, tag?: string) => boolean
  toast: (message: string) => void
  displayName: (symbol: string) => string
}

const LOCAL_KEY = 'trading.paper.v1'
const BACKUP_KEY = 'trading.paper.backup.v1'
const OFFLINE_MSG = '서버에 연결할 수 없어 이 기기에만 저장합니다'
const SAVE_DEBOUNCE_MS = 600
const POLL_MS = 8000
const LIVE_MS = 250
const FUNDING_DELAY_MS = 15000
/** 되짚기 요청 간 최소 간격 — 차단을 피한다. */
const REQ_SPACING_MS = 150
const MINUTE = 60_000
/** 이보다 오래 자리를 비웠을 때만 되짚는다(수 초 오차는 무시). */
const CATCHUP_MIN_GAP = 2000
/** pagehide 때 checkedAt 이 이만큼 앞섰으면 서버에 마지막 저장을 시도한다. */
const HIDE_SAVE_GAP = 5 * MINUTE
/** 되짚는 동안 쌓아 둘 실시간 시세 수 상한(되짚기는 보통 몇 초). */
const MAX_DEFERRED = 50_000

/** 엔진에 넣을 실시간 시세 한 건. other = 체결이면 그때의 마크가, 마크면 그때의 최근 체결가. */
interface LiveStep {
  kind: 'trade' | 'mark'
  symbol: string
  price: number
  at: number
  other?: number
}

interface Persisted {
  code: string
  version: number
  account: PaperAccount
  pending: Command[]
}

interface ServerResponse {
  version?: number
  state?: PaperAccount
  same?: boolean
  updatedAt?: number
  error?: string
}

const INTERVAL_MS: Record<Interval, number> = {
  '1m': MINUTE,
  '3m': 3 * MINUTE,
  '5m': 5 * MINUTE,
  '15m': 15 * MINUTE,
  '30m': 30 * MINUTE,
  '1h': 60 * MINUTE,
  '2h': 120 * MINUTE,
  '4h': 240 * MINUTE,
  '6h': 360 * MINUTE,
  '8h': 480 * MINUTE,
  '12h': 720 * MINUTE,
  '1d': 1440 * MINUTE,
  '3d': 4320 * MINUTE,
  '1w': 10080 * MINUTE,
  '1M': 43200 * MINUTE,
}

function loadLocal(): Persisted | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Persisted
    if (!p.account || p.account.v !== 1) return null
    return { code: p.code ?? '', version: p.version ?? 0, account: p.account, pending: Array.isArray(p.pending) ? p.pending : [] }
  } catch {
    return null
  }
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** 되짚기 봉 주기 — 창이 길수록 성긴 봉을 쓴다. */
function catchUpInterval(windowMs: number): Interval {
  if (windowMs <= 2 * 86_400_000) return '1m'
  if (windowMs <= 20 * 86_400_000) return '15m'
  return '1h'
}

export function usePaperTrading(opts: UsePaperTradingOptions): PaperApi {
  const optsRef = useRef(opts)
  optsRef.current = opts

  const initialRef = useRef<Persisted | null | undefined>(undefined)
  if (initialRef.current === undefined) initialRef.current = loadLocal()
  const initial = initialRef.current

  const [account, setAccount] = useState<PaperAccount>(
    () => initial?.account ?? createAccount(DEFAULT_START_BALANCE, Date.now()),
  )
  const accountRef = useRef(account)

  const [sync, setSync] = useState<{ mode: PaperSyncMode; status: PaperSyncStatus; message: string }>(() => ({
    mode: opts.code.trim() ? 'server' : 'local',
    status: 'idle',
    message: '',
  }))
  const [catchingUp, setCatchingUp] = useState(false)
  const [, setRulesVersion] = useState(0)
  const [, setWatchVersion] = useState(0)

  const versionRef = useRef(initial && initial.code === opts.code.trim() ? initial.version : 0)
  const pendingRef = useRef<Command[]>(initial && initial.code === opts.code.trim() ? initial.pending : [])
  const modeRef = useRef<PaperSyncMode>(opts.code.trim() ? 'server' : 'local')
  const savedCheckedAtRef = useRef(accountRef.current.checkedAt)

  const rulesMapRef = useRef(new Map<string, SymbolRules>())
  const rulesLoadingRef = useRef(new Set<string>())
  const quotesRef = useRef<Record<string, PaperQuote>>({})
  const watchedRef = useRef(new Map<string, number>())
  const lastNextFundingRef = useRef(new Map<string, number>())
  const fundingTimerRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const catchUpRunningRef = useRef(false)
  const lastReqRef = useRef(0)
  const deferredRef = useRef<LiveStep[]>([])

  // 시세로 바뀌는 파생 값 저장소.
  const liveRef = useRef<PaperLive>({
    quotes: {},
    summary: {
      equity: accountRef.current.balance,
      balance: accountRef.current.balance,
      upl: 0,
      available: accountRef.current.balance,
      usedMargin: 0,
      frozen: 0,
      maintenance: 0,
      marginRatio: null,
    } satisfies AccountSummary,
    positions: {},
  })
  const listenersRef = useRef(new Set<() => void>())
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastLiveRef = useRef(0)
  const storeRef = useRef<PaperLiveStore | null>(null)
  if (!storeRef.current) {
    storeRef.current = {
      get: () => liveRef.current,
      subscribe: (l) => {
        listenersRef.current.add(l)
        return () => {
          listenersRef.current.delete(l)
        }
      },
    }
  }

  /* ── 시세·규칙 헬퍼 ─────────────────────────────────────────── */

  const rulesOf: RulesOf = (symbol) => rulesMapRef.current.get(symbol) ?? null

  function infoOf(symbol: string): SymbolInfo | undefined {
    return optsRef.current.symbols.find((s) => s.symbol === symbol)
  }

  function ensureRules(symbol: string): void {
    if (rulesMapRef.current.has(symbol) || rulesLoadingRef.current.has(symbol)) return
    rulesLoadingRef.current.add(symbol)
    void loadRules(symbol, infoOf(symbol)).then((r) => {
      rulesMapRef.current.set(symbol, r)
      rulesLoadingRef.current.delete(symbol)
      setRulesVersion((v) => v + 1)
      markLiveDirty()
    })
  }

  function buildMarks(): Record<string, number> {
    const marks: Record<string, number> = {}
    for (const [sym, q] of Object.entries(quotesRef.current)) {
      if (Number.isFinite(q.mark)) marks[sym] = q.mark
    }
    return marks
  }

  function snapOf(symbol: string): MarketSnap | null {
    const q = quotesRef.current[symbol]
    if (!q || !Number.isFinite(q.last)) return null
    return { last: q.last, mark: Number.isFinite(q.mark) ? q.mark : q.last, at: q.at }
  }

  async function snapForMarket(symbol: string): Promise<MarketSnap | null> {
    try {
      const bt = await fetchBookTicker(symbol)
      const q = quotesRef.current[symbol]
      const mid = (bt.bid + bt.ask) / 2
      return { last: q?.last ?? mid, mark: q?.mark ?? mid, bid: bt.bid, ask: bt.ask, at: bt.time }
    } catch {
      return snapOf(symbol)
    }
  }

  /* ── 라이브 스토어 ──────────────────────────────────────────── */

  function recompute(): void {
    const acct = accountRef.current
    const marks = buildMarks()
    const positions: Record<string, PositionView> = {}
    for (const pos of acct.positions) positions[pos.id] = positionView(acct, pos, marks, rulesOf)
    liveRef.current = { quotes: quotesRef.current, summary: summarize(acct, marks, rulesOf), positions }
    for (const l of listenersRef.current) l()
  }

  function markLiveDirty(): void {
    const now = Date.now()
    const since = now - lastLiveRef.current
    if (since >= LIVE_MS) {
      lastLiveRef.current = now
      recompute()
    } else if (liveTimerRef.current === null) {
      liveTimerRef.current = setTimeout(() => {
        liveTimerRef.current = null
        lastLiveRef.current = Date.now()
        recompute()
      }, LIVE_MS - since)
    }
  }

  /* ── 저장(로컬·서버) ────────────────────────────────────────── */

  function saveLocal(): void {
    try {
      localStorage.setItem(
        LOCAL_KEY,
        JSON.stringify({
          code: optsRef.current.code,
          version: versionRef.current,
          account: accountRef.current,
          pending: pendingRef.current,
        } satisfies Persisted),
      )
    } catch {
      /* 저장 실패해도 이번 세션은 동작한다 */
    }
  }

  function scheduleSave(): void {
    if (modeRef.current !== 'server') return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void doSave()
    }, SAVE_DEBOUNCE_MS)
  }

  async function doSave(): Promise<void> {
    if (modeRef.current !== 'server') return
    const code = optsRef.current.code.trim()
    if (!code) return
    const baseVersion = versionRef.current
    const state = accountRef.current
    const pendingCount = pendingRef.current.length
    const body = JSON.stringify({ baseVersion, state })
    setSync((s) => ({ ...s, status: 'saving' }))

    let res: Response
    try {
      res = await fetch(`/api/paper?code=${encodeURIComponent(code)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    } catch {
      setSync({ mode: 'server', status: 'offline', message: OFFLINE_MSG })
      return
    }
    if (res.status === 404) {
      setSync({ mode: 'server', status: 'offline', message: OFFLINE_MSG })
      return
    }
    let data: ServerResponse
    try {
      data = (await res.json()) as ServerResponse
    } catch {
      setSync({ mode: 'server', status: 'offline', message: OFFLINE_MSG })
      return
    }
    if (res.ok && typeof data.version === 'number') {
      versionRef.current = data.version
      pendingRef.current = pendingRef.current.slice(pendingCount)
      savedCheckedAtRef.current = state.checkedAt
      saveLocal()
      setSync({ mode: 'server', status: 'idle', message: '' })
      if (pendingRef.current.length) scheduleSave()
      return
    }
    if (res.status === 409 && data.state && typeof data.version === 'number') {
      await handleConflict(data.state, data.version)
      return
    }
    setSync({ mode: 'server', status: 'error', message: data.error ?? '저장에 실패했습니다' })
  }

  /** 서버 상태를 그대로 받아들이고 그 시점부터 되짚는다(대기 명령 없음). */
  async function adopt(state: PaperAccount, version: number): Promise<void> {
    accountRef.current = state
    versionRef.current = version
    savedCheckedAtRef.current = state.checkedAt
    setAccount(state)
    saveLocal()
    markLiveDirty()
    await runCatchUp()
  }

  /** 충돌: 서버 상태를 받아 되짚은 뒤 대기 명령을 순서대로 다시 적용하고 저장한다. */
  async function handleConflict(state: PaperAccount, version: number): Promise<void> {
    accountRef.current = state
    versionRef.current = version
    setAccount(state)
    markLiveDirty()
    await runCatchUp()
    const still: Command[] = []
    for (const cmd of pendingRef.current) {
      const r = applyCommand(accountRef.current, cmd, rulesOf)
      if ('error' in r) {
        optsRef.current.toast('다른 기기에서 먼저 바뀌어 적용하지 못했습니다: ' + r.error)
        continue
      }
      accountRef.current = r.account
      still.push(cmd)
      if (r.events.length) handleEvents(r.events)
    }
    pendingRef.current = still
    setAccount(accountRef.current)
    saveLocal()
    markLiveDirty()
    await doSave()
  }

  async function poll(): Promise<void> {
    if (modeRef.current !== 'server' || document.hidden) return
    const code = optsRef.current.code.trim()
    if (!code) return
    let data: ServerResponse
    try {
      const res = await fetch(`/api/paper?code=${encodeURIComponent(code)}&v=${versionRef.current}`)
      if (res.status === 404) {
        setSync({ mode: 'server', status: 'offline', message: OFFLINE_MSG })
        return
      }
      data = (await res.json()) as ServerResponse
    } catch {
      return
    }
    if (data.same) {
      // 폴링은 마운트 때 만든 타이머에서 돈다 — 상태는 함수형 갱신으로 최신 값을 본다.
      setSync((s) => (s.status === 'offline' ? { mode: 'server', status: 'idle', message: '' } : s))
      return
    }
    if (typeof data.version === 'number' && data.version > versionRef.current && data.state) {
      if (pendingRef.current.length === 0) await adopt(data.state, data.version)
      else await handleConflict(data.state, data.version)
    }
  }

  /* ── 알림 ───────────────────────────────────────────────────── */

  function notifyAndToast(title: string, body: string, tag: string): void {
    optsRef.current.notify(title, body, tag)
    optsRef.current.toast(body)
  }

  function handleEvents(events: EngineEvent[]): void {
    for (const ev of events) {
      if (ev.kind === 'canceled' || ev.kind === 'funding') continue
      const name = optsRef.current.displayName
      if (ev.kind === 'triggered') {
        const o = ev.order
        notifyAndToast('조건부 주문 발동', `${name(o.symbol)} ${SIDE_LABEL[o.side]} 조건부 주문 발동`, `paper-${o.id}`)
        continue
      }
      const f = ev.fill
      const info = infoOf(f.symbol)
      const tick = info?.tickSize && info.tickSize > 0 ? info.tickSize : 0.01
      const step = info?.stepSize && info.stepSize > 0 ? info.stepSize : 0.001
      const priceStr = fmtPrice(f.price, tick)
      const qtyStr = fmtQty(f.qty, step)
      const nm = name(f.symbol)
      if (ev.kind === 'liquidation') {
        notifyAndToast(
          '강제 청산',
          `${nm} ${SIDE_LABEL[f.side]} 강제 청산 ${qtyStr} @ ${priceStr} (${fmtUsdt(Math.abs(f.pnl))} USDT 손실)`,
          `paper-${f.id}`,
        )
        continue
      }
      let title = '체결'
      let typeLabel = '시장가'
      if (f.reason === 'tp') {
        title = '익절 체결'
        typeLabel = '익절'
      } else if (f.reason === 'sl') {
        title = '손절 체결'
        typeLabel = '손절'
      } else if (f.reason === 'order') {
        typeLabel = '지정가'
      }
      notifyAndToast(
        title,
        `${nm} ${SIDE_LABEL[f.side]} ${ACTION_LABEL[f.action]} ${qtyStr} @ ${priceStr} (${typeLabel})`,
        `paper-${f.id}`,
      )
    }
  }

  /* ── 되짚기(catch-up) ───────────────────────────────────────── */

  /** 요청 간격을 벌리고, 쿨다운 중이면 즉시 중단(상위에서 재개 예약). */
  async function space(): Promise<void> {
    const until = rateLimitedUntil()
    if (until) throw new RateLimitError(until)
    const wait = REQ_SPACING_MS - (Date.now() - lastReqRef.current)
    if (wait > 0) await delay(wait)
    lastReqRef.current = Date.now()
  }

  /** [start, end) 구간의 집계 체결을 시각 순서로 엔진에 흘린다. */
  async function replayTrades(symbol: string, start: number, end: number, collected: EngineEvent[]): Promise<void> {
    if (end <= start) return
    let fromId: number | undefined
    for (;;) {
      await space()
      const trades = await fetchAggTrades(symbol, start, end, fromId)
      if (trades.length === 0) break
      let stop = false
      for (const t of trades) {
        if (t.time >= end) {
          stop = true
          break
        }
        const mark = quotesRef.current[symbol]?.mark
        const res = onTrade(accountRef.current, symbol, t.price, t.time, rulesOf, mark)
        accountRef.current = res.account
        if (res.events.length) collected.push(...res.events)
      }
      const last = trades[trades.length - 1]
      if (stop || trades.length < 1000 || last.time >= end) break
      fromId = last.id + 1
    }
  }

  async function catchUpSymbol(symbol: string, from: number, now: number, collected: EngineEvent[]): Promise<void> {
    const firstBoundary = Math.ceil(from / MINUTE) * MINUTE
    const lastBoundary = Math.floor(now / MINUTE) * MINUTE

    // 펀딩 내역을 미리 받아 봉 사이에 시각 순서로 끼워 넣는다(멱등).
    let funding: FundingEvent[] = []
    try {
      await space()
      funding = (await fetchFundingRates(symbol, from, now)).map((r) => ({ time: r.time, rate: r.rate, mark: r.mark }))
    } catch (e) {
      if (e instanceof RateLimitError) throw e
    }
    let fundIdx = 0
    const applyFundingUpTo = (t: number) => {
      const due: FundingEvent[] = []
      while (fundIdx < funding.length && funding[fundIdx].time <= t) due.push(funding[fundIdx++])
      if (due.length) {
        const res = applyFunding(accountRef.current, symbol, due)
        accountRef.current = res.account
        if (res.events.length) collected.push(...res.events)
      }
    }

    // (a) checkedAt ~ 다음 분 경계까지 부분 분봉을 체결로 채운다.
    await replayTrades(symbol, from, Math.min(firstBoundary, now), collected)

    // (b) 완전한 봉 구간(가격봉 + 마크봉)을 시각 순서로 되짚는다.
    //     15분·1시간 봉은 제 경계에 맞춰 있어서, 앞뒤의 어긋난 조각은 1분봉으로 채운다
    //     (안 그러면 앞 조각이 빠지고, 뒤쪽의 아직 안 끝난 봉은 끝나는 시각이 미래라 새 포지션의 updatedAt 이 미래가 된다).
    const replayBars = async (interval: Interval, start: number, end: number) => {
      const barMs = INTERVAL_MS[interval]
      while (start < end) {
        const chunkEnd = Math.min(end, start + barMs * 1500)
        await space()
        const kl = await fetchKlines(symbol, interval, 1500, undefined, chunkEnd - 1, start)
        await space()
        const mk = await fetchMarkKlines(symbol, interval, start, chunkEnd - 1, 1500)
        if (kl.length === 0) break
        const markByTime: Record<number, Candle> = {}
        for (const m of mk) markByTime[m.time] = m
        for (const c of kl) {
          const openTime = c.time * 1000
          if (openTime < start || openTime + barMs > end) continue
          applyFundingUpTo(openTime)
          const bar: Bar = { openTime, closeTime: openTime + barMs - 1, open: c.open, high: c.high, low: c.low, close: c.close }
          const m = markByTime[c.time]
          const markBar: Bar | null = m
            ? { openTime, closeTime: openTime + barMs - 1, open: m.open, high: m.high, low: m.low, close: m.close }
            : null
          const res = onBar(accountRef.current, symbol, bar, markBar, rulesOf, buildMarks())
          accountRef.current = res.account
          if (res.events.length) collected.push(...res.events)
        }
        const nextStart = kl[kl.length - 1].time * 1000 + barMs
        if (nextStart <= start) break
        start = nextStart
      }
    }
    if (firstBoundary < lastBoundary) {
      const interval = catchUpInterval(now - from)
      const barMs = INTERVAL_MS[interval]
      const coarseStart = Math.ceil(firstBoundary / barMs) * barMs
      const coarseEnd = Math.floor(lastBoundary / barMs) * barMs
      if (barMs === MINUTE || coarseStart >= coarseEnd) {
        await replayBars('1m', firstBoundary, lastBoundary)
      } else {
        await replayBars('1m', firstBoundary, coarseStart)
        await replayBars(interval, coarseStart, coarseEnd)
        await replayBars('1m', coarseEnd, lastBoundary)
      }
    }

    // (c) 마지막 분 경계 ~ 지금까지 부분 분봉을 체결로 채운다.
    applyFundingUpTo(now)
    await replayTrades(symbol, lastBoundary, now, collected)
    applyFundingUpTo(now)
  }

  async function runCatchUp(): Promise<void> {
    if (catchUpRunningRef.current) return
    catchUpRunningRef.current = true
    setCatchingUp(true)
    const collected: EngineEvent[] = []
    try {
      const from = accountRef.current.checkedAt
      const now = Date.now()
      const symbols = symbolsInUse(accountRef.current)
      for (const s of symbols) {
        if (!rulesMapRef.current.has(s)) {
          rulesMapRef.current.set(s, await loadRules(s, infoOf(s)))
          setRulesVersion((v) => v + 1)
        }
      }
      if (from > 0 && now - from > CATCHUP_MIN_GAP) {
        for (const s of symbols) await catchUpSymbol(s, from, now, collected)
      }
      accountRef.current = markChecked(accountRef.current, now)
      setAccount(accountRef.current)
      saveLocal()
      // 되짚어 달라진 게 있거나(체결·펀딩) 반영 시각이 많이 앞섰을 때만 서버에 올린다. 늘 올리면 두 기기가
      // 서로의 저장을 받아(→ 되짚기 → 저장) 몇 초마다 끝없이 주고받는다. 다시 되짚는 것은 멱등이라 괜찮다.
      if (collected.length > 0 || accountRef.current.checkedAt - savedCheckedAtRef.current >= HIDE_SAVE_GAP) scheduleSave()
      markLiveDirty()
      if (collected.length) handleEvents(collected)
    } catch (e) {
      // 되짚기 도중 실패: 여기까지 반영한 것은 남기고, 쿨다운이면 나중에 다시 시도(checkedAt 은 그대로).
      setAccount(accountRef.current)
      saveLocal()
      markLiveDirty()
      if (collected.length) handleEvents(collected)
      if (e instanceof RateLimitError) {
        const wait = Math.max(1000, e.until - Date.now())
        setTimeout(() => void runCatchUp(), wait)
      }
    } finally {
      catchUpRunningRef.current = false
      setCatchingUp(false)
      // 되짚는 동안 미뤄 둔 실시간 시세를 이제 순서대로 반영한다(되짚기와 겹친 구간은 엔진이 멱등으로 거른다).
      const queue = deferredRef.current
      deferredRef.current = []
      for (const step of queue) runStep(step)
    }
  }

  /** 시세 한 건을 엔진에 반영한다. 되짚는 중이면 미뤄 둔다 — 새 시세가 옛 시세보다 먼저 판정되면 순서가 뒤집힌다. */
  function runStep(step: LiveStep): void {
    if (catchUpRunningRef.current) {
      if (deferredRef.current.length < MAX_DEFERRED) deferredRef.current.push(step)
      return
    }
    const res =
      step.kind === 'trade'
        ? onTrade(accountRef.current, step.symbol, step.price, step.at, rulesOf, step.other)
        : onMark(accountRef.current, step.symbol, step.price, step.at, rulesOf, step.other, buildMarks())
    accountRef.current = markChecked(res.account, step.at)
    if (res.events.length) {
      setAccount(accountRef.current)
      saveLocal()
      scheduleSave()
      handleEvents(res.events)
    }
  }

  /** 이 종목 포지션의 가장 오래된 펀딩 시각부터 펀딩을 받아 반영한다(멱등). */
  async function syncFunding(symbol: string): Promise<void> {
    const positions = accountRef.current.positions.filter((p) => p.symbol === symbol)
    if (positions.length === 0) return
    const from = Math.min(...positions.map((p) => p.fundingAt || p.openedAt))
    try {
      const rates = await fetchFundingRates(symbol, from, Date.now())
      if (rates.length === 0) return
      const events = rates.map((r) => ({ time: r.time, rate: r.rate, mark: r.mark }))
      const res = applyFunding(accountRef.current, symbol, events)
      if (res.events.length) {
        accountRef.current = res.account
        setAccount(res.account)
        saveLocal()
        scheduleSave()
        markLiveDirty()
      }
    } catch {
      /* 다음 마크 갱신 때 다시 시도한다 */
    }
  }

  function scheduleFunding(symbol: string, nextFundingTime: number): void {
    const prev = lastNextFundingRef.current.get(symbol) ?? 0
    if (nextFundingTime <= prev) return
    lastNextFundingRef.current.set(symbol, nextFundingTime)
    // 첫 마크가 아니고(펀딩이 막 정산돼 다음 시각이 넘어감) 포지션이 있으면 잠시 뒤 펀딩을 받아 온다.
    if (prev === 0) return
    if (!accountRef.current.positions.some((p) => p.symbol === symbol)) return
    if (fundingTimerRef.current.has(symbol)) return
    const id = setTimeout(() => {
      fundingTimerRef.current.delete(symbol)
      void syncFunding(symbol)
    }, FUNDING_DELAY_MS)
    fundingTimerRef.current.set(symbol, id)
  }

  /* ── 스트림 메시지 ──────────────────────────────────────────── */

  function handleStreamMessage(raw: string): void {
    let msg: CombinedStreamMessage<AggTradeEvent | MarkPriceEvent>
    try {
      msg = JSON.parse(raw) as CombinedStreamMessage<AggTradeEvent | MarkPriceEvent>
    } catch {
      return
    }
    const d = msg.data
    if (!d) return
    if (d.e === 'aggTrade') {
      const symbol = d.s
      const price = Number(d.p)
      const at = d.T
      const prev = quotesRef.current[symbol]
      quotesRef.current = {
        ...quotesRef.current,
        [symbol]: {
          last: price,
          mark: prev?.mark ?? price,
          fundingRate: prev?.fundingRate ?? null,
          nextFundingTime: prev?.nextFundingTime ?? null,
          at,
        },
      }
      runStep({ kind: 'trade', symbol, price, at, other: quotesRef.current[symbol].mark })
      markLiveDirty()
    } else if (d.e === 'markPriceUpdate') {
      const symbol = d.s
      const mark = Number(d.p)
      const at = d.E
      const prev = quotesRef.current[symbol]
      quotesRef.current = {
        ...quotesRef.current,
        [symbol]: {
          last: prev?.last ?? mark,
          mark,
          fundingRate: Number(d.r),
          nextFundingTime: d.T,
          at,
        },
      }
      runStep({ kind: 'mark', symbol, price: mark, at, other: prev?.last })
      markLiveDirty()
      scheduleFunding(symbol, d.T)
    }
  }

  /* ── 사용자 동작 ────────────────────────────────────────────── */

  function dispatch(cmd: Command): string | null {
    const res = applyCommand(accountRef.current, cmd, rulesOf)
    if ('error' in res) return res.error
    accountRef.current = res.account
    // 서버에 올리기 전까지만 들고 있으면 된다 — 이 기기에만 저장할 때는 쌓아 둘 까닭이 없다.
    if (modeRef.current === 'server') pendingRef.current = [...pendingRef.current, cmd]
    setAccount(res.account)
    saveLocal()
    scheduleSave()
    if (res.events.length) handleEvents(res.events)
    markLiveDirty()
    return null
  }

  const api: PaperApi = {
    account,
    live: storeRef.current,
    sync,
    catchingUp,
    rules: (symbol) => {
      const r = rulesMapRef.current.get(symbol)
      if (r) return r
      ensureRules(symbol)
      return null
    },
    watch: (symbol) => {
      const m = watchedRef.current
      m.set(symbol, (m.get(symbol) ?? 0) + 1)
      ensureRules(symbol)
      setWatchVersion((v) => v + 1)
      return () => {
        const n = (m.get(symbol) ?? 0) - 1
        if (n <= 0) m.delete(symbol)
        else m.set(symbol, n)
        setWatchVersion((v) => v + 1)
      }
    },
    place: async (req) => {
      const snap = req.type === 'market' ? await snapForMarket(req.symbol) : snapOf(req.symbol)
      if (!snap) return '시세를 아직 받지 못했습니다'
      return dispatch({ kind: 'place', req, snap, marks: buildMarks(), at: Date.now() })
    },
    cancel: async (orderId) => dispatch({ kind: 'cancel', orderId, at: Date.now() }),
    cancelAll: async (symbol) => dispatch({ kind: 'cancelAll', symbol: symbol ?? null, at: Date.now() }),
    amend: async (orderId, patch) => {
      const order = accountRef.current.orders.find((o) => o.id === orderId)
      if (!order) return '주문을 찾을 수 없습니다'
      const snap = snapOf(order.symbol)
      if (!snap) return '시세를 아직 받지 못했습니다'
      return dispatch({ kind: 'amend', orderId, patch, snap, marks: buildMarks(), at: Date.now() })
    },
    close: async (symbol, side, qty) => {
      const snap = await snapForMarket(symbol)
      if (!snap) return '시세를 아직 받지 못했습니다'
      return dispatch({ kind: 'close', symbol, side, qty: qty ?? 0, snap, marks: buildMarks(), at: Date.now() })
    },
    setTpSl: async (symbol, side, tp, sl) => {
      const snap = snapOf(symbol)
      if (!snap) return '시세를 아직 받지 못했습니다'
      return dispatch({ kind: 'setTpSl', symbol, side, tp, sl, snap, marks: buildMarks(), at: Date.now() })
    },
    adjustMargin: async (symbol, side, delta) => {
      const snap = snapOf(symbol)
      if (!snap) return '시세를 아직 받지 못했습니다'
      return dispatch({ kind: 'adjustMargin', symbol, side, delta, snap, marks: buildMarks(), at: Date.now() })
    },
    setSymbolSettings: async (symbol, patch) =>
      dispatch({ kind: 'setSymbolSettings', symbol, patch, snap: snapOf(symbol), marks: buildMarks(), at: Date.now() }),
    reset: async (startBalance) => dispatch({ kind: 'reset', startBalance, at: Date.now() }),
    setFees: async (fees) => dispatch({ kind: 'setFees', fees, at: Date.now() }),
    estimate: (req): OrderEstimate | null => {
      const rules = rulesMapRef.current.get(req.symbol)
      const snap = snapOf(req.symbol)
      if (!rules || !snap) {
        ensureRules(req.symbol)
        return null
      }
      return estimateOrder(accountRef.current, req, snap, rules, buildMarks())
    },
    maxOpenQty: (symbol, side, price) => {
      const rules = rulesMapRef.current.get(symbol)
      const snap = snapOf(symbol)
      if (!rules || !snap) {
        ensureRules(symbol)
        return 0
      }
      return engineMaxOpenQty(accountRef.current, symbol, side, price ?? snap.last, snap, rules, buildMarks())
    },
    report: (message) => optsRef.current.toast(message),
  }

  /* ── 효과 ───────────────────────────────────────────────────── */

  // 동기화 코드가 바뀌면(또는 처음 마운트) 서버와 맞춘다.
  useEffect(() => {
    const code = opts.code.trim()
    modeRef.current = code ? 'server' : 'local'
    if (!code) {
      setSync({ mode: 'local', status: 'idle', message: '' })
      return
    }
    setSync({ mode: 'server', status: 'idle', message: '' })
    let cancelled = false
    void (async () => {
      let data: ServerResponse
      try {
        const res = await fetch(`/api/paper?code=${encodeURIComponent(code)}`)
        if (res.status === 404) {
          if (!cancelled) setSync({ mode: 'server', status: 'offline', message: OFFLINE_MSG })
          return
        }
        data = (await res.json()) as ServerResponse
      } catch {
        if (!cancelled) setSync({ mode: 'server', status: 'offline', message: OFFLINE_MSG })
        return
      }
      if (cancelled) return
      if (!data.state || data.version === 0 || typeof data.version !== 'number') {
        // 서버에 계좌가 없다 → 이 기기 계좌를 baseVersion 0 으로 올려 만든다.
        versionRef.current = 0
        await doSave()
      } else {
        // 서버에 계좌가 있다 → 이전 로컬 계좌를 백업하고 서버 것을 받아들인다.
        try {
          const cur = localStorage.getItem(LOCAL_KEY)
          if (cur) localStorage.setItem(BACKUP_KEY, cur)
        } catch {
          /* 백업 실패는 무시 */
        }
        if (pendingRef.current.length) await handleConflict(data.state, data.version)
        else await adopt(data.state, data.version)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.code])

  // 감시할 종목 집합(포지션·미체결 + 주문창이 보는 종목)이 바뀌면 스트림을 다시 연다.
  const streamSymbols = (() => {
    const set = new Set<string>()
    for (const s of symbolsInUse(account)) set.add(s)
    for (const s of watchedRef.current.keys()) set.add(s)
    return [...set].sort()
  })()
  const streamKey = streamSymbols.join(',')

  useEffect(() => {
    for (const s of streamSymbols) ensureRules(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamKey])

  useEffect(() => {
    if (!streamKey) return
    const symbols = streamKey.split(',')
    let disposed = false
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let idle: ReturnType<typeof setTimeout> | null = null
    let backoff = 1000

    const armIdle = (ws: WebSocket) => {
      if (idle !== null) clearTimeout(idle)
      idle = setTimeout(() => {
        if (!disposed && socket === ws) ws.close()
      }, 20000)
    }

    const connect = () => {
      if (disposed) return
      const ws = new WebSocket(paperStreamUrl(symbols))
      socket = ws
      ws.onopen = () => {
        if (disposed) return
        backoff = 1000
        armIdle(ws)
        void runCatchUp()
      }
      ws.onmessage = (e: MessageEvent<string>) => {
        if (disposed) return
        armIdle(ws)
        handleStreamMessage(e.data)
      }
      ws.onerror = () => ws.close()
      ws.onclose = () => {
        if (disposed) return
        const d = backoff
        backoff = Math.min(backoff * 2, 30000)
        retry = setTimeout(connect, d)
      }
    }
    connect()

    return () => {
      disposed = true
      if (retry !== null) clearTimeout(retry)
      if (idle !== null) clearTimeout(idle)
      if (socket) {
        socket.onopen = null
        socket.onmessage = null
        socket.onerror = null
        socket.onclose = null
        socket.close()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamKey])

  // 서버 폴링(보이는 동안 8초마다) + 탭 복귀/숨김 처리.
  useEffect(() => {
    const flushOnHide = () => {
      saveLocal()
      if (modeRef.current !== 'server') return
      const code = optsRef.current.code.trim()
      if (!code) return
      if (accountRef.current.checkedAt - savedCheckedAtRef.current < HIDE_SAVE_GAP) return
      try {
        void fetch(`/api/paper?code=${encodeURIComponent(code)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseVersion: versionRef.current, state: accountRef.current }),
          keepalive: true,
        })
        savedCheckedAtRef.current = accountRef.current.checkedAt
      } catch {
        /* 마지막 저장 실패는 무시 */
      }
    }
    const onVis = () => {
      if (document.hidden) flushOnHide()
      else {
        void runCatchUp()
        void poll()
      }
    }
    const id = setInterval(() => void poll(), POLL_MS)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', flushOnHide)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', flushOnHide)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 마운트 시 한 번 파생 값을 계산하고, 남은 타이머를 정리한다.
  useEffect(() => {
    recompute()
    const fundingTimers = fundingTimerRef.current
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current)
      for (const id of fundingTimers.values()) clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return api
}
