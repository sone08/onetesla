// OneTesla Service Worker — handles push notifications
self.addEventListener('push', event => {
  let data = { title: '🚔 OneTesla Alert', body: 'New alert nearby' }
  try { data = event.data?.json() ?? data } catch { /* use defaults */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon ?? '/favicon.svg',
      badge: data.badge ?? '/favicon.svg',
      tag: data.tag ?? 'onetesla',
      renotify: data.renotify ?? false,
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open', title: '🗺️ Open Map' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        const existing = list.find(c => c.url.includes(self.location.origin))
        if (existing) return existing.focus()
        return clients.openWindow('/?page=map')
      })
    )
  }
})

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(clients.claim()))
