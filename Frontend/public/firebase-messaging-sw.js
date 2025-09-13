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
// Déduplication simple en mémoire (cycle de vie court du SW):
const RECENT = new Set();
function makeTag({ nid, title, body, url }) {
  if (nid) return String(nid).slice(0, 128);
  return `tag:${title || ''}|${body || ''}|${url || ''}`.slice(0, 128);
}
function shouldShowOnce(tag) {
  if (!tag) return true;
  if (RECENT.has(tag)) return false;
  RECENT.add(tag);
  // Purge après 15s
  setTimeout(() => RECENT.delete(tag), 15000);
  return true;
}
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
  const nid = payload.data?.nid || payload.notification?.tag;
  const tag = makeTag({ nid, title, body, url: clickUrl });
    if (!shouldShowOnce(tag)) return;
    const options = {
      body,
      icon: '/vite.svg',
      data: { url: clickUrl },
      tag,
      renotify: false,
    };
    self.registration.getNotifications({ includeTriggered: true }).then(list => {
      list.filter(n => n.tag === tag).forEach(n => n.close());
      self.registration.showNotification(title, options);
    });
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

// Fallback Web Push standard (iOS/Safari, navigateurs sans FCM)
self.addEventListener('push', (event) => {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || (data.notification && data.notification.title) || 'Notification';
    const body = data.body || (data.notification && data.notification.body) || '';
    const clickUrl = data.link || (data.data && data.data.link) || '/';
  const nid = data.nid || (data.notification && data.notification.tag);
  const tag = makeTag({ nid, title, body, url: clickUrl });
    if (!shouldShowOnce(tag)) return;
    const options = {
      body,
      icon: '/vite.svg',
      data: { url: clickUrl },
      tag,
      renotify: false,
    };
    event.waitUntil(
      self.registration.getNotifications({ includeTriggered: true }).then(list => {
        list.filter(n => n.tag === tag).forEach(n => n.close());
        return self.registration.showNotification(title, options);
      })
    );
  } catch (e) {
    // Données non JSON, afficher un titre par défaut
    event.waitUntil(self.registration.showNotification('Notification', { body: '', icon: '/vite.svg' }));
  }
});
