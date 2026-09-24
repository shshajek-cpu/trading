/**
 * 모의 선물거래(페이퍼 트레이딩) 공용 타입 — 엔진·저장·화면이 모두 이 계약을 따른다.
 *
 * 규칙은 OKX USDT 무기한(롱/숏 모드 = 한 종목에 롱·숏 포지션을 따로 가진다), 가격은 바이낸스 USDT-M 시세.
 * 금액은 모두 USDT, 수량은 바이낸스 심볼 단위의 코인 수량(1000PEPEUSDT 면 "1000PEPE" 개수), 시각은 ms.
 */

export type PosSide = 'long' | 'short'
export type MarginMode = 'cross' | 'isolated'
/** 발동 기준 가격: 최근 체결가 또는 마크 가격. */
export type TriggerBy = 'last' | 'mark'
/** 진입(포지션을 늘림) 또는 종료(줄임). 종료 주문은 항상 포지션 줄이기 전용이다. */
export type OrderAction = 'open' | 'close'
export type OrderType = 'market' | 'limit' | 'trigger'

/** 주문창·차트·포지션 목록이 만드는 주문 요청. 레버리지·마진 모드는 계좌의 종목 설정을 따른다. */
export interface OrderRequest {
  symbol: string
  side: PosSide
  action: OrderAction
  type: OrderType
  /** 코인 수량. 종료 주문에서 0 이하면 그 포지션 전량. */
  qty: number
  /** limit: 지정가. trigger: 발동 뒤 넣을 지정가(없으면 발동 즉시 시장가). */
  price?: number
  /** trigger 전용 — 이 가격에 닿으면 발동. */
  triggerPrice?: number
  triggerBy?: TriggerBy
  /** 진입 주문 전용 — 체결되면 포지션의 TP/SL 로 붙는다. */
  tp?: number
  sl?: number
  tpSlBy?: TriggerBy
}

/** 체결을 기다리는 주문(지정가·조건부). 시장가는 남지 않는다. */
export interface PaperOrder {
  id: string
  symbol: string
  side: PosSide
  action: OrderAction
  type: 'limit' | 'trigger'
  qty: number
  price?: number
  triggerPrice?: number
  triggerBy?: TriggerBy
  /** 발동 방향 — 기준가가 triggerPrice 이상(up)·이하(down)가 되면 발동. 넣을 때의 가격으로 정한다. */
  triggerDir?: 'up' | 'down'
  leverage: number
  marginMode: MarginMode
  tp?: number
  sl?: number
  tpSlBy?: TriggerBy
  /** 진입 주문이 묶어 둔 증거금 + 예상 수수료(USDT). 종료 주문은 0. */
  frozen: number
  createdAt: number
  updatedAt: number
}

export interface TpSl {
  price: number
  by: TriggerBy
}

export interface PaperPosition {
  /** `${symbol}:${side}` — 롱/숏 모드라 종목·방향마다 하나. */
  id: string
  symbol: string
  side: PosSide
  marginMode: MarginMode
  leverage: number
  qty: number
  /** 평균 진입가. */
  entry: number
  /** 격리: 이 포지션에 묶인 증거금(추가·감소 반영). 교차: 0 — 필요 증거금은 마크가로 그때그때 계산한다. */
  isoMargin: number
  tp?: TpSl
  sl?: TpSl
  openedAt: number
  /** 수량·증거금·TP/SL 이 마지막으로 바뀐 시각 — 되짚기(catch-up)에서 이 뒤의 시세만 본다. */
  updatedAt: number
  /** 이 포지션에 반영한 마지막 펀딩 시각. 같은 펀딩을 두 번 매기지 않는다. */
  fundingAt: number
  /** 연 뒤 실현된 손익 합(부분 종료 손익 − 수수료 ± 펀딩). 표시용. */
  realized: number
  /** 마지막으로 알던 마크가 — 체결·되짚기 때 적어 둔다. 시세가 아직 없을 때(재시작·다른 종목 교차 계산) 평가에 쓴다. */
  lastMark?: number
}

export type FillReason = 'order' | 'market' | 'tp' | 'sl' | 'liquidation'

export interface PaperFill {
  id: string
  orderId?: string
  symbol: string
  side: PosSide
  action: OrderAction
  qty: number
  price: number
  fee: number
  /** 종료 체결의 실현 손익(수수료 제외). 진입은 0. 강제 청산은 잃은 증거금(음수). */
  pnl: number
  maker: boolean
  reason: FillReason
  at: number
}

