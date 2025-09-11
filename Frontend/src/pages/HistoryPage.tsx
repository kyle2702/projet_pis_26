import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { getFirestoreDb } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';

interface Job { id: string; title: string; 'date-begin': string; 'date-end': string; adress: string; description: string; remuneration: string; places: number; dateBeginSort?: number; dateEndSort?: number }

const HistoryPage: React.FC = () => {
  const { user } = useAuth();
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
    <div style={{ maxWidth: 900, margin: '2rem auto', padding: '1rem' }}>
      <h1>Historique des jobs</h1>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center', alignItems: 'flex-start' }}>
        {jobs.map(job => (
      <div key={job.id} style={{ border: '1px solid #ddd', borderRadius: 10, padding: '1rem', background: '#fff', color: '#222', display:'inline-block', textAlign:'center', width:'fit-content', maxWidth: 'min(92vw, 420px)', margin: '0 auto' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>{job.title || 'Sans titre'}</div>
            <div style={{ color: '#555', marginBottom: 6 }}>{job['date-begin']} — {job['date-end']}</div>
            <div style={{ marginBottom: 6 }}><span style={{ fontWeight: 600 }}>Adresse :</span> {job.adress}</div>
            <div style={{ marginBottom: 6 }}><span style={{ fontWeight: 600 }}>Description :</span> {job.description}</div>
            <div style={{ marginBottom: 6 }}><span style={{ fontWeight: 600 }}>Rémunération :</span> {job.remuneration}</div>
            <div style={{ marginBottom: 6 }}><span style={{ fontWeight: 600 }}>Places :</span> {job.places}</div>
            <div>
              <span style={{ fontWeight: 700, color: '#646cff' }}>Participants :</span> {participants[job.id]?.length ? participants[job.id].join(', ') : 'Aucun'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryPage;