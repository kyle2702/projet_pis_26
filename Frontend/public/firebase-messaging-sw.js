// Service worker Firebase Messaging pour recevoir des notifications en background
// Doit se trouver dans /public a la racine du site
// Version SW: v4

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

try {
  importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js');
} catch (e) {
  console.error('[SW] Erreur chargement Firebase SDK:', e);
}

let messaging = null;
let backgroundHandlerReady = false;

const CONFIG_CACHE_NAME = 'sw-runtime-config';
const CONFIG_CACHE_KEY = '/__firebase_config__';

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
  setTimeout(() => RECENT.delete(tag), 15000);
  if (contentKey) {
    if (RECENT_CONTENT.has(contentKey)) return false;
    RECENT_CONTENT.add(contentKey);
    setTimeout(() => RECENT_CONTENT.delete(contentKey), 15000);
  }
  return true;
}

async function saveFirebaseConfig(config) {
  try {
    if (!config) return;
    const cache = await caches.open(CONFIG_CACHE_NAME);
    await cache.put(
      CONFIG_CACHE_KEY,
      new Response(JSON.stringify(config), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
  } catch (e) {
    console.warn('[SW] Impossible de persister la config Firebase:', e);
  }
}

async function loadFirebaseConfig() {
  try {
    const cache = await caches.open(CONFIG_CACHE_NAME);
    const res = await cache.match(CONFIG_CACHE_KEY);
    if (!res) return null;
    return await res.json();
  } catch (e) {
    console.warn('[SW] Impossible de charger la config Firebase:', e);
    return null;
  }
}

function showNotificationFromData(data) {
  const rawTitle = data && (data.title || (data.notification && data.notification.title));
  const rawBody = data && (data.body || (data.notification && data.notification.body));
  const clickUrl = (data && (data.link || (data.data && data.data.link))) || '/';
  const nid = data && (data.nid || (data.notification && data.notification.tag));
  const hasMeaningfulContent = Boolean(rawTitle || rawBody || nid || clickUrl !== '/');
  const title = rawTitle || 'Notification';
  const body = rawBody || (hasMeaningfulContent ? '' : 'Ouvrez l application pour voir le detail.');

  let tag;
  if (hasMeaningfulContent) {
    tag = makeTag({ nid, title, body, url: clickUrl });
    const contentKey = `${title}|${body}|${clickUrl}`.slice(0, 180);
    if (!shouldShowOnce(tag, contentKey)) return Promise.resolve();
  } else {
    // Si la charge utile est vide/inexploitable, ne pas deduper pour eviter les faux negatives.
    tag = `fallback:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  }

  const options = {
    body,
    icon: '/logo_pionniers.avif',
    data: { url: clickUrl },
    tag,
    renotify: false,
  };

  return self.registration.getNotifications({ includeTriggered: true }).then((list) => {
    list.filter((n) => n.tag === tag).forEach((n) => n.close());
    return self.registration.showNotification(title, options);
  });
}

function setupMessagingListener() {
  if (!messaging || backgroundHandlerReady) return;

  messaging.onBackgroundMessage((payload) => {
    const fcmData = {
      title: payload.data?.title || payload.notification?.title,
      body: payload.data?.body || payload.notification?.body,
      link: payload.fcmOptions?.link || payload.data?.link,
      nid: payload.data?.nid || payload.notification?.tag,
      notification: payload.notification,
      data: payload.data,
    };
    showNotificationFromData(fcmData).catch((e) => {
      console.error('[SW] Erreur affichage notification FCM:', e);
    });
  });

  backgroundHandlerReady = true;
  console.log('[SW] Ecoute Firebase background active');
}

function tryInitFirebase(config) {
  try {
    if (typeof firebase === 'undefined') return;

    if (config && firebase.apps.length === 0) {
      firebase.initializeApp(config);
      console.log('[SW] Firebase initialise avec succes');
    }

    if (
      firebase.apps.length > 0 &&
      firebase.messaging &&
      firebase.messaging.isSupported &&
      firebase.messaging.isSupported()
    ) {
      messaging = firebase.messaging();
      setupMessagingListener();
      console.log('[SW] Firebase Messaging initialise');
    }
  } catch (e) {
    console.error('[SW] Erreur initialisation Firebase:', e);
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    console.log('[SW] Configuration Firebase recue');
    saveFirebaseConfig(event.data.config);
    tryInitFirebase(event.data.config);
  }
});

loadFirebaseConfig().then((cachedConfig) => {
  tryInitFirebase(cachedConfig);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
      return undefined;
    })
  );
});

// Fallback Web Push standard (iOS/Safari, navigateurs sans FCM)
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    if (!messaging) {
      const cachedConfig = await loadFirebaseConfig();
      if (cachedConfig) tryInitFirebase(cachedConfig);
    }

    if (messaging) return;

    let data = {};
    try {
      if (event.data) {
        try {
          data = event.data.json();
        } catch {
          const text = event.data.text();
          if (text) {
            try {
              data = JSON.parse(text);
            } catch {
              data = { body: text };
            }
          }
        }
      }
    } catch (e) {
      console.warn('[SW] Payload push non JSON:', e);
      data = {};
    }

    try {
      await showNotificationFromData(data);
    } catch (e) {
      console.error('[SW] Erreur traitement push:', e);
      await self.registration.showNotification('Notification', {
        body: 'Ouvrez l application pour voir le detail.',
        icon: '/logo_pionniers.avif',
      });
    }
  })());
});