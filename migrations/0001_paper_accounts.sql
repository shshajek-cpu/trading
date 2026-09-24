-- 모의 선물거래 계좌 저장. 동기화 코드(code)를 열쇠로 계좌 상태(JSON)를 낙관적 잠금으로 저장한다.
CREATE TABLE IF NOT EXISTS paper_accounts (
  code TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  state TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
