/**
 * 직렬화 가능한 사용자 명령. 시장가 체결가·마크가를 명령에 담아 두어, 서버 상태 위에 다시 적용해도
 * 같은 결과가 나온다(멱등). 시세 기반 체결(지정가·조건부·강제 청산)은 명령으로 남기지 않는다 —
 * 서버 상태에 되짚기를 다시 돌리면 같은 결과가 나오기 때문.
 */

import {
  adjustMargin as engineAdjustMargin,
  amendOrder,
  cancelAll,
  cancelOrder,
  closePosition,
  placeOrder,
  resetAccount,
  setFees as engineSetFees,
  setSymbolSettings,
  setTpSl,
} from './engine'
import type {
  ActionResult,
  MarketSnap,
  OrderRequest,
  PaperAccount,
  PosSide,
  RulesOf,
  SymbolSettings,
  TpSl,
} from './types'

/** 명령이 실행될 때 잡아 둔 시세 — 시장가 체결가(snap)와 종목별 마크가(marks, 교차 가용·청산가 계산용). */
export interface CommandContext {
  snap: MarketSnap
  marks: Record<string, number>
}

export type Command =
  | ({ kind: 'place'; req: OrderRequest; at: number } & CommandContext)
  | { kind: 'cancel'; orderId: string; at: number }
  | { kind: 'cancelAll'; symbol: string | null; at: number }
  | ({ kind: 'amend'; orderId: string; patch: { price?: number; triggerPrice?: number; qty?: number }; at: number } & CommandContext)
  | ({ kind: 'close'; symbol: string; side: PosSide; qty: number; at: number } & CommandContext)
  | ({ kind: 'setTpSl'; symbol: string; side: PosSide; tp: TpSl | null | undefined; sl: TpSl | null | undefined; at: number } & CommandContext)
  | ({ kind: 'adjustMargin'; symbol: string; side: PosSide; delta: number; at: number } & CommandContext)
  | ({ kind: 'setSymbolSettings'; symbol: string; patch: Partial<SymbolSettings>; at: number; snap: MarketSnap | null; marks: Record<string, number> })
  | { kind: 'reset'; startBalance: number; at: number }
  | { kind: 'setFees'; fees: { maker: number; taker: number }; at: number }

const NO_RULES = '규칙을 아직 받지 못했습니다'

/** 명령을 계좌에 적용한다. 시세·규칙이 없어 실행할 수 없으면 { error }. */
export function applyCommand(acct: PaperAccount, cmd: Command, rulesOf: RulesOf): ActionResult {
  switch (cmd.kind) {
    case 'place': {
      const rules = rulesOf(cmd.req.symbol)
      if (!rules) return { error: NO_RULES }
      return placeOrder(acct, cmd.req, cmd.snap, rules, cmd.marks)
    }
    case 'cancel':
      return cancelOrder(acct, cmd.orderId, cmd.at)
    case 'cancelAll':
      return cancelAll(acct, cmd.symbol, cmd.at)
    case 'amend': {
      const order = acct.orders.find((o) => o.id === cmd.orderId)
      if (!order) return { error: '주문을 찾을 수 없습니다' }
      const rules = rulesOf(order.symbol)
      if (!rules) return { error: NO_RULES }
      return amendOrder(acct, cmd.orderId, cmd.patch, cmd.snap, rules, cmd.marks)
    }
    case 'close': {
      const rules = rulesOf(cmd.symbol)
      if (!rules) return { error: NO_RULES }
      return closePosition(acct, cmd.symbol, cmd.side, cmd.qty, cmd.snap, rules)
    }
    case 'setTpSl':
      return setTpSl(acct, cmd.symbol, cmd.side, cmd.tp, cmd.sl, cmd.snap)
    case 'adjustMargin': {
      const rules = rulesOf(cmd.symbol)
      if (!rules) return { error: NO_RULES }
      return engineAdjustMargin(acct, cmd.symbol, cmd.side, cmd.delta, cmd.snap, rules, cmd.marks)
    }
    case 'setSymbolSettings': {
      const rules = rulesOf(cmd.symbol)
      if (!rules) return { error: NO_RULES }
      return setSymbolSettings(acct, cmd.symbol, cmd.patch, cmd.snap, rules, cmd.at, cmd.marks)
    }
    case 'reset':
      return { account: resetAccount(cmd.startBalance, cmd.at), events: [] }
    case 'setFees':
      return { account: engineSetFees(acct, cmd.fees), events: [] }
  }
}
