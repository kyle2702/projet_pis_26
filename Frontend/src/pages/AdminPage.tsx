import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, doc, getDoc, getDocs, getDocs as getDocsFirestore, updateDoc, query, where, Timestamp } from 'firebase/firestore';
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

  // Récupère les utilisateurs et calcule les heures prestées à partir des jobs passés
  useEffect(() => {
    if (isLoading) return;
    (async () => {
      try {
        if (!user) throw new Error('Accès interdit');
        const db = getFirestoreDb();
        const me = await getDoc(doc(db, 'users', user.uid));
        const isAdmin = me.exists() && me.data().isAdmin === true;
        if (!isAdmin) throw new Error('Accès interdit');

        // 1) Charger les users pour disposer des noms/emails
        const usersSnap = await getDocs(collection(db, 'users'));
        const userMeta = new Map<string, { username: string; email?: string | null; displayName?: string | null }>();
        const emailToUid = new Map<string, string>();
        const nameToUid = new Map<string, string>(); // displayName normalisé -> uid
        usersSnap.forEach(d => {
          const data = d.data() as { displayName?: string | null; email?: string | null };
          const username = data.displayName || data.email || d.id;
          userMeta.set(d.id, { username, email: data.email ?? null, displayName: data.displayName ?? null });
          if (data.email) emailToUid.set(String(data.email).toLowerCase(), d.id);
          if (data.displayName) nameToUid.set(String(data.displayName).trim().toLowerCase(), d.id);
        });

        // 2) Charger tous les jobs et filtrer ceux dont la fin est passée
        const jobsSnap = await getDocs(collection(db, 'jobs'));
        type JobDoc = { ['date-begin']?: string | Timestamp; ['date-end']?: string | Timestamp };
        const now = Date.now();
        function parseDdMmYyyy(s: string): number | undefined {
          // ex: "31/08/2025 09:30" ou "31/08/2025"
          const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?$/);
          if (!m) return undefined;
          const dd = Number(m[1]);
          const mm = Number(m[2]);
          const yyyy = Number(m[3]);
          const HH = m[4] ? Number(m[4]) : 0;
          const MM = m[5] ? Number(m[5]) : 0;
          const d = new Date(yyyy, mm - 1, dd, HH, MM, 0, 0); // local time
          const t = d.getTime();
          return Number.isNaN(t) ? undefined : t;
        }
        function parseIsoLocal(s: string): number | undefined {
          // ex: "2025-09-11T09:30" ou "2025-09-11 09:30"
          const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
          if (!m) return undefined;
          const yyyy = Number(m[1]);
          const mm = Number(m[2]);
          const dd = Number(m[3]);
          const HH = Number(m[4]);
          const MM = Number(m[5]);
          const SS = m[6] ? Number(m[6]) : 0;
          const d = new Date(yyyy, mm - 1, dd, HH, MM, SS, 0); // local time
          const t = d.getTime();
          return Number.isNaN(t) ? undefined : t;
        }
        function toEpoch(val: unknown): number | undefined {
          if (!val) return undefined;
          if (typeof val === 'string') {
            // Supporter explicitement ISO local, puis fallback dd/mm
            const tIso = parseIsoLocal(val);
            if (tIso !== undefined) return tIso;
            const tDdMm = parseDdMmYyyy(val);
            if (tDdMm !== undefined) return tDdMm;
            // dernier recours: Date(val) si le navigateur sait parser
            const t = new Date(val).getTime();
            return Number.isNaN(t) ? undefined : t;
          }
          if (val instanceof Timestamp) { return val.toMillis(); }
          return undefined;
        }

        const pastJobs: Array<{ id: string; start?: number; end?: number }> = [];
        jobsSnap.forEach(d => {
          const data = d.data() as JobDoc;
          const start = toEpoch(data['date-begin']);
          const end = toEpoch(data['date-end']);
          if (end !== undefined && end < now && start !== undefined) {
            pastJobs.push({ id: d.id, start, end });
          }
        });

        // 3) Parcourir les participants validés de chaque job passé et sommer les heures
        const totals = new Map<string, number>(); // uid -> heures cumulées
        for (const j of pastJobs) {
          // Calcul à la minute près pour éviter les imprécisions de flottants
          const diffMs = (j.end ?? 0) - (j.start ?? 0);
          const minutes = diffMs > 0 ? Math.round(diffMs / 60000) : 0;
          const durationHours = minutes / 60;
          try {
            const appsSnap = await getDocs(collection(db, `jobs/${j.id}/applications`));
            interface ApprovedApplication { userId?: string; email?: string; displayName?: string }
            appsSnap.forEach(p => {
              const app = p.data() as ApprovedApplication;
              let uid: string | undefined = undefined;
              // 1) userId direct
              if (app.userId && userMeta.has(app.userId)) uid = app.userId;
              // 2) via email
              if (!uid && app.email) {
                const viaEmail = emailToUid.get(String(app.email).toLowerCase());
                if (viaEmail) uid = viaEmail;
              }
              // 3) via displayName
              if (!uid && app.displayName) {
                const viaName = nameToUid.get(String(app.displayName).trim().toLowerCase());
                if (viaName) uid = viaName;
              }
              // 4) via docId (si docId est déjà l'uid, un email, ou un nom)
              if (!uid) {
                const pid = p.id;
                if (userMeta.has(pid)) uid = pid;
                if (!uid) {
                  const viaEmailPid = emailToUid.get(String(pid).toLowerCase());
                  if (viaEmailPid) uid = viaEmailPid;
                }
                if (!uid) {
                  const viaNamePid = nameToUid.get(String(pid).trim().toLowerCase());
                  if (viaNamePid) uid = viaNamePid;
                }
              }
              const finalUid = uid ?? p.id;
              totals.set(finalUid, (totals.get(finalUid) || 0) + durationHours);
            });
          } catch {
            // ignorer
          }
        }

        // 4) Construire les lignes pour TOUS les utilisateurs (0 heure par défaut si rien validé)
        const rows: Row[] = Array.from(userMeta.entries()).map(([uid, meta]) => {
          const hours = totals.get(uid) || 0;
          return {
            id: uid,
            username: meta.username,
            totalHours: Number(hours.toFixed(2)),
          };
        });

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
      maxWidth: '390px',
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
