// 푸시 수신 — 앱이 꺼져 있어도 이 코드가 깨어나 알림을 띄운다.
self.addEventListener('push', (event) => {
  let data = { title: '가격 알림', body: '', tag: undefined }
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
    }),
  )
})

// 알림을 누르면 이미 열린 창으로 가고, 없으면 새로 연다.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow('/')
    }),
  )
})
