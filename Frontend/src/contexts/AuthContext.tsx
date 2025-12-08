/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { getFirebaseAuth, getGoogleProvider, getFirestoreDb } from '../firebase/config';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  signInWithPopup,
  type User as FirebaseUser,
  getIdToken,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { initMessagingAndGetToken, listenForegroundMessages } from '../firebase/messaging';
import { isWebPushSupported, subscribeWebPush, unsubscribeWebPush } from '../webpush';

type PublicUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

interface AuthContextType {
  user: PublicUser | null;
  token: string | null;
  isLoading: boolean;
  isAdmin: boolean;
  rolesReady: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

function toPublicUser(u: FirebaseUser): PublicUser {
  return { uid: u.uid, email: u.email, displayName: u.displayName };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rolesReady, setRolesReady] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let unsubMsg: (() => void) | undefined;
    try {
      const a = getFirebaseAuth();
      const d = getFirestoreDb();
      unsub = onAuthStateChanged(a, async (u) => {
      if (u) {
        setUser(toPublicUser(u));
        const t = await getIdToken(u, /* forceRefresh */ true).catch(() => null);
        setToken(t);
        tokenRef.current = t;
        setRolesReady(false);
        // Upsert du document utilisateur minimal, sans écraser displayName existant par null
        try {
          const userDocRef = doc(d, 'users', u.uid);
          const update: Record<string, unknown> = { email: u.email ?? null, updatedAt: serverTimestamp() };
          if (u.displayName) {
            update.displayName = u.displayName;
          }
          await setDoc(userDocRef, update, { merge: true });
        } catch (e) {
          // non bloquant pour l'UI
          console.warn('Impossible de créer/mettre à jour le profil utilisateur:', e);
        }

        // Récupération du rôle admin
        try {
          const snap = await (await import('firebase/firestore')).getDoc(doc(d, 'users', u.uid));
          const isAdm = snap.exists() && snap.data()?.isAdmin === true;
          setIsAdmin(!!isAdm);
        } catch {
          setIsAdmin(false);
        } finally {
          setRolesReady(true);
        }

        // Init FCM (meilleur effort) + demande de permission si nécessaire
        try {
          // Vérifier si les service workers sont supportés
          if (!('serviceWorker' in navigator)) {
            console.info('Service Workers non supportés par ce navigateur');
            return;
          }

          const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
            scope: '/',
            updateViaCache: 'none'
          });
          console.info('SW registered for FCM:', swReg.scope);
          
          // Attendre que le SW soit activé
          if (swReg.installing) {
            await new Promise((resolve) => {
              swReg.installing!.addEventListener('statechange', (e) => {
                if ((e.target as ServiceWorker).state === 'activated') {
                  resolve(null);
                }
              });
            });
          }

          let allowed = false;
          if (typeof Notification !== 'undefined') {
            if (Notification.permission === 'granted') {
              allowed = true;
              console.info('Permission notifications déjà accordée');
            } else if (Notification.permission === 'default') {
              console.info('Demande de permission notifications...');
              const res = await Notification.requestPermission().catch((err) => {
                console.warn('Erreur lors de la demande de permission:', err);
                return 'denied';
              });
              allowed = res === 'granted';
              console.info('Résultat permission:', res);
            } else {
              console.info('Notifications bloquées par le navigateur (denied).');
            }
          }
          
          if (allowed) {
            console.info('Initialisation du token FCM...');
            const tok = await initMessagingAndGetToken(u.uid);
            console.info('FCM token obtenu:', !!tok);
            
            if (tok) {
              console.info('Configuration de l\'écoute des messages en premier plan...');
              unsubMsg = await listenForegroundMessages((payload) => {
                const title = payload.notification?.title || payload.data?.title;
                const body = payload.notification?.body || payload.data?.body;
                console.info('Notification reçue en premier plan:', { title, body });
                if (title) console.info('Notification:', title, body);
              });
              console.info('Écoute des messages configurée avec succès');
            } else if (isWebPushSupported() && t) {
              // Fallback Web Push pour iOS/Safari
              console.info('Tentative de fallback Web Push...');
              const ok = await subscribeWebPush(u.uid, t);
              console.info('Web Push subscription:', ok);
            } else {
              console.warn('Impossible d\'obtenir le token FCM et Web Push non supporté');
            }
          } else {
            console.info('Permission notifications non accordée; token/subscription non enregistrés.');
          }
        } catch (e) {
          console.error('Erreur lors de l\'initialisation FCM/Web Push:', e);
          console.error('Détails de l\'erreur:', e instanceof Error ? e.message : String(e));
        }
      } else {
        // Déconnexion: nettoyage (non-bloquant pour l'UI)
        const lastToken = tokenRef.current;
        if (lastToken) {
          // Lancer en arrière-plan pour ne pas bloquer le rendu
          Promise.resolve().then(() => unsubscribeWebPush(lastToken)).catch(() => { /* noop */ });
        }
        setUser(null);
        setToken(null);
        tokenRef.current = null;
  setIsAdmin(false);
  setRolesReady(true);
        // Cleanup messaging listener
        try { unsubMsg?.(); } catch { /* noop */ }
      }
      setIsLoading(false);
      });
    } catch (e) {
      console.warn('Firebase non configuré ou indisponible:', e);
      setIsLoading(false);
    }
    return () => { try { unsub?.(); unsubMsg?.(); } catch { /* noop */ } };
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    } catch (e: unknown) {
      const code = typeof e === 'object' && e && 'code' in e ? String((e as { code?: unknown }).code) : '';
      // Normaliser les cas: auth/invalid-credential peut recouvrir mauvais mot de passe
      let msg = 'Impossible de se connecter.';
      if (code.includes('invalid-credential') || code.includes('wrong-password')) {
        msg = 'Email ou mot de passe incorrect.';
      } else if (code.includes('user-not-found')) {
        msg = "Aucun compte ne correspond à cet email.";
      } else if (code.includes('too-many-requests')) {
        msg = 'Trop de tentatives. Réessayez plus tard.';
      } else if (code.includes('network-request-failed')) {
        msg = 'Problème réseau. Vérifiez votre connexion.';
      } else if (code.includes('user-disabled')) {
        msg = 'Ce compte a été désactivé.';
      }
      const err = new Error(msg);
      // @ts-expect-error ajouter le code pour usage éventuel en UI
      err.code = code;
      throw err;
    }
  };

  const loginWithGoogle = async () => {
  await signInWithPopup(getFirebaseAuth(), getGoogleProvider());
  };

  const logout = async () => {
  await signOut(getFirebaseAuth());
  };

  return (
  <AuthContext.Provider value={{ user, token, isLoading, isAdmin, rolesReady, loginWithEmail, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};