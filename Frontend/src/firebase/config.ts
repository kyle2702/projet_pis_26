// Initialisation Firebase paresseuse (client Web)
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth as _getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getFirestore as _getFirestore, type Firestore } from 'firebase/firestore';

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let googleProviderInstance: GoogleAuthProvider | null = null;

function readConfig() {
  const cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  };
  const missing = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    const msg = `Config Firebase manquante: ${missing.join(', ')}. Ajoutez Frontend/.env.local (voir .env.example).`;
    console.error(msg);
    throw new Error(msg);
  }
  return cfg as Required<typeof cfg>;
}

function ensureApp(): FirebaseApp {
  if (!appInstance) {
    const cfg = readConfig();
    appInstance = initializeApp(cfg);
  }
  return appInstance;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = _getAuth(ensureApp());
  }
  return authInstance;
}

export function getFirestoreDb(): Firestore {
  if (!dbInstance) {
    dbInstance = _getFirestore(ensureApp());
  }
  return dbInstance;
}

export function getGoogleProvider(): GoogleAuthProvider {
  if (!googleProviderInstance) {
    googleProviderInstance = new GoogleAuthProvider();
  }
  return googleProviderInstance;
}
