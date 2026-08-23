import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import admin from 'firebase-admin';
import webpush, { PushSubscription } from 'web-push';

// Variables d'env attendues:
// - GOOGLE_APPLICATION_CREDENTIALS (chemin vers json service account) OU FIREBASE_CONFIG via initApp default creds
// - FIREBASE_PROJECT_ID (facultatif si dans creds)

if (!admin.apps.length) {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const creds = JSON.parse(json);
    admin.initializeApp({ credential: admin.credential.cert(creds) });
  } else {
    // Par défaut: variables d'env Google (GOOGLE_APPLICATION_CREDENTIALS) ou métadonnées
    admin.initializeApp();
  }
}
const db = admin.firestore();
const app = express();
app.use(cors());
app.use(express.json());

// Config Web Push (VAPID)
const WEBPUSH_PUBLIC_KEY = process.env.WEBPUSH_PUBLIC_KEY;
const WEBPUSH_PRIVATE_KEY = process.env.WEBPUSH_PRIVATE_KEY;
const WEBPUSH_SUBJECT = process.env.WEBPUSH_SUBJECT || 'mailto:admin@example.com';
if (WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY) {
  webpush.setVapidDetails(WEBPUSH_SUBJECT, WEBPUSH_PUBLIC_KEY, WEBPUSH_PRIVATE_KEY);
}

// Endpoints de santé pour Render
app.get('/', (_req: Request, res: Response) => res.status(200).send('notify-api ok'));
app.get('/health', (_req: Request, res: Response) => res.status(200).json({ ok: true }));

// Middleware auth: vérifie l'ID token et isAdmin
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (!token) return res.status(401).json({ error: 'No token' });
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.isAdmin !== true) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  (req as any).uid = uid;
    next();
  } catch (e: any) {
    console.error('Auth error', e);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Middleware auth simple: vérifie uniquement l'ID token et expose req.uid
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (!token) return res.status(401).json({ error: 'No token' });
    const decoded = await admin.auth().verifyIdToken(token);
    (req as any).uid = decoded.uid;
    next();
  } catch (e) {
    console.error('Auth error', e);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

async function getAllTokens(): Promise<Array<{ userId: string; token: string }>> {
  const out: { userId: string; token: string }[] = [];
  const seen = new Set<string>();

  // Legacy: un token par utilisateur dans fcmTokens/{uid}
  const legacy = await db.collection('fcmTokens').get();
  legacy.forEach((doc) => {
    const token = (doc.data() as any)?.token as string | undefined;
    if (!token) return;
    const key = `${doc.id}|${token}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ userId: doc.id, token });
  });

  // V2: multi-appareils dans fcmTokensV2/{uid__encodedToken}
  const v2 = await db.collection('fcmTokensV2').get();
  v2.forEach((doc) => {
    const d = doc.data() as any;
    const userId = d?.userId as string | undefined;
    const token = d?.token as string | undefined;
    if (!userId || !token) return;
    const key = `${userId}|${token}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ userId, token });
  });

  return out;
}

