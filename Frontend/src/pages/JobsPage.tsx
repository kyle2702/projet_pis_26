import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { collection, getDocs, doc, getDoc, addDoc, serverTimestamp, getCountFromServer } from 'firebase/firestore';
import { getFirebaseAuth } from '../firebase/config';
import { getFirestoreDb } from '../firebase/config';

// Types
interface Job { id: string; title: string; 'date-begin': string; 'date-end': string; adress: string; description: string; remuneration: string; places: number; dateBeginSort?: number; }
interface JobParticipants { [jobId: string]: string[]; }

const JobsPage: React.FC = () => {
  const [jobParticipants, setJobParticipants] = useState<JobParticipants>({});
  const { user } = useAuth();
  const location = useLocation();
  const [focusJobId, setFocusJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [applications, setApplications] = useState<Record<string, number>>({}); // jobId -> count
  const [userApplications, setUserApplications] = useState<Record<string, boolean>>({}); // jobId -> a postulé ?
  const [applyLoading, setApplyLoading] = useState<string | null>(null); // jobId en cours de postulation
  const [isAdmin, setIsAdmin] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    'date-begin': '',
    'date-end': '',
    adress: '',
    description: '',
    remuneration: '',
    places: 1,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setIsAdmin(false); return; }
      try {
        const db = getFirestoreDb();
        const snap = await getDoc(doc(db, 'users', user.uid));
        const val = snap.exists() && snap.data().isAdmin === true;
        if (!cancelled) setIsAdmin(!!val);
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const db = getFirestoreDb();
      const jobsCol = collection(db, 'jobs');
      const snap = await getDocs(jobsCol);
      const list: Job[] = [];
      const appCounts: Record<string, number> = {};
      const userApps: Record<string, boolean> = {};
      const participantsMap: JobParticipants = {};

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

      function toEpochMillis(val: unknown): number | undefined {
        if (!val) return undefined;
        if (typeof val === 'string') {
          const dt = new Date(val); // compatible avec input datetime-local ("YYYY-MM-DDTHH:mm")
          const t = dt.getTime();
          return Number.isNaN(t) ? undefined : t;
        }
        if (typeof val === 'object' && val !== null && 'seconds' in val) {
          return (val as { seconds: number }).seconds * 1000;
        }
        return undefined;
      }

      // Préparer les fetch parallèles sur chaque job
      await Promise.all(snap.docs.map(async (d) => {
        const data = d.data() as Partial<Job>;
        const jobId = d.id;
        list.push({
          id: jobId,
          title: data.title ?? '',
          'date-begin': toDateString(data['date-begin']),
          'date-end': toDateString(data['date-end']),
          adress: data.adress ?? '',
          description: data.description ?? '',
          remuneration: data.remuneration ?? '',
          places: typeof data.places === 'number' ? data.places : 0,
          dateBeginSort: toEpochMillis(data['date-begin'])
        });

        // Compte des candidatures
        try {
          const countSnap = await getCountFromServer(collection(db, `jobs/${jobId}/applications`));
          appCounts[jobId] = countSnap.data().count || 0;
        } catch {
          appCounts[jobId] = 0;
        }

        // L'utilisateur a-t-il postulé ? (doc présent dans la sous-collection validée)
        if (user) {
          try {
            const userAppSnap = await getDoc(doc(db, `jobs/${jobId}/applications/${user.uid}`));
            userApps[jobId] = userAppSnap.exists();
          } catch {
            userApps[jobId] = false;
          }
        }

        // Participants (admin uniquement)
        if (isAdmin) {
          try {
            const participantsSnap = await getDocs(collection(db, `jobs/${jobId}/applications`));
            const names = participantsSnap.docs.map(p => {
              const pdata = p.data();
              return (pdata.displayName as string) || (pdata.email as string) || p.id;
            });
            participantsMap[jobId] = names;
          } catch {
            participantsMap[jobId] = [];
          }
        }
      }));

      // Tri chronologique ascendant sur la date de début
      list.sort((a, b) => {
        const ta = a.dateBeginSort ?? Number.POSITIVE_INFINITY;
        const tb = b.dateBeginSort ?? Number.POSITIVE_INFINITY;
        return ta - tb;
      });

      setJobs(list);
      setApplications(appCounts);
      setUserApplications(userApps);
      if (isAdmin) setJobParticipants(participantsMap);
      setFetchError(null);
    } catch (e) {
      setJobs([]);
      setApplications({});
      setUserApplications({});
      if (isAdmin) setJobParticipants({});
      setFetchError('Erreur lors de la récupération des jobs. Voir la console.');
      console.error('Erreur fetch jobs:', e);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  // Recharger quand user ou statut admin change
  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Extraire jobId depuis query string pour highlight
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const jid = params.get('jobId');
    if (jid) {
      setFocusJobId(jid);
      // Scroll léger après rendu
      setTimeout(() => {
        const el = document.getElementById(`job-${jid}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 250);
    } else {
      setFocusJobId(null);
    }
  }, [location.search]);

  return (
    <div style={{ maxWidth: 700, margin: '2rem auto', padding: '1rem' }}>
      <h1>Jobs disponibles</h1>
      {isAdmin && !showForm && (
        <button
          style={{ marginBottom: 24, background: '#646cff', color: 'white', border: 'none', borderRadius: 8, padding: '0.7rem 1.5rem', fontSize: '1rem', cursor: 'pointer' }}
          onClick={() => setShowForm(true)}
        >
          Ajouter un job
        </button>
      )}
      {isAdmin && showForm && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setFormError(null);
            setFormLoading(true);
            try {
              // Validation simple
              if (!form.title.trim() || !form['date-begin'].trim() || !form['date-end'].trim() || !form.adress.trim() || !form.description.trim() || !form.remuneration.trim() || !form.places) {
                setFormError('Tous les champs sont obligatoires.');
                setFormLoading(false);
                return;
              }
              const db = getFirestoreDb();
              const newJobRef = await addDoc(collection(db, 'jobs'), {
                ...form,
                places: Number(form.places),
                createdAt: serverTimestamp(),
              });
              // Appeler le backend de notification (meilleur effort, sans bloquer l'ajout)
              try {
                const apiUrl = import.meta.env.VITE_NOTIFY_API_URL as string | undefined;
                if (apiUrl) {
                  const auth = getFirebaseAuth();
                  const idToken = await auth.currentUser?.getIdToken();
                  const payload = {
                    jobId: newJobRef.id,
                    title: form.title,
                    dateBegin: form['date-begin'],
                    dateEnd: form['date-end'],
                    adress: form.adress,
                    description: form.description,
                    remuneration: form.remuneration,
                    places: Number(form.places)
                  };
                  await fetch(`${apiUrl.replace(/\/$/, '')}/notify/new-job`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
                    },
                    body: JSON.stringify(payload)
                  }).catch(() => {});
                }
              } catch (e) {
                console.warn('Notification email backend failed (ignored):', e);
              }
              setShowForm(false);
              setForm({ title: '', 'date-begin': '', 'date-end': '', adress: '', description: '', remuneration: '', places: 1 });
              setFormError(null);
              // Recharge
              await fetchJobs();
            } catch (e) {
              setFormError('Erreur lors de l\'ajout du job.');
              console.error('Erreur ajout job:', e);
            } finally {
              setFormLoading(false);
            }
          }}
          style={{
            display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: 24, background: '#f9f9ff', border: '1px solid #ccc', borderRadius: 10, padding: '1.5rem', boxShadow: '0 2px 8px rgba(100,108,255,0.07)'
          }}
        >
          <input type="text" placeholder="Titre" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
          <input type="datetime-local" placeholder="Début" value={form['date-begin']} onChange={e => setForm(f => ({ ...f, ['date-begin']: e.target.value }))} required />
          <input type="datetime-local" placeholder="Fin" value={form['date-end']} onChange={e => setForm(f => ({ ...f, ['date-end']: e.target.value }))} required />
          <input type="text" placeholder="Adresse" value={form.adress} onChange={e => setForm(f => ({ ...f, adress: e.target.value }))} required />
          <textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
          <input type="text" placeholder="Rémunération (ex: 8€/h ou 300€)" value={form.remuneration} onChange={e => setForm(f => ({ ...f, remuneration: e.target.value }))} required />
          <input type="number" min={1} placeholder="Places (nombre de pionniers nécessaires)" value={form.places} onChange={e => setForm(f => ({ ...f, places: Number(e.target.value) }))} required />
          {formError && <div style={{ color: 'red' }}>{formError}</div>}
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit" disabled={formLoading} style={{ background: '#646cff', color: 'white', border: 'none', borderRadius: 8, padding: '0.7rem 1.5rem', fontSize: '1rem', cursor: 'pointer' }}>Valider</button>
            <button type="button" disabled={formLoading} style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 8, padding: '0.7rem 1.5rem', fontSize: '1rem', cursor: 'pointer' }} onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </form>
      )}
  {fetchError && <div style={{ color: 'red', marginBottom: 16 }}>{fetchError}</div>}
  {loading ? <div>Chargement...</div> : jobs.length === 0 ? <div>Aucun job disponible.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {jobs.map(job => {
            // Participants (admin)
            const participants = isAdmin ? (jobParticipants[job.id] || []) : [];
            const nbApplications = applications[job.id] || 0;
            const placesRestantes = Math.max(0, job.places - nbApplications);
            const dejaPostule = userApplications[job.id];
            return (
                  <div
                    key={job.id}
                    id={`job-${job.id}`}
                    style={{
                      border: focusJobId === job.id ? '2px solid #646cff' : '1px solid #bbb',
                      borderRadius: 10,
                      padding: '1.5rem',
                      background: focusJobId === job.id ? '#f0f2ff' : '#fff',
                      boxShadow: '0 2px 8px rgba(100,108,255,0.07)',
                      color: '#222',
                      position: 'relative',
                      transition: 'background .4s, border-color .4s'
                    }}
                  >
                <h2 style={{ margin: 0, color: '#222', fontWeight: 700 }}>{job.title && job.title.trim() ? job.title : 'Sans titre'}</h2>
                <div style={{ color: '#646cff', fontWeight: 600, marginBottom: 8 }}>
                  {job['date-begin']} — {job['date-end']}
                </div>
                <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 600, color: '#222' }}>Adresse :</span> {job.adress}</div>
                <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 600, color: '#222' }}>Description :</span> {job.description}</div>
                <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 600, color: '#222' }}>Rémunération :</span> {job.remuneration}</div>
                <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 600, color: '#222' }}>Places restantes :</span> {placesRestantes}/{job.places}</div>
                    {!user && (
                      <div style={{ color: '#888', fontWeight: 500, marginTop: 8, fontStyle: 'italic' }}>
                        Connectez-vous pour postuler à ce job
                      </div>
                    )}
                {user && !isAdmin && !dejaPostule && placesRestantes > 0 && (
                  <button
                    style={{ background: '#646cff', color: 'white', border: 'none', borderRadius: 8, padding: '0.7rem 1.5rem', fontSize: '1rem', cursor: 'pointer', marginTop: 8 }}
                    disabled={applyLoading === job.id}
                    onClick={async () => {
                      setApplyLoading(job.id);
                      try {
                        const db = getFirestoreDb();
                        // Cherche un displayName fiable (Firestore, Auth, fallback)
                        let displayName = user.displayName;
                        try {
                          const userDoc = await getDoc(doc(db, 'users', user.uid));
                          if (userDoc.exists() && userDoc.data().displayName) {
                            displayName = userDoc.data().displayName;
                          }
                        } catch {
                          // Erreur ignorée intentionnellement
                        }
                        if (!displayName) displayName = user.email || 'Utilisateur inconnu';
                        // Ajoute une demande d'approbation dans jobApplications
                        await addDoc(collection(db, 'jobApplications'), {
                          jobId: job.id,
                          jobTitle: job.title,
                          userId: user.uid,
                          email: user.email,
                          displayName,
                          appliedAt: serverTimestamp(),
                          status: 'pending'
                        });
                        // Notifier les admins (best-effort)
                        try {
                          const apiUrl = import.meta.env.VITE_NOTIFY_API_URL as string | undefined;
                          if (apiUrl) {
                            const auth = getFirebaseAuth();
                            const idToken = await auth.currentUser?.getIdToken();
                            await fetch(`${apiUrl.replace(/\/$/, '')}/notify/new-application`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
                              },
                              body: JSON.stringify({
                                jobId: job.id,
                                jobTitle: job.title,
                                applicantId: user.uid,
                                applicantName: displayName
                              })
                            }).catch(() => {});
                          }
                        } catch {
                          // ignoré volontairement
                        }
                        setUserApplications(a => ({ ...a, [job.id]: true }));
                        alert('Votre demande a été envoyée et est en attente de validation.');
                      } catch (e) {
                        alert('Erreur lors de la postulation.');
                        console.error(e);
                      } finally {
                        setApplyLoading(null);
                      }
                    }}
                  >
                    Postuler
                  </button>
                )}
                {user && dejaPostule && (
                  <div style={{ color: '#2e7d32', fontWeight: 600, marginTop: 8 }}>Vous avez postulé</div>
                )}
                {placesRestantes === 0 && (
                  <div style={{ color: '#c62828', fontWeight: 600, marginTop: 8 }}>Complet</div>
                )}
                {isAdmin && participants.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #eee', color: '#222', fontWeight: 500, fontSize: '.95rem' }}>
                    <span style={{ color: '#646cff', fontWeight: 700 }}>Participants :</span> {participants.join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default JobsPage;
