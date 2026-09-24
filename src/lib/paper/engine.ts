/**
 * 모의 선물거래 엔진 — 순수 함수만 둔다(시각은 인자로 받는다).
 *
 * 규칙: OKX USDT 무기한 롱/숏 모드(종목·방향마다 포지션 하나), 교차/격리, 구간별 최대 레버리지·유지증거금률.
 * 가격: 바이낸스 시세(체결가·마크가·호가)를 호출하는 쪽이 넣어 준다.
 *
 * 멱등성: 시세로 판정하는 모든 것(지정가 체결·발동·TP/SL·강제 청산)은 주문·포지션의 updatedAt 이후 시세만 본다.
 * 그래서 같은 구간을 두 번 되짚어도(다른 기기에서 이미 처리했거나 재시작) 결과가 같다.
 * 아무 일도 없으면 계좌 객체를 그대로(같은 참조로) 돌려준다.
 */
import {
  DEFAULT_FEES,
  DEFAULT_SETTINGS,
  HISTORY_CAP,
  type AccountSummary,
  type ActionResult,
  type Bar,
  type EngineEvent,
  type EngineResult,
  type FillReason,
  type FundingEvent,
  type MarginMode,
  type MarketSnap,
  type OrderAction,
  type OrderEstimate,
  type OrderRequest,
  type OrderType,
  type PaperAccount,
  type PaperFill,
  type PaperOrder,
  type PaperOrderRecord,
  type PaperPosition,
  type PaperPositionRecord,
  type PosSide,
  type PositionView,
  type RiskTier,
  type RulesOf,
  type SymbolRules,
  type SymbolSettings,
  type TpSl,
  type TriggerBy,
} from './types'

type Marks = Record<string, number>

const EPS = 1e-9

const dirOf = (side: PosSide): 1 | -1 => (side === 'long' ? 1 : -1)

/** 사는 주문인가 — 롱 진입·숏 종료는 사고, 숏 진입·롱 종료는 판다. */
const isBuy = (side: PosSide, action: OrderAction): boolean => (side === 'long') === (action === 'open')

const SIDE_KO: Record<PosSide, string> = { long: '롱', short: '숏' }

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 8
  const [mant, exp] = step.toExponential().split('e')
  return Math.max(0, (mant.split('.')[1] ?? '').length - parseInt(exp, 10))
}

/** 수량은 단위의 배수로 내린다(부동소수 오차는 자릿수로 잘라 낸다). */
function floorStep(v: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(v)) return v
  return Number((Math.floor(v / step + 1e-9) * step).toFixed(stepDecimals(step)))
}

/** 가격은 틱의 배수로 반올림. */
function roundStep(v: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(v)) return v
  return Number((Math.round(v / step) * step).toFixed(stepDecimals(step)))
}

function num(v: number, digits = 2): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: digits })
}

function capList<T>(list: T[]): T[] {
  return list.length > HISTORY_CAP ? list.slice(list.length - HISTORY_CAP) : list
}

/* ── 계좌 ─────────────────────────────────────────────── */

export function createAccount(startBalance: number, now: number): PaperAccount {
  return {
    v: 1,
    startBalance,
    balance: startBalance,
    positions: [],
    orders: [],
    fills: [],
    orderHistory: [],
    funding: [],
    positionHistory: [],
    settings: {},
    fees: { ...DEFAULT_FEES },
    checkedAt: now,
    createdAt: now,
  }
}

export function resetAccount(startBalance: number, now: number): PaperAccount {
  return createAccount(startBalance, now)
}

export function setFees(acct: PaperAccount, fees: { maker: number; taker: number }): PaperAccount {
  return { ...acct, fees: { maker: Math.max(0, fees.maker), taker: Math.max(0, fees.taker) } }
}

export function settingsOf(acct: PaperAccount, symbol: string): SymbolSettings {
  return acct.settings[symbol] ?? DEFAULT_SETTINGS
}

/** 포지션·미체결 주문이 있는 종목 — 이 종목들의 시세를 계속 받아야 한다. */
export function symbolsInUse(acct: PaperAccount): string[] {
  const set = new Set<string>()
  for (const p of acct.positions) set.add(p.symbol)
  for (const o of acct.orders) set.add(o.symbol)
  return [...set]
}

/** 밖에서 들어온 계좌(로컬 사본·서버)를 지금 모양으로 맞춘다 — 포지션 기록이 생기기 전 계좌에는 그 배열이 없다. */
export function normalizeAccount(acct: PaperAccount): PaperAccount {
  return Array.isArray(acct.positionHistory) ? acct : { ...acct, positionHistory: [] }
}

export function markChecked(acct: PaperAccount, at: number): PaperAccount {
  return at > acct.checkedAt ? { ...acct, checkedAt: at } : acct
}

/* ── 구간표 ───────────────────────────────────────────── */

function tierOf(rules: SymbolRules, qty: number): RiskTier {
  for (const t of rules.tiers) if (qty <= t.maxQty + EPS) return t
  return rules.tiers[rules.tiers.length - 1] ?? { maxQty: Infinity, maxLeverage: rules.maxLeverage, mmr: 0.025 }
}

/** 이 크기의 포지션에 쓸 수 있는 최대 레버리지. */
function maxLeverageFor(rules: SymbolRules, qty: number): number {
  return Math.min(rules.maxLeverage, tierOf(rules, qty).maxLeverage)
}

/* ── 계산 도우미 ──────────────────────────────────────── */

function markOf(pos: PaperPosition, marks?: Marks): number {
  return marks?.[pos.symbol] ?? pos.lastMark ?? pos.entry
}

function uplOf(pos: PaperPosition, mark: number): number {
  return (mark - pos.entry) * pos.qty * dirOf(pos.side)
}

interface MarginState {
  isoMargin: number
  crossIM: number
  crossUpl: number
  isoUpl: number
  crossMM: number
  frozen: number
  /** 교차 유지증거금을 계산하지 못한 종목이 있다(구간표 없음). */
  crossMMUnknown: boolean
}

function marginState(acct: PaperAccount, marks?: Marks, rulesOf?: RulesOf): MarginState {
  const s: MarginState = { isoMargin: 0, crossIM: 0, crossUpl: 0, isoUpl: 0, crossMM: 0, frozen: 0, crossMMUnknown: false }
  for (const p of acct.positions) {
    const mark = markOf(p, marks)
    if (p.marginMode === 'isolated') {
      s.isoMargin += p.isoMargin
      s.isoUpl += uplOf(p, mark)
    } else {
      s.crossIM += (p.qty * mark) / p.leverage
      s.crossUpl += uplOf(p, mark)
      const rules = rulesOf?.(p.symbol)
      if (rules) s.crossMM += p.qty * mark * tierOf(rules, p.qty).mmr
      else s.crossMMUnknown = true
    }
  }
  for (const o of acct.orders) s.frozen += o.frozen
  return s
}

/** 새 주문에 쓸 수 있는 금액(음수일 수 있다 — 표시할 때는 0 으로 자른다). */
function availableOf(acct: PaperAccount, marks?: Marks): number {
  const m = marginState(acct, marks)
  return acct.balance + m.crossUpl - m.isoMargin - m.crossIM - m.frozen
}

