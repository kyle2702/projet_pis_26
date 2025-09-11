import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import SibApiV3Sdk from 'sib-api-v3-sdk';
import 'dotenv/config';

admin.initializeApp();

// Lecture API Key Brevo via variable d'environnement (Spark plan sans Secret Manager)
// IMPORTANT: Définir BREVO_API_KEY avant le déploiement (voir README / instructions fournies)
// Sur Firebase Functions (Spark), il n'y a pas de Secret Manager :
// 1. Éviter d'exposer la clé côté client
// 2. Ne pas committer la clé dans le repo
// 3. Utiliser un script de build qui injecte la valeur (ex: set BREVO_API_KEY=xxx && npm run build && firebase deploy)
// 4. OU fallback à un provider gratuit différent si besoin
// On tente d'abord process.env, sinon functions.config().brevo.key (config set via CLI pour ne pas exposer la clé dans le code)
let BREVO_API_KEY = process.env.BREVO_API_KEY;
if (!BREVO_API_KEY) {
  // try catch pour éviter erreur si config non définie
  try {
    // @ts-ignore
    const cfg: any = functions.config();
    if (cfg?.brevo?.key) BREVO_API_KEY = cfg.brevo.key as string;
  } catch (e) {
    // ignore
  }
}

// Paramètres configurables
const SENDER_EMAIL = 'no-reply@exemple.com'; // Remplacer par une adresse validée dans Brevo
const SENDER_NAME = 'Pionniers';
const DEFAULT_RECIPIENT = 'destinataire@exemple.com'; // Peut être remplacé dynamiquement

interface JobData {
  title?: string;
  titre?: string; // si francisé
  description?: string;
  emailCible?: string; // champ optionnel dans le document pour envoyer à un destinataire spécifique
  emailSent?: boolean;
}

export const onJobCreated = functions.firestore
  .document('jobs/{jobId}')
  .onCreate(async (snap, ctx) => {
    const data = snap.data() as JobData | undefined;
    if (!data) return;

    if (data.emailSent) {
      console.log('Email déjà marqué comme envoyé, skip.');
      return;
    }

    if (!BREVO_API_KEY) {
      console.error('BREVO_API_KEY manquante: définir la variable d\'environnement avant déploiement. Email non envoyé.');
      return;
    }

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    SibApiV3Sdk.ApiClient.instance.authentications['apiKey'].apiKey = BREVO_API_KEY;

    const subject = `Nouveau job: ${data.title || data.titre || 'Sans titre'}`;

    const htmlContent = `<!doctype html><html><body>
      <h2>${subject}</h2>
      <p>${data.description || 'Aucune description.'}</p>
      <small>Job ID: ${ctx.params.jobId}</small>
      </body></html>`;

    const toEmail = data.emailCible || DEFAULT_RECIPIENT;

    const sendSmtpEmail: SibApiV3Sdk.SendSmtpEmail = {
      subject,
      sender: { email: SENDER_EMAIL, name: SENDER_NAME },
      to: [{ email: toEmail }],
      htmlContent
    } as SibApiV3Sdk.SendSmtpEmail;

    try {
      await apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log('Email Brevo envoyé');

      await snap.ref.set({ emailSent: true }, { merge: true });
    } catch (err) {
      console.error('Erreur envoi email Brevo', err);
      // Optionnel: écrire un log / collection errors
    }
  });
