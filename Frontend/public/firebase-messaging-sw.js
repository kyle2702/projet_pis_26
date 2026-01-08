// Service worker Firebase Messaging pour recevoir des notifications en background
// Doit se trouver dans /public à la racine du site
// Version SW: v3

self.addEventListener('install', (event) => {
  // Activer immédiatement la nouvelle version
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Prendre le contrôle des pages ouvertes sans attendre un reload
  event.waitUntil(self.clients.claim());
});

// Importer Firebase SDK v10.14.0 (compatible avec Firebase v12.x client)
try {
  importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js');
} catch (e) {
  console.error('[SW] Erreur chargement Firebase SDK:', e);
}

// La config Firebase sera reçue depuis le client via postMessage
let firebaseConfig = null;

// Écouter les messages du client pour recevoir la config
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    firebaseConfig = event.data.config;
    console.log('[SW] Configuration Firebase reçue');
    try {
      if (typeof firebase !== 'undefined' && firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
        console.log('[SW] Firebase initialisé avec succès');
        // Réinitialiser messaging après l'init
        if (firebase.messaging && firebase.messaging.isSupported && firebase.messaging.isSupported()) {
          messaging = firebase.messaging();
          console.log('[SW] Firebase Messaging initialisé');
          setupMessagingListener();
        }
      }
    } catch (e) {
      console.error('[SW] Erreur initialisation Firebase:', e);
    }
  }
});

let messaging = null;

// Fonction pour configurer l'écoute des messages (appelée après init)
function setupMessagingListener() {
  if (!messaging) return;
  
  messaging.onBackgroundMessage((payload) => {
    // Préférer les champs data.* que nous contrôlons depuis notre backend
    const title = payload.data?.title || payload.notification?.title || 'Nouvelle notification';
    const body = payload.data?.body || payload.notification?.body || '';
    const clickUrl = payload.fcmOptions?.link || payload.data?.link || '/';
    const nid = payload.data?.nid || payload.notification?.tag;
    const tag = makeTag({ nid, title, body, url: clickUrl });
    const contentKey = `${title}|${body}|${clickUrl}`.slice(0, 180);
    if (!shouldShowOnce(tag, contentKey)) return;
    const options = {
      body,
      icon: '/logo_pionniers.avif',
      data: { url: clickUrl },
      tag,
      renotify: false,
    };
    self.registration.getNotifications({ includeTriggered: true }).then(list => {
      list.filter(n => n.tag === tag).forEach(n => n.close());
      self.registration.showNotification(title, options);
    });
  });
}

// Déduplication simple en mémoire (cycle de vie court du SW):
const RECENT = new Set();
const RECENT_CONTENT = new Set();
function makeTag({ nid, title, body, url }) {
  if (nid) return String(nid).slice(0, 128);
  return `tag:${title || ''}|${body || ''}|${url || ''}`.slice(0, 128);
}
function shouldShowOnce(tag, contentKey) {
  if (!tag) return true;
  if (RECENT.has(tag)) return false;
  RECENT.add(tag);
  // Purge après 15s
  setTimeout(() => RECENT.delete(tag), 15000);
  if (contentKey) {
    if (RECENT_CONTENT.has(contentKey)) return false;
    RECENT_CONTENT.add(contentKey);
    setTimeout(() => RECENT_CONTENT.delete(contentKey), 15000);
  }
  return true;
}
try {
  const hasFirebase = typeof firebase !== 'undefined' && !!firebase;
  const isSupported = hasFirebase && firebase.messaging && firebase.messaging.isSupported && firebase.messaging.isSupported();
  const isInitialized = hasFirebase && firebase.apps && firebase.apps.length > 0;
  if (hasFirebase && isSupported && isInitialized) {
    messaging = firebase.messaging();
    console.log('[SW] Firebase Messaging pré-initialisé');
    setupMessagingListener();
  } else {
    console.log('[SW] Firebase Messaging en attente de configuration');
  }
} catch (err) {
  console.warn('[SW] Erreur pré-initialisation Messaging', err);
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = event.notification?.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Chercher une fenêtre déjà ouverte sur le même domaine
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Sinon ouvrir une nouvelle fenêtre
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Fallback Web Push standard (iOS/Safari, navigateurs sans FCM)
// N'activer le fallback Web Push que si Firebase Messaging n'est pas actif
if (!messaging) self.addEventListener('push', (event) => {
  try {
    let data = {};
    if (event.data) {
      try {
        data = event.data.json();
      } catch (e) {
        try {
          const t = event.data.text();
          data = JSON.parse(t);
        } catch {
          data = {};
        }
      }
    }
  // Même logique: préférer data.title/body
  const title = (data && (data.title || (data.notification && data.notification.title))) || 'Notification';
  const body = (data && (data.body || (data.notification && data.notification.body))) || '';
    const clickUrl = data.link || (data.data && data.data.link) || '/';
  const nid = data.nid || (data.notification && data.notification.tag);
  const tag = makeTag({ nid, title, body, url: clickUrl });
self.addEventListener('push', (event) => {
  // Skip si Firebase Messaging est actif
  if (messaging) return;
  
  try {
    let data = {};
    if (event.data) {
      try {
        data = event.data.json();
      } catch (e) {
        try {
          const t = event.data.text();
          data = JSON.parse(t);
        } catch {
          data = {};
        }
      }
    }
    // Même logique: préférer data.title/body
    const title = (data && (data.title || (data.notification && data.notification.title))) || 'Notification';
    const body = (data && (data.body || (data.notification && data.notification.body))) || '';
    const clickUrl = data.link || (data.data && data.data.link) || '/';
    const nid = data.nid || (data.notification && data.notification.tag);
    const tag = makeTag({ nid, title, body, url: clickUrl });
    const contentKey = `${title}|${body}|${clickUrl}`.slice(0, 180);
    if (!shouldShowOnce(tag, contentKey)) return;
    const options = {
      body,
      icon: '/logo_pionniers.avif',
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
    console.error('[SW] Erreur traitement push:', e);
    // Données non JSON, afficher un titre par défaut
    event.waitUntil(self.registration.showNotification('Notification', { body: '', icon: '/logo_pionniers.avif