/** 교차 자산 = 잔고 − 격리 증거금 + 교차 미실현 손익. 미체결 주문 묶음은 청산 판정에 넣지 않는다. */
function crossEquityOf(acct: PaperAccount, m: MarginState): number {
  return acct.balance - m.isoMargin + m.crossUpl
}

function marketPrice(snap: MarketSnap, buy: boolean): number {
  const quote = buy ? snap.ask : snap.bid
  return quote !== undefined && quote > 0 ? quote : snap.last
}

function findPos(acct: PaperAccount, symbol: string, side: PosSide): PaperPosition | undefined {
  return acct.positions.find((p) => p.symbol === symbol && p.side === side)
}

/** 바꿔도 되는 사본. 기록 배열은 새 배열로(원본은 그대로). */
function draft(acct: PaperAccount): PaperAccount {
  return {
    ...acct,
    positions: acct.positions.map((p) => ({ ...p })),
    orders: acct.orders.map((o) => ({ ...o })),
    fills: [...acct.fills],
    orderHistory: [...acct.orderHistory],
    funding: [...acct.funding],
    positionHistory: [...(acct.positionHistory ?? [])],
    settings: { ...acct.settings },
  }
}

function finish(d: PaperAccount, events: EngineEvent[]): EngineResult {
  d.fills = capList(d.fills)
  d.orderHistory = capList(d.orderHistory)
  d.funding = capList(d.funding)
  d.positionHistory = capList(d.positionHistory)
  return { account: d, events }
}

/* ── 체결 ─────────────────────────────────────────────── */

interface FillSpec {
  symbol: string
  side: PosSide
  action: OrderAction
  qty: number
  price: number
  maker: boolean
  reason: FillReason
  at: number
  leverage: number
  marginMode: MarginMode
  orderId?: string
  tp?: number
  sl?: number
  tpSlBy?: TriggerBy
  mark?: number
}

/** 포지션에 체결을 반영한다. 종료할 포지션이 없으면 null. */
function applyFill(d: PaperAccount, s: FillSpec, events: EngineEvent[]): PaperFill | null {
  const dir = dirOf(s.side)
  const feeRate = s.maker ? d.fees.maker : d.fees.taker
  let pos = findPos(d, s.symbol, s.side)
  let qty = s.qty
  let pnl = 0

  if (s.action === 'open') {
    if (!pos) {
      pos = {
        id: `${s.symbol}:${s.side}`,
        symbol: s.symbol,
        side: s.side,
        marginMode: s.marginMode,
        leverage: s.leverage,
        qty: 0,
        entry: 0,
        isoMargin: 0,
        openedAt: s.at,
        updatedAt: s.at,
        fundingAt: s.at,
        realized: 0,
      }
      d.positions.push(pos)
    }
    ensureStats(pos)
    const fee = qty * s.price * feeRate
    const total = pos.qty + qty
    pos.entry = (pos.entry * pos.qty + s.price * qty) / total
    pos.qty = total
    if (pos.marginMode === 'isolated') pos.isoMargin += (qty * s.price) / pos.leverage
    pos.realized -= fee
    pos.updatedAt = s.at
    pos.lastMark = s.mark ?? s.price
    pos.openQty! += qty
    pos.openValue! += qty * s.price
    pos.feeSum! += fee
    pos.maxQty = Math.max(pos.maxQty!, total)
    if (s.tp !== undefined) pos.tp = { price: s.tp, by: s.tpSlBy ?? 'last' }
    if (s.sl !== undefined) pos.sl = { price: s.sl, by: s.tpSlBy ?? 'last' }
    d.balance -= fee
    return pushFill(d, s, qty, 0, fee, events)
  }

  if (!pos) return null
  qty = Math.min(qty, pos.qty)
  if (!(qty > 0)) return null
  const fee = qty * s.price * feeRate
  pnl = (s.price - pos.entry) * qty * dir
  d.balance += pnl - fee
  ensureStats(pos)
  if (qty >= pos.qty - EPS) {
    recordClosed(d, pos, s.at, 'closed', { qty, price: s.price, pnl, fee })
    removePosition(d, pos, s.at, '포지션이 모두 종료되어 취소', events)
  } else {
    if (pos.marginMode === 'isolated') pos.isoMargin -= pos.isoMargin * (qty / pos.qty)
    pos.qty = Number((pos.qty - qty).toPrecision(12))
    pos.realized += pnl - fee
    pos.updatedAt = s.at
    pos.lastMark = s.mark ?? s.price
    pos.closedQty! += qty
    pos.closedValue! += qty * s.price
    pos.feeSum! += fee
  }
  return pushFill(d, s, qty, pnl, fee, events)
}

/** 기록용 누계가 없으면(누계가 생기기 전에 연 포지션) 지금 상태로 채운다 — 그 전의 부분 종료·수수료는 알 수 없다. */
function ensureStats(pos: PaperPosition): void {
  if (pos.openQty === undefined) {
    pos.openQty = pos.qty
    pos.openValue = pos.qty * pos.entry
  }
  pos.closedQty ??= 0
  pos.closedValue ??= 0
  pos.maxQty ??= pos.qty
  pos.feeSum ??= 0
  pos.fundingSum ??= 0
}

/** 포지션이 끝났다 — 마지막 체결까지 더해 포지션 기록을 남긴다. */
function recordClosed(
  d: PaperAccount,
  pos: PaperPosition,
  at: number,
  status: 'closed' | 'liquidated',
  last: { qty: number; price: number; pnl: number; fee: number },
): PaperPositionRecord {
  ensureStats(pos)
  const closedQty = pos.closedQty! + last.qty
  const closedValue = pos.closedValue! + last.qty * last.price
  const fees = pos.feeSum! + last.fee
  const funding = pos.fundingSum!
  const realized = pos.realized + last.pnl - last.fee
  const record: PaperPositionRecord = {
    id: newId(),
    symbol: pos.symbol,
    side: pos.side,
    marginMode: pos.marginMode,
    leverage: pos.leverage,
    entry: pos.openQty! > 0 ? pos.openValue! / pos.openQty! : pos.entry,
    exit: closedQty > 0 ? closedValue / closedQty : last.price,
    maxQty: Math.max(pos.maxQty!, pos.qty),
    closedQty,
    pnl: realized + fees - funding,
    fees,
    funding,
    realized,
    status,
    openedAt: pos.openedAt,
    closedAt: at,
  }
  d.positionHistory.push(record)
  return record
}

function pushFill(d: PaperAccount, s: FillSpec, qty: number, pnl: number, fee: number, events: EngineEvent[]): PaperFill {
  const fill: PaperFill = {
    id: newId(),
    orderId: s.orderId,
    symbol: s.symbol,
    side: s.side,
    action: s.action,
    qty,
    price: s.price,
    fee,
    pnl,
    maker: s.maker,
    reason: s.reason,
    at: s.at,
  }
  d.fills.push(fill)
  events.push(s.reason === 'liquidation' ? { kind: 'liquidation', fill } : { kind: 'fill', fill })
  return fill
}

/** 포지션을 없애고, 그 포지션을 줄이려던 종료 주문도 거둔다(TP/SL 은 포지션에 붙어 있어 함께 사라진다). */
function removePosition(d: PaperAccount, pos: PaperPosition, at: number, note: string, events: EngineEvent[]): void {
  d.positions = d.positions.filter((p) => p !== pos)
  for (const o of d.orders.filter((x) => x.symbol === pos.symbol && x.side === pos.side && x.action === 'close')) {
    endOrder(d, o, 'canceled', at, events, note)
  }
}

