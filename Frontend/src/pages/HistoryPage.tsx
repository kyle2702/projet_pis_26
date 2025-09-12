import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { getFirestoreDb } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';

interface Job { id: string; title: string; 'date-begin': string; 'date-end': string; adress: string; description: string; remuneration: string; places: number; dateBeginSort?: number; dateEndSort?: number }

const HistoryPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [participants, setParticipants] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = getFirestoreDb();
        if (!user) { setIsAdmin(false); setLoading(false); return; }
        const me = await getDoc(doc(db, 'users', user.uid));
        const admin = me.exists() && me.data().isAdmin === true;
        if (!admin) { setIsAdmin(false); setLoading(false); return; }
        setIsAdmin(true);

        // Récupère tous les jobs
        const snap = await getDocs(collection(db, 'jobs'));
        const list: Job[] = [];
  function toEpochMillis(val: unknown): number | undefined {
          if (!val) return undefined;
          if (typeof val === 'string') {
            const dt = new Date(val); const t = dt.getTime();
            return Number.isNaN(t) ? undefined : t;
          }
          if (typeof val === 'object' && val !== null && 'seconds' in val) {
            return (val as { seconds: number }).seconds * 1000;
          }
          return undefined;
        }
        function toDateString(val: unknown): string {
          if (!val) return '';
          if (typeof val === 'string') {
            const m = val.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
            if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
            return val;
          }
          if (typeof val === 'object' && val !== null && 'seconds' in val) {
            const d = new Date((val as { seconds: number }).seconds * 1000);
            return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          }
          return String(val);
        }
        for (const d of snap.docs) {
          const data = d.data() as Partial<Job>;
          list.push({
            id: d.id,
            title: data.title ?? '',
            'date-begin': toDateString(data['date-begin']),
            'date-end': toDateString(data['date-end']),
            adress: data.adress ?? '',
            description: data.description ?? '',
            remuneration: data.remuneration ?? '',
            places: typeof data.places === 'number' ? data.places : 0,
            dateBeginSort: toEpochMillis(data['date-begin']),
            dateEndSort: toEpochMillis(data['date-end'])
          });
        }
        // Jobs terminés uniquement (fin passée)
        const now = Date.now();
        const past = list
          .filter(j => (j.dateEndSort ?? 0) < now)
          .sort((a,b) => (b.dateEndSort ?? 0) - (a.dateEndSort ?? 0));
        setJobs(past);

        // Récupère les participants pour chaque job passé
        const parts: Record<string, string[]> = {};
        for (const j of past) {
          try {
            const sub = await getDocs(collection(db, `jobs/${j.id}/applications`));
            parts[j.id] = sub.docs.map(p => {
              const pd = p.data();
              return (pd.displayName as string) || (pd.email as string) || p.id;
            });
          } catch {
            parts[j.id] = [];
          }
        }
        if (!cancelled) setParticipants(parts);
        if (!cancelled) setLoading(false);
  } catch {
        if (!cancelled) { setError('Erreur lors du chargement de l\'historique'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!user) return <div style={{ padding: 24 }}>Accès interdit</div>;
  if (!isAdmin) return <div style={{ padding: 24 }}>Accès réservé aux admins</div>;
  if (loading) return <div style={{ padding: 24 }}>Chargement…</div>;
  if (error) return <div style={{ padding: 24 }}>{error}</div>;

  return (
    <div style={{ maxWidth: 400, margin: '2rem auto', padding: '1rem', position: 'relative' }}>
      <a
       
        onClick={(e) => { e.preventDefault(); navigate('/jobs'); }}
        aria-label="Retour à la page des jobs"
        title="left arrow icons"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'fixed',
          top: 95,
          left: 8,
          borderRadius: 8,
          padding: '6px 8px',
          cursor: 'pointer',
            zIndex: 900,
          color: '#222',
          textDecoration: 'none',
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32
        }}
      >
        <img src="/back-button.png" alt="Retour" style={{ width: 35, height: 35, display: 'block' }} />
      </a>
      <h1 style={{ marginTop: 0, textAlign: 'center' }}>Historique des jobs</h1>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          alignItems: 'center',
          width: '100%'
        }}
      >
        {jobs.map(job => (
          <div
            key={job.id}
            style={{
              border: '1px solid #bbb',
              borderRadius: 10,
              padding: '1.5rem',
              background: '#fff',
              boxShadow: '0 2px 8px rgba(100,108,255,0.07)',
              color: '#222',
              position: 'relative',
              transition: 'background .4s, border-color .4s',
              width: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <h2 style={{ margin: 0, color: '#222', fontWeight: 700 }}>{job.title || 'Sans titre'}</h2>
            <div style={{ color: '#646cff', fontWeight: 600, marginBottom: 8 }}>
              {job['date-begin']} — {job['date-end']}
            </div>
            <div style={{ marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span style={{ fontWeight: 600, color: '#222' }}>Adresse :</span> {job.adress}
            </div>
            <div style={{ marginBottom: 8, lineHeight: '1.4em', maxHeight: '4.2em', overflow: 'hidden' }}>
              <span style={{ fontWeight: 600, color: '#222' }}>Description :</span> {job.description}
            </div>
            <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 600, color: '#222' }}>Rémunération :</span> {job.remuneration}</div>
            <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 600, color: '#222' }}>Places :</span> {job.places}</div>
            <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid #eee', color: '#222', fontWeight: 500, fontSize: '.95rem' }}>
              <span style={{ color: '#646cff', fontWeight: 700 }}>Participants :</span> {participants[job.id]?.length ? participants[job.id].join(', ') : 'Aucun'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryPage;