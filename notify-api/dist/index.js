"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const web_push_1 = __importDefault(require("web-push"));
// Variables d'env attendues:
// - GOOGLE_APPLICATION_CREDENTIALS (chemin vers json service account) OU FIREBASE_CONFIG via initApp default creds
// - FIREBASE_PROJECT_ID (facultatif si dans creds)
if (!firebase_admin_1.default.apps.length) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (json) {
        const creds = JSON.parse(json);
        firebase_admin_1.default.initializeApp({ credential: firebase_admin_1.default.credential.cert(creds) });
    }
    else {
        // Par défaut: variables d'env Google (GOOGLE_APPLICATION_CREDENTIALS) ou métadonnées
        firebase_admin_1.default.initializeApp();
    }
}
const db = firebase_admin_1.default.firestore();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Config Web Push (VAPID)
const WEBPUSH_PUBLIC_KEY = process.env.WEBPUSH_PUBLIC_KEY;
const WEBPUSH_PRIVATE_KEY = process.env.WEBPUSH_PRIVATE_KEY;
const WEBPUSH_SUBJECT = process.env.WEBPUSH_SUBJECT || 'mailto:admin@example.com';
if (WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY) {
    web_push_1.default.setVapidDetails(WEBPUSH_SUBJECT, WEBPUSH_PUBLIC_KEY, WEBPUSH_PRIVATE_KEY);
}
// Endpoints de santé pour Render
app.get('/', (_req, res) => res.status(200).send('notify-api ok'));
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));
// Middleware auth: vérifie l'ID token et isAdmin
async function requireAdmin(req, res, next) {
    try {
        const auth = req.headers.authorization || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
        if (!token)
            return res.status(401).json({ error: 'No token' });
        const decoded = await firebase_admin_1.default.auth().verifyIdToken(token);
        const uid = decoded.uid;
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists || userDoc.data()?.isAdmin !== true) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        req.uid = uid;
        next();
    }
    catch (e) {
        console.error('Auth error', e);
        return res.status(401).json({ error: 'Invalid token' });
    }
}
// Middleware auth simple: vérifie uniquement l'ID token et expose req.uid
async function requireAuth(req, res, next) {
    try {
        const auth = req.headers.authorization || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
        if (!token)
            return res.status(401).json({ error: 'No token' });
        const decoded = await firebase_admin_1.default.auth().verifyIdToken(token);
        req.uid = decoded.uid;
        next();
    }
    catch (e) {
        console.error('Auth error', e);
        return res.status(401).json({ error: 'Invalid token' });
    }
}
async function getAllTokens() {
    const snap = await db.collection('fcmTokens').get();
    const list = [];
    snap.forEach((doc) => {
        const token = doc.data()?.token;
        if (token)
            list.push({ userId: doc.id, token });
    });
    return list;
}
async function getAdminTokens() {
    // Récupère les UID des admins
    const adminsSnap = await db.collection('users').where('isAdmin', '==', true).get();
    const adminIds = new Set();
    adminsSnap.forEach(d => adminIds.add(d.id));
    if (adminIds.size === 0)
        return [];
    // Pour chaque admin, récupérer son token dans fcmTokens/{uid}
    const list = [];
    const reads = Array.from(adminIds).map(async (uid) => {
        const ref = await db.collection('fcmTokens').doc(uid).get();
        const token = ref.exists ? ref.data()?.token : undefined;
        if (token)
            list.push({ userId: uid, token });
    });
    await Promise.all(reads);
    return list;
}
async function getAllWebPushSubs() {
    const snap = await db.collection('webPushSubs').get();
    const out = [];
    snap.forEach((doc) => {
        const d = doc.data();
        const sub = d?.subscription;
        if (sub)
            out.push({ userId: doc.id, subscription: sub });
    });
    return out;
}
app.post('/notify/new-job', requireAdmin, async (req, res) => {
    const { jobId, title, description } = req.body || {};
    if (!jobId || !title)
        return res.status(400).json({ error: 'Missing jobId/title' });
    const link = `/jobs?jobId=${encodeURIComponent(jobId)}`;
    try {
        const tokens = await getAllTokens();
        // Notifications Firestore
        const batch = db.batch();
        const createdAt = firebase_admin_1.default.firestore.FieldValue.serverTimestamp();
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
            const resp = await firebase_admin_1.default.messaging().sendEachForMulticast({
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
                .map((r, i) => (!r.success && r.error && invalidCodes.has(r.error.code) ? tokenList[i] : null))
                .filter(Boolean);
            if (toDelete.length) {
                const snap = await db.collection('fcmTokens').where('token', 'in', toDelete).get();
                const cleanup = db.batch();
                snap.forEach((d) => cleanup.delete(d.ref));
                await cleanup.commit();
            }
        }
        // Web Push (iOS/Safari et navigateurs compatibles)
        if (WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY) {
            const subs = await getAllWebPushSubs();
            if (subs.length) {
                const payload = JSON.stringify({ title: 'Nouveau job disponible', body: String(title), link });
                const results = await Promise.allSettled(subs.map(({ subscription }) => web_push_1.default.sendNotification(subscription, payload)));
                const toDelete = [];
                results.forEach((r, i) => {
                    if (r.status === 'rejected') {
                        const err = r.reason;
                        const code = err?.statusCode;
                        if (code === 404 || code === 410)
                            toDelete.push(subs[i].userId);
                    }
                });
                if (toDelete.length) {
                    const batch = db.batch();
                    toDelete.forEach(uid => batch.delete(db.collection('webPushSubs').doc(uid)));
                    await batch.commit();
                }
            }
        }
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('notify/new-job error', e);
        return res.status(500).json({ error: 'Internal error' });
    }
});
// Notification aux admins lorsqu'un utilisateur postule
app.post('/notify/new-application', requireAuth, async (req, res) => {
    const { jobId, jobTitle, applicantId, applicantName } = req.body || {};
    if (!jobId || !jobTitle || !applicantId)
        return res.status(400).json({ error: 'Missing fields' });
    // L'appelant doit correspondre au candidat
    const callerUid = req.uid;
    if (callerUid !== applicantId)
        return res.status(403).json({ error: 'Forbidden' });
    const link = `/jobs?jobId=${encodeURIComponent(jobId)}`;
    try {
        const tokens = await getAdminTokens();
        if (tokens.length === 0)
            return res.json({ ok: true, sent: 0 });
        // Écrit une notification Firestore (type: new_application) pour chaque admin
        const batch = db.batch();
        const createdAt = firebase_admin_1.default.firestore.FieldValue.serverTimestamp();
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
        const resp = await firebase_admin_1.default.messaging().sendEachForMulticast({
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
            .map((r, i) => (!r.success && r.error && invalidCodes.has(r.error.code) ? tokenList[i] : null))
            .filter(Boolean);
        if (toDelete.length) {
            const snap = await db.collection('fcmTokens').where('token', 'in', toDelete).get();
            const cleanup = db.batch();
            snap.forEach((d) => cleanup.delete(d.ref));
            await cleanup.commit();
        }
        // Web Push vers les admins
        if (WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY) {
            const adminsSnap = await db.collection('users').where('isAdmin', '==', true).get();
            const subs = [];
            await Promise.all(adminsSnap.docs.map(async (d) => {
                const subDoc = await db.collection('webPushSubs').doc(d.id).get();
                const sub = subDoc.exists ? subDoc.data()?.subscription : undefined;
                if (sub)
                    subs.push({ userId: d.id, subscription: sub });
            }));
            if (subs.length) {
                const payload = JSON.stringify({
                    title: 'Nouvelle candidature',
                    body: `${applicantName ? applicantName + ' a p' : 'Un utilisateur a p'}ostulé: ${jobTitle}`,
                    link,
                });
                const results = await Promise.allSettled(subs.map(({ subscription }) => web_push_1.default.sendNotification(subscription, payload)));
                const toDelete = [];
                results.forEach((r, i) => {
                    if (r.status === 'rejected') {
                        const err = r.reason;
                        const code = err?.statusCode;
                        if (code === 404 || code === 410)
                            toDelete.push(subs[i].userId);
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
    }
    catch (e) {
        console.error('notify/new-application error', e);
        return res.status(500).json({ error: 'Internal error' });
    }
});
// Notification au candidat quand sa candidature est acceptée (admin-only)
app.post('/notify/application-accepted', requireAdmin, async (req, res) => {
    const { jobId, jobTitle, applicantId, applicantName } = req.body || {};
    if (!jobId || !jobTitle || !applicantId)
        return res.status(400).json({ error: 'Missing fields' });
    const link = `/jobs?jobId=${encodeURIComponent(jobId)}`;
    try {
        // Token du candidat
        const tokenDoc = await db.collection('fcmTokens').doc(applicantId).get();
        const token = tokenDoc.exists ? tokenDoc.data()?.token : undefined;
        // Écrire notification Firestore (type: application_accepted)
        const createdAt = firebase_admin_1.default.firestore.FieldValue.serverTimestamp();
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
            await firebase_admin_1.default.messaging().send({
                token,
                notification: {
                    title: 'Candidature acceptée',
                    body: `Votre candidature a été acceptée: ${jobTitle}`,
                },
                data: { link, jobId, jobTitle },
                webpush: { fcmOptions: { link } },
            });
        }
        // Web Push au candidat
        if (WEBPUSH_PUBLIC_KEY && WEBPUSH_PRIVATE_KEY) {
            const subDoc = await db.collection('webPushSubs').doc(applicantId).get();
            const sub = subDoc.exists ? subDoc.data()?.subscription : undefined;
            if (sub) {
                await web_push_1.default.sendNotification(sub, JSON.stringify({
                    title: 'Candidature acceptée',
                    body: `Votre candidature a été acceptée: ${jobTitle}`,
                    link,
                }));
            }
        }
        return res.json({ ok: true, sent: token ? 1 : 0 });
    }
    catch (e) {
        console.error('notify/application-accepted error', e);
        return res.status(500).json({ error: 'Internal error' });
    }
});
// Enregistre une subscription Web Push pour l'utilisateur courant
app.post('/webpush/subscribe', requireAuth, async (req, res) => {
    try {
        const uid = req.uid;
        const { subscription } = req.body || {};
        if (!subscription || !WEBPUSH_PUBLIC_KEY || !WEBPUSH_PRIVATE_KEY)
            return res.status(400).json({ error: 'Missing subscription or VAPID config' });
        await db.collection('webPushSubs').doc(uid).set({ subscription }, { merge: true });
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('webpush/subscribe error', e);
        return res.status(500).json({ error: 'Internal error' });
    }
});
// Supprime la subscription Web Push de l'utilisateur courant
app.post('/webpush/unsubscribe', requireAuth, async (req, res) => {
    try {
        const uid = req.uid;
        await db.collection('webPushSubs').doc(uid).delete();
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('webpush/unsubscribe error', e);
        return res.status(500).json({ error: 'Internal error' });
    }
});
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`notify-api listening on :${port}`));
