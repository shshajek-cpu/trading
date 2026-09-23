import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

// 새 배포의 서비스워커가 페이지를 넘겨받으면 한 번 새로고침한다. 이게 없으면 이미 열었던
// 사람은 캐시에 남은 옛 화면을 한 번 더 보게 된다(새로고침을 두 번 해야 새 버전이 뜬다).
// 처음 설치(원래 제어하던 워커가 없던 경우)에는 새로고침하지 않는다.
if ('serviceWorker' in navigator) {
  if (navigator.serviceWorker.controller) {
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    })
  }
  // 브라우저는 페이지를 새로 열 때만 새 배포를 확인한다. 탭을 켜 둔 채 쓰면 몇 시간이고
  // 옛 버전에 머문다 — 탭으로 돌아올 때와 30분마다 직접 확인해 위의 새로고침으로 넘어가게 한다.
  const checkForUpdate = () => {
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => {
        /* 오프라인이면 다음 확인 때 */
      })
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate()
  })
  window.setInterval(checkForUpdate, 30 * 60 * 1000)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary label="앱">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
