import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import admin from 'firebase-admin';

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

app.post('/notify/new-job', requireAdmin, async (req: Request, res: Response) => {
  const { jobId, title, description } = req.body || {};
  if (!jobId || !title) return res.status(400).json({ error: 'Missing jobId/title' });
  const link = `/jobs?jobId=${encodeURIComponent(jobId)}`;
  try {
    const tokens = await getAllTokens();
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
          title: 'Nouveau job disponible',
          body: String(title),
        },
        data: { link, jobId, title: String(title) },
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
  try {
    const tokens = await getAdminTokens();
    if (tokens.length === 0) return res.json({ ok: true, sent: 0 });

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
    const resp = await admin.messaging().sendEachForMulticast({
      tokens: tokenList,
      notification: {
        title: 'Nouvelle candidature',
        body: `${applicantName ? applicantName + ' a p' : 'Un utilisateur a p'}ostulé: ${jobTitle}`,
      },
      data: { link, jobId, jobTitle, applicantId, applicantName: String(applicantName || '') },
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
  try {
    // Token du candidat
    const tokenDoc = await db.collection('fcmTokens').doc(applicantId).get();
    const token = tokenDoc.exists ? (tokenDoc.data() as any)?.token as string | undefined : undefined;
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
    // Push FCM au candidat
    if (token) {
      await admin.messaging().send({
        token,
        notification: {
          title: 'Candidature acceptée',
          body: `Votre candidature a été acceptée: ${jobTitle}`,
        },
        data: { link, jobId, jobTitle },
        webpush: { fcmOptions: { link } },
      });
    }
    return res.json({ ok: true, sent: token ? 1 : 0 });
  } catch (e) {
    console.error('notify/application-accepted error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`notify-api listening on :${port}`));
