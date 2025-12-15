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
  const snap = await db.collection('fcmTokens').get();
  const list: { userId: string; token: string }[] = [];
  snap.forEach((doc) => {
    const token = (doc.data() as any)?.token as string | undefined;
    if (token) list.push({ userId: doc.id, token });
  });
  return list;
}

async function getAdminTokens(): Promise<Array<{ userId: string; token: string }>> {
  // Récupère les UID des admins
  const adminsSnap = await db.collection('users').where('isAdmin', '==', true).get();
  const adminIds = new Set<string>();
  adminsSnap.forEach(d => adminIds.add(d.id));
  if (adminIds.size === 0) return [];
  // Pour chaque admin, récupérer son token dans fcmTokens/{uid}
  const list: { userId: string; token: string }[] = [];
  const reads = Array.from(adminIds).map(async (uid) => {
    const ref = await db.collection('fcmTokens').doc(uid).get();
    const token = ref.exists ? (ref.data() as any)?.token as string | undefined : undefined;
    if (token) list.push({ userId: uid, token });
  });
  await Promise.all(reads);
  return list;
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
  // Construire un envoi exclusif par utilisateur: si sub Web Push existe => prioriser Web Push (retirer du lot FCM)
  const usersWithWebPush = new Set(subs.map(s => s.userId));
  const fcmTokensFiltered = tokens.filter(t => !usersWithWebPush.has(t.userId));
  const nid = buildNid('new_job', String(jobId));
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
  const tokenList = fcmTokensFiltered.map(t => t.token);
    if (tokenList.length) {
      const resp = await admin.messaging().sendEachForMulticast({
        tokens: tokenList,
        // Unifier les clés pour le SW: title/body/link/nid (tout en string)
        data: {
          link,
          jobId: String(jobId),
          title: 'Nouveau job disponible',
          body: String(title),
          nid,
          type: 'new_job',
        },
        webpush: { fcmOptions: { link } },
      });
      // Cleanup tokens invalides
      const invalidCodes = new Set(['messaging/invalid-registration-token', 'messaging/registration-token-not-registered']);
      const toDelete = resp.responses
        .map((r: any, i: number) => (!r.success && r.error && invalidCodes.has((r.error as any).code) ? tokenList[i] : null))
        .filter(Boolean) as string[];
      if (toDelete.length) {
        const snap = await db.collection('fcmTokens').where('token', 'in', toDelete).get();
        const cleanup = db.batch();
        snap.forEach((d) => cleanup.delete(d.ref));
        await cleanup.commit();
      }
    }
    // Web Push (iOS/Safari et navigateurs compatibles)
    if (subs.length) {
        const payload = JSON.stringify({ title: 'Nouveau job disponible', body: String(title), link, nid });
        const results = await Promise.allSettled(subs.map(({ subscription }) => webpush.sendNotification(subscription, payload)));
        const toDelete: string[] = [];
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            const err: any = r.reason;
            const code = err?.statusCode;
            if (code === 404 || code === 410) toDelete.push(subs[i].userId);
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
    const usersWithWebPush = new Set(subs.map(s => s.userId));
    const fcmTokensFiltered = tokens.filter(t => !usersWithWebPush.has(t.userId));

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
    const tokenList = fcmTokensFiltered.map(t => t.token);
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
    if (toDelete.length) {
      const snap = await db.collection('fcmTokens').where('token', 'in', toDelete).get();
      const cleanup = db.batch();
      snap.forEach((d) => cleanup.delete(d.ref));
      await cleanup.commit();
    }

    // Web Push vers les admins
  if (WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY) {
      if (subs.length) {
        const payload = JSON.stringify({
          title: 'Nouvelle candidature',
          body: `${applicantName ? applicantName + ' a p' : 'Un utilisateur a p'}ostulé: ${jobTitle}`,
          link,
          nid,
        });
        const results = await Promise.allSettled(subs.map(({ subscription }) => webpush.sendNotification(subscription, payload)));
        const toDelete: string[] = [];
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            const err: any = r.reason;
            const code = err?.statusCode;
            if (code === 404 || code === 410) toDelete.push(subs[i].userId);
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
    // Token du candidat
    const tokenDoc = await db.collection('fcmTokens').doc(applicantId).get();
    const token = tokenDoc.exists ? (tokenDoc.data() as any)?.token as string | undefined : undefined;
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
  // Push FCM au candidat (si pas déjà Web Push)
    if (token && !sub) {
      await admin.messaging().send({
        token,
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
    }
  // Web Push au candidat
  if (WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY) {
    if (sub) {
        await webpush.sendNotification(sub, JSON.stringify({
          title: 'Candidature acceptée',
          body: `Votre candidature a été acceptée: ${jobTitle}`,
      link,
      nid,
        }));
      }
    }
  return res.json({ ok: true, sent: (token && !sub ? 1 : 0) + (sub ? 1 : 0) });
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
    
    // Récupérer le token FCM de l'utilisateur
    const tokenDoc = await db.collection('fcmTokens').doc(uid).get();
    const token = tokenDoc.exists ? (tokenDoc.data() as any)?.token as string | undefined : undefined;
    
    // Récupérer la subscription Web Push de l'utilisateur
    const subDoc = WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY ? await db.collection('webPushSubs').doc(uid).get() : null;
    const sub: PushSubscription | undefined = subDoc && subDoc.exists ? (subDoc.data() as any)?.subscription as PushSubscription | undefined : undefined;
    
    let sentFCM = false;
    let sentWebPush = false;
    
    // Envoyer via FCM si le token existe et pas de Web Push
    if (token && !sub) {
      try {
        await admin.messaging().send({
          token,
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
        sentFCM = true;
        console.log(`[Test] FCM envoyé à ${uid}`);
      } catch (e: any) {
        console.error('[Test] Erreur FCM:', e);
        // Si le token est invalide, le supprimer
        const invalidCodes = new Set(['messaging/invalid-registration-token', 'messaging/registration-token-not-registered']);
        if (e.code && invalidCodes.has(e.code)) {
          await db.collection('fcmTokens').doc(uid).delete();
          console.log(`[Test] Token FCM invalide supprimé pour ${uid}`);
        }
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
      hasToken: !!token,
      hasSub: !!sub,
      message: sentFCM || sentWebPush ? 'Notification envoyée' : 'Aucun token/subscription trouvé'
    });
  } catch (e) {
    console.error('[Test] Erreur:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`notify-api listening on :${port}`));
