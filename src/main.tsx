import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

// 새 배포의 서비스워커가 페이지를 넘겨받으면 새 버전을 띄워야 한다. 이게 없으면 이미 열었던
// 사람은 캐시에 남은 옛 화면을 한 번 더 보게 된다(새로고침을 두 번 해야 새 버전이 뜬다).
// 보고 있는 화면을 갑자기 새로고침하면 입력 중인 주문·그리던 선이 날아간다 — 화면이 보이면
// 'app-update-ready' 로 알리고(앱이 '새로고침' 버튼 토스트를 띄운다), 숨어 있을 때만 바로 새로고침한다.
// 알린 뒤에도 누르지 않고 다른 앱·탭으로 넘어가면 그때 조용히 새로고침한다.
// 처음 설치(원래 제어하던 워커가 없던 경우)에는 아무것도 하지 않는다.
if ('serviceWorker' in navigator) {
  if (navigator.serviceWorker.controller) {
    let pending = false
    let reloading = false
    const reload = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (document.visibilityState === 'hidden') {
        reload()
        return
      }
      if (pending) return
      pending = true
      window.dispatchEvent(new CustomEvent('app-update-ready'))
    })
    document.addEventListener('visibilitychange', () => {
      if (pending && document.visibilityState === 'hidden') reload()
    })
  }
  // 브라우저는 페이지를 새로 열 때만 새 배포를 확인한다. 탭을 켜 둔 채 쓰면 몇 시간이고
  // 옛 버전에 머문다 — 탭으로 돌아올 때와 30분마다 직접 확인해 위의 새 버전 안내로 넘어가게 한다.
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
