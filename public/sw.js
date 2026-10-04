// odds background script: shows the morning message and opens odds when it is tapped.
// It caches nothing, so the app is always the latest version.

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : "" }
  }
  const title = data.title || "odds"
  // iPhones turn notifications off for a site that receives a push without showing one, so one is always shown.
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: data.body || "New jobs fit you.",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: data.tag || "odds-morning",
        data: { url: data.url || "/" },
      }),
      typeof data.count === "number" && self.navigator.setAppBadge ? self.navigator.setAppBadge(data.count).catch(() => undefined) : undefined,
    ]),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of open) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus()
          if ("navigate" in client) await client.navigate(url)
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
