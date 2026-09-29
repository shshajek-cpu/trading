/**
 * 자주 찾는 야후 종목의 한글 이름. 야후 검색은 한글 검색어('삼성', '코스피')를 받지 않아 이 표로 먼저 찾고,
 * 심볼 이름표(범례·관심 목록)에도 한글 이름을 쓴다. 주식·지수 탭을 검색어 없이 열면 이 목록을 보여 준다.
 */
export interface KnownYahoo {
  /** 야후 심볼 */
  symbol: string
  /** 한글 이름 */
  ko: string
  /** 검색용 다른 이름(영문·약칭) */
  alt?: string
  kind: 'index' | 'stock' | 'etf' | 'fx' | 'future'
}

export const KNOWN_YAHOO: KnownYahoo[] = [
  // 지수
  { symbol: '^KS11', ko: '코스피', alt: 'KOSPI', kind: 'index' },
  { symbol: '^KQ11', ko: '코스닥', alt: 'KOSDAQ', kind: 'index' },
  { symbol: '^KS200', ko: '코스피 200', alt: 'KOSPI200', kind: 'index' },
  { symbol: '^GSPC', ko: 'S&P 500', alt: 'SPX 에스앤피', kind: 'index' },
  { symbol: '^IXIC', ko: '나스닥 종합', alt: 'NASDAQ', kind: 'index' },
  { symbol: '^NDX', ko: '나스닥 100', alt: 'NASDAQ100', kind: 'index' },
  { symbol: '^DJI', ko: '다우존스', alt: 'DOW', kind: 'index' },
  { symbol: '^RUT', ko: '러셀 2000', alt: 'RUSSELL', kind: 'index' },
  { symbol: '^SOX', ko: '필라델피아 반도체', alt: 'SOX', kind: 'index' },
  { symbol: '^VIX', ko: 'VIX 변동성', alt: 'VIX', kind: 'index' },
  { symbol: '^N225', ko: '니케이 225', alt: 'NIKKEI', kind: 'index' },
  { symbol: '^HSI', ko: '항셍', alt: 'HANG SENG', kind: 'index' },
  { symbol: '000001.SS', ko: '상하이 종합', alt: 'SHANGHAI', kind: 'index' },
  { symbol: '^GDAXI', ko: '독일 DAX', alt: 'DAX', kind: 'index' },
  // 환율
  { symbol: 'KRW=X', ko: '달러/원', alt: 'USDKRW 원달러 환율', kind: 'fx' },
  { symbol: 'JPYKRW=X', ko: '엔/원', alt: 'JPYKRW 엔화', kind: 'fx' },
  { symbol: 'EURKRW=X', ko: '유로/원', alt: 'EURKRW', kind: 'fx' },
  { symbol: 'EURUSD=X', ko: '유로/달러', alt: 'EURUSD', kind: 'fx' },
  { symbol: 'JPY=X', ko: '달러/엔', alt: 'USDJPY', kind: 'fx' },
  { symbol: 'DX-Y.NYB', ko: '달러 인덱스', alt: 'DXY', kind: 'index' },
  // 선물·원자재
  { symbol: 'GC=F', ko: '금 선물', alt: 'GOLD', kind: 'future' },
  { symbol: 'SI=F', ko: '은 선물', alt: 'SILVER', kind: 'future' },
  { symbol: 'CL=F', ko: 'WTI 원유 선물', alt: 'CRUDE OIL', kind: 'future' },
  { symbol: 'BZ=F', ko: '브렌트유 선물', alt: 'BRENT', kind: 'future' },
  { symbol: 'NG=F', ko: '천연가스 선물', alt: 'NATURAL GAS', kind: 'future' },
  { symbol: 'HG=F', ko: '구리 선물', alt: 'COPPER', kind: 'future' },
  { symbol: 'ES=F', ko: 'S&P 500 선물', alt: 'E-MINI', kind: 'future' },
  { symbol: 'NQ=F', ko: '나스닥 100 선물', alt: 'E-MINI NASDAQ', kind: 'future' },
  // 한국 주식
  { symbol: '005930.KS', ko: '삼성전자', alt: 'SAMSUNG ELECTRONICS', kind: 'stock' },
  { symbol: '005935.KS', ko: '삼성전자우', kind: 'stock' },
  { symbol: '000660.KS', ko: 'SK하이닉스', alt: 'SK HYNIX 하이닉스', kind: 'stock' },
  { symbol: '373220.KS', ko: 'LG에너지솔루션', alt: 'LG ENERGY', kind: 'stock' },
  { symbol: '207940.KS', ko: '삼성바이오로직스', kind: 'stock' },
  { symbol: '005380.KS', ko: '현대차', alt: 'HYUNDAI MOTOR 현대자동차', kind: 'stock' },
  { symbol: '000270.KS', ko: '기아', alt: 'KIA', kind: 'stock' },
  { symbol: '068270.KS', ko: '셀트리온', alt: 'CELLTRION', kind: 'stock' },
  { symbol: '035420.KS', ko: 'NAVER', alt: '네이버', kind: 'stock' },
  { symbol: '035720.KS', ko: '카카오', alt: 'KAKAO', kind: 'stock' },
  { symbol: '323410.KS', ko: '카카오뱅크', kind: 'stock' },
  { symbol: '005490.KS', ko: 'POSCO홀딩스', alt: '포스코', kind: 'stock' },
  { symbol: '003670.KS', ko: '포스코퓨처엠', kind: 'stock' },
  { symbol: '051910.KS', ko: 'LG화학', kind: 'stock' },
  { symbol: '006400.KS', ko: '삼성SDI', kind: 'stock' },
  { symbol: '009150.KS', ko: '삼성전기', kind: 'stock' },
  { symbol: '028260.KS', ko: '삼성물산', kind: 'stock' },
  { symbol: '032830.KS', ko: '삼성생명', kind: 'stock' },
  { symbol: '000810.KS', ko: '삼성화재', kind: 'stock' },
  { symbol: '066570.KS', ko: 'LG전자', kind: 'stock' },
  { symbol: '003550.KS', ko: 'LG', kind: 'stock' },
  { symbol: '105560.KS', ko: 'KB금융', kind: 'stock' },
  { symbol: '055550.KS', ko: '신한지주', kind: 'stock' },
  { symbol: '086790.KS', ko: '하나금융지주', kind: 'stock' },
  { symbol: '316140.KS', ko: '우리금융지주', kind: 'stock' },
  { symbol: '012330.KS', ko: '현대모비스', kind: 'stock' },
  { symbol: '012450.KS', ko: '한화에어로스페이스', kind: 'stock' },
  { symbol: '329180.KS', ko: 'HD현대중공업', kind: 'stock' },
  { symbol: '034020.KS', ko: '두산에너빌리티', kind: 'stock' },
  { symbol: '015760.KS', ko: '한국전력', kind: 'stock' },
  { symbol: '017670.KS', ko: 'SK텔레콤', kind: 'stock' },
  { symbol: '034730.KS', ko: 'SK', kind: 'stock' },
  { symbol: '096770.KS', ko: 'SK이노베이션', kind: 'stock' },
  { symbol: '030200.KS', ko: 'KT', kind: 'stock' },
  { symbol: '259960.KS', ko: '크래프톤', kind: 'stock' },
  { symbol: '352820.KS', ko: '하이브', kind: 'stock' },
  { symbol: '036570.KS', ko: '엔씨소프트', kind: 'stock' },
  { symbol: '003490.KS', ko: '대한항공', kind: 'stock' },
  { symbol: '010130.KS', ko: '고려아연', kind: 'stock' },
  { symbol: '042700.KS', ko: '한미반도체', kind: 'stock' },
  { symbol: '247540.KQ', ko: '에코프로비엠', kind: 'stock' },
  { symbol: '086520.KQ', ko: '에코프로', kind: 'stock' },
  { symbol: '196170.KQ', ko: '알테오젠', kind: 'stock' },
  { symbol: '028300.KQ', ko: 'HLB', kind: 'stock' },
  { symbol: '277810.KQ', ko: '레인보우로보틱스', kind: 'stock' },
  { symbol: '058470.KQ', ko: '리노공업', kind: 'stock' },
  { symbol: '263750.KQ', ko: '펄어비스', kind: 'stock' },
  // 미국 주식·ETF
  { symbol: 'AAPL', ko: '애플', alt: 'APPLE', kind: 'stock' },
  { symbol: 'MSFT', ko: '마이크로소프트', alt: 'MICROSOFT', kind: 'stock' },
  { symbol: 'NVDA', ko: '엔비디아', alt: 'NVIDIA', kind: 'stock' },
  { symbol: 'TSLA', ko: '테슬라', alt: 'TESLA', kind: 'stock' },
  { symbol: 'AMZN', ko: '아마존', alt: 'AMAZON', kind: 'stock' },
  { symbol: 'GOOGL', ko: '알파벳 A', alt: 'GOOGLE 구글', kind: 'stock' },
  { symbol: 'META', ko: '메타', alt: 'META PLATFORMS 페이스북', kind: 'stock' },
  { symbol: 'NFLX', ko: '넷플릭스', alt: 'NETFLIX', kind: 'stock' },
  { symbol: 'AVGO', ko: '브로드컴', alt: 'BROADCOM', kind: 'stock' },
  { symbol: 'AMD', ko: 'AMD', kind: 'stock' },
  { symbol: 'INTC', ko: '인텔', alt: 'INTEL', kind: 'stock' },
  { symbol: 'TSM', ko: 'TSMC', kind: 'stock' },
  { symbol: 'MU', ko: '마이크론', alt: 'MICRON', kind: 'stock' },
  { symbol: 'QCOM', ko: '퀄컴', alt: 'QUALCOMM', kind: 'stock' },
  { symbol: 'PLTR', ko: '팔란티어', alt: 'PALANTIR', kind: 'stock' },
  { symbol: 'COIN', ko: '코인베이스', alt: 'COINBASE', kind: 'stock' },
  { symbol: 'MSTR', ko: '스트래티지', alt: 'MICROSTRATEGY', kind: 'stock' },
  { symbol: 'IONQ', ko: '아이온큐', alt: 'IONQ', kind: 'stock' },
  { symbol: 'BRK-B', ko: '버크셔 해서웨이 B', alt: 'BERKSHIRE', kind: 'stock' },
  { symbol: 'KO', ko: '코카콜라', alt: 'COCA-COLA', kind: 'stock' },
  { symbol: 'DIS', ko: '디즈니', alt: 'DISNEY', kind: 'stock' },
  { symbol: 'NKE', ko: '나이키', alt: 'NIKE', kind: 'stock' },
  { symbol: 'SBUX', ko: '스타벅스', alt: 'STARBUCKS', kind: 'stock' },
  { symbol: 'BA', ko: '보잉', alt: 'BOEING', kind: 'stock' },
  { symbol: 'SPY', ko: 'SPDR S&P 500 ETF', kind: 'etf' },
  { symbol: 'QQQ', ko: '인베스코 QQQ', alt: 'NASDAQ ETF', kind: 'etf' },
  { symbol: 'SOXL', ko: '반도체 3배 ETF', alt: 'SOXL', kind: 'etf' },
  { symbol: 'TQQQ', ko: '나스닥 3배 ETF', alt: 'TQQQ', kind: 'etf' },
]

const BY_SYMBOL: Record<string, KnownYahoo> = Object.fromEntries(KNOWN_YAHOO.map((k) => [k.symbol, k]))

export function knownYahoo(symbol: string): KnownYahoo | undefined {
  return BY_SYMBOL[symbol]
}
