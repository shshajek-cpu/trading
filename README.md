# Trading

바이낸스 USDT-M 선물(BTC 등) 실시간 차트. 블랙 & 화이트 모노크롬 다크 테마에
글래스모피즘 UI를 얹었고, 지표와 가격 도달 알림을 붙였다.

## 실행

```bash
npm install
npm run dev     # http://localhost:5173
```

```bash
npm run build   # 타입체크 + 프로덕션 빌드
npm run lint
```

## 기능

**차트**
- 캔들스틱 + 거래량 히스토그램(메인 패널 하단 오버레이)
- 심볼 선택(검색 가능) / 인터벌 전환 `1m · 5m · 15m · 1h · 4h · 1d`
- 현재가와 24시간 변동률 표시(상승 흰색 / 하락 회색)
- 우상단 점으로 웹소켓 연결 상태 표시(밝음 연결 · 어두움 끊김)
- 창 크기에 따라 자동 리사이즈

**지표**
- 이동평균(SMA/EMA) — 기간·색상 지정, 추가/삭제 자유. 기본 7 / 25 / 99
- RSI, MACD — 각각 별도 패널. on/off 및 파라미터 조절 가능
- 계산은 `src/lib/indicators.ts` 의 순수 함수. RSI 는 Wilder smoothing 을 쓴다

**화면 분할**
- 1 / 2 / 4분할. 칸마다 심볼·인터벌 독립, 클릭한 칸이 활성(알림 추가 대상)
- 레이아웃과 각 칸의 심볼/인터벌은 localStorage에 저장되어 복원된다
- 모바일(≤900px)에서는 분할이 세로 스택으로 바뀜다

**PWA (모바일 앱)**
- 홈 화면에 추가하면 standalone 앱처럼 실행된다 (manifest + service worker)
- 앱 셸만 캐시하고 시세 API는 캐시하지 않는다 (NetworkOnly)

**PiP 미니창**
- 툴바의 "미니창" 버튼 — 항상 위에 뜨는 작은 창에 활성 칸의 실제 캔들차트 + 현재가 표시
- 다른 작업 중 시세를 곁눈질하는 용도. Document Picture-in-Picture 지원 브라우저(크롬·엣지) 전용

**가격 알림**
- 조건(이상/이하) + 가격으로 등록하면 차트에 수평선이 그려진다
- 도달하면 브라우저 알림 + 화면 토스트. 한 번 발동하면 자동으로 비활성화된다
- 목록은 localStorage 에 저장되어 새로고침해도 남는다
- 알림 권한이 없거나 차단된 경우 토스트로만 안내한다

## 구조

```
src/
  components/   Chart, Toolbar, IndicatorPanel, AlertPanel, Toasts
  hooks/        useBinanceKlines, useBinanceWebSocket, usePriceAlerts,
                useNotifications, useSymbols, useTicker24h
  lib/          binance(API·타입), indicators(지표 계산), indicatorConfig, theme
```

## 차트 엔진

차트 렌더링은 TradingView 의 오픈소스 [lightweight-charts](https://github.com/tradingview/lightweight-charts)를 사용한다 (Apache-2.0).
자세한 정보는 [https://www.tradingview.com/](https://www.tradingview.com/) 참고.

## 데이터 출처

바이낸스 선물 퍼블릭 API를 브라우저에서 직접 호출한다. 별도 백엔드나 API 키가 없다.

- 과거 캔들 `GET https://fapi.binance.com/fapi/v1/klines` (최대 1000개)
- 심볼 목록 `GET /fapi/v1/exchangeInfo` — 거래중인 USDT 페어만
- 시세 `GET /fapi/v1/ticker/24hr` — 10초 주기 폴링
- 실시간 `wss://fstream.binance.com/ws/{symbol}@kline_{interval}`

## 주의

- 브라우저에서 바이낸스로 직접 접속하므로 **지역에 따라 차단될 수 있다.** 이 경우 차트가
  비거나 연결 상태 점이 빨간색으로 남는다.
- 웹소켓이 끊기면 지수 백오프(1s → 최대 30s)로 재연결하고, 다시 붙으면 캔들을 재조회해
  끊긴 동안의 공백을 메운다.
- 알림은 화면에 떠 있는 모든 칸의 심볼을 감시한다. 웹소켓 틱과 10초 주기 시세 양쪽에서 검사한다. 웹소켓이 막힌 환경에서도
  최대 10초 안에는 발동한다.
- 기본 알림 감시는 페이지가 열려 있는 동안 동작한다. `앱 꺼도 알림 받기`를 켜면 서버가 최대 1분 주기로 대신 감시한다.
- iPhone·iPad의 백그라운드 알림은 iOS·iPadOS 16.4 이상에서 홈 화면에 추가한 앱으로 열어야 동작한다.
- 시세 조회용일 뿐 주문 기능은 없다. 투자 판단의 근거로 쓰기 전에 거래소 화면과 대조하라.
