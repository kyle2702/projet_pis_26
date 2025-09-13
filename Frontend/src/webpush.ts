// Helpers Web Push (fallback iOS/Safari). On reste côté Web standard sans FCM.

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isWebPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function subscribeWebPush(userId: string, idToken: string): Promise<boolean> {
  if (!isWebPushSupported()) return false;
  const publicKey = import.meta.env.VITE_WEBPUSH_PUBLIC_KEY as string | undefined;
  if (!publicKey) {
    console.warn('VITE_WEBPUSH_PUBLIC_KEY manquante; Web Push inactif');
    return false;
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    } catch (e) {
      console.info('Refus abonnement Web Push ou non supporté.', e);
      return false;
    }
  }

  try {
    const baseUrl = import.meta.env.VITE_NOTIFY_API_URL as string | undefined;
    if (!baseUrl) throw new Error('VITE_NOTIFY_API_URL manquante');
    const res = await fetch(baseUrl.replace(/\/$/, '') + '/webpush/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ userId, subscription: sub.toJSON() }),
    });
    if (!res.ok) throw new Error('subscribe failed');
    return true;
  } catch (e) {
    console.warn('Impossible d\'enregistrer la subscription Web Push', e);
    return false;
  }
}

export async function unsubscribeWebPush(idToken?: string | null): Promise<void> {
  if (!isWebPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    try { await sub.unsubscribe(); } catch { /* noop */ }
  }
  try {
    const baseUrl = import.meta.env.VITE_NOTIFY_API_URL as string | undefined;
    if (!baseUrl || !idToken) return;
    await fetch(baseUrl.replace(/\/$/, '') + '/webpush/unsubscribe', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken}` },
    });
  } catch { /* noop */ }
}
