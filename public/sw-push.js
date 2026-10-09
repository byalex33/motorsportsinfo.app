// Web Push handlers for Session Reminders and Schedule Change pushes.
// Loaded by /sw.js via importScripts("/sw-push.js"). Payload: { title, body, url, tag } (see src/server/alerts/types.ts).

const PUSH_ICON = "/icons/icon-192.png";
const PUSH_BADGE = "/icons/badge-72.png";

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "motorsportsinfo.app";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: PUSH_ICON,
      badge: PUSH_BADGE,
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const exact = windows.find((client) => client.url === target);
      if (exact) return exact.focus();
      const sameOrigin = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (sameOrigin && "navigate" in sameOrigin) {
        const focused = await sameOrigin.focus();
        return focused.navigate(target);
      }
      return self.clients.openWindow(target);
    })(),
  );
});

// The browser replaced the subscription (keys rotated or expired): move this device's settings to the new one.
self.addEventListener("pushsubscriptionchange", (event) => {
  const oldSubscription = event.oldSubscription;
  event.waitUntil(
    (async () => {
      if (!oldSubscription) return;
      let next = event.newSubscription;
      if (!next && oldSubscription.options) {
        next = await self.registration.pushManager.subscribe(oldSubscription.options);
      }
      if (!next) return;
      await fetch("/api/push/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldEndpoint: oldSubscription.endpoint, subscription: next.toJSON() }),
      });
    })(),
  );
});
