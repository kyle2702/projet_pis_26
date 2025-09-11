const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Helper pour récupérer tous les tokens FCM et les docs utilisateurs
async function getAllUserTokens() {
  const tokensSnap = await db.collection('fcmTokens').get();
  const entries = [];
  tokensSnap.forEach((doc) => {
    const data = doc.data();
    if (data && data.token) {
      entries.push({ userId: doc.id, token: data.token });
    }
  });
  return entries;
}

exports.onJobCreated = functions.firestore
  .document('jobs/{jobId}')
  .onCreate(async (snap, context) => {
    const jobId = context.params.jobId;
    const job = snap.data() || {};

    const title = (job.title || 'Nouveau job');
    const body = `Nouveau job: ${title}`;
    const link = `/jobs?jobId=${encodeURIComponent(jobId)}`;

    // 1) Créer des documents "notifications" ciblés par user
    // 2) Envoyer une notif FCM broadcast à tous les tokens disponibles
    try {
      const tokens = await getAllUserTokens();
      const batch = db.batch();
      const createdAt = admin.firestore.FieldValue.serverTimestamp();
      tokens.forEach(({ userId }) => {
        const ref = db.collection('notifications').doc();
        batch.set(ref, {
          userId,
          type: 'new_job',
          jobId,
          title: `Nouveau job: ${title}`,
          description: job.description || '',
          createdAt,
          readBy: [],
        });
      });
      await batch.commit();

      const tokenList = tokens.map(t => t.token).filter(Boolean);
      if (tokenList.length > 0) {
        const message = {
          notification: {
            title: 'Nouveau job disponible',
            body: title,
          },
          data: {
            link,
            jobId,
            title: String(title),
          },
          webpush: {
            fcmOptions: { link },
          },
          tokens: tokenList,
        };
        const resp = await admin.messaging().sendEachForMulticast(message);
        const failures = [];
        resp.responses.forEach((r, idx) => {
          if (!r.success) {
            failures.push({ token: tokenList[idx], error: r.error });
          }
        });
        // Nettoyage des tokens invalides
        const invalidCodes = new Set(['messaging/invalid-registration-token', 'messaging/registration-token-not-registered']);
        const toDelete = failures
          .filter(f => f.error && invalidCodes.has(f.error.code))
          .map(f => f.token);
        if (toDelete.length) {
          const tokenDocs = await db.collection('fcmTokens').where('token', 'in', toDelete).get();
          const cleanup = db.batch();
          tokenDocs.forEach(d => cleanup.delete(d.ref));
          await cleanup.commit();
        }
      }
    } catch (e) {
      console.error('onJobCreated error', e);
    }
  });
