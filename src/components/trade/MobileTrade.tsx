import { useEffect, useState } from 'react'
import type { SymbolInfo } from '../../lib/symbols'
import { usePaper } from '../../lib/paper/context'
import { OrderPanel, type OrderDraft } from './OrderPanel'
import { TradingPanel } from './TradingPanel'

export interface MobileTradeProps {
  symbol: string
  symbols: SymbolInfo[]
  onSelectSymbol: (symbol: string) => void
  /** 차트 우클릭 "여기에 지정가 …" 로 주문창 가격·유형을 채운다. nonce 가 바뀔 때마다 반영. */
  draft?: OrderDraft | null
  /** 주문창이 초안을 채운 직후 — App 이 초안을 지운다. */
  onDraftApplied?: () => void
}

type MobileTradeTab = 'order' | 'book'

/**
 * 폰 거래 시트 내용: 주문 | 포지션·주문 두 갈래.
 * TradingPanel 은 내부 탭(포지션·미체결·내역·계좌)을 스스로 가지므로 하나로 묶어 보여 준다.
 */
export function MobileTrade({ symbol, symbols, onSelectSymbol, draft, onDraftApplied }: MobileTradeProps) {
  const [tab, setTab] = useState<MobileTradeTab>('order')
  const { account } = usePaper()
  const openCount = account.positions.length + account.orders.length

  // 이 종목 지정가 초안이 들어오면 주문 탭으로 이동한다(주문창이 채우고 App 이 지운다).
  const draftNonce = draft && draft.symbol === symbol ? draft.nonce : undefined
  useEffect(() => {
    if (draftNonce != null) setTab('order')
  }, [draftNonce])

  return (
    <div className="m-tradesheet">
      <div className="m-trade-tabs" role="tablist" aria-label="거래">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'order'}
          className={`m-trade-tab${tab === 'order' ? ' active' : ''}`}
          onClick={() => setTab('order')}
        >
          주문
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'book'}
          className={`m-trade-tab${tab === 'book' ? ' active' : ''}`}
          onClick={() => setTab('book')}
        >
          포지션·주문
          {openCount > 0 && <span className="m-trade-badge">{openCount}</span>}
        </button>
      </div>
      <div className="m-trade-body">
        {tab === 'order' ? (
          <OrderPanel symbol={symbol} symbols={symbols} compact draft={draft} onDraftApplied={onDraftApplied} />
        ) : (
          <TradingPanel symbols={symbols} activeSymbol={symbol} onSelectSymbol={onSelectSymbol} variant="mobile" />
        )}
      </div>
    </div>
  )
}
