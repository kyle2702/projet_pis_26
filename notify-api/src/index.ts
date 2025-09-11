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

async function getAllTokens(): Promise<Array<{ userId: string; token: string }>> {
  const snap = await db.collection('fcmTokens').get();
  const list: { userId: string; token: string }[] = [];
  snap.forEach((doc) => {
    const token = (doc.data() as any)?.token as string | undefined;
    if (token) list.push({ userId: doc.id, token });
  });
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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`notify-api listening on :${port}`));
