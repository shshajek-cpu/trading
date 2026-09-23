import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

// 새 배포의 서비스워커가 페이지를 넘겨받으면 한 번 새로고침한다. 이게 없으면 이미 열었던
// 사람은 캐시에 남은 옛 화면을 한 번 더 보게 된다(새로고침을 두 번 해야 새 버전이 뜬다).
// 처음 설치(원래 제어하던 워커가 없던 경우)에는 새로고침하지 않는다.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary label="앱">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
