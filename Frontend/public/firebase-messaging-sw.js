// Service worker Firebase Messaging pour recevoir des notifications en background
// Doit se trouver dans /public à la racine du site

try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  // En production (Firebase Hosting), ce script initialise automatiquement l'app
  importScripts('/__/firebase/init.js?useEmulator=false');
} catch (e) {
  // En dev local (Vite), ce script n'existe pas: on passe en mode dégradé.
}

let messaging = null;
try {
  const hasFirebase = typeof firebase !== 'undefined' && !!firebase;
  const isSupported = hasFirebase && firebase.messaging && firebase.messaging.isSupported && firebase.messaging.isSupported();
  const isInitialized = hasFirebase && firebase.apps && firebase.apps.length > 0;
  if (hasFirebase && isSupported && isInitialized) {
    messaging = firebase.messaging();
  } else {
    // Ne pas casser le SW en dev local si Firebase n'est pas initialisé
    // console.log('[SW] Firebase Messaging non initialisé (dev local or unsupported).');
  }
} catch (err) {
  // console.warn('[SW] Erreur d\'initialisation de Messaging', err);
}

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
