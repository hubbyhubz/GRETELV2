self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icons/brain.svg',
      badge: '/icons/brain.svg',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: '2',
        url: data.url || '/'
      },
      actions: [
        {action: 'explore', title: 'View Details', icon: '/icons/check-square.svg'},
        {action: 'close', title: 'Close', icon: '/icons/close.svg'},
      ]
    };
    event.waitUntil(
      self.registration.showNotification(data.title, options)
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