function endOrder(
  d: PaperAccount,
  o: PaperOrder,
  status: PaperOrderRecord['status'],
  at: number,
  events: EngineEvent[],
  note?: string,
  avgPrice?: number,
): void {
  d.orders = d.orders.filter((x) => x.id !== o.id)
  const record: PaperOrderRecord = { ...o, frozen: 0, status, endedAt: at, note, avgPrice }
  d.orderHistory.push(record)
  if (status !== 'filled') events.push({ kind: 'canceled', order: record })
}

/** 바로 체결된 주문(시장가·바로 체결된 지정가)의 기록. */
function recordImmediate(
  d: PaperAccount,
  base: Omit<PaperOrderRecord, 'status' | 'endedAt' | 'frozen' | 'updatedAt' | 'createdAt'>,
  at: number,
): void {
  d.orderHistory.push({ ...base, frozen: 0, createdAt: at, updatedAt: at, status: 'filled', endedAt: at })
}

/* ── 검증 ─────────────────────────────────────────────── */

/** 진입 주문의 TP/SL 이 기준가(p)의 올바른 쪽에 있는지. */
function checkEntryTpSl(side: PosSide, p: number, tp?: number, sl?: number): string | null {
  const long = side === 'long'
  if (tp !== undefined && (!(tp > 0) || (long ? tp <= p : tp >= p))) {
    return `${SIDE_KO[side]} 익절가는 주문 가격보다 ${long ? '높아야' : '낮아야'} 합니다`
  }
  if (sl !== undefined && (!(sl > 0) || (long ? sl >= p : sl <= p))) {
    return `${SIDE_KO[side]} 손절가는 주문 가격보다 ${long ? '낮아야' : '높아야'} 합니다`
  }
  return null
}

function marginShortfall(need: number, avail: number): string {
  return `가용 금액이 부족합니다 (필요 ${num(need)} USDT · 가용 ${num(Math.max(0, avail))} USDT)`
}

/** 진입에 필요한 금액 = 초기 증거금 + 수수료. */
function openCost(qty: number, price: number, leverage: number, feeRate: number): number {
  return (qty * price) / leverage + qty * price * feeRate
}

/* ── 사용자 동작 ──────────────────────────────────────── */

export function placeOrder(
  acct: PaperAccount,
  req: OrderRequest,
  snap: MarketSnap,
  rules: SymbolRules,
  marks?: Marks,
): ActionResult {
  const at = snap.at
  const set = settingsOf(acct, req.symbol)
  const buy = isBuy(req.side, req.action)
  const pos = findPos(acct, req.symbol, req.side)
  const mk: Marks = { ...marks, [req.symbol]: snap.mark }

  let qty = floorStep(req.qty, rules.stepSize)
  if (req.action === 'close') {
    if (!pos) return { error: `종료할 ${SIDE_KO[req.side]} 포지션이 없습니다` }
    if (!(req.qty > 0)) qty = pos.qty
    qty = Math.min(qty, pos.qty)
    if (!(qty > 0)) return { error: '수량을 입력하세요' }
  } else {
    if (!(qty > 0)) return { error: '수량을 입력하세요' }
    if (qty < rules.minQty - EPS) return { error: `최소 수량은 ${num(rules.minQty, 8)} 입니다` }
    if (pos && pos.marginMode !== set.marginMode) {
      return { error: '이미 다른 마진 모드의 포지션이 있습니다' }
    }
    const cap = maxLeverageFor(rules, (pos?.qty ?? 0) + qty)
    if (set.leverage > cap + EPS) {
      return { error: `이 크기의 포지션은 최대 ${num(cap)}배까지입니다. 레버리지를 낮추거나 수량을 줄이세요` }
    }
  }
  const tpSl = req.action === 'open' ? { tp: req.tp, sl: req.sl, tpSlBy: req.tpSlBy } : {}
  const base = {
    symbol: req.symbol,
    side: req.side,
    action: req.action,
    qty,
    leverage: set.leverage,
    marginMode: set.marginMode,
    ...tpSl,
  }

  // 바로 체결: 시장가, 또는 지금 호가에 바로 닿는 지정가(테이커).
  const executeNow = (price: number, type: OrderType, limitPrice?: number): ActionResult => {
    if (req.action === 'open') {
      const tpErr = checkEntryTpSl(req.side, price, req.tp, req.sl)
      if (tpErr) return { error: tpErr }
      const need = openCost(qty, price, set.leverage, acct.fees.taker)
      const avail = availableOf(acct, mk)
      if (need > avail + EPS) return { error: marginShortfall(need, avail) }
    }
    const d = draft(acct)
    const events: EngineEvent[] = []
    const id = newId()
    const fill = applyFill(
      d,
      { ...base, price, maker: false, reason: type === 'market' ? 'market' : 'order', at, orderId: id, mark: snap.mark },
      events,
    )
    if (!fill) return { error: `종료할 ${SIDE_KO[req.side]} 포지션이 없습니다` }
    recordImmediate(d, { ...base, id, type, price: limitPrice, avgPrice: price }, at)
    return finish(d, events)
  }

  if (req.type === 'market') return executeNow(marketPrice(snap, buy), 'market')

  if (req.type === 'limit') {
    const price = roundStep(req.price ?? NaN, rules.tickSize)
    if (!(price > 0)) return { error: '가격을 입력하세요' }
    const opposite = marketPrice(snap, buy)
    if (buy ? price >= opposite : price <= opposite) {
      // 지정가가 이미 반대 호가에 닿아 있다 — 그 호가로 바로 체결된다(더 나은 가격).
      return executeNow(opposite, 'limit', price)
    }
    let frozen = 0
    if (req.action === 'open') {
      const tpErr = checkEntryTpSl(req.side, price, req.tp, req.sl)
      if (tpErr) return { error: tpErr }
      frozen = openCost(qty, price, set.leverage, acct.fees.maker)
      const avail = availableOf(acct, mk)
      if (frozen > avail + EPS) return { error: marginShortfall(frozen, avail) }
    }
    const d = draft(acct)
    d.orders.push({ ...base, id: newId(), type: 'limit', price, frozen, createdAt: at, updatedAt: at })
    return finish(d, [])
  }

  // 조건부: 발동가에 닿으면 시장가(또는 지정가)로 넣는다. 증거금은 발동할 때 확인한다(OKX 와 같다).
  const trigger = roundStep(req.triggerPrice ?? NaN, rules.tickSize)
  if (!(trigger > 0)) return { error: '발동 가격을 입력하세요' }
  const by = req.triggerBy ?? 'last'
  const ref = by === 'mark' ? snap.mark : snap.last
  if (Math.abs(trigger - ref) < rules.tickSize / 2) return { error: '발동 가격이 현재가와 같습니다' }
  const execPrice = req.price !== undefined ? roundStep(req.price, rules.tickSize) : undefined
  if (execPrice !== undefined && !(execPrice > 0)) return { error: '발동 뒤 지정가를 입력하세요' }
  if (req.action === 'open') {
    const tpErr = checkEntryTpSl(req.side, execPrice ?? trigger, req.tp, req.sl)
    if (tpErr) return { error: tpErr }
  }
  const d = draft(acct)
  d.orders.push({
    ...base,
    id: newId(),
    type: 'trigger',
    price: execPrice,
    triggerPrice: trigger,
    triggerBy: by,
    triggerDir: trigger > ref ? 'up' : 'down',
    frozen: 0,
    createdAt: at,
    updatedAt: at,
  })
  return finish(d, [])
}

