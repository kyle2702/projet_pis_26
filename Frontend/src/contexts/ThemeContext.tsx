import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '../firebase/config';
import { useAuth } from './AuthContext';

type ThemeMode = 'light' | 'dark' | 'auto';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('auto');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  // Fonction pour résoudre le thème en fonction du mode et des préférences système
  const resolveTheme = (mode: ThemeMode): ResolvedTheme => {
    if (mode === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return mode;
  };

  // Charger le thème depuis Firestore ou localStorage
  useEffect(() => {
    let cancelled = false;

    const loadTheme = async () => {
      try {
        // Essayer de charger depuis localStorage d'abord (synchrone)
        const localMode = localStorage.getItem('themeMode') as ThemeMode | null;
        if (localMode && (localMode === 'light' || localMode === 'dark' || localMode === 'auto')) {
          if (!cancelled) {
            setThemeModeState(localMode);
            setResolvedTheme(resolveTheme(localMode));
          }
        }

        // Si utilisateur connecté, charger depuis Firestore
        if (user?.uid) {
          const db = getFirestoreDb();
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (!cancelled && userDoc.exists()) {
            const userData = userDoc.data();
            const firestoreMode = userData?.themeMode as ThemeMode | undefined;
            if (firestoreMode && (firestoreMode === 'light' || firestoreMode === 'dark' || firestoreMode === 'auto')) {
              setThemeModeState(firestoreMode);
              setResolvedTheme(resolveTheme(firestoreMode));
              // Synchroniser avec localStorage
              localStorage.setItem('themeMode', firestoreMode);
            }
          }
        }
      } catch (error) {
        console.error('Erreur lors du chargement du thème:', error);
      }
    };

    loadTheme();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  // Écouter les changements de préférences système
  useEffect(() => {
    if (themeMode !== 'auto') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setResolvedTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode]);

  // Appliquer le thème au document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.body.setAttribute('data-theme', resolvedTheme);
    console.log('Theme applied:', resolvedTheme);
  }, [resolvedTheme]);

  // Fonction pour changer le thème
  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    setResolvedTheme(resolveTheme(mode));
    
    // Sauvegarder dans localStorage
    localStorage.setItem('themeMode', mode);

    // Sauvegarder dans Firestore si utilisateur connecté
    if (user?.uid) {
      try {
        const db = getFirestoreDb();
        await setDoc(doc(db, 'users', user.uid), { themeMode: mode }, { merge: true });
      } catch (error) {
        console.error('Erreur lors de la sauvegarde du thème:', error);
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ themeMode, resolvedTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme doit être utilisé dans un ThemeProvider');
  }
  return context;
};
