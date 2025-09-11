import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, doc, getDoc, getDocs, getDocs as getDocsFirestore, updateDoc, query, where } from 'firebase/firestore';
import { getFirestoreDb } from '../firebase/config';

interface Row {
  id: string;
  username: string;
  totalHours: number;
}

interface JobApplication {
  id: string;
  jobId: string;
  jobTitle: string;
  userId: string;
  email: string;
  displayName: string;
  appliedAt: unknown;
  status: string;
}

const AdminPage: React.FC = () => {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [appLoading, setAppLoading] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const { user, token, isLoading } = useAuth();
  const [users, setUsers] = useState<Row[]>([]);
  const [sortBy, setSortBy] = useState<'username' | 'totalHours' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Récupère les candidatures en attente
  useEffect(() => {
    if (isLoading) return;
    setAppLoading(true);
    const fetchApplications = async () => {
      try {
        const db = getFirestoreDb();
        const q = query(collection(db, 'jobApplications'), where('status', '==', 'pending'));
        const snap = await getDocsFirestore(q);
        const apps: JobApplication[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as JobApplication));
        setApplications(apps);
        setAppLoading(false);
      } catch {
        setAppError('Erreur lors du chargement des candidatures');
        setAppLoading(false);
      }
    };
    fetchApplications();
  }, [isLoading]);

  // Accepter/refuser une candidature
  const handleAppStatus = async (id: string, status: 'accepted' | 'refused') => {
    try {
      const db = getFirestoreDb();
      // Récupérer la demande pour avoir jobId et userId
      const appDoc = await getDoc(doc(db, 'jobApplications', id));
      if (!appDoc.exists()) throw new Error('Demande introuvable');
      const appData = appDoc.data();
      await updateDoc(doc(db, 'jobApplications', id), { status });
      // Si accepté, créer l'application validée dans la sous-collection du job
      if (status === 'accepted') {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, `jobs/${appData.jobId}/applications/${appData.userId}`), {
          userId: appData.userId,
          email: appData.email,
          displayName: appData.displayName,
          appliedAt: appData.appliedAt,
          approved: true
        });
        // Notifier le candidat (best-effort)
        try {
          const apiUrl = import.meta.env.VITE_NOTIFY_API_URL as string | undefined;
          if (apiUrl) {
            const { getFirebaseAuth } = await import('../firebase/config');
            const auth = getFirebaseAuth();
            const idToken = await auth.currentUser?.getIdToken();
            await fetch(`${apiUrl.replace(/\/$/, '')}/notify/application-accepted`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
              },
              body: JSON.stringify({
                jobId: appData.jobId,
                jobTitle: appData.jobTitle,
                applicantId: appData.userId,
                applicantName: appData.displayName
              })
            }).catch(() => {});
          }
        } catch {
          // ignoré volontairement
        }
      }
      setApplications(applications => applications.filter(app => app.id !== id));
    } catch {
      alert('Erreur lors de la mise à jour du statut.');
    }
  };

  // Récupère les utilisateurs et heures prestées
  useEffect(() => {
    if (isLoading) return;
    (async () => {
      try {
        if (!user) throw new Error('Accès interdit');
        const db = getFirestoreDb();
        const me = await getDoc(doc(db, 'users', user.uid));
        const isAdmin = me.exists() && me.data().isAdmin === true;
        if (!isAdmin) throw new Error('Accès interdit');
        const usersCol = collection(db, 'users');
        const snap = await getDocs(usersCol);
        const rows: Row[] = [];
        type UserDoc = { displayName?: string | null; email?: string | null; totalHours?: number; isAdmin?: boolean };
        for (const d of snap.docs) {
          const data = d.data() as UserDoc;
          rows.push({
            id: d.id,
            username: data.displayName || data.email || d.id,
            totalHours: typeof data.totalHours === 'number' ? data.totalHours : 0,
          });
        }
        setUsers(rows);
        setLoading(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur inconnue');
        setLoading(false);
      }
    })();
  }, [user, token, isLoading]);

  if (isLoading || loading) return <div>Chargement...</div>;
  if (error) return <div>{error}</div>;

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: '2rem',
      textAlign: 'center',
    },
    table: {
      width: '100%',
      maxWidth: '600px',
      borderCollapse: 'collapse',
      margin: '2rem auto',
      backgroundColor: '#fdfdfd',
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.05)',
      borderRadius: '8px',
      overflow: 'hidden',
    },
    th: {
      backgroundColor: '#646cff',
      color: 'white',
      fontWeight: 'bold',
      padding: '1rem',
      borderBottom: '1px solid #e0e0e0',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
      userSelect: 'none',
    },
    thInactive: {
      backgroundColor: '#646cff',
      color: 'white',
      fontWeight: 'bold',
      padding: '1rem',
      borderBottom: '1px solid #e0e0e0',
      cursor: 'default',
      userSelect: 'none',
    },
    td: {
      padding: '1rem',
      borderBottom: '1px solid #e0e0e0',
      color: '#333',
      textAlign: 'center',
    },
    h2: {
      marginBottom: '2rem',
      color: '#646cff',
    },
  };

  // Tri des utilisateurs
  const sortedUsers = [...users];
  if (sortBy) {
    sortedUsers.sort((a, b) => {
      if (sortBy === 'username') {
        if (a.username < b.username) return sortOrder === 'asc' ? -1 : 1;
        if (a.username > b.username) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      } else {
        return sortOrder === 'asc'
          ? a.totalHours - b.totalHours
          : b.totalHours - a.totalHours;
      }
    });
  }

  // Gestion du clic sur les entêtes pour trier
  const handleSort = (key: 'username' | 'totalHours') => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('asc');
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.h2}>Utilisateurs et heures prestées</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            <th
              style={{
                ...styles.th,
                backgroundColor: sortBy === 'username' ? '#4b53c3' : styles.th.backgroundColor,
                textDecoration: 'underline',
              }}
              onClick={() => handleSort('username')}
            >
              Totem {sortBy === 'username' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              style={{
                ...styles.th,
                backgroundColor: sortBy === 'totalHours' ? '#4b53c3' : styles.th.backgroundColor,
                textDecoration: 'underline',
              }}
              onClick={() => handleSort('totalHours')}
            >
              Heures prestées {sortBy === 'totalHours' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedUsers.map((u) => (
            <tr key={u.id}>
              <td style={styles.td}>{u.username}</td>
              <td style={styles.td}>{u.totalHours}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{...styles.h2, marginTop: 40}}>Demandes de candidature en attente</h2>
      {appLoading ? <div>Chargement des candidatures...</div> : appError ? <div>{appError}</div> : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.thInactive}>Job</th>
              <th style={styles.thInactive}>Utilisateur</th>
              <th style={styles.thInactive}>Email</th>
              <th style={styles.thInactive}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {applications.length === 0 && (
              <tr><td colSpan={4} style={styles.td}>Aucune demande en attente</td></tr>
            )}
            {applications.map(app => (
              <tr key={app.id}>
                <td style={styles.td}>{app.jobTitle}</td>
                <td style={styles.td}>{app.displayName}</td>
                <td style={styles.td}>{app.email}</td>
                <td style={styles.td}>
                  <button style={{ background: '#2e7d32', color: 'white', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', marginRight: 8, cursor: 'pointer' }} onClick={() => handleAppStatus(app.id, 'accepted')}>Accepter</button>
                  <button style={{ background: '#c62828', color: 'white', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer' }} onClick={() => handleAppStatus(app.id, 'refused')}>Refuser</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AdminPage;