export function cancelOrder(acct: PaperAccount, orderId: string, now: number): ActionResult {
  const o = acct.orders.find((x) => x.id === orderId)
  if (!o) return { error: '주문을 찾을 수 없습니다 (이미 체결되었거나 취소됨)' }
  const d = draft(acct)
  const events: EngineEvent[] = []
  endOrder(d, o, 'canceled', now, events, '사용자 취소')
  return finish(d, events)
}

export function cancelAll(acct: PaperAccount, symbol: string | null, now: number): EngineResult {
  const targets = acct.orders.filter((o) => symbol === null || o.symbol === symbol)
  if (targets.length === 0) return { account: acct, events: [] }
  const d = draft(acct)
  const events: EngineEvent[] = []
  for (const o of targets) endOrder(d, o, 'canceled', now, events, '사용자 취소')
  return finish(d, events)
}

export function amendOrder(
  acct: PaperAccount,
  orderId: string,
  patch: { price?: number; triggerPrice?: number; qty?: number },
  snap: MarketSnap,
  rules: SymbolRules,
  marks?: Marks,
): ActionResult {
  const o = acct.orders.find((x) => x.id === orderId)
  if (!o) return { error: '주문을 찾을 수 없습니다 (이미 체결되었거나 취소됨)' }
  const at = snap.at
  const next: PaperOrder = { ...o, updatedAt: at }
  if (patch.qty !== undefined) {
    const q = floorStep(patch.qty, rules.stepSize)
    if (!(q > 0) || q < rules.minQty - EPS) return { error: `최소 수량은 ${num(rules.minQty, 8)} 입니다` }
    next.qty = q
  }
  if (patch.price !== undefined && (o.type === 'limit' || o.price !== undefined)) {
    const p = roundStep(patch.price, rules.tickSize)
    if (!(p > 0)) return { error: '가격을 입력하세요' }
    next.price = p
  }
  if (o.type === 'trigger' && patch.triggerPrice !== undefined) {
    const t = roundStep(patch.triggerPrice, rules.tickSize)
    if (!(t > 0)) return { error: '발동 가격을 입력하세요' }
    const ref = (o.triggerBy ?? 'last') === 'mark' ? snap.mark : snap.last
    if (Math.abs(t - ref) < rules.tickSize / 2) return { error: '발동 가격이 현재가와 같습니다' }
    next.triggerPrice = t
    next.triggerDir = t > ref ? 'up' : 'down'
  }
  if (next.action === 'open') {
    const tpErr = checkEntryTpSl(next.side, next.price ?? next.triggerPrice ?? 0, next.tp, next.sl)
    if (tpErr) return { error: tpErr }
  }

  const without: PaperAccount = { ...acct, orders: acct.orders.filter((x) => x.id !== orderId) }
  const mk: Marks = { ...marks, [o.symbol]: snap.mark }

  if (next.type === 'limit' && next.price !== undefined) {
    const buy = isBuy(next.side, next.action)
    const opposite = marketPrice(snap, buy)
    if (buy ? next.price >= opposite : next.price <= opposite) {
      // 옮긴 가격이 반대 호가에 닿는다 — 바로 체결.
      if (next.action === 'open') {
        const need = openCost(next.qty, opposite, next.leverage, acct.fees.taker)
        const avail = availableOf(without, mk)
        if (need > avail + EPS) return { error: marginShortfall(need, avail) }
      }
      const d = draft(acct)
      const events: EngineEvent[] = []
      d.orders = d.orders.filter((x) => x.id !== orderId)
      const fill = applyFill(
        d,
        { ...next, price: opposite, maker: false, reason: 'order', at, orderId, mark: snap.mark },
        events,
      )
      if (!fill) return { error: `종료할 ${SIDE_KO[next.side]} 포지션이 없습니다` }
      d.orderHistory.push({ ...next, frozen: 0, status: 'filled', endedAt: at, avgPrice: opposite })
      return finish(d, events)
    }
    if (next.action === 'open') {
      next.frozen = openCost(next.qty, next.price, next.leverage, acct.fees.maker)
      const avail = availableOf(without, mk)
      if (next.frozen > avail + EPS) return { error: marginShortfall(next.frozen, avail) }
    }
  }
  const d = draft(acct)
  d.orders = d.orders.map((x) => (x.id === orderId ? next : x))
  return finish(d, [])
}

/** 시장가 종료. qty ≤ 0 이면 전량. */
export function closePosition(
  acct: PaperAccount,
  symbol: string,
  side: PosSide,
  qty: number,
  snap: MarketSnap,
  rules: SymbolRules,
): ActionResult {
  return placeOrder(acct, { symbol, side, action: 'close', type: 'market', qty }, snap, rules)
}

export function setTpSl(
  acct: PaperAccount,
  symbol: string,
  side: PosSide,
  tp: TpSl | null | undefined,
  sl: TpSl | null | undefined,
  snap: MarketSnap,
): ActionResult {
  const pos = findPos(acct, symbol, side)
  if (!pos) return { error: `${SIDE_KO[side]} 포지션이 없습니다` }
  const long = side === 'long'
  const refOf = (by: TriggerBy) => (by === 'mark' ? snap.mark : snap.last)
  if (tp) {
    const ref = refOf(tp.by)
    if (!(tp.price > 0) || (long ? tp.price <= ref : tp.price >= ref)) {
      return { error: `${SIDE_KO[side]} 익절가는 현재가보다 ${long ? '높아야' : '낮아야'} 합니다` }
    }
  }
  if (sl) {
    const ref = refOf(sl.by)
    if (!(sl.price > 0) || (long ? sl.price >= ref : sl.price <= ref)) {
      return { error: `${SIDE_KO[side]} 손절가는 현재가보다 ${long ? '낮아야' : '높아야'} 합니다` }
    }
  }
  const d = draft(acct)
  const p = findPos(d, symbol, side)!
  if (tp !== undefined) p.tp = tp ?? undefined
  if (sl !== undefined) p.sl = sl ?? undefined
  if (tp === null) delete p.tp
  if (sl === null) delete p.sl
  p.updatedAt = snap.at
  return finish(d, [])
}