async function getAdminTokens(): Promise<Array<{ userId: string; token: string }>> {
  // Récupère les UID des admins
  const adminsSnap = await db.collection('users').where('isAdmin', '==', true).get();
  const adminIds = new Set<string>();
  adminsSnap.forEach(d => adminIds.add(d.id));
  if (adminIds.size === 0) return [];
  // Pour chaque admin, récupérer ses tokens (legacy + v2)
  const list: { userId: string; token: string }[] = [];
  const seen = new Set<string>();
  const reads = Array.from(adminIds).map(async (uid) => {
    const userTokens = await getUserTokens(uid);
    userTokens.forEach((token) => {
      const key = `${uid}|${token}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ userId: uid, token });
    });
  });
  await Promise.all(reads);
  return list;
}

async function getUserTokens(userId: string): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();

  const legacy = await db.collection('fcmTokens').doc(userId).get();
  const legacyToken = legacy.exists ? (legacy.data() as any)?.token as string | undefined : undefined;
  if (legacyToken && !seen.has(legacyToken)) {
    seen.add(legacyToken);
    out.push(legacyToken);
  }

  const v2 = await db.collection('fcmTokensV2').where('userId', '==', userId).get();
  v2.forEach((doc) => {
    const token = (doc.data() as any)?.token as string | undefined;
    if (token && !seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  });

  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function cleanupInvalidTokens(invalidTokens: string[]): Promise<void> {
  if (!invalidTokens.length) return;
  const chunks = chunk(invalidTokens, 10);

  for (const c of chunks) {
    const legacySnap = await db.collection('fcmTokens').where('token', 'in', c).get();
    const v2Snap = await db.collection('fcmTokensV2').where('token', 'in', c).get();
    const batch = db.batch();
    legacySnap.forEach((d) => batch.delete(d.ref));
    v2Snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function getAllWebPushSubs(): Promise<Array<{ userId: string; subscription: PushSubscription }>> {
  const snap = await db.collection('webPushSubs').get();
  const out: Array<{ userId: string; subscription: PushSubscription }> = [];
  snap.forEach((doc) => {
    const d = doc.data() as any;
    const sub = d?.subscription as PushSubscription | undefined;
    if (sub) out.push({ userId: doc.id, subscription: sub });
  });
  return out;
}

// Construit un nid stable pour un type d'événement
function buildNid(kind: 'new_job'|'new_application'|'application_accepted', id: string) {
  return `${kind}:${id}`;
}

app.post('/notify/new-job', requireAdmin, async (req: Request, res: Response) => {
  const { jobId, title, description } = req.body || {};
  if (!jobId || !title) return res.status(400).json({ error: 'Missing jobId/title' });
  const link = `/jobs?jobId=${encodeURIComponent(jobId)}`;
  try {
  const tokens = await getAllTokens();
  const subs = WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY ? await getAllWebPushSubs() : [];
  // FCM prioritaire. Web Push est un secours pour les utilisateurs sans token FCM.
  const usersWithFcm = new Set(tokens.map(t => t.userId));
  const webPushSubsFallback = subs.filter(s => !usersWithFcm.has(s.userId));
  const nid = buildNid('new_job', String(jobId));
  const pushTitle = 'Nouveau job disponible';
  const pushBody = String(title);
    // Notifications Firestore
    const batch = db.batch();
    const createdAt = admin.firestore.FieldValue.serverTimestamp();
    tokens.forEach(({ userId }) => {
      const ref = db.collection('notifications').doc();
      batch.set(ref, {
        userId,
        type: 'new_job',
        jobId,
        title: `Nouveau job: ${title}`,
        description: description || '',
        createdAt,
        readBy: [],
      });
    });
    await batch.commit();

  // Push FCM
  const tokenList = tokens.map(t => t.token);
    if (tokenList.length) {
      const resp = await admin.messaging().sendEachForMulticast({
        tokens: tokenList,
        notification: {
          title: pushTitle,
          body: pushBody,
        },
        // Unifier les clés pour le SW: title/body/link/nid (tout en string)
        data: {
          link,
          jobId: String(jobId),
          title: pushTitle,
          body: pushBody,
          nid,
          type: 'new_job',
        },
        webpush: {
          fcmOptions: { link },
          notification: {
            title: pushTitle,
            body: pushBody,
            icon: '/logo_pionniers.avif',
            tag: nid,
          },
        },
      });
      // Cleanup tokens invalides
      const invalidCodes = new Set(['messaging/invalid-registration-token', 'messaging/registration-token-not-registered']);
      const toDelete = resp.responses
        .map((r: any, i: number) => (!r.success && r.error && invalidCodes.has((r.error as any).code) ? tokenList[i] : null))
        .filter(Boolean) as string[];
      await cleanupInvalidTokens(toDelete);
    }
    // Web Push (iOS/Safari et navigateurs compatibles)
    if (webPushSubsFallback.length) {
      const payload = JSON.stringify({ title: pushTitle, body: pushBody, link, nid });
        const results = await Promise.allSettled(webPushSubsFallback.map(({ subscription }) => webpush.sendNotification(subscription, payload)));
        const toDelete: string[] = [];
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            const err: any = r.reason;
            const code = err?.statusCode;
            if (code === 404 || code === 410) toDelete.push(webPushSubsFallback[i].userId);
          }
        });
        if (toDelete.length) {
          const batch = db.batch();
          toDelete.forEach(uid => batch.delete(db.collection('webPushSubs').doc(uid)));
          await batch.commit();
        }
      }
    return res.json({ ok: true });
  } catch (e: any) {
    console.error('notify/new-job error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Notification aux admins lorsqu'un utilisateur postule
app.post('/notify/new-application', requireAuth, async (req: Request, res: Response) => {
  const { jobId, jobTitle, applicantId, applicantName } = req.body || {};
  if (!jobId || !jobTitle || !applicantId) return res.status(400).json({ error: 'Missing fields' });
  // L'appelant doit correspondre au candidat
  const callerUid = (req as any).uid as string;
  if (callerUid !== applicantId) return res.status(403).json({ error: 'Forbidden' });
  const link = `/jobs?jobId=${encodeURIComponent(jobId)}`;
  const nid = buildNid('new_application', String(jobId));
  try {
    const tokens = await getAdminTokens();
    // Récupérer les subs Web Push des admins
    const adminsSnap = await db.collection('users').where('isAdmin', '==', true).get();
    const subs: Array<{ userId: string; subscription: PushSubscription }> = [];
    if (WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY) {
      await Promise.all(adminsSnap.docs.map(async (d) => {
        const subDoc = await db.collection('webPushSubs').doc(d.id).get();
        const sub = subDoc.exists ? (subDoc.data() as any)?.subscription as PushSubscription | undefined : undefined;
        if (sub) subs.push({ userId: d.id, subscription: sub });
      }));
    }
    if (tokens.length === 0 && subs.length === 0) return res.json({ ok: true, sent: 0 });
    const usersWithFcm = new Set(tokens.map(t => t.userId));
    const webPushSubsFallback = subs.filter(s => !usersWithFcm.has(s.userId));

    // Écrit une notification Firestore (type: new_application) pour chaque admin
    const batch = db.batch();
    const createdAt = admin.firestore.FieldValue.serverTimestamp();
    tokens.forEach(({ userId }) => {
      const ref = db.collection('notifications').doc();
      batch.set(ref, {
        userId,
        type: 'new_application',
        jobId,
        title: `Nouvelle candidature: ${jobTitle}`,
        description: applicantName ? `${applicantName} a postulé.` : 'Un utilisateur a postulé.',
        createdAt,
        readBy: [],
      });
    });
    await batch.commit();

    // Push FCM uniquement aux admins
    const tokenList = tokens.map(t => t.token);
    if (tokenList.length) {
      const resp = await admin.messaging().sendEachForMulticast({
        tokens: tokenList,
        // Fournir title/body cohérents pour l'affichage côté SW
        data: {
          link,
          jobId: String(jobId),
          jobTitle: String(jobTitle),
          applicantId: String(applicantId),
          applicantName: String(applicantName || ''),
          title: 'Nouvelle candidature',
          body: `${applicantName ? applicantName + ' a p' : 'Un utilisateur a p'}ostulé: ${jobTitle}`,
          nid,
          type: 'new_application',
        },
        webpush: { fcmOptions: { link } },
      });

      // Cleanup tokens invalides
      const invalidCodes = new Set(['messaging/invalid-registration-token', 'messaging/registration-token-not-registered']);
      const toDelete = resp.responses
        .map((r: any, i: number) => (!r.success && r.error && invalidCodes.has((r.error as any).code) ? tokenList[i] : null))
        .filter(Boolean) as string[];
      await cleanupInvalidTokens(toDelete);
    }

    // Web Push vers les admins
  if (WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY) {
      if (webPushSubsFallback.length) {
        const payload = JSON.stringify({
          title: 'Nouvelle candidature',
          body: `${applicantName ? applicantName + ' a p' : 'Un utilisateur a p'}ostulé: ${jobTitle}`,
          link,
          nid,
        });
        const results = await Promise.allSettled(webPushSubsFallback.map(({ subscription }) => webpush.sendNotification(subscription, payload)));
        const toDelete: string[] = [];
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            const err: any = r.reason;
            const code = err?.statusCode;
            if (code === 404 || code === 410) toDelete.push(webPushSubsFallback[i].userId);
          }
        });
        if (toDelete.length) {
          const batch = db.batch();
          toDelete.forEach(uid => batch.delete(db.collection('webPushSubs').doc(uid)));
          await batch.commit();
        }
      }
    }
    return res.json({ ok: true, sent: tokenList.length });
  } catch (e) {
    console.error('notify/new-application error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Notification au candidat quand sa candidature est acceptée (admin-only)
app.post('/notify/application-accepted', requireAdmin, async (req: Request, res: Response) => {
  const { jobId, jobTitle, applicantId, applicantName } = req.body || {};
  if (!jobId || !jobTitle || !applicantId) return res.status(400).json({ error: 'Missing fields' });
  const link = `/jobs?jobId=${encodeURIComponent(jobId)}`;
  const nid = buildNid('application_accepted', String(jobId));
  try {
    // Tokens du candidat (multi-appareils)
    const tokens = await getUserTokens(applicantId);
    // Subscription Web Push du candidat
    const subDoc = WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY ? await db.collection('webPushSubs').doc(applicantId).get() : null;
    const sub: PushSubscription | undefined = subDoc && subDoc.exists ? (subDoc.data() as any)?.subscription as PushSubscription | undefined : undefined;
    // Écrire notification Firestore (type: application_accepted)
    const createdAt = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('notifications').add({
      userId: applicantId,
      type: 'application_accepted',
      jobId,
      title: `Candidature acceptée: ${jobTitle}`,
      description: applicantName ? `${applicantName}, votre candidature a été acceptée.` : 'Votre candidature a été acceptée.',
      createdAt,
      readBy: [],
    });
  // Push FCM au candidat (prioritaire)
    if (tokens.length) {
      const resp = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: 'Candidature acceptée',
          body: `Votre candidature a été acceptée: ${jobTitle}`,
        },
        data: {
          link,
          jobId: String(jobId),
          jobTitle: String(jobTitle),
          title: 'Candidature acceptée',
          body: `Votre candidature a été acceptée: ${jobTitle}`,
          nid,
          type: 'application_accepted',
        },
        webpush: { fcmOptions: { link } },
      });
      const invalidCodes = new Set(['messaging/invalid-registration-token', 'messaging/registration-token-not-registered']);
      const toDelete = resp.responses
        .map((r: any, i: number) => (!r.success && r.error && invalidCodes.has((r.error as any).code) ? tokens[i] : null))
        .filter(Boolean) as string[];
      await cleanupInvalidTokens(toDelete);
    }
  // Web Push au candidat (secours si pas de token FCM)
  if (WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY) {
    if (sub && tokens.length === 0) {
        await webpush.sendNotification(sub, JSON.stringify({
          title: 'Candidature acceptée',
          body: `Votre candidature a été acceptée: ${jobTitle}`,
      link,
      nid,
        }));
      }
    }
  return res.json({ ok: true, sent: (tokens.length ? tokens.length : 0) + (sub && tokens.length === 0 ? 1 : 0) });
  } catch (e) {
    console.error('notify/application-accepted error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Enregistre une subscription Web Push pour l'utilisateur courant
app.post('/webpush/subscribe', requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).uid as string;
    const { subscription } = req.body || {};
    if (!subscription || !WEBPUSH_PUBLIC_KEY || !WEBPUSH_PRIVATE_KEY) return res.status(400).json({ error: 'Missing subscription or VAPID config' });
    await db.collection('webPushSubs').doc(uid).set({ subscription }, { merge: true });
    return res.json({ ok: true });
  } catch (e) {
    console.error('webpush/subscribe error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Supprime la subscription Web Push de l'utilisateur courant
app.post('/webpush/unsubscribe', requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).uid as string;
    await db.collection('webPushSubs').doc(uid).delete();
    return res.json({ ok: true });
  } catch (e) {
    console.error('webpush/unsubscribe error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Endpoint de test: envoie une notification uniquement à l'utilisateur connecté
app.post('/notify/test', requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).uid as string;
    const { title, body } = req.body || {};
    if (!title) return res.status(400).json({ error: 'Missing title' });
    
    const notifTitle = String(title);
    const notifBody = String(body || '');
    const link = '/';
    const nid = `test:${Date.now()}`;
    
    // Récupérer les tokens FCM de l'utilisateur
    const tokens = await getUserTokens(uid);
    
    // Récupérer la subscription Web Push de l'utilisateur
    const subDoc = WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY ? await db.collection('webPushSubs').doc(uid).get() : null;
    const sub: PushSubscription | undefined = subDoc && subDoc.exists ? (subDoc.data() as any)?.subscription as PushSubscription | undefined : undefined;
    
    let sentFCM = false;
    let sentWebPush = false;
    let fcmSuccessCount = 0;
    let fcmFailureCount = 0;
    let invalidTokenCleanupCount = 0;
    const fcmErrors: Array<{ tokenSuffix: string; code: string; message: string }> = [];
    let webPushError: { statusCode?: number; message: string } | null = null;
    
    // Envoyer via FCM si le token existe
    if (tokens.length) {
      try {
        const resp = await admin.messaging().sendEachForMulticast({
          tokens,
          notification: {
            title: notifTitle,
            body: notifBody,
          },
          data: {
            title: notifTitle,
            body: notifBody,
            link,
            nid,
            type: 'test',
          },
          webpush: { 
            fcmOptions: { link },
          },
        });
        fcmSuccessCount = resp.successCount;
        fcmFailureCount = resp.failureCount;
        sentFCM = resp.successCount > 0;
        console.log(`[Test] FCM envoyé à ${uid}`);

        const invalidCodes = new Set(['messaging/invalid-registration-token', 'messaging/registration-token-not-registered']);
        const toDelete: string[] = [];
        resp.responses.forEach((r: any, i: number) => {
          if (r.success) return;
          const errCode = (r.error as any)?.code || 'unknown';
          const errMsg = (r.error as any)?.message || 'unknown error';
          fcmErrors.push({
            tokenSuffix: tokens[i] ? tokens[i].slice(-12) : 'unknown',
            code: String(errCode),
            message: String(errMsg),
          });
          if (r.error && invalidCodes.has(errCode)) toDelete.push(tokens[i]);
        });
        await cleanupInvalidTokens(toDelete);
        invalidTokenCleanupCount = toDelete.length;
      } catch (e: any) {
        console.error('[Test] Erreur FCM:', e);
        fcmErrors.push({
          tokenSuffix: 'multicast',
          code: String(e?.code || 'fcm-send-failed'),
          message: String(e?.message || 'FCM send failure'),
        });
      }
    }
    
    // Envoyer via Web Push si la subscription existe
    if (sub && WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY) {
      try {
        await webpush.sendNotification(sub, JSON.stringify({
          title: notifTitle,
          body: notifBody,
          link,
          nid,
        }));
        sentWebPush = true;
        console.log(`[Test] Web Push envoyé à ${uid}`);
      } catch (e: any) {
        console.error('[Test] Erreur Web Push:', e);
        const code = e?.statusCode;
        webPushError = { statusCode: code, message: String(e?.message || 'WebPush send failure') };
        if (code === 404 || code === 410) {
          await db.collection('webPushSubs').doc(uid).delete();
          console.log(`[Test] Subscription Web Push invalide supprimée pour ${uid}`);
        }
      }
    }
    
    return res.json({ 
      ok: true, 
      sentFCM, 
      sentWebPush,
      hasToken: tokens.length > 0,
      hasSub: !!sub,
      message: sentFCM || sentWebPush ? 'Notification envoyée' : 'Aucun token/subscription trouvé',
      debug: {
        uid,
        nid,
        tokenCount: tokens.length,
        tokenSuffixes: tokens.map((t) => t.slice(-12)),
        webPushConfigured: Boolean(WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY),
        fcmSuccessCount,
        fcmFailureCount,
        invalidTokenCleanupCount,
        fcmErrors,
        webPushError,
      },
    });
  } catch (e) {
    console.error('[Test] Erreur:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`notify-api listening on :${port}`));
