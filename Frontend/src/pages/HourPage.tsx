import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { getFirestoreDb } from '../firebase/config';


interface HourEntry {
  id: string;
  title: string;
  date: string;
  hours: number;
}

const HourPage: React.FC = () => {
  const { user } = useAuth();
  const [firestoreName, setFirestoreName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function fetchName() {
      if (!user?.uid) { setFirestoreName(null); return; }
      try {
        const { getFirestoreDb } = await import('../firebase/config');
        const { doc, getDoc } = await import('firebase/firestore');
        const db = getFirestoreDb();
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!cancelled && snap.exists()) {
          const name = snap.data().displayName;
          setFirestoreName(typeof name === 'string' && name.trim() ? name : null);
        }
      } catch {
        if (!cancelled) setFirestoreName(null);
      }
    }
    fetchName();
    return () => { cancelled = true; };
  }, [user?.uid]);
  const location = useLocation();
  const [entries, setEntries] = useState<HourEntry[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  // Ne montre le popup que si navigation avec state.showWelcome === true (connexion), jamais sur refresh direct
  const [showWelcome, setShowWelcome] = useState(false);

  // Affiche le popup uniquement lors d'une navigation après login (pas sur reload)
  useEffect(() => {
    let isReload = false;
    if (window.performance && window.performance.getEntriesByType) {
      const navs = window.performance.getEntriesByType('navigation');
      if (navs.length && (navs[0] as PerformanceNavigationTiming).type === 'reload') {
        isReload = true;
      }
    }
    if (location.state?.showWelcome && !isReload) {
      setShowWelcome(true);
    }
  }, [location.state]);

  useEffect(() => {
    const fetchHours = async () => {
      if (!user) return;
      try {
        const db = getFirestoreDb();
        // entries: collection("users/{uid}/hours")
        const hoursCol = collection(db, 'users', user.uid, 'hours');
        const snap = await getDocs(hoursCol);
        const list: HourEntry[] = [];
        snap.forEach((d) => {
          const data = d.data() as Partial<HourEntry> & { date?: string; title?: string; hours?: number };
          list.push({
            id: d.id,
            title: data.title ?? 'Sans titre',
            date: data.date ?? '',
            hours: typeof data.hours === 'number' ? data.hours : 0,
          });
        });
        setEntries(list);
        // summary: doc("users/{uid}") avec un champ totalHours (optionnel)
  const uDoc = await getDoc(doc(db, 'users', user.uid));
        const total = (uDoc.exists() && typeof uDoc.data().totalHours === 'number') ? uDoc.data().totalHours : list.reduce((s, e) => s + (e.hours || 0), 0);
        setTotalHours(total);
      } catch (error) {
        console.error(error);
      }
    };
    fetchHours();
    // Affiche le popup de bienvenue pendant 2 secondes
    if (showWelcome) {
      const timer = setTimeout(() => setShowWelcome(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [user, showWelcome]);

  if (!user) {
    return <div>Veuillez vous connecter pour voir vos heures.</div>;
  }

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: '2rem',
      textAlign: 'center',
    },
    total: {
      fontSize: '1.2rem',
      marginBottom: '1.5rem',
    },
    table: {
      width: '100%',
      maxWidth: '500px',
      borderCollapse: 'collapse',
      margin: '0 auto',
      backgroundColor: '#fdfdfd',
      boxShadow: '0 4px 8px rgba(0,0,0,0.05)',
      borderRadius: '8px',
      overflow: 'hidden',
    },
    th: {
      backgroundColor: '#646cff',
      color: 'white',
      padding: '0.75rem',
      fontWeight: 'bold',
    },
    td: {
      padding: '0.75rem',
      borderBottom: '1px solid #e0e0e0',
    },
    tr: {
      backgroundColor: '#fff',
      color: '#222',
    },
  };

  return (
    <div style={styles.container}>
      {showWelcome && user && (
        <div style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: '#646cff',
          color: 'white',
          padding: '2rem 3rem',
          borderRadius: '16px',
          fontSize: '1.5rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          zIndex: 2000,
        }}>
          Bienvenue, <strong>{firestoreName || user.displayName || ''}</strong>
        </div>
      )}
      <h1>Mes heures prestées</h1>
      <div style={styles.total}>Total: <strong>{totalHours}</strong> heures</div>
      <table style={styles.table}>
        <thead>
          <tr style={styles.tr}>
            <th style={styles.th}>Titre</th>
            <th style={styles.th}>Date</th>
            <th style={styles.th}>Heures</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr key={entry.id} style={styles.tr}>
              <td style={styles.td}>{entry.title}</td>
              <td style={styles.td}>{entry.date}</td>
              <td style={styles.td}>{entry.hours}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default HourPage;
