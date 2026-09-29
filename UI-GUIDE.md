# UI 가이드 — TradingView 패리티

이 앱은 tradingview.com/chart 의 배치·치수·상호작용·색을 기준으로 다시 짰다.
겉모습은 **평면(flat)** 이다. 유리·블러·그림자 남용·번들 글꼴은 없다. 색과 치수는 전부
`src/styles/tokens.css` 의 `--tv-*` 변수에서만 가져온다. 데스크톱과 모바일은 상태를 공유하되
화면 구조는 다르게 그린다.

TradingView 의 코드·CSS·아이콘·로고·자산은 절대 베끼지 않는다. 아이콘은 `Icon.tsx` 에
28×28 그리드, 1.5px 단일 획으로 직접 그린 것만 쓴다.

---

## 1. 토큰 (styles/tokens.css)

- **표면**: `--tv-bg`(툴바·차트·위젯) · `--tv-elevated`(메뉴·다이얼로그·서랍) · `--tv-hover` · `--tv-active` · `--tv-gutter`(4px 간격/헤어라인).
- **선**: `--tv-border`, `--tv-border-strong`.
- **글자**: `--tv-text`, `--tv-text-strong`, `--tv-text-dim`, `--tv-text-faint`.
- **시장색**: `--tv-accent`(#2962ff), `--tv-up`(#089981), `--tv-down`(#f23645), `--tv-warn`.
- **치수**: 상단 툴바 38px · 좌측 도구 52px · 위젯 페이지 302px · 위젯 탭 45px · 하단 바 38px · 간격 `--tv-gap` 4px. 폰 앱은 `components/mobile/mobile.css`(탭 막대 56px · 차트 도구 줄 52px · 시트 둥근 모서리 16px).
- 테마는 `<html data-theme="dark|light">` 로 전환한다. 다크가 기본. `App` 이 설정 변경 시 `document.documentElement.dataset.theme` 를 갱신한다.

색을 하드코딩하지 않는다. 캔버스(lightweight-charts)만 `lib/theme.ts` 의 `CHART_PALETTES` 로 색을 받는다.

---

## 2. 데스크톱 배치

CSS 그리드 한 판(`.tv-app`), 칸 사이는 `--tv-gap` 거터.

```
┌──────┬─────────────────────────────────────────────┐ 38px 상단 툴바
│  ≡   │ [심볼][⊕][1m 15m 1h 4h D ▾][유형▾][ƒ 지표][템플릿][⏰][리플레이][↶][↷] … [레이아웃▾][저장][🔍][⚙][⛶][📷][미니창] │
├──────┼───────────────────────────────┬─────────┬───┤
│ 좌측 │ 차트 격자(최대 9칸, 드래그 분할) │ 위젯    │탭 │
│ 도구 │                               │ 페이지  │45 │
│ 52px ├───────────────────────────────┤ 302px   │px │
│      │ 거래 패널(기본 펼침 260px, 끌어 조절) │    │   │
│      ├───────────────────────────────┤         │   │
│      │ 하단 바(기간·시계·%·log·auto)  │         │   │
└──────┴───────────────────────────────┴─────────┴───┘
```

- **상단 툴바**(`TopToolbar`): 심볼 알약(128×28, `심볼 검색` 열기) · 심볼 비교 ⊕(`심볼 비교`) · 즐겨찾기 간격 버튼 + 간격 메뉴(☆ 즐겨찾기 토글, `useUiPrefs` 에 저장) · 차트 유형 메뉴 · 지표 · 지표 템플릿(팝오버) · 알림 · 리플레이 · 실행 취소/다시 실행 · (유동 간격) · 레이아웃 · 저장 · 빠른 검색 · 설정 · 전체 화면 · 스냅샷 · 미니창.
- **좌측 도구**(52px): `DrawingToolbar`.
  - 그리기 도구 목록은 `lib/drawings` 의 `TOOL_GROUPS` 하나에서 나온다(왼쪽 툴바 플라이아웃·폰 ✎ 시트 타일·빠른 검색이 같이 쓴다). 갠·피보나치 그룹은 「피보나치」「갠」 두 구획이다.
  - 점 수가 정해지지 않은 도구(경로·폴리라인)는 마지막 점을 다시 누르거나(두 번 클릭·두 번 탭) Enter·Esc 로 마친다 — 폰은 두 번 탭으로 끝낸다. 도구 칩 ✕ 는 그리던 것을 버린다.
  - 글을 적는 그림(텍스트·노트·말풍선·코멘트·표지판)은 `lib/drawings` 의 `TEXT_EDITORS`(한 줄/여러 줄, 편집기를 띄울 점)로 같은 인라인 편집기를 쓴다. 점이 하나면 누른 자리에서 열고, 말풍선은 두 점을 찍은 뒤 글 상자 자리에서 연다. 글을 적어 마쳐야 만들어진다.
- **차트 그리드**(`ChartGrid`): 격자 = 줄(1~4) × 줄마다 칸 수(1~4), 모두 9칸까지(`layoutConfig.LayoutGrid` — `dir` 'rows' 는 가로 줄을 위에서 아래로, 'cols' 는 세로 줄을 왼쪽에서 오른쪽으로 쌓는다. 왼쪽 크게 + 2칸 = cols [1, 2]). 칸은 모두 한 부모 아래 절대 배치라 격자를 바꿔도 남는 칸의 차트를 다시 만들지 않는다. 줄 사이·칸 사이 경계 막대(4px, `role="separator"`)를 끌어 비율을 바꾸고(최소 80px), 더블클릭·Enter 는 그 경계 양옆을 균등, 방향키는 2%(Shift 10%). 레이아웃 메뉴(`menus/LayoutMenu`) = 칸 수별 모양 그림 프리셋(1 · 좌우/위아래 2 · 좌우/위아래 3 · 왼쪽 크게+2 · 위 크게+2 · 2×2 · 좌우 4 · 왼쪽 크게+3 · 3×2 · 2×3 · 4×2 · 3×3) · 직접 만들기(줄 방향, 줄 추가·빼기, 줄마다 칸 수, 바로 바뀌는 미리보기 → 적용) · 균등 분할 · 내 레이아웃(격자 + 칸 설정을 이름 붙여 저장·적용·이름 바꾸기·삭제(되돌리기 토스트), 동기화 키 `trading.savedLayouts.v1`) · 「모든 칸에 같이 적용」 = 심볼 · 차트 종류(`layoutConfig.syncSymbol`/`syncChartType`). 모양 아이콘은 `Icon.tsx` 의 `LayoutIcon` 이 격자에서 바로 그린다. `cells` 는 늘 9칸이고 앞에서부터 격자 칸 수만큼 보인다(줄였다 늘려도 숨은 칸 설정이 남는다). MTF 프리셋은 앞 칸들에 걸고 칸이 모자라면 격자를 늘린다. 옛 저장값(layout 1/2/4 + splitCol/splitRow)은 읽을 때 격자로 바꾼다. 동기화 합치기는 모양을 한 덩어리 문자열(`shape: "rows:2,2"`)로 두어 두 기기의 모양을 섞지 않고, 크기 비율이 모양과 안 맞으면 균등, 칸은 자리 번호별로 합친다. 활성 칸만 그리기·핀 입력을 받는다. 십자선은 늘 모든 분할 칸에 같이 보인다 — 커서가 있는 칸의 시각을 다른 칸은 그 시각을 품는 봉의 세로선으로, 같은 종목 칸은 커서 가격의 가로선·가격 라벨까지 보이고, 다른 종목 칸과 보조 지표 칸에 커서가 있을 때는 세로선만 보인다(`chart/crosshairSync` 모듈 구독으로 주고받아 React 상태를 거치지 않는다. PiP 창은 제외). 최대화해도 다른 칸은 `display:none` 으로 살려 둔다(다시 불러오지 않음). 리플레이는 시작한 칸(`replayCell`)에 붙어 있고 활성 칸이 바뀌어도 이어지며, 격자를 줄여 그 칸이 사라지면 끝난다.
- **십자선 자석·현재가 배지**: 차트 설정의 십자선 「자석」은 `CrosshairMode.MagnetOHLC`(가격 칸 시리즈의 시고저종·선 값 중 커서에 가장 가까운 값에 붙음)이고, 다른 칸에 보내는 가격도 그 값이다(`magnetPrice`). 다른 칸이 맞춰 주는 동안만 일반 모드로 두어 받은 가격이 그 칸 봉에 다시 붙지 않게 한다. 현재가·카운트다운 배지(캔버스 위 HTML)는 십자선 가격 라벨과 겹치는 동안 숨긴다(`coverCountdown`) — 트레이딩뷰처럼 십자선 라벨이 위에 보인다.
- **하단 바**(`BottomBar`): 기간 프리셋(1일→1m … 전체→1M, 클릭 시 활성 칸 간격 변경 후 `getChart(active).setVisibleRange`) · 시계(시간대 메뉴) · % / log / auto(활성 칸 스케일).
- **거래 패널**(`TradingPanel`, `.tv-trade-cell`): 차트 그리드와 하단 바 사이, 거래소 아래 창처럼 펼친 채 시작한다. 위쪽 경계(`.tp-resize`)를 끌어 높이를 바꾸고(기기마다 `useUiPrefs.tradePanelHeight`), ˅ 로 접는다(머리 줄 32px 만 남음). 탭 = 포지션 · 포지션 기록 · 미체결 · 주문 내역 · 체결 내역 · 자금 내역, 오른쪽 260px 는 자산 칸(폰은 자산 탭).
- **위젯 바**(`WidgetBar`): 우측 탭 45px + 페이지 302px. 탭 = 관심 목록·거래(주문창 `OrderPanel`)·알림·객체 트리·멀티 타임프레임·핀·탐색·동기화. 열린 탭을 다시 누르면 페이지가 접힌다. 알림 탭에 개수 배지(울리지 않았고 만료되지 않은 알림만). 알림 페이지(`AlertsWidget`, 폰은 알림 탭에 같은 것)는 가격·지표·선 알림 목록(행마다 연필 = 가격 알림은 `CreateAlertDialog`, 선 알림은 `LineAlertDialog`) 아래에 「알림 설정」(`.tv-switch` — 새 수평선에 알림 자동 켜기·알림 소리, 차트 설정 → 알림 탭과 같은 값)과 「알림 기록」(최근 100개, 앱/서버)을 둔다. 트리거·재알림·만료 칸은 두 알림 창이 `AlertTimingFields` 를 함께 쓴다.
- **토스트**(`Toasts`): 오른쪽 아래(폰은 탭 막대·차트 도구 줄 위). 되돌릴 수 있는 동작(지표·그림 일괄 삭제, 템플릿 적용)과 새 버전 알림은 동작 버튼(`pushToast(message, { label, run })`)을 단다.
- **차트 위 거래 선**(`chart/trade/TradeOverlay`): 진입가·익절·손절·미체결 주문·청산가 선과 왼쪽 라벨. 라벨을 끌어 가격을 바꾸고(청산가 제외) ✕ 로 종료·취소한다. 라벨은 시리즈 프리미티브의 `updateAllViews` 에서 위치만 옮긴다(렌더 없음).

---

## 3. 폰 앱 배치 (≤900px) — TradingView 앱 구조

데스크톱을 줄인 화면이 아니다. `MobileShell` 이 TradingView 앱처럼 아래 탭과 아래 시트로 그린다. 차트 영역은 데스크톱과 같은 격자(설정 동기화로 공유, 1px 경계)를 쓴다 — 세로 화면에서 칸이 너무 좁으면(200×120px 미만) 줄 방향을 뒤집어 보인다(좌우 2칸 → 위아래, 좌우 4칸 → 위아래 4칸, 4×2 → 2×4). 칸을 누르거나 끌면 그 칸이 활성(파란 테두리)이 되고, 아래 도구 줄·시트는 활성 칸을 다룬다.

```
┌────────────────────────────────────┐
│ 차트 + 범례(전체 폭)          가격축 │  과거로 밀면 » (최근 봉으로)
│                         시간축  ⚙  │  ⚙ = 가격 축 시트
├────────────────────────────────────┤ 52px 차트 도구 줄(차트 탭에서만)
│ (코인) BTCUSDT.P  1m     거래  +  ✎  ⋯ │
├────────────────────────────────────┤ 56px 탭 막대 + 아래 안전 영역
│ ☆관심 목록  차트  알림  탐색  ≡메뉴 │
└────────────────────────────────────┘
```

- **탭**: 관심 목록(큰 제목, 두 줄 행 — 누르면 그 종목 차트로, ⋯ → 목록 편집에서 위/아래·빼기) · 차트 · 알림 · 탐색 · 메뉴. 차트는 다른 탭에 있어도 떠 있어 돌아와도 다시 불러오지 않는다. 차트가 아닌 탭에서 뒤로가기 = 차트 탭.
- **차트 도구 줄**: 심볼(검색) · 주기(주기 시트) · 거래 시트(주문창·포지션·미체결·내역 — `MobileTrade`) · + 추가 시트(그리기·지표·알림·비교·지표 템플릿·차트 사진 저장) · ✎ 그리기 시트(도구 타일·자석·모드 유지·잠금·숨기기·실행 취소·삭제) · ⋯ 더보기 시트(심볼 정보·레이아웃·차트 유형·알림 관리·기간·날짜로 이동·바 리플레이·객체 트리·차트 설정·핀·동기화).
- **레이아웃 시트**: 모양 프리셋(44px), 직접 만들기, 칸 크기 조절(시트를 닫고 경계마다 44px 손잡이 + "칸 크기 조절 · 균등 · ✕" 칩, 뒤로가기로 끝), 균등 분할, 이 칸 크게 보기(뒤로가기로 분할 복귀), 가격 축 표시(폰 전용 `useUiPrefs.mobilePriceAxis` — 끄면 칸마다 오른쪽 가격 축과 현재가 배지를 숨겨 차트를 넓힌다. ⚙ 가격 축 시트 맨 위에도 같은 항목, ⚙ 버튼은 축이 꺼져도 44px 로 남는다), 내 레이아웃, 모든 칸에 같이 적용(심볼·차트 종류). 격자를 바꾸면 데스크톱 레이아웃도 같이 바뀐다.
- 그리기 도구를 고르면 시트가 닫히고 시간축 위에 "도구 ✕" 칩이 뜬다. ✕ 로 그리기를 끝낸다.
- **시트**: `BottomSheet`(배경 탭·✕·Esc·안드로이드 뒤로가기로 닫힘). 타일은 `SheetTiles`, 목록은 `SheetList`(우클릭 메뉴와 같은 `MenuEntry` 를 받는다 — ⚙ 가격 축 시트가 데스크톱 가격축 메뉴와 같은 항목을 쓴다).
- 안전 영역(`--sat`/`--sab`, 가로 모드는 `--sal`/`--sar` 까지) 패딩과 안드로이드 뒤로가기·Esc 닫기(`useBackClose`)를 시트·다이얼로그에 붙인다. 다이얼로그 층(960)은 시트(950) 위, 메뉴(1000)·토스트(1100)·툴팁(2000)은 그 위.

---

## 4. 키보드 단축키 (`useShortcuts`)

입력칸/텍스트영역/contenteditable 에 포커스가 있거나, 대화상자·시트·서랍이 열려 있으면(`hasOpenOverlay`) 전부 무시한다.

- **도구**: Alt+T 추세선 · Alt+H 수평선 · Alt+J 수평 광선 · Alt+V 수직선 · Alt+C 크로스라인 · Alt+F 피보나치 · Alt+Shift+R 사각형.
- Esc: 십자선으로 되돌리고 열린 메뉴를 닫는다.
- Ctrl+Z / Ctrl+Y(또는 Ctrl+Shift+Z): 실행 취소 / 다시 실행.
- Alt+R 보기 초기화 · Alt+A 알림 · Alt+S 스냅샷 · Ctrl+K 빠른 검색 · Shift+F 전체 화면.
- 글자 하나 → 심볼 검색을 그 글자로 채워 연다. 숫자 하나 → `주기 변경` 상자(“5”→5m, “60”/“1h”→1h, “240”→4h, “D”→1d, “W”→1w, “M”→1M; Enter 적용, 오류는 빨강).

---

## 5. 슬라이스 경계

`App`(슬라이스 C)은 다른 슬라이스의 컴포넌트를 **계약대로** 조립하기만 한다.

- A(그리기): `DrawingToolbar`, `ObjectTree`, `useDrawings`, `lib/drawings`.
- B(차트/지표): `ChartCell`, `IndicatorsDialog`, `IndicatorTemplatesMenu`, `lib/indicatorConfig`, `lib/indicatorStorage`.
- D(심볼/관심/알림): `SymbolSearchDialog`, `CreateAlertDialog`, `widgets/*`, `useSymbols`, `useWatchlist`, `usePriceAlerts`, `lib/symbols`.
- 시장(Markets): `lib/market/*`(심볼 id·주기 계획·어댑터·실시간), `useKlines`·`useLiveCandles`·`useTicker24h`·`useMiniTickers`, `functions/api/yahoo.ts`. 다른 코드는 심볼을 불투명한 문자열(`BTCUSDT`·`BSPOT:BTCUSDT`·`UPBIT:KRW-BTC`·`YF:AAPL`)로 다루고, 시장을 알아야 하면 `lib/market/ids`(`marketOf`·`supportsPaperTrading`·`supportsInterval`)만 부른다. 거래소 API 를 컴포넌트에서 직접 부르지 않는다 — `lib/market`(`fetchCandles`·`fetchOlder`·`fetchTicker`)과 `lib/market/live`(`subscribeCandles`·`subscribeTickers`)를 거친다.

`CellConfig`(symbol·interval·chartType·scaleMode·autoScale·compare)는 C 가 소유하고 관대하게 파싱한다.
차트 명령(스냅샷·보기 초기화·가시 범위)은 `lib/chartRegistry` 의 `getChart(cellIndex)` 로 부른다.

---

## 6. 규칙

- 새 겹침 요소(서랍·오버레이·다이얼로그)에는 반드시 `useBackClose` 를 붙이고, 따로 Esc 를 듣지 않는다 — 뒤로가기와 Esc 는 스택 맨 위 하나만 닫는다. 안쪽 입력칸이 Esc 를 쓰면 `preventDefault` 한다.
- 라벨은 상태로 바뀌지 않는다. 상태는 색·배경(`.active`)으로 알린다.
- 이모지 금지. 아이콘은 `Icon.tsx` 에만 추가한다.
- 켜고 끄기는 `.tv-switch`.
- 손가락 표적은 모바일에서 최소 44px. 입력 글자는 16px 이상(iOS 확대 방지).
- 기기별로 달라야 하는 값(즐겨찾기 간격·그리기 토글·단축키)은 `useUiPrefs`·`trading.shortcuts.v1`(동기화 제외)에, 공유값은 동기화 키에 둔다.
- 아이콘 버튼에는 `title` 대신 `{...tip(이름, 설명, 단축키, 방향)}`(`lib/tooltip`)을 단다. `TooltipLayer` 가 마우스를 올렸을 때 이름·단축키·설명을 띄운다. 단축키는 `shortcutKeys.label(id)` 로 사용자가 바꾼 키를 쓴다. 왼쪽 툴바는 `'right'`, 오른쪽 위젯 탭은 `'left'`.
- `App` 에는 시세 틱마다 바뀌는 상태를 두지 않는다 — `App` 이 다시 그리면 화면 전체가 다시 그려진다. 틱 값은 `lib/liveStore`(관심 목록 행, 활성 종목 현재가)나 모의거래 라이브 스토어(`usePaperLive`)에 두고, 쓰는 컴포넌트만 `useSyncExternalStore` 로 구독한다.
- 닫힌 채 시작하는 위젯 페이지·대화상자는 `React.lazy` 로 나눠 열 때 불러온다(닫혀 있는 동안 상태를 들고 있어야 하는 것은 제외).
- 알림 판정 규칙(`lib/alertRules` — 가격 알림 모양·조건, 선·도형 기하, 한 번만/매번·히스테리시스·재알림 대기·만료)은 앱(`usePriceAlerts`·`useDrawings`)과 워커(`worker/alertJudge.ts`)가 같은 코드로 쓴다. 새 조건은 여기에만 더하고 앱·워커가 따라오게 한다. 「매번」 알림의 판정 상태는 앱은 기기별(`trading.alertRepeat.v1`, 동기화 제외)·메모리, 서버는 `w:<code>.ruleMarks` 에 따로 두고 서로 확인하지 않는다(한 번만 알림만 firedIds·acks 로 맞춘다). 앱 안 알림은 `App.announce` 한 곳에서 시스템 알림·토스트·소리(`lib/alertSound`)·기록(`lib/alertLog`)을 낸다.
- 푸시 워커(`worker/indicatorAlerts.ts`·`worker/market.ts`·`worker/alertJudge.ts`)가 앱과 같은 값으로 알림을 판정하려고 `lib/alertRules`·`chart/compute`·`lib/indicatorConfig`·`lib/indicatorAlerts`·`lib/indicators`·`lib/intervals`·`lib/theme`·`lib/market/types`·`lib/market/ids`·`lib/market/bars`·`lib/market/upbit`·`lib/market/yahoo` 를 그대로 번들한다. 이 파일들(과 그들이 가져오는 파일)에는 `window`·`document`·`localStorage`·캔버스 코드와 차트 라이브러리의 실행 코드를 넣지 않는다 — 저장은 `lib/indicatorStorage`·`useIndicatorAlerts`, 그리기는 `chart/bandFill`·`chart/volumeProfile` 에 둔다. 지표 알림은 앱이 열려 있으면 브라우저에서, 푸시를 켜 두면 앱을 닫아도 워커가 울린다(태그 `ind-<id>` 가 같아 OS 가 합친다). 워커는 바이낸스가 막히면 gate.io 봉으로 계산하므로 값이 조금 다를 수 있다(거래량 기반 지표가 특히).
- 새 시장을 붙일 때: `lib/market/ids` 에 접두사·모양·주기 계획, 어댑터 파일(순수 파싱 + 브라우저 REST), `lib/market/index`·`live` 의 분기, `useSymbols` 의 목록 로더, 워커 `market.ts` 의 봉 경로를 함께 바꾼다. 거래소에 없는 주기는 `lib/market/bars` 의 `aggregate` 로 묶거나 `supportedIntervals` 에서 빼 메뉴가 끄게 한다.

---

## 7. 파일 지도

```
src/
  index.css                 기본 문서 스타일(리셋·스크롤바·앱 잔손질)
  styles/tokens.css         --tv-* 토큰(색·치수·테마)
  App.tsx / App.css         셸 조립 + 셸 스타일 전체
  components/
    Icon.tsx                직접 그린 선 아이콘
    TopToolbar.tsx          상단 툴바
    BottomBar.tsx           하단 바(기간·시계·스케일)
    WidgetBar.tsx           우측 위젯 탭 + 페이지
    MainMenuDrawer.tsx      데스크톱 좌측 메뉴 서랍
    mobile/                 폰 앱: MobileShell(탭·도구 줄·시트) · BottomSheet · MobileBars · MobileMenuPage
    SettingsDialog.tsx      차트 설정(심볼/상태 줄/스케일/캔버스/시간대/알림)
    CreateAlertDialog.tsx   가격·지표 알림 만들기·편집(조건·경계·이동 %·트리거·만료) · LineAlertDialog.tsx 선·도형 알림 설정
    AlertTimingFields.tsx   알림 창 공통 트리거(한 번만/매번)·재알림·만료 칸
    QuickSearchDialog.tsx   Ctrl+K 명령 팔레트(기능·종목·지표)
    QuickIntervalBox.tsx    숫자로 여는 주기 변경 상자
    Toasts.tsx              알림 토스트(선택적 동작 버튼)
    ChartGrid.tsx           분할 차트 격자(칸 절대 배치·경계 막대·폰 손잡이·세로 화면 뒤집기)
    menus/                  차트 유형·간격·레이아웃(프리셋·직접 만들기·내 레이아웃)·시간대·스냅샷 팝오버
    SyncPanel/PinPanel/DiscoverPanel/MtfPanel  위젯(평면 스타일)
    trade/                  모의거래: OrderPanel(주문창) · TradingPanel(거래 패널) · MobileTrade(폰 시트) · format(표시 헬퍼)
  hooks/
    useShortcuts.ts         전역 단축키
    useUiPrefs.ts           기기별 UI 설정(그리기 토글·즐겨찾기 간격)
    useFullscreen.ts        전체 화면 토글
    useBackClose.ts         뒤로가기·Esc 로 맨 위 겹침 요소 닫기, hasOpenOverlay
    useSavedLayouts.ts      내 레이아웃 목록(동기화 키)
    usePaperTrading.ts      모의거래 계좌·시세 구독·되짚기·D1 동기화 → PaperContext
  lib/
    layoutConfig.ts         CellConfig·격자(모양·크기·경계·프리셋·옛 저장값 변환)·내 레이아웃·칸 동기화(심볼·차트 종류)·MTF·pane 크기
    chartRegistry.ts        차트 명령 핸들
    liveStore.ts            틱 값 스토어(구독자만 다시 그림)
    alertRules.ts           알림 모양·판정 규칙(앱·워커 공용, 순수) · alertSettings.ts 알림 설정(동기화) · alertLog.ts 알림 기록(동기화)
    alertSound.ts           Web Audio 알림 소리 · alertTimingDraft.ts 알림 창 트리거·만료 입력 검사
    symbols.ts              SymbolInfo·표시 심볼·이름표·가격 자릿수·아이콘 코드·거래소 이름(시장별)
    market/                 시장 공급자 층 — types(Candle·Interval·Ticker24h) · ids(심볼 id·주기 계획) · bars(봉 경계·묶기) ·
                            binance(선물·현물) · upbit · yahoo(+ yahooNames 한글 이름표, yahooProxy 프록시 검증) · index(봉·시세·검색 창구) · live(웹소켓·폴링)
    timezone.ts             차트 시간대 계산(Intl 인자·검증·벽시계↔epoch)
    paper/                  모의거래 계약(types)·엔진(engine, 순수 함수)·OKX 규칙(rules)·명령(commands)·context
  chart/trade/              차트 위 거래 선(TradeOverlay)
  chart/drawing/            그리기 엔진: render(그리기)·hitTest(잡기)·builders(점 수·앵커 만들기)·coords(시각·가격↔px)·
                            toolsA(채널·피치포크 변형, 갠·피보나치 추가 도구, 회전 사각형·경로·원·폴리라인·호·곡선 — 모양 목록 하나로 그리기와 잡기)
                            toolsB·studiesB(패턴·엘리엇 파동·주기·말풍선 등 주석·예측·바 패턴·앵커 VWAP·앵커 볼륨 프로파일 — 그리기·잡기와 봉 계산)
  chart/crosshairSync.ts    분할 칸끼리 십자선 시각·가격을 주고받는 모듈 구독
```
