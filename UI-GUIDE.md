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
- **치수**: 상단 툴바 38px(모바일 44) · 좌측 도구 52px(모바일 44) · 위젯 페이지 302px · 위젯 탭 45px · 하단 바 38px(모바일 40) · 간격 `--tv-gap` 4px.
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
│      │ 하단 바(기간·시계·%·log·auto)  │         │   │
└──────┴───────────────────────────────┴─────────┴───┘
```

- **상단 툴바**(`TopToolbar`): 심볼 알약(128×28, `심볼 검색` 열기) · 심볼 비교 ⊕(`심볼 비교`) · 즐겨찾기 간격 버튼 + 간격 메뉴(☆ 즐겨찾기 토글, `useUiPrefs` 에 저장) · 차트 유형 메뉴 · 지표 · 지표 템플릿(팝오버) · 알림 · 리플레이 · 실행 취소/다시 실행 · (유동 간격) · 레이아웃 · 저장 · 빠른 검색 · 설정 · 전체 화면 · 스냅샷 · 미니창.
- **좌측 도구**(52px): `DrawingToolbar` (슬라이스 A) desktop 변형.
- **차트 그리드**: 1/2/4 분할. 경계 바를 끌어 비율 조정, 더블클릭으로 균등. 활성 칸만 그리기·핀 입력을 받는다.
- **하단 바**(`BottomBar`): 기간 프리셋(1일→1m … 전체→1M, 클릭 시 활성 칸 간격 변경 후 `getChart(active).setVisibleRange`) · 시계(시간대 메뉴) · % / log / auto(활성 칸 스케일).
- **위젯 바**(`WidgetBar`): 우측 탭 45px + 페이지 302px. 탭 = 관심 목록·알림·객체 트리·멀티 타임프레임·핀·탐색·동기화. 열린 탭을 다시 누르면 페이지가 접힌다. 알림 탭에 개수 배지.

---

## 3. 모바일 배치 (≤900px)

세로 flex(`.tv-app.mobile`). 활성 칸 하나만 보여준다.

```
┌────────────────────────────────────┐ 44px 상단 툴바(가로 스크롤, 라벨 숨김)
│ ≡ [심볼][⊕][D▾][유형][ƒ][⏰][↶][↷][레이아웃][⚙][⛶][📷] →
├────┬───────────────────────────────┤
│좌측│ 차트 + 범례                    │ 좌측 도구 44px(서랍 '그리기 패널' 스위치로 표시)
├────┴───────────────────────────────┤
│ 기간 ▾                  01:51:16 UTC│ 40px 하단 바
└────────────────────────────────────┘
```

- ≡ 는 `MainMenuDrawer`(좌측 서랍 ~330px): 위젯 목록 · 다크 테마 스위치 · 그리기 패널 스위치 · 키보드 단축키 · 앱 설치(가능할 때).
- 서랍에서 위젯을 고르면 전체 화면 오버레이로 열린다(`MobileWidgetOverlay`). 관심 목록·알림은 자체 헤더(제목 · ⊕ · ×)를, 나머지는 공용 헤더를 쓴다.
- 안전 영역(`--sat`/`--sab`) 패딩과 안드로이드 뒤로가기 닫기(`useBackClose`)를 서랍·오버레이·다이얼로그에 붙인다.

---

## 4. 키보드 단축키 (`useShortcuts`)

입력칸/텍스트영역/contenteditable 에 포커스가 있으면 전부 무시한다.

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

- 새 겹침 요소(서랍·오버레이·다이얼로그)에는 반드시 `useBackClose` 를 붙인다.
- 라벨은 상태로 바뀌지 않는다. 상태는 색·배경(`.active`)으로 알린다.
- 이모지 금지. 아이콘은 `Icon.tsx` 에만 추가한다.
- 켜고 끄기는 `.tv-switch`.
- 손가락 표적은 모바일에서 최소 44px. 입력 글자는 16px 이상(iOS 확대 방지).
- 기기별로 달라야 하는 값(즐겨찾기 간격·그리기 토글)은 `useUiPrefs`(동기화 제외)에, 공유값은 동기화 키에 둔다.

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
    MainMenuDrawer.tsx      모바일/데스크톱 좌측 메뉴 서랍
    SettingsDialog.tsx      차트 설정(심볼/상태 줄/스케일/캔버스/시간대)
    QuickSearchDialog.tsx   Ctrl+K 명령 팔레트
    QuickIntervalBox.tsx    숫자로 여는 주기 변경 상자
    Toasts.tsx              알림 토스트
    menus/                  차트 유형·간격·레이아웃·시간대·스냅샷 팝오버
    SyncPanel/PinPanel/DiscoverPanel/MtfPanel  위젯(평면 스타일)
  hooks/
    useShortcuts.ts         전역 단축키
    useUiPrefs.ts           기기별 UI 설정(그리기 토글·즐겨찾기 간격)
    useFullscreen.ts        전체 화면 토글
    useBackClose.ts         뒤로가기로 겹침 요소 닫기
  lib/
    layoutConfig.ts         CellConfig·레이아웃·분할·MTF·pane 크기
    chartRegistry.ts        차트 명령 핸들
```