export interface PaperFunding {
  id: string
  symbol: string
  side: PosSide
  qty: number
  rate: number
  mark: number
  /** 받으면 +, 내면 −(USDT). */
  amount: number
  at: number
}

export type OrderEnd = 'filled' | 'canceled' | 'rejected'

/** 끝난 주문. 시장가 주문(바로 체결)도 여기 남는다. */
export interface PaperOrderRecord extends Omit<PaperOrder, 'type'> {
  type: OrderType
  status: OrderEnd
  endedAt: number
  /** 취소·거절 이유(예: "포지션이 없어 취소"). */
  note?: string
  /** 체결가(filled). */
  avgPrice?: number
}

export interface SymbolSettings {
  leverage: number
  marginMode: MarginMode
}

export interface PaperAccount {
  v: 1
  startBalance: number
  /** 지갑 잔고 = 시작 잔고 + 실현 손익 − 수수료 ± 펀딩. 격리 증거금도 이 안에 들어 있다(묶여 있을 뿐). */
  balance: number
  positions: PaperPosition[]
  orders: PaperOrder[]
  /** 기록은 오래된 것부터 쌓이고 각각 최근 HISTORY_CAP 개만 남긴다. */
  fills: PaperFill[]
  orderHistory: PaperOrderRecord[]
  funding: PaperFunding[]
  /** 종목별 레버리지·마진 모드. 없으면 DEFAULT_SETTINGS. */
  settings: Record<string, SymbolSettings>
  /** 수수료율(0.0002 = 0.02%). */
  fees: { maker: number; taker: number }
  /** 시세를 이 시각까지 반영했다 — 다시 열면 여기부터 되짚는다. */
  checkedAt: number
  createdAt: number
}

export const HISTORY_CAP = 500
export const DEFAULT_START_BALANCE = 10_000
/** OKX 일반 등급 무기한 수수료. */
export const DEFAULT_FEES = { maker: 0.0002, taker: 0.0005 } as const
export const DEFAULT_SETTINGS: SymbolSettings = { leverage: 10, marginMode: 'cross' }

/** 한 종목의 그 순간 시세. 시장가는 bid/ask(없으면 last)로 체결한다. */
export interface MarketSnap {
  last: number
  mark: number
  bid?: number
  ask?: number
  at: number
}

/** 포지션 크기 구간. 크기가 커질수록 최대 레버리지가 낮아지고 유지증거금률이 오른다. */
export interface RiskTier {
  /** 이 구간이 끝나는 포지션 수량(코인, 이하). 마지막 구간은 Infinity. */
  maxQty: number
  maxLeverage: number
  /** 유지증거금률(0.004 = 0.4%). */
  mmr: number
}

export interface SymbolRules {
  symbol: string
  tickSize: number
  stepSize: number
  minQty: number
  maxLeverage: number
  /** 수량 오름차순. */
  tiers: RiskTier[]
  /** okx = OKX 공개 구간표, default = OKX 에 없는 종목의 기본값(최대 20배·유지 2.5%). */
  source: 'okx' | 'default'
}

export type RulesOf = (symbol: string) => SymbolRules | null

/* ── 엔진 결과 ─────────────────────────────────────────────── */

export type EngineEvent =
  | { kind: 'fill'; fill: PaperFill }
  | { kind: 'liquidation'; fill: PaperFill }
  | { kind: 'canceled'; order: PaperOrderRecord }
  | { kind: 'triggered'; order: PaperOrder }
  | { kind: 'funding'; funding: PaperFunding }

export interface EngineResult {
  account: PaperAccount
  events: EngineEvent[]
}

export type ActionResult = EngineResult | { error: string }

/** 되짚기용 1분봉(체결가 또는 마크 가격). */
export interface Bar {
  openTime: number
  closeTime: number
  open: number
  high: number
  low: number
  close: number
}

export interface FundingEvent {
  time: number
  rate: number
  mark: number
}

/* ── 파생 값(시세로 매번 계산, 저장하지 않음) ───────────────── */