/** 격리 증거금 추가(+)·감소(−). 줄일 때는 마크가 기준 초기 증거금 아래로는 못 내린다. */
export function adjustMargin(
  acct: PaperAccount,
  symbol: string,
  side: PosSide,
  delta: number,
  snap: MarketSnap,
  rules: SymbolRules,
  marks?: Marks,
): ActionResult {
  const pos = findPos(acct, symbol, side)
  if (!pos) return { error: `${SIDE_KO[side]} 포지션이 없습니다` }
  if (pos.marginMode !== 'isolated') return { error: '교차 포지션은 증거금을 따로 조정하지 않습니다' }
  if (!Number.isFinite(delta) || delta === 0) return { error: '금액을 입력하세요' }
  const mk: Marks = { ...marks, [symbol]: snap.mark }
  if (delta > 0) {
    const avail = availableOf(acct, mk)
    if (delta > avail + EPS) return { error: marginShortfall(delta, avail) }
  } else {
    const floor = (pos.qty * snap.mark) / pos.leverage
    const removable = Math.max(0, pos.isoMargin + Math.min(0, uplOf(pos, snap.mark)) - floor)
    if (-delta > removable + EPS) return { error: `줄일 수 있는 최대 금액은 ${num(removable)} USDT 입니다` }
    const after = pos.isoMargin + delta + uplOf(pos, snap.mark)
    if (after <= pos.qty * snap.mark * tierOf(rules, pos.qty).mmr) return { error: '줄이면 곧바로 강제 청산됩니다' }
  }
  const d = draft(acct)
  const p = findPos(d, symbol, side)!
  p.isoMargin += delta
  p.updatedAt = snap.at
  return finish(d, [])
}

export function setSymbolSettings(
  acct: PaperAccount,
  symbol: string,
  patch: Partial<SymbolSettings>,
  snap: MarketSnap | null,
  rules: SymbolRules,
  now: number,
  marks?: Marks,
): ActionResult {
  const cur = settingsOf(acct, symbol)
  const next: SymbolSettings = { ...cur, ...patch }
  const busy = acct.positions.some((p) => p.symbol === symbol) || acct.orders.some((o) => o.symbol === symbol)
  if (next.marginMode !== cur.marginMode && busy) {
    return { error: '이 종목에 포지션이나 미체결 주문이 있으면 마진 모드를 바꿀 수 없습니다' }
  }
  const lev = Math.round(next.leverage * 100) / 100
  if (!(lev >= 1)) return { error: '레버리지는 1배 이상이어야 합니다' }
  const held = acct.positions.filter((p) => p.symbol === symbol)
  const biggest = Math.max(0, ...held.map((p) => p.qty))
  const cap = maxLeverageFor(rules, biggest)
  if (lev > cap + EPS) {
    return { error: biggest > 0 ? `지금 포지션 크기에선 최대 ${num(cap)}배입니다` : `최대 레버리지는 ${num(cap)}배입니다` }
  }
  next.leverage = lev

  const d = draft(acct)
  d.settings[symbol] = next
  if (lev !== cur.leverage) {
    const mark = snap?.mark
    for (const p of d.positions.filter((x) => x.symbol === symbol)) {
      if (p.marginMode === 'isolated') {
        // 더 넣었던 증거금·펀딩 조정분은 그대로 두고 초기 증거금 몫만 새 레버리지로 다시 잡는다.
        const extra = p.isoMargin - (p.qty * p.entry) / p.leverage
        p.isoMargin = (p.qty * p.entry) / lev + extra
        const m = mark ?? markOf(p, marks)
        if (p.isoMargin + uplOf(p, m) <= p.qty * m * tierOf(rules, p.qty).mmr) {
          return { error: '이 레버리지로 바꾸면 곧바로 강제 청산됩니다' }
        }
      }
      p.leverage = lev
      p.updatedAt = now
    }
    for (const o of d.orders.filter((x) => x.symbol === symbol && x.action === 'open')) {
      o.leverage = lev
      if (o.type === 'limit' && o.price !== undefined) o.frozen = openCost(o.qty, o.price, lev, d.fees.maker)
    }
    const mk: Marks = { ...marks, ...(mark !== undefined ? { [symbol]: mark } : {}) }
    const avail = availableOf(d, mk)
    if (avail < -EPS) return { error: `가용 금액이 부족해 ${num(lev)}배로 바꿀 수 없습니다` }
  }
  return finish(d, [])
}

/* ── 시세 반영 ────────────────────────────────────────── */

function limitTouched(o: PaperOrder, price: number): boolean {
  if (o.type !== 'limit' || o.price === undefined) return false
  return isBuy(o.side, o.action) ? price <= o.price : price >= o.price
}

function triggerHit(o: PaperOrder, price: number): boolean {
  if (o.type !== 'trigger' || o.triggerPrice === undefined) return false
  return o.triggerDir === 'up' ? price >= o.triggerPrice : price <= o.triggerPrice
}

function tpHit(p: PaperPosition, by: TriggerBy, price: number): boolean {
  if (!p.tp || p.tp.by !== by) return false
  return p.side === 'long' ? price >= p.tp.price : price <= p.tp.price
}

function slHit(p: PaperPosition, by: TriggerBy, price: number): boolean {
  if (!p.sl || p.sl.by !== by) return false
  return p.side === 'long' ? price <= p.sl.price : price >= p.sl.price
}

/** 지정가 주문 체결(메이커, 지정가 그대로). */
function fillLimit(d: PaperAccount, o: PaperOrder, at: number, events: EngineEvent[], mark?: number): void {
  const price = o.price!
  d.orders = d.orders.filter((x) => x.id !== o.id)
  const fill = applyFill(d, { ...o, price, maker: true, reason: 'order', at, orderId: o.id, mark }, events)
  if (!fill) {
    d.orderHistory.push({ ...o, frozen: 0, status: 'canceled', endedAt: at, note: '종료할 포지션이 없어 취소' })
    events.push({ kind: 'canceled', order: d.orderHistory[d.orderHistory.length - 1] })
    return
  }
  d.orderHistory.push({ ...o, frozen: 0, qty: fill.qty, status: 'filled', endedAt: at, avgPrice: price })
}

/**
 * 조건부 주문 발동. 시장가면 `price` 에 체결(테이커), 지정가면 지정가 주문으로 바꿔 둔다.
 * 진입은 이때 증거금을 확인하고, 모자라면 거절한다.
 */
