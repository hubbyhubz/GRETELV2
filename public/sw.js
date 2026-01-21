self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    const sentAt = data.sentAt ? new Date(data.sentAt) : null;
    const timeLabel = sentAt ? sentAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
    const isAssistant = data.kind === 'assistant_message' || data.kind === 'assistant_notification' || data.userId;
    const title = isAssistant ? `${data.title || 'G.R.E.T.E.L'} [Assistant]` : (data.title || 'Notification');
    const body = isAssistant
      ? `${data.preview || data.body || ''}${timeLabel ? `\n${timeLabel}` : ''}`
      : (data.body || '');
    const options = {
      body,
      icon: '/icons/brain.svg',
      badge: '/icons/brain.svg',
      vibrate: [100, 50, 100],
      tag: data.messageId || (isAssistant ? 'assistant-message' : undefined),
      renotify: true,
      data: {
        dateOfArrival: Date.now(),
        primaryKey: '2',
        url: data.url || '/',
        messageId: data.messageId || null,
        userId: data.userId || null,
        kind: data.kind || null,
      },
      actions: [
        {action: 'explore', title: 'Open', icon: '/icons/check-square.svg'},
        {action: 'close', title: 'Close', icon: '/icons/close.svg'},
      ]
    };
    event.waitUntil(
      Promise.all([
        self.registration.showNotification(title, options),
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
          for (const client of clientList) {
            client.postMessage({ type: 'assistant_push', payload: data });
          }
        })
      ])
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'close') {
    return;
  }
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