export interface PositionView {
  position: PaperPosition
  mark: number
  notional: number
  /** 미실현 손익(마크가 기준). */
  upl: number
  /** 증거금 대비 수익률(%). */
  roe: number
  /** 표시 증거금 — 격리는 isoMargin, 교차는 수량×마크/레버리지. */
  margin: number
  mmr: number
  maintenance: number
  /** 예상 강제 청산가. 청산될 수 없으면 null. */
  liqPrice: number | null
}

export interface AccountSummary {
  /** 총자산 = 잔고 + 전체 미실현 손익. */
  equity: number
  balance: number
  upl: number
  /** 새 주문에 쓸 수 있는 금액. */
  available: number
  /** 포지션에 쓰인 증거금(격리 + 교차). */
  usedMargin: number
  /** 미체결 진입 주문이 묶은 금액. */
  frozen: number
  /** 교차 유지증거금 합. */
  maintenance: number
  /** 교차 증거금률 = 교차 자산 ÷ 교차 유지증거금(×100, %). 교차 포지션이 없으면 null. 100% 이하면 강제 청산. */
  marginRatio: number | null
}

export interface OrderEstimate {
  notional: number
  margin: number
  fee: number
  liqPrice: number | null
}

/* ── 화면이 쓰는 훅 API(usePaperTrading → PaperContext) ─────── */

export type PaperSyncMode = 'local' | 'server'
export type PaperSyncStatus = 'idle' | 'saving' | 'error' | 'offline'

export interface PaperQuote {
  last: number
  mark: number
  /** 현재 펀딩비율과 다음 정산 시각(ms). */
  fundingRate: number | null
  nextFundingTime: number | null
  at: number
}

/** 시세로 바뀌는 값 — 초당 최대 4번 갱신한다. `usePaperLive` 로 구독. */
export interface PaperLive {
  quotes: Record<string, PaperQuote>
  summary: AccountSummary
  /** 포지션 id → 파생 값. */
  positions: Record<string, PositionView>
}

export interface PaperLiveStore {
  get: () => PaperLive
  subscribe: (listener: () => void) => () => void
}

export interface PaperApi {
  account: PaperAccount
  /** 시세로 바뀌는 값(평가 손익·청산가·시세). 화면은 `usePaperLive(selector)` 로 읽는다. */
  live: PaperLiveStore
  sync: { mode: PaperSyncMode; status: PaperSyncStatus; message: string }
  /** 앱을 꺼 둔 동안의 시세를 되짚는 중. */
  catchingUp: boolean
  /** 규칙(구간표). 아직 못 받았으면 null — 받는 대로 다시 그린다. */
  rules: RulesOf
  /** 이 종목 시세를 계속 받는다(주문창이 보고 있는 종목). 돌려준 함수로 끊는다. */
  watch: (symbol: string) => () => void
  /** 동작은 모두 오류 문구(실패) 또는 null(성공)을 돌려준다. */
  place: (req: OrderRequest) => Promise<string | null>
  cancel: (orderId: string) => Promise<string | null>
  cancelAll: (symbol?: string) => Promise<string | null>
  amend: (orderId: string, patch: { price?: number; triggerPrice?: number; qty?: number }) => Promise<string | null>
  /** 시장가 종료. qty 생략·0 이하 = 전량. */
  close: (symbol: string, side: PosSide, qty?: number) => Promise<string | null>
  /** undefined = 그대로, null = 지움. */
  setTpSl: (symbol: string, side: PosSide, tp: TpSl | null | undefined, sl: TpSl | null | undefined) => Promise<string | null>
  /** 격리 증거금 추가(+)·감소(−). */
  adjustMargin: (symbol: string, side: PosSide, delta: number) => Promise<string | null>
  setSymbolSettings: (symbol: string, patch: Partial<SymbolSettings>) => Promise<string | null>
  reset: (startBalance: number) => Promise<string | null>
  setFees: (fees: { maker: number; taker: number }) => Promise<string | null>
  /** 주문 전 예상치(증거금·수수료·청산가). 시세·규칙이 없으면 null. */
  estimate: (req: OrderRequest) => OrderEstimate | null
  /** 이 방향으로 지금 열 수 있는 최대 수량(가용 금액·레버리지·구간 한도). 모르면 0. */
  maxOpenQty: (symbol: string, side: PosSide, price?: number) => number
  /** 화면이 실패 문구를 사용자에게 알린다(토스트). */
  report: (message: string) => void
}
