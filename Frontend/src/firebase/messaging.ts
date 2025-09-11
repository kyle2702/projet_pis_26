import { getToken, onMessage, isSupported, type Messaging, type MessagePayload } from 'firebase/messaging';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getApp, initializeApp } from 'firebase/app';

// On réutilise la config via import.meta.env comme dans config.ts sans le réimporter pour éviter cycles
function getFirebaseApp() {
  try {
    return getApp();
  } catch {
    const cfg = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
      appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
    };
    return initializeApp(cfg);
  }
}

export async function initMessagingAndGetToken(userId: string): Promise<string | null> {
  const supported = await isSupported();
  if (!supported) return null;
  const app = getFirebaseApp();
  const { getMessaging } = await import('firebase/messaging');
  const messaging: Messaging = getMessaging(app);
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
  if (!vapidKey) {
    console.warn('VAPID key manquante (VITE_FIREBASE_VAPID_KEY). Messaging non initialisé.');
    return null;
  }

  try {
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: await navigator.serviceWorker.ready });
    if (token) {
      const db = getFirestore(app);
      const ref = doc(db, 'fcmTokens', userId);
      await setDoc(ref, {
        token,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      return token;
    }
  } catch (e) {
    console.warn('Impossible d\'obtenir le token FCM:', e);
  }
  return null;
}

export async function listenForegroundMessages(cb: (payload: MessagePayload) => void) {
  const supported = await isSupported();
  if (!supported) return () => {};
  const app = getFirebaseApp();
  const { getMessaging } = await import('firebase/messaging');
  const messaging: Messaging = getMessaging(app);
  const unsub = onMessage(messaging, cb);
  return unsub;
}
