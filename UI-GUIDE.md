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
│ 좌측 │ 차트 그리드(1/2/4, 드래그 분할) │ 위젯    │탭 │
│ 도구 │                               │ 페이지  │45 │
│ 52px ├───────────────────────────────┤ 302px   │px │
│      │ 거래 패널(기본 펼침 260px, 끌어 조절) │    │   │
│      ├───────────────────────────────┤         │   │
│      │ 하단 바(기간·시계·%·log·auto)  │         │   │
└──────┴───────────────────────────────┴─────────┴───┘
```

- **상단 툴바**(`TopToolbar`): 심볼 알약(128×28, `심볼 검색` 열기) · 심볼 비교 ⊕(`심볼 비교`) · 즐겨찾기 간격 버튼 + 간격 메뉴(☆ 즐겨찾기 토글, `useUiPrefs` 에 저장) · 차트 유형 메뉴 · 지표 · 지표 템플릿(팝오버) · 알림 · 리플레이 · 실행 취소/다시 실행 · (유동 간격) · 레이아웃 · 저장 · 빠른 검색 · 설정 · 전체 화면 · 스냅샷 · 미니창.
- **좌측 도구**(52px): `DrawingToolbar`.
- **차트 그리드**: 1/2/4 분할. 경계 바를 끌어 비율 조정, 더블클릭으로 균등. 활성 칸만 그리기·핀 입력을 받는다. 레이아웃 메뉴 「모든 칸에 같이 적용」 = 심볼 · 차트 종류 · 십자선(`layoutConfig.syncSymbol`/`syncChartType`/`syncCrosshair`; 십자선은 `chart/crosshairSync` 모듈 구독으로 주고받아 React 상태를 거치지 않는다). 최대화해도 다른 칸은 `display:none` 으로 살려 둔다(다시 불러오지 않음). 리플레이는 시작한 칸(`replayCell`)에 붙어 있고 활성 칸이 바뀌어도 이어진다.
- **하단 바**(`BottomBar`): 기간 프리셋(1일→1m … 전체→1M, 클릭 시 활성 칸 간격 변경 후 `getChart(active).setVisibleRange`) · 시계(시간대 메뉴) · % / log / auto(활성 칸 스케일).
- **거래 패널**(`TradingPanel`, `.tv-trade-cell`): 차트 그리드와 하단 바 사이, 거래소 아래 창처럼 펼친 채 시작한다. 위쪽 경계(`.tp-resize`)를 끌어 높이를 바꾸고(기기마다 `useUiPrefs.tradePanelHeight`), ˅ 로 접는다(머리 줄 32px 만 남음). 탭 = 포지션 · 포지션 기록 · 미체결 · 주문 내역 · 체결 내역 · 자금 내역, 오른쪽 260px 는 자산 칸(폰은 자산 탭).
- **위젯 바**(`WidgetBar`): 우측 탭 45px + 페이지 302px. 탭 = 관심 목록·거래(주문창 `OrderPanel`)·알림·객체 트리·멀티 타임프레임·핀·탐색·동기화. 열린 탭을 다시 누르면 페이지가 접힌다. 알림 탭에 개수 배지(울리지 않은 알림만).
- **토스트**(`Toasts`): 오른쪽 아래(폰은 탭 막대·차트 도구 줄 위). 되돌릴 수 있는 동작(지표·그림 일괄 삭제, 템플릿 적용)과 새 버전 알림은 동작 버튼(`pushToast(message, { label, run })`)을 단다.
- **차트 위 거래 선**(`chart/trade/TradeOverlay`): 진입가·익절·손절·미체결 주문·청산가 선과 왼쪽 라벨. 라벨을 끌어 가격을 바꾸고(청산가 제외) ✕ 로 종료·취소한다. 라벨은 시리즈 프리미티브의 `updateAllViews` 에서 위치만 옮긴다(렌더 없음).

---

## 3. 폰 앱 배치 (≤900px) — TradingView 앱 구조

데스크톱을 줄인 화면이 아니다. `MobileShell` 이 TradingView 앱처럼 아래 탭과 아래 시트로 그린다. 활성 칸 하나만 보여준다.

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
- **차트 도구 줄**: 심볼(검색) · 주기(주기 시트) · 거래 시트(주문창·포지션·미체결·내역 — `MobileTrade`) · + 추가 시트(그리기·지표·알림·비교·지표 템플릿·차트 사진 저장) · ✎ 그리기 시트(도구 타일·자석·모드 유지·잠금·숨기기·실행 취소·삭제) · ⋯ 더보기 시트(심볼 정보·차트 유형·알림 관리·기간·날짜로 이동·바 리플레이·객체 트리·차트 설정·핀·동기화).
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
- B(차트/지표): `ChartCell`, `IndicatorsDialog`, `IndicatorTemplatesMenu`, `lib/indicatorConfig`.
- D(심볼/관심/알림): `SymbolSearchDialog`, `CreateAlertDialog`, `widgets/*`, `useSymbols`, `useWatchlist`, `usePriceAlerts`, `lib/symbols`.

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
    SettingsDialog.tsx      차트 설정(심볼/상태 줄/스케일/캔버스/시간대)
    QuickSearchDialog.tsx   Ctrl+K 명령 팔레트(기능·종목·지표)
    QuickIntervalBox.tsx    숫자로 여는 주기 변경 상자
    Toasts.tsx              알림 토스트(선택적 동작 버튼)
    menus/                  차트 유형·간격·레이아웃·시간대·스냅샷 팝오버
    SyncPanel/PinPanel/DiscoverPanel/MtfPanel  위젯(평면 스타일)
    trade/                  모의거래: OrderPanel(주문창) · TradingPanel(거래 패널) · MobileTrade(폰 시트) · format(표시 헬퍼)
  hooks/
    useShortcuts.ts         전역 단축키
    useUiPrefs.ts           기기별 UI 설정(그리기 토글·즐겨찾기 간격)
    useFullscreen.ts        전체 화면 토글
    useBackClose.ts         뒤로가기·Esc 로 맨 위 겹침 요소 닫기, hasOpenOverlay
    usePaperTrading.ts      모의거래 계좌·시세 구독·되짚기·D1 동기화 → PaperContext
  lib/
    layoutConfig.ts         CellConfig·레이아웃·분할·칸 동기화(심볼·차트 종류·십자선)·MTF·pane 크기
    chartRegistry.ts        차트 명령 핸들
    liveStore.ts            틱 값 스토어(구독자만 다시 그림)
    timezone.ts             차트 시간대 계산(Intl 인자·검증·벽시계↔epoch)
    paper/                  모의거래 계약(types)·엔진(engine, 순수 함수)·OKX 규칙(rules)·명령(commands)·context
  chart/trade/              차트 위 거래 선(TradeOverlay)
  chart/crosshairSync.ts    분할 칸끼리 십자선 시각을 주고받는 모듈 구독
```
