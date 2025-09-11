/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useEffect, useContext } from 'react';
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

type PublicUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

interface AuthContextType {
  user: PublicUser | null;
  token: string | null;
  isLoading: boolean;
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      const a = getFirebaseAuth();
      const d = getFirestoreDb();
      unsub = onAuthStateChanged(a, async (u) => {
      if (u) {
        setUser(toPublicUser(u));
        const t = await getIdToken(u, /* forceRefresh */ true).catch(() => null);
        setToken(t);
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
      } else {
        setUser(null);
        setToken(null);
      }
      setIsLoading(false);
      });
    } catch (e) {
      console.warn('Firebase non configuré ou indisponible:', e);
      setIsLoading(false);
    }
    return () => unsub?.();
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
  await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  };

  const loginWithGoogle = async () => {
  await signInWithPopup(getFirebaseAuth(), getGoogleProvider());
  };

  const logout = async () => {
  await signOut(getFirebaseAuth());
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, loginWithEmail, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};