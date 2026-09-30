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
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
// firebase/messaging n'est plus importé statiquement ici: il est chargé à la demande
// dans le bloc notifications (initNotifications), pour ne pas peser sur le chunk
// critique du premier rendu (voir PERF_BASELINE.md phase 3.1).
import { isWebPushSupported, subscribeWebPush, unsubscribeWebPush } from '../webpush';
import { Toast } from '../components/ui/Toast';

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
  const [foregroundToast, setForegroundToast] = useState<{ id: number; message: string } | null>(null);
  const toastIdRef = useRef(0);

  const showForegroundToast = (title: string, body?: string) => {
    const nextId = ++toastIdRef.current;
    const msg = body ? `${title} — ${body}` : title;
    setForegroundToast({ id: nextId, message: msg });
  };

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let unsubMsg: (() => void) | undefined;
    try {
      const a = getFirebaseAuth();
      const d = getFirestoreDb();
      unsub = onAuthStateChanged(a, async (u) => {
      if (u) {
        // 1. L'identité est connue: on libère l'UI tout de suite (Layout, pages publiques).
        setUser(toPublicUser(u));
        setIsLoading(false);
        setRolesReady(false);
        // 2. Jeton sans forceRefresh (un aller-retour réseau en moins) et non attendu:
        //    rien dans le premier écran n'en dépend (seuls les appels backend l'utilisent).
        getIdToken(u)
          .then((freshToken) => {
            setToken(freshToken);
            tokenRef.current = freshToken;
          })
          .catch(() => null);
        // 3. Upsert du document utilisateur minimal, sans écraser displayName existant
        //    par null. Volontairement non attendu: une écriture ne doit jamais retarder
        //    la lecture du rôle admin (rolesReady) qui, elle, débloque les données.
        {
          const userDocRef = doc(d, 'users', u.uid);
          const update: Record<string, unknown> = { email: u.email ?? null, updatedAt: serverTimestamp() };
          if (u.displayName) {
            update.displayName = u.displayName;
          }
          setDoc(userDocRef, update, { merge: true }).catch((e) => {
            console.warn('Impossible de créer/mettre à jour le profil utilisateur:', e);
          });
        }

        // 4. Rôle admin: 1 seule lecture, lancée en parallèle du reste. C'est elle qui
        //    débloque useJobs (rolesReady): plus aucune cascade séquentielle au démarrage.
        try {
          const snap = await getDoc(doc(d, 'users', u.uid));
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
            console.warn('[FCM] Service Workers non supportés par ce navigateur');
            return;
          }

          // Enregistrer le service worker (fonctionne en dev et prod)
          let swReg = await navigator.serviceWorker.getRegistration('/');
          if (!swReg) {
            swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
              scope: '/',
              updateViaCache: 'none'
            });
            console.log('[FCM] Service worker enregistré:', swReg.scope);
          } else {
            console.log('[FCM] Service worker déjà enregistré:', swReg.scope);
            // Forcer la mise à jour si disponible
            await swReg.update().catch(() => {});
          }

          // Envoyer la config Firebase au service worker de manière sécurisée
          const sendConfig = () => {
            if (swReg.active) {
              swReg.active.postMessage({
                type: 'FIREBASE_CONFIG',
                config: {
                  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
                  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
                  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
                  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
                  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
                  appId: import.meta.env.VITE_FIREBASE_APP_ID
                }
              });
              console.log('[FCM] Configuration envoyée au service worker');
            }
          };
          
          // Envoyer immédiatement si activé, sinon attendre l'activation
          if (swReg.active) {
            sendConfig();
          } else if (swReg.installing || swReg.waiting) {
            const worker = swReg.installing || swReg.waiting;
            worker?.addEventListener('statechange', () => {
              if (worker.state === 'activated') sendConfig();
            });
          }

          // Attendre que le SW soit activé
          if (swReg.installing) {
            console.log('[FCM] Attente activation du service worker...');
            await new Promise((resolve) => {
              swReg.installing!.addEventListener('statechange', (e) => {
                const state = (e.target as ServiceWorker).state;
                console.log('[FCM] SW state:', state);
                if (state === 'activated') {
                  resolve(null);
                }
              });
            });
          }

          let allowed = false;
          if (typeof Notification !== 'undefined') {
            if (Notification.permission === 'granted') {
              allowed = true;
              console.log('[FCM] ✓ Permission notifications déjà accordée');
            } else if (Notification.permission === 'default') {
              console.log('[FCM] Demande de permission notifications...');
              const res = await Notification.requestPermission().catch((err) => {
                console.error('[FCM] Erreur lors de la demande de permission:', err);
                return 'denied';
              });
              allowed = res === 'granted';
              console.log(`[FCM] Résultat permission: ${res}`);
            } else {
              console.warn('[FCM] ✗ Notifications bloquées par le navigateur (denied)');
            }
          }

          if (allowed) {
            console.log('[FCM] Initialisation du token FCM...');
            // Import dynamique: firebase/messaging sort ainsi du chunk critique.
            const { initMessagingAndGetToken } = await import('../firebase/messaging');
            const tok = await initMessagingAndGetToken(u.uid);
            if (tok) {
              console.log('[FCM] ✓ Token FCM obtenu et enregistré');
              console.log('[FCM] Configuration de l\'écoute des messages en premier plan...');
            const { listenForegroundMessages } = await import('../firebase/messaging');
              unsubMsg = await listenForegroundMessages((payload) => {
                const title = payload.notification?.title || payload.data?.title;
                const body = payload.notification?.body || payload.data?.body;
                const link = payload.fcmOptions?.link || payload.data?.link || '/';
                console.log('[FCM] 📬 Notification reçue:', { title, body });
                if (title) {
                  showForegroundToast(title, body || '');
                }
                // Sur mobile, showNotification via SW est souvent plus fiable que new Notification en foreground.
                if (title && document.visibilityState === 'visible') {
                  Promise.resolve()
                    .then(async () => {
                      const reg = await navigator.serviceWorker.ready;
                      if ('showNotification' in reg) {
                        await reg.showNotification(title, {
                          body: body || '',
                          icon: '/logo_pionniers.avif',
                          data: { url: link },
                          tag: `fg:${Date.now()}`,
                        });
                        return;
                      }
                      new Notification(title, { body: body || '', icon: '/logo_pionniers.avif' });
                    })
                    .catch(() => {
                      try {
                        new Notification(title, { body: body || '', icon: '/logo_pionniers.avif' });
                      } catch {
                        // noop
                      }
                    });
                }
              });
              console.log('[FCM] ✓ Écoute des messages configurée avec succès');
            } else {
              console.warn('[FCM] ✗ Impossible d\'obtenir le token FCM');
              // Jeton résolu localement (mis en cache par le SDK): 0 aller-retour réseau.
              const webPushToken = tokenRef.current ?? (await getIdToken(u).catch(() => null));
              if (isWebPushSupported() && webPushToken) {
                // Fallback Web Push pour iOS/Safari
                console.log('[WebPush] Tentative de fallback Web Push...');
                const ok = await subscribeWebPush(u.uid, webPushToken);
                console.log(`[WebPush] ${ok ? '✓' : '✗'} Subscription Web Push: ${ok}`);
              } else {
                console.warn('[Notifications] ✗ Aucun système de notification disponible');
              }
            }
          } else {
            console.warn('[FCM] ✗ Permission non accordée; notifications désactivées');
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
      {foregroundToast && (
        <Toast
          key={foregroundToast.id}
          message={foregroundToast.message}
          type="info"
          duration={4500}
          onClose={() => setForegroundToast(null)}
        />
      )}
    </AuthContext.Provider>
  );
};