function fireTrigger(
  d: PaperAccount,
  o: PaperOrder,
  price: number,
  at: number,
  events: EngineEvent[],
  rulesOf: RulesOf,
  marks: Marks | undefined,
  /** 바로 체결을 볼 현재 체결가 — 봉 되짚기에서는 undefined(다음 봉부터 본다). */
  livePrice: number | undefined,
  mark?: number,
): void {
  d.orders = d.orders.filter((x) => x.id !== o.id)
  const rules = rulesOf(o.symbol)
  const set = { leverage: o.leverage, marginMode: o.marginMode }
  if (o.action === 'open') {
    const pos = findPos(d, o.symbol, o.side)
    if (rules && set.leverage > maxLeverageFor(rules, (pos?.qty ?? 0) + o.qty) + EPS) {
      d.orderHistory.push({ ...o, status: 'rejected', endedAt: at, note: '포지션 크기가 레버리지 구간을 넘어 거절' })
      events.push({ kind: 'canceled', order: d.orderHistory[d.orderHistory.length - 1] })
      return
    }
  }
  if (o.price === undefined) {
    if (o.action === 'open') {
      const need = openCost(o.qty, price, o.leverage, d.fees.taker)
      if (need > availableOf(d, marks) + EPS) {
        d.orderHistory.push({ ...o, status: 'rejected', endedAt: at, note: '증거금이 부족해 발동 후 거절' })
        events.push({ kind: 'canceled', order: d.orderHistory[d.orderHistory.length - 1] })
        return
      }
    }
    const fill = applyFill(d, { ...o, price, maker: false, reason: 'order', at, orderId: o.id, mark }, events)
    if (!fill) {
      d.orderHistory.push({ ...o, status: 'canceled', endedAt: at, note: '종료할 포지션이 없어 취소' })
      events.push({ kind: 'canceled', order: d.orderHistory[d.orderHistory.length - 1] })
      return
    }
    d.orderHistory.push({ ...o, qty: fill.qty, status: 'filled', endedAt: at, avgPrice: price })
    return
  }
  // 지정가로 바꿔 둔다.
  const limit: PaperOrder = {
    ...o,
    type: 'limit',
    triggerPrice: undefined,
    triggerDir: undefined,
    frozen: o.action === 'open' ? openCost(o.qty, o.price, o.leverage, d.fees.maker) : 0,
    updatedAt: at,
  }
  if (o.action === 'open' && limit.frozen > availableOf(d, marks) + EPS) {
    d.orderHistory.push({ ...o, status: 'rejected', endedAt: at, note: '증거금이 부족해 발동 후 거절' })
    events.push({ kind: 'canceled', order: d.orderHistory[d.orderHistory.length - 1] })
    return
  }
  d.orders.push(limit)
  events.push({ kind: 'triggered', order: limit })
  if (livePrice !== undefined && limitTouched(limit, livePrice)) {
    // 발동 순간 이미 닿는 지정가 — 지금 가격으로 바로 체결(테이커).
    d.orders = d.orders.filter((x) => x.id !== limit.id)
    const fill = applyFill(d, { ...limit, price: livePrice, maker: false, reason: 'order', at, orderId: limit.id, mark }, events)
    if (fill) d.orderHistory.push({ ...limit, frozen: 0, qty: fill.qty, status: 'filled', endedAt: at, avgPrice: livePrice })
    else {
      d.orderHistory.push({ ...limit, frozen: 0, status: 'canceled', endedAt: at, note: '종료할 포지션이 없어 취소' })
      events.push({ kind: 'canceled', order: d.orderHistory[d.orderHistory.length - 1] })
    }
  }
}

/** 포지션 전량을 시장가로 닫는다(TP/SL). */
function closeAllAt(d: PaperAccount, pos: PaperPosition, price: number, reason: 'tp' | 'sl', at: number, events: EngineEvent[], mark?: number): void {
  applyFill(
    d,
    {
      symbol: pos.symbol,
      side: pos.side,
      action: 'close',
      qty: pos.qty,
      price,
      maker: false,
      reason,
      at,
      leverage: pos.leverage,
      marginMode: pos.marginMode,
      mark,
    },
    events,
  )
}

/** 격리 강제 청산 — 묶인 증거금을 모두 잃는다. */
function liquidateIsolated(d: PaperAccount, pos: PaperPosition, price: number, at: number, events: EngineEvent[]): void {
  const loss = Math.max(0, pos.isoMargin)
  d.balance -= loss
  recordClosed(d, pos, at, 'liquidated', { qty: pos.qty, price, pnl: -loss, fee: 0 })
  removePosition(d, pos, at, '강제 청산으로 취소', events)
  pushFill(
    d,
    { symbol: pos.symbol, side: pos.side, action: 'close', qty: pos.qty, price, maker: false, reason: 'liquidation', at, leverage: pos.leverage, marginMode: 'isolated' },
    pos.qty,
    -loss,
    0,
    events,
  )
}

/**
 * 교차 강제 청산 — 교차 포지션을 모두 그 마크가로 닫고, 남은 교차 자산은 청산 수수료로 사라진다
 * (손실이 자산보다 크면 보험 기금이 메운 것으로 보고 교차 자산을 0 으로 둔다).
 */
function liquidateCross(d: PaperAccount, priceOf: (p: PaperPosition) => number, at: number, events: EngineEvent[]): void {
  const cross = d.positions.filter((p) => p.marginMode === 'cross')
  if (cross.length === 0) return
  for (const o of d.orders.filter((x) => x.marginMode === 'cross')) endOrder(d, o, 'canceled', at, events, '강제 청산으로 취소')
  const fills: PaperFill[] = []
  const records: PaperPositionRecord[] = []
  for (const pos of cross) {
    const price = priceOf(pos)
    const pnl = (price - pos.entry) * pos.qty * dirOf(pos.side)
    const fee = pos.qty * price * d.fees.taker
    d.balance += pnl - fee
    records.push(recordClosed(d, pos, at, 'liquidated', { qty: pos.qty, price, pnl, fee }))
    removePosition(d, pos, at, '강제 청산으로 취소', events)
    fills.push(
      pushFill(
        d,
        { symbol: pos.symbol, side: pos.side, action: 'close', qty: pos.qty, price, maker: false, reason: 'liquidation', at, leverage: pos.leverage, marginMode: 'cross' },
        pos.qty,
        pnl,
        fee,
        events,
      ),
    )
  }
  const isoTotal = d.positions.reduce((s, p) => s + (p.marginMode === 'isolated' ? p.isoMargin : 0), 0)
  const left = d.balance - isoTotal
  const last = fills[fills.length - 1]
  const lastRecord = records[records.length - 1]
  // 남은 교차 자산은 청산 수수료로, 모자란 손실은 보험 기금 몫으로 — 체결과 포지션 기록에 같게 반영한다.
  if (left > 0) {
    last.fee += left
    lastRecord.fees += left
  } else if (left < 0) {
    last.pnl -= left
    lastRecord.pnl -= left
  }
  lastRecord.realized -= left
  d.balance = isoTotal
}

/** 최근 체결가 한 건 반영: 지정가 체결, 최근가 기준 조건부 발동·TP/SL. */
export function onTrade(
  acct: PaperAccount,
  symbol: string,
  price: number,
  at: number,
  rulesOf: RulesOf,
  mark?: number,
): EngineResult {
  const posHits = acct.positions.filter(
    (p) => p.symbol === symbol && p.updatedAt < at && (slHit(p, 'last', price) || tpHit(p, 'last', price)),
  )
  const orderHits = acct.orders.filter(
    (o) =>
      o.symbol === symbol &&
      o.updatedAt < at &&
      (limitTouched(o, price) || ((o.triggerBy ?? 'last') === 'last' && triggerHit(o, price))),
  )
  if (posHits.length === 0 && orderHits.length === 0) return { account: acct, events: [] }
  const d = draft(acct)
  const events: EngineEvent[] = []
  const marks: Marks | undefined = mark !== undefined ? { [symbol]: mark } : undefined
  for (const hit of posHits) {
    const pos = findPos(d, hit.symbol, hit.side)
    if (!pos) continue
    if (slHit(pos, 'last', price)) closeAllAt(d, pos, price, 'sl', at, events, mark)
    else if (tpHit(pos, 'last', price)) closeAllAt(d, pos, price, 'tp', at, events, mark)
  }
  for (const hit of orderHits) {
    const o = d.orders.find((x) => x.id === hit.id)
    if (!o) continue
    if (o.type === 'limit') fillLimit(d, o, at, events, mark)
    else fireTrigger(d, o, price, at, events, rulesOf, marks, price, mark)
  }
  return finish(d, events)
}

