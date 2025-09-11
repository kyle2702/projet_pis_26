// Service worker Firebase Messaging pour recevoir des notifications en background
// Doit se trouver dans /public à la racine du site

try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  // Initialisation auto fournie par Firebase Hosting (disponible en production)
  importScripts('/__/firebase/init.js?useEmulator=false');
} catch (e) {
  // En dev local (Vite), ce script d'init n'est pas disponible: on ignore.
}

const messaging = firebase.messaging.isSupported() ? firebase.messaging() : null;

if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'Nouvelle notification';
    const body = payload.notification?.body || payload.data?.body || '';
    const clickUrl = payload.fcmOptions?.link || payload.data?.link || '/';
    const options = {
      body,
      icon: '/vite.svg',
      data: { url: clickUrl },
    };
    self.registration.showNotification(title, options);
  });

  self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    const url = event.notification?.data?.url || '/';
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(windowClients => {
        for (const client of windowClients) {
          if ('focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
    );
  });
}
