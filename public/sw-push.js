// 푸시 수신 — 앱이 꺼져 있어도 이 코드가 깨어나 알림을 띄운다.
self.addEventListener('push', (event) => {
  let data = { title: '가격 알림', body: '', tag: undefined, symbol: undefined }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    if (event.data) data.body = event.data.text()
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      vibrate: [200, 100, 200],
      renotify: Boolean(data.tag),
      // 누르면 이 종목 차트를 연다.
      data: { symbol: typeof data.symbol === 'string' ? data.symbol : '' },
    }),
  )
})

// 알림을 누르면 열린 창으로 가서 그 종목을 보여 주고, 창이 없으면 그 종목으로 새로 연다.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const symbol = event.notification.data?.symbol || ''
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // 목록은 최근에 초점을 받은 창 순서다.
      const client = list.find((c) => 'focus' in c)
      if (client) {
        if (symbol) client.postMessage({ type: 'open-symbol', symbol })
        return client.focus()
      }
      return self.clients.openWindow(symbol ? `/?symbol=${encodeURIComponent(symbol)}` : '/')
    }),
  )
})