/** 마크가 한 건 반영: 마크 기준 조건부 발동·TP/SL, 강제 청산. `marks` 는 다른 종목의 마크가(교차 계산용). */
export function onMark(
  acct: PaperAccount,
  symbol: string,
  mark: number,
  at: number,
  rulesOf: RulesOf,
  last?: number,
  marks?: Marks,
): EngineResult {
  const fillPrice = last ?? mark
  const mk: Marks = { ...marks, [symbol]: mark }
  const posHits = acct.positions.filter(
    (p) => p.symbol === symbol && p.updatedAt < at && (slHit(p, 'mark', mark) || tpHit(p, 'mark', mark)),
  )
  const orderHits = acct.orders.filter(
    (o) => o.symbol === symbol && o.updatedAt < at && o.triggerBy === 'mark' && triggerHit(o, mark),
  )
  const rules = rulesOf(symbol)
  const isoLiq = rules
    ? acct.positions.filter(
        (p) =>
          p.symbol === symbol &&
          p.marginMode === 'isolated' &&
          p.updatedAt < at &&
          p.isoMargin + uplOf(p, mark) <= p.qty * mark * tierOf(rules, p.qty).mmr,
      )
    : []
  const crossLiq = crossLiquidating(acct, mk, rulesOf, symbol, at)
  if (posHits.length === 0 && orderHits.length === 0 && isoLiq.length === 0 && !crossLiq) {
    return { account: acct, events: [] }
  }
  const d = draft(acct)
  const events: EngineEvent[] = []
  // 강제 청산이 먼저 — 같은 순간이면 거래소도 청산부터 한다.
  for (const hit of isoLiq) {
    const pos = findPos(d, hit.symbol, hit.side)
    if (pos) liquidateIsolated(d, pos, mark, at, events)
  }
  if (crossLiq) liquidateCross(d, (p) => markOf(p, mk), at, events)
  for (const hit of posHits) {
    const pos = findPos(d, hit.symbol, hit.side)
    if (!pos) continue
    if (slHit(pos, 'mark', mark)) closeAllAt(d, pos, fillPrice, 'sl', at, events, mark)
    else if (tpHit(pos, 'mark', mark)) closeAllAt(d, pos, fillPrice, 'tp', at, events, mark)
  }
  for (const hit of orderHits) {
    const o = d.orders.find((x) => x.id === hit.id)
    if (o) fireTrigger(d, o, fillPrice, at, events, rulesOf, mk, last, mark)
  }
  return finish(d, events)
}

/** 교차 자산이 교차 유지증거금 이하인가. 이 종목의 교차 포지션이 있을 때만 본다(마크가 갱신된 종목). */
function crossLiquidating(acct: PaperAccount, marks: Marks, rulesOf: RulesOf, symbol: string, at: number): boolean {
  const mine = acct.positions.filter((p) => p.marginMode === 'cross' && p.symbol === symbol && p.updatedAt < at)
  if (mine.length === 0) return false
  const m = marginState(acct, marks, rulesOf)
  if (m.crossMMUnknown) return false
  return crossEquityOf(acct, m) <= m.crossMM
}

/**
 * 되짚기 — 봉 하나(길이 무관)를 반영한다. 봉 안의 순서는 알 수 없으므로 불리한 쪽부터 본다:
 * 강제 청산 → 손절 → 지정가·조건부 → 익절. 이 봉에서 새로 생긴 포지션·주문은 다음 봉부터 본다.
 */
export function onBar(
  acct: PaperAccount,
  symbol: string,
  bar: Bar,
  markBar: Bar | null,
  rulesOf: RulesOf,
  marks?: Marks,
): EngineResult {
  const mb = markBar ?? bar
  const at = bar.closeTime
  const eligible = (t: number) => t <= bar.openTime
  const d = draft(acct)
  const events: EngineEvent[] = []
  const rules = rulesOf(symbol)

  // 1) 강제 청산 — 포지션마다 불리한 쪽 마크가(롱은 저가, 숏은 고가).
  if (rules) {
    const adverse = (p: PaperPosition) => (p.side === 'long' ? mb.low : mb.high)
    for (const pos of d.positions.filter((p) => p.symbol === symbol && p.marginMode === 'isolated' && eligible(p.updatedAt))) {
      const m = adverse(pos)
      if (pos.isoMargin + uplOf(pos, m) <= pos.qty * m * tierOf(rules, pos.qty).mmr) {
        const liq = positionLiq(d, pos, rules, marks, rulesOf)
        liquidateIsolated(d, pos, liq !== null && liq >= mb.low && liq <= mb.high ? liq : m, at, events)
      }
    }
    const mine = d.positions.filter((p) => p.symbol === symbol && p.marginMode === 'cross' && eligible(p.updatedAt))
    if (mine.length > 0) {
      const priceOf = (p: PaperPosition) => (p.symbol === symbol ? adverse(p) : markOf(p, marks))
      // 롱·숏이 모두 있으면 각각 불리한 값으로 본다(보수적으로).
      const worst = d.positions.map((p) => ({ ...p, lastMark: priceOf(p) }))
      const m = marginState({ ...d, positions: worst }, undefined, rulesOf)
      if (!m.crossMMUnknown && crossEquityOf(d, m) <= m.crossMM) liquidateCross(d, priceOf, at, events)
    }
  }

  // 2) 손절.
  for (const pos of d.positions.filter((p) => p.symbol === symbol && p.sl && eligible(p.updatedAt))) {
    const sl = pos.sl!
    const src = sl.by === 'mark' ? mb : bar
    const hit = pos.side === 'long' ? src.low <= sl.price : src.high >= sl.price
    if (!hit) continue
    const gap = pos.side === 'long' ? bar.open <= sl.price : bar.open >= sl.price
    closeAllAt(d, pos, gap && sl.by === 'last' ? bar.open : sl.price, 'sl', at, events, mb.close)
  }

  // 3) 지정가·조건부.
  for (const o of [...d.orders].filter((x) => x.symbol === symbol && eligible(x.updatedAt))) {
    if (!d.orders.some((x) => x.id === o.id)) continue
    if (o.type === 'limit') {
      const touched = isBuy(o.side, o.action) ? bar.low <= o.price! : bar.high >= o.price!
      if (touched) fillLimit(d, o, at, events, mb.close)
      continue
    }
    const src = o.triggerBy === 'mark' ? mb : bar
    const t = o.triggerPrice!
    const hit = o.triggerDir === 'up' ? src.high >= t : src.low <= t
    if (!hit) continue
    const gap = o.triggerDir === 'up' ? bar.open >= t : bar.open <= t
    const price = gap && o.triggerBy !== 'mark' ? bar.open : t
    fireTrigger(d, o, price, at, events, rulesOf, { ...marks, [symbol]: mb.close }, undefined, mb.close)
  }

  // 4) 익절.
  for (const pos of d.positions.filter((p) => p.symbol === symbol && p.tp && eligible(p.updatedAt))) {
    const tp = pos.tp!
    const src = tp.by === 'mark' ? mb : bar
    const hit = pos.side === 'long' ? src.high >= tp.price : src.low <= tp.price
    if (!hit) continue
    const gap = pos.side === 'long' ? bar.open >= tp.price : bar.open <= tp.price
    closeAllAt(d, pos, gap && tp.by === 'last' ? bar.open : tp.price, 'tp', at, events, mb.close)
  }

  for (const p of d.positions) if (p.symbol === symbol) p.lastMark = mb.close
  return finish(d, events)
}

/** 펀딩 반영 — 펀딩 시각에 들고 있던 포지션만, 이미 반영한 시각은 건너뛴다. 롱은 비율이 +면 낸다. */
export function applyFunding(acct: PaperAccount, symbol: string, events: FundingEvent[]): EngineResult {
  const due = [...events]
    .sort((a, b) => a.time - b.time)
    .filter((ev) => acct.positions.some((p) => p.symbol === symbol && p.openedAt < ev.time && p.fundingAt < ev.time))
  if (due.length === 0) return { account: acct, events: [] }
  const d = draft(acct)
  const out: EngineEvent[] = []
  for (const ev of due) {
    for (const p of d.positions) {
      if (p.symbol !== symbol || !(p.openedAt < ev.time) || !(p.fundingAt < ev.time)) continue
      const amount = -dirOf(p.side) * p.qty * ev.mark * ev.rate
      d.balance += amount
      p.realized += amount
      if (p.marginMode === 'isolated') p.isoMargin += amount
      p.fundingAt = ev.time
      ensureStats(p)
      p.fundingSum! += amount
      const funding = { id: newId(), symbol, side: p.side, qty: p.qty, rate: ev.rate, mark: ev.mark, amount, at: ev.time }
      d.funding.push(funding)
      out.push({ kind: 'funding', funding })
    }
  }
  return finish(d, out)
}

/* ── 파생 값 ──────────────────────────────────────────── */

/** 예상 강제 청산가. 격리는 그 포지션 증거금으로, 교차는 나머지 교차 자산까지 본다. */
function positionLiq(acct: PaperAccount, pos: PaperPosition, rules: SymbolRules, marks: Marks | undefined, rulesOf: RulesOf): number | null {
  const m = tierOf(rules, pos.qty).mmr
  const q = pos.qty
  const e = pos.entry
  let cushion: number
  if (pos.marginMode === 'isolated') {
    cushion = pos.isoMargin
  } else {
    // 이 포지션을 뺀 교차 자산 − 다른 교차 포지션의 유지증거금.
    const others = { ...acct, positions: acct.positions.filter((p) => p !== pos && p.id !== pos.id) }
    const ms = marginState(others, marks, rulesOf)
    if (ms.crossMMUnknown) return null
    cushion = crossEquityOf(others, ms) - ms.crossMM
  }
  const price = pos.side === 'long' ? (q * e - cushion) / (q * (1 - m)) : (cushion + q * e) / (q * (1 + m))
  return Number.isFinite(price) && price > 0 ? price : null
}

export function positionView(acct: PaperAccount, pos: PaperPosition, marks: Record<string, number>, rulesOf: RulesOf): PositionView {
  const mark = markOf(pos, marks)
  const notional = pos.qty * mark
  const upl = uplOf(pos, mark)
  const initial = (pos.qty * pos.entry) / pos.leverage
  const rules = rulesOf(pos.symbol)
  const mmr = rules ? tierOf(rules, pos.qty).mmr : 0
  return {
    position: pos,
    mark,
    notional,
    upl,
    roe: initial > 0 ? (upl / initial) * 100 : 0,
    margin: pos.marginMode === 'isolated' ? pos.isoMargin : notional / pos.leverage,
    mmr,
    maintenance: notional * mmr,
    liqPrice: rules ? positionLiq(acct, pos, rules, marks, rulesOf) : null,
  }
}

export function summarize(acct: PaperAccount, marks: Record<string, number>, rulesOf: RulesOf): AccountSummary {
  const m = marginState(acct, marks, rulesOf)
  const upl = m.crossUpl + m.isoUpl
  const hasCross = acct.positions.some((p) => p.marginMode === 'cross')
  return {
    equity: acct.balance + upl,
    balance: acct.balance,
    upl,
    available: Math.max(0, acct.balance + m.crossUpl - m.isoMargin - m.crossIM - m.frozen),
    usedMargin: m.isoMargin + m.crossIM,
    frozen: m.frozen,
    maintenance: m.crossMM,
    marginRatio: hasCross && m.crossMM > 0 && !m.crossMMUnknown ? (crossEquityOf(acct, m) / m.crossMM) * 100 : null,
  }
}

/** 주문 가격(추정) — 시장가는 반대 호가, 지정가는 지정가, 조건부는 발동 뒤 지정가 또는 발동가. */
function requestPrice(req: OrderRequest, snap: MarketSnap): number {
  if (req.type === 'market') return marketPrice(snap, isBuy(req.side, req.action))
  if (req.type === 'limit') return req.price ?? snap.last
  return req.price ?? req.triggerPrice ?? snap.last
}

export function estimateOrder(
  acct: PaperAccount,
  req: OrderRequest,
  snap: MarketSnap,
  rules: SymbolRules,
  marks?: Marks,
): OrderEstimate {
  const set = settingsOf(acct, req.symbol)
  const price = requestPrice(req, snap)
  const pos = findPos(acct, req.symbol, req.side)
  const qty = req.action === 'close' ? Math.min(req.qty > 0 ? req.qty : (pos?.qty ?? 0), pos?.qty ?? 0) : Math.max(0, req.qty)
  const notional = qty * price
  const taker = req.type === 'market' || (req.type === 'trigger' && req.price === undefined)
  const fee = notional * (taker ? acct.fees.taker : acct.fees.maker)
  const mk: Marks = { ...marks, [req.symbol]: snap.mark }
  if (!(qty > 0) || !(price > 0)) return { notional: 0, margin: 0, fee: 0, liqPrice: null }
  if (req.action === 'close') return { notional, margin: 0, fee, liqPrice: null }

  // 체결된 뒤의 포지션을 가정해 청산가를 구한다.
  const d = draft(acct)
  applyFill(
    d,
    { symbol: req.symbol, side: req.side, action: 'open', qty, price, maker: !taker, reason: 'order', at: snap.at, leverage: set.leverage, marginMode: set.marginMode },
    [],
  )
  const after = findPos(d, req.symbol, req.side)
  const rulesOf: RulesOf = (s) => (s === req.symbol ? rules : null)
  return {
    notional,
    margin: notional / set.leverage,
    fee,
    liqPrice: after ? positionLiq(d, after, rules, mk, rulesOf) : null,
  }
}

/** 이 방향으로 지금 열 수 있는 최대 수량 — 가용 금액과 레버리지 구간 한도 중 작은 쪽. */
export function maxOpenQty(
  acct: PaperAccount,
  symbol: string,
  side: PosSide,
  price: number,
  snap: MarketSnap,
  rules: SymbolRules,
  marks?: Marks,
): number {
  if (!(price > 0)) return 0
  const set = settingsOf(acct, symbol)
  const mk: Marks = { ...marks, [symbol]: snap.mark }
  const avail = Math.max(0, availableOf(acct, mk))
  const byMoney = avail / (price / set.leverage + price * acct.fees.taker)
  const held = findPos(acct, symbol, side)?.qty ?? 0
  // 이 레버리지를 허용하는 가장 큰 구간의 끝까지.
  let tierCap = 0
  for (const t of rules.tiers) if (t.maxLeverage + EPS >= set.leverage) tierCap = Math.max(tierCap, t.maxQty)
  const byTier = Math.max(0, tierCap - held)
  return Math.max(0, floorStep(Math.min(byMoney, byTier), rules.stepSize))
}
