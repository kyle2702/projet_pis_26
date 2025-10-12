import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { collection, getDocs, doc, getDoc, addDoc, serverTimestamp, getCountFromServer, updateDoc, deleteDoc, onSnapshot, query, setDoc } from 'firebase/firestore';
import { getFirebaseAuth } from '../firebase/config';
import { getFirestoreDb } from '../firebase/config';

// Types
interface Job {
  id: string;
  title: string;
  'date-begin': string; // affichage (ex: 28/11/2025 17:00)
  'date-end': string;   // affichage
  dateBeginInput?: string; // pour input datetime-local (YYYY-MM-DDTHH:mm)
  dateEndInput?: string;   // pour input datetime-local
  adress: string;
  description: string;
  remuneration: string;
  places: number;
  dateBeginSort?: number;
}
interface Participant { userId: string; displayName?: string; email?: string }
interface JobParticipants { [jobId: string]: Participant[]; }

// Combobox avec recherche intégrée en haut de la liste
type ComboOption = { value: string; label: string };
const ComboSearch: React.FC<{ value: string; onChange: (v: string) => void; options: ComboOption[]; placeholder?: string; maxItems?: number; disabled?: boolean; }>
  = ({ value, onChange, options, placeholder = 'Choisir…', maxItems = 5, disabled }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const selected = options.find(o => o.value === value);
    const list = options.filter(o => {
      const q = query.trim().toLowerCase();
      return !q || o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q);
    }).slice(0, maxItems);
    const [menuPos, setMenuPos] = useState<{ left: number; top: number; width: number; maxHeight: number; openUp: boolean }>({ left: 0, top: 0, width: 0, maxHeight: 240, openUp: false });

    const updatePosition = useCallback(() => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const desiredMax = 280;
      const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(140, Math.min(desiredMax, (openUp ? spaceAbove - 10 : spaceBelow - 10)));
      setMenuPos({
        left: Math.round(rect.left),
        top: Math.round(openUp ? rect.top - Math.min(desiredMax, maxHeight) : rect.bottom),
        width: Math.round(rect.width),
        maxHeight,
        openUp
      });
    }, []);
    useEffect(() => {
      const onDocClick = (e: MouseEvent) => {
        if (!wrapRef.current) return;
        const target = e.target as Node;
        if (wrapRef.current.contains(target)) return;
        if (menuRef.current && menuRef.current.contains(target)) return;
        setOpen(false);
        setQuery('');
      };
      document.addEventListener('mousedown', onDocClick);
      return () => document.removeEventListener('mousedown', onDocClick);
    }, []);
    useEffect(() => {
      if (!open) return;
      updatePosition();
      const onScroll = () => updatePosition();
      const onResize = () => updatePosition();
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onResize);
      return () => {
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onResize);
      };
    }, [open, updatePosition]);
    useEffect(() => {
      if (open) setTimeout(() => inputRef.current?.focus(), 0);
    }, [open]);
    return (
      <div ref={wrapRef} style={{ position: 'relative', width: '100%', minWidth: 0 }}>
        <button ref={buttonRef} type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
          style={{ width: '100%', textAlign: 'left', background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 8, padding: '0.45rem 0.6rem', cursor: disabled ? 'not-allowed' : 'pointer' }}>
          {selected ? selected.label : <span style={{ color: '#9ca3af' }}>{placeholder}</span>}
        </button>
        {open && createPortal(
          <div ref={menuRef} role="listbox"
            style={{ position: 'fixed', zIndex: 100000, top: menuPos.top, left: menuPos.left, width: menuPos.width, background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 8, boxShadow: '0 10px 26px rgba(0,0,0,0.45)', padding: 8 }}>
            <input ref={inputRef} type="text" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: 6, border: '1px solid #374151', background: '#1f2937', color: '#e5e7eb', marginBottom: 8 }} />
            <div style={{ maxHeight: menuPos.maxHeight, overflowY: 'auto', display: 'grid', gap: 4 }}>
              {list.length === 0 ? (
                <div style={{ color: '#9ca3af', padding: '0.25rem 0.2rem' }}>Aucun résultat</div>
              ) : (
                list.map(opt => (
                  <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); setQuery(''); }} type="button"
                    style={{ textAlign: 'left', width: '100%', background: '#1f2937', border: '1px solid #374151', color: '#e5e7eb', borderRadius: 6, padding: '0.4rem 0.6rem', cursor: 'pointer' }}>
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </div>, document.body)
        }
      </div>
    );
  };

const JobsPage: React.FC = () => {
  const [jobParticipants, setJobParticipants] = useState<JobParticipants>({});
  const { user, isLoading: authLoading, isAdmin: ctxIsAdmin, rolesReady } = useAuth();
  const location = useLocation();
  const [focusJobId, setFocusJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [applications, setApplications] = useState<Record<string, number>>({}); // jobId -> count
  const [userApplications, setUserApplications] = useState<Record<string, boolean>>({}); // jobId -> a postulé/pendant ?
  const [userPendingApps, setUserPendingApps] = useState<Record<string, boolean>>({}); // jobId -> pending
  const [applyLoading, setApplyLoading] = useState<string | null>(null); // jobId en cours de postulation
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminReady, setAdminReady] = useState(false); // statut admin déterminé (vrai/faux) ?
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
  // Edition
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    'date-begin': '',
    'date-end': '',
    adress: '',
    description: '',
    remuneration: '',
    places: 1,
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  // Admin: gestion utilisateurs pour remplacement participants
  const [allUsers, setAllUsers] = useState<Array<{ uid: string; displayName?: string | null; email?: string | null }>>([]);
  const [participantBusy, setParticipantBusy] = useState<string | null>(null); // key: `${jobId}:${userId}`
  const [replaceSelection, setReplaceSelection] = useState<Record<string, string>>({}); // key: `${jobId}:${userId}` -> newUserId
  const navigate = useNavigate();

  useEffect(() => {
    // Aligner isAdmin/adminReady avec le contexte centralisé
    if (authLoading || !rolesReady) return;
    setIsAdmin(!!ctxIsAdmin);
    setAdminReady(true);
  }, [ctxIsAdmin, rolesReady, authLoading]);

  // Charger tous les utilisateurs (admin) pour remplacement participants
  useEffect(() => {
    if (!adminReady || !isAdmin) return;
    (async () => {
      try {
        const db = getFirestoreDb();
        const snap = await getDocs(collection(db, 'users'));
        const list = snap.docs.map(d => {
          const data = d.data() as { displayName?: string | null; email?: string | null };
          return { uid: d.id, displayName: data.displayName ?? null, email: data.email ?? null };
        });
        setAllUsers(list);
      } catch (e) {
        console.warn('Chargement des utilisateurs impossible (admin):', e);
      }
    })();
  }, [adminReady, isAdmin]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const db = getFirestoreDb();
      const jobsCol = collection(db, 'jobs');
      const snap = await getDocs(jobsCol);
      const list: Job[] = [];
      const appCounts: Record<string, number> = {};
      const userApps: Record<string, boolean> = {};
      const userPending: Record<string, boolean> = {};
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

      function toInputLocalString(val: unknown): string {
        if (!val) return '';
        if (typeof val === 'string') {
          // si déjà au format input, garder
          if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val)) return val;
          // tenter conversion générique
          const d = new Date(val);
          if (!Number.isNaN(d.getTime())) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
          }
          return '';
        }
        if (typeof val === 'object' && val !== null && 'seconds' in val) {
          const d = new Date((val as { seconds: number }).seconds * 1000);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const hh = String(d.getHours()).padStart(2, '0');
          const mi = String(d.getMinutes()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
        }
        return '';
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
          dateBeginInput: toInputLocalString(data['date-begin']),
          dateEndInput: toInputLocalString(data['date-end']),
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
          try {
            const pendingSnap = await getDoc(doc(db, 'jobApplications', `${jobId}_${user.uid}`));
            userPending[jobId] = pendingSnap.exists() && (pendingSnap.data()?.status === 'pending');
          } catch {
            userPending[jobId] = false;
          }
        }

        // Participants (admin uniquement)
        if (isAdmin) {
          try {
            const participantsSnap = await getDocs(collection(db, `jobs/${jobId}/applications`));
            const participants: Participant[] = participantsSnap.docs.map(p => {
              const pdata = p.data();
              return { userId: p.id, displayName: pdata.displayName as string | undefined, email: pdata.email as string | undefined };
            });
            participantsMap[jobId] = participants;
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
  setUserPendingApps(userPending);
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

  // Temps réel: écouter les jobs et dépendances
  useEffect(() => {
    if (!adminReady) return;
    const db = getFirestoreDb();
    setLoading(true);

    const unsubs: Array<() => void> = [];
    const jobsUnsub = onSnapshot(query(collection(db, 'jobs')),
      async (jobsSnap) => {
  const list: Job[] = [];
  const appCounts: Record<string, number> = {};

        // utilitaires (du fetchJobs)
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
            const dt = new Date(val);
            const t = dt.getTime();
            return Number.isNaN(t) ? undefined : t;
          }
          if (typeof val === 'object' && val !== null && 'seconds' in val) {
            return (val as { seconds: number }).seconds * 1000;
          }
          return undefined;
        }
        function toInputLocalString(val: unknown): string {
          if (!val) return '';
          if (typeof val === 'string') {
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val)) return val;
            const d = new Date(val);
            if (!Number.isNaN(d.getTime())) {
              const yyyy = d.getFullYear();
              const mm = String(d.getMonth() + 1).padStart(2, '0');
              const dd = String(d.getDate()).padStart(2, '0');
              const hh = String(d.getHours()).padStart(2, '0');
              const mi = String(d.getMinutes()).padStart(2, '0');
              return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
            }
            return '';
          }
          if (typeof val === 'object' && val !== null && 'seconds' in val) {
            const d = new Date((val as { seconds: number }).seconds * 1000);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
          }
          return '';
        }

        // Construire liste de jobs de l'instantané
        for (const d of jobsSnap.docs) {
          const data = d.data() as Partial<Job>;
          const jobId = d.id;
          list.push({
            id: jobId,
            title: data.title ?? '',
            'date-begin': toDateString(data['date-begin']),
            'date-end': toDateString(data['date-end']),
            dateBeginInput: toInputLocalString(data['date-begin']),
            dateEndInput: toInputLocalString(data['date-end']),
            adress: data.adress ?? '',
            description: data.description ?? '',
            remuneration: data.remuneration ?? '',
            places: typeof data.places === 'number' ? data.places : 0,
            dateBeginSort: toEpochMillis(data['date-begin'])
          });

          // Sous-écoutes par job
          const appsUnsub = onSnapshot(collection(db, `jobs/${jobId}/applications`), (appsSnap) => {
            appCounts[jobId] = appsSnap.size;
            setApplications(prev => ({ ...prev, [jobId]: appCounts[jobId] }));
            if (isAdmin) {
              const participants: Participant[] = appsSnap.docs.map(p => {
                const pdata = p.data();
                return { userId: p.id, displayName: pdata.displayName as string | undefined, email: pdata.email as string | undefined };
              });
              setJobParticipants(prev => ({ ...prev, [jobId]: participants }));
            }
          });
          unsubs.push(appsUnsub);

          if (user) {
            const userAppDocUnsub = onSnapshot(doc(db, `jobs/${jobId}/applications/${user.uid}`), (docSnap) => {
              setUserApplications(prev => ({ ...prev, [jobId]: docSnap.exists() }));
            });
            unsubs.push(userAppDocUnsub);
            const pendingDocUnsub = onSnapshot(doc(db, 'jobApplications', `${jobId}_${user.uid}`), (docSnap) => {
              setUserPendingApps(prev => ({ ...prev, [jobId]: docSnap.exists() && (docSnap.data()?.status === 'pending') }));
            });
            unsubs.push(pendingDocUnsub);
          }
        }

        // Tri et set liste
        list.sort((a, b) => {
          const ta = a.dateBeginSort ?? Number.POSITIVE_INFINITY;
          const tb = b.dateBeginSort ?? Number.POSITIVE_INFINITY;
          return ta - tb;
        });
        setJobs(list);
        setLoading(false);
      },
      (err) => {
        console.error('onSnapshot jobs error:', err);
        setLoading(false);
      }
    );
    unsubs.push(jobsUnsub);

    return () => {
      unsubs.forEach(u => {
        try { u(); } catch (e) { console.warn('jobs unsubscribe failed', e); }
      });
    };
  }, [adminReady, isAdmin, user]);

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

  // Pendant la détermination du rôle, on garde la page en chargement
  if (!adminReady) {
    return (
      <div style={{ maxWidth: 400, margin: '2rem auto', padding: '1rem' }} className="max-w-screen-sm w-full mx-auto px-4 sm:px-6">
        <h1>Jobs disponibles</h1>
        <div>Chargement...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 340, margin: '2rem auto', padding: '1rem' }} className="max-w-screen-sm w-full mx-auto px-4 sm:px-6">
      <h1>Jobs disponibles</h1>
      {isAdmin && !showForm && (
        <button
          style={{ marginBottom: 24, background: '#646cff', color: 'white', border: 'none', borderRadius: 8, padding: '0.7rem 1.5rem', fontSize: '1rem', cursor: 'pointer' }}
          onClick={() => setShowForm(true)}
        >
          Ajouter un job
        </button>
      )}
      {isAdmin && (
        <button
          style={{ marginLeft: 12, marginBottom: 24, background: '#888', color: 'white', border: 'none', borderRadius: 8, padding: '0.7rem 1.2rem', fontSize: '0.95rem', cursor: 'pointer' }}
          onClick={() => navigate('/history')}
        >
          Historique
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
              // Empêcher même date/heure en début et fin
              if (form['date-begin'] === form['date-end']) {
                setFormError('La date/heure de fin doit être différente de la date/heure de début.');
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
            display: 'flex', flexDirection: 'column', gap: '1rem', margin: '0 auto 24px', background: '#f9f9ff', border: '1px solid #ccc', borderRadius: 10, padding: '1.5rem', boxShadow: '0 2px 8px rgba(100,108,255,0.07)', width: 'fit-content', maxWidth: '90vw', alignItems: 'center'
          }}
        >
          <input style={{ width: 320 }} type="text" placeholder="Titre" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
          <input style={{ width: 320 }} type="datetime-local" placeholder="Début" value={form['date-begin']} onChange={e => setForm(f => ({ ...f, ['date-begin']: e.target.value }))} required />
          <input style={{ width: 320 }} type="datetime-local" placeholder="Fin" value={form['date-end']} onChange={e => setForm(f => ({ ...f, ['date-end']: e.target.value }))} required />
          <input style={{ width: 320 }} type="text" placeholder="Adresse" value={form.adress} onChange={e => setForm(f => ({ ...f, adress: e.target.value }))} required />
          <textarea style={{ width: 320 }} placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
          <input style={{ width: 320 }} type="text" placeholder="Rémunération (ex: 8€/h ou 300€)" value={form.remuneration} onChange={e => setForm(f => ({ ...f, remuneration: e.target.value }))} required />
          <input style={{ width: 320 }} type="number" min={1} placeholder="Places (nombre de pionniers nécessaires)" value={form.places} onChange={e => setForm(f => ({ ...f, places: Number(e.target.value) }))} required />
          {formError && <div style={{ color: 'red' }}>{formError}</div>}
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit" disabled={formLoading} style={{ background: '#646cff', color: 'white', border: 'none', borderRadius: 8, padding: '0.7rem 1.5rem', fontSize: '1rem', cursor: 'pointer' }}>Valider</button>
            <button type="button" disabled={formLoading} style={{ background: '#ccc', color: '#222', border: 'none', borderRadius: 8, padding: '0.7rem 1.5rem', fontSize: '1rem', cursor: 'pointer' }} onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </form>
      )}
  {fetchError && <div style={{ color: 'red', marginBottom: 16 }}>{fetchError}</div>}
  {loading ? <div>Chargement...</div> : (() => {
        const now = Date.now();
  const upcoming = jobs.filter(j => (j.dateBeginSort ?? Number.POSITIVE_INFINITY) >= now);
        if (upcoming.length === 0 && !isAdmin) return <div>Aucun job disponible.</div>;
        return (
        <>
  <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              alignItems: 'center',
              width: '100%'
            }}
          >
          {upcoming.map(job => {
            // Participants (admin)
            const participants = isAdmin ? (jobParticipants[job.id] || []) : [];
            const nbApplications = applications[job.id] || 0;
            const placesRestantes = Math.max(0, job.places - nbApplications);
            const dejaPostule = userApplications[job.id];
            const pending = userPendingApps[job.id];
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
            transition: 'background .4s, border-color .4s',
            width: '100%',
            minHeight: 220,
            display: 'flex',
            flexDirection: 'column'
                    }}
                  >
                {isAdmin && (
                  <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8 }}>
                    <button
                      title="Modifier"
                      aria-label="Modifier"
                      onClick={() => {
                        setEditingId(job.id);
                        setEditForm({
                          title: job.title,
                          'date-begin': job.dateBeginInput || '',
                          'date-end': job.dateEndInput || '',
                          adress: job.adress,
                          description: job.description,
                          remuneration: job.remuneration,
                          places: job.places,
                        });
                        setEditError(null);
                        setEditOpen(true);
                      }}
                      style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 6, cursor: 'pointer' }}
                    >
                      {/* Pencil icon */}
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                    </button>
                    <button
                      title="Supprimer"
                      aria-label="Supprimer"
                      onClick={async () => {
                        if (deleteLoadingId) return;
                        const ok = window.confirm('Supprimer définitivement ce job ?');
                        if (!ok) return;
                        try {
                          setDeleteLoadingId(job.id);
                          const db = getFirestoreDb();
                          await deleteDoc(doc(db, 'jobs', job.id));
                          await fetchJobs();
                        } catch (e) {
                          alert('Suppression impossible.');
                          console.error(e);
                        } finally {
                          setDeleteLoadingId(null);
                        }
                      }}
                      style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 6, cursor: 'pointer' }}
                    >
                      {/* Trash icon */}
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                )}
                <h2 style={{ margin: 0, color: '#222', fontWeight: 700 }}>{job.title && job.title.trim() ? job.title : 'Sans titre'}</h2>
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
                <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 600, color: '#222' }}>Places restantes :</span> {placesRestantes}/{job.places}</div>
                    {!user && (
                      <div style={{ color: '#888', fontWeight: 500, marginTop: 8, fontStyle: 'italic' }}>
                        Connectez-vous pour postuler à ce job
                      </div>
                    )}
                {user && !isAdmin && !dejaPostule && !pending && placesRestantes > 0 && (
                  <button
                    style={{ background: '#646cff', color: 'white', border: 'none', borderRadius: 8, padding: '0.7rem 1.5rem', fontSize: '1rem', cursor: 'pointer', marginTop: 'auto' }}
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
                        const appDocId = `${job.id}_${user.uid}`;
                        const { setDoc } = await import('firebase/firestore');
                        await setDoc(doc(db, 'jobApplications', appDocId), {
                          jobId: job.id,
                          jobTitle: job.title,
                          userId: user.uid,
                          email: user.email,
                          displayName,
                          appliedAt: serverTimestamp(),
                          status: 'pending'
                        }, { merge: false });
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
                        // Rester en attente jusqu'à validation admin
                        setUserPendingApps(a => ({ ...a, [job.id]: true }));
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
                  <div style={{ color: '#2e7d32', fontWeight: 700, marginTop: 8 }}>Candidature acceptée</div>
                )}
                {user && !dejaPostule && pending && (
                  <div style={{ color: '#ff8f00', fontWeight: 600, marginTop: 8 }}>Votre demande est en attente</div>
                )}
                {placesRestantes === 0 && (
                  <div style={{ color: '#c62828', fontWeight: 600, marginTop: 8 }}>Complet</div>
                )}
        {isAdmin && participants.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #eee', color: '#222', fontWeight: 500, fontSize: '.95rem' }}>
          <span style={{ color: '#646cff', fontWeight: 700 }}>Participants :</span> {participants.map(p => p.displayName || p.email || p.userId).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
  {/* Historique déplacé sur page dédiée */}
        </>
        );
      })()}
      {isAdmin && editOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setEditOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!editingId) return;
              setEditError(null);
              setEditLoading(true);
              try {
                if (!editForm.title.trim() || !editForm['date-begin'].trim() || !editForm['date-end'].trim() || !editForm.adress.trim() || !editForm.description.trim() || !editForm.remuneration.trim() || !editForm.places) {
                  setEditError('Tous les champs sont obligatoires.');
                  setEditLoading(false);
                  return;
                }
                if (editForm['date-begin'] === editForm['date-end']) {
                  setEditError('La date/heure de fin doit être différente de la date/heure de début.');
                  setEditLoading(false);
                  return;
                }
                const db = getFirestoreDb();
                await updateDoc(doc(db, 'jobs', editingId), {
                  title: editForm.title,
                  'date-begin': editForm['date-begin'],
                  'date-end': editForm['date-end'],
                  adress: editForm.adress,
                  description: editForm.description,
                  remuneration: editForm.remuneration,
                  places: Number(editForm.places),
                });
                setEditOpen(false);
                setEditingId(null);
                await fetchJobs();
              } catch (err) {
                setEditError('Mise à jour impossible.');
                console.error(err);
              } finally {
                setEditLoading(false);
              }
            }}
            style={{ background: '#fff', color: '#222', borderRadius: 12, padding: '1rem 1.25rem', width: 'min(340px, 92vw)', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Modifier le job</h2>
              <button type="button" onClick={() => setEditOpen(false)} style={{ background: '#f0f0f0', color: '#222', border: '1px solid #ddd', borderRadius: 8, padding: '0.25rem 0.55rem', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Titre</span>
                <input type="text" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} required style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid #ddd' }} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Début</span>
                <input type="datetime-local" value={editForm['date-begin']} onChange={e => setEditForm(f => ({ ...f, ['date-begin']: e.target.value }))} required style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid #ddd' }} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Fin</span>
                <input type="datetime-local" value={editForm['date-end']} onChange={e => setEditForm(f => ({ ...f, ['date-end']: e.target.value }))} required style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid #ddd' }} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Adresse</span>
                <input type="text" value={editForm.adress} onChange={e => setEditForm(f => ({ ...f, adress: e.target.value }))} required style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid #ddd' }} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Description</span>
                <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} required style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid #ddd' }} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Rémunération</span>
                <input type="text" value={editForm.remuneration} onChange={e => setEditForm(f => ({ ...f, remuneration: e.target.value }))} required style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid #ddd' }} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Places</span>
                <input type="number" min={1} value={editForm.places} onChange={e => setEditForm(f => ({ ...f, places: Number(e.target.value) }))} required style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid #ddd' }} />
              </label>

              {/* Bouton pour gestion des participants dans une modale dédiée */}
              {isAdmin && editingId && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" onClick={() => setParticipantsOpen(true)}
                    style={{ background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 8, padding: '0.45rem 0.9rem', cursor: 'pointer' }}>
                    Participants...
                  </button>
                </div>
              )}
            </div>
            {editError && <div style={{ color: 'red', marginTop: 8 }}>{editError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button type="button" onClick={() => setEditOpen(false)} style={{ background: '#eee', color: '#222', border: '1px solid #ddd', borderRadius: 8, padding: '0.45rem 0.9rem', cursor: 'pointer' }}>Annuler</button>
              <button type="submit" disabled={editLoading} style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 0.9rem', cursor: 'pointer', fontWeight: 600 }}>Enregistrer</button>
            </div>
          </form>
        </div>
      )}
      {isAdmin && participantsOpen && editingId && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setParticipantsOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', color: '#222', borderRadius: 12, padding: '0.8rem 0.9rem', width: 'min(340px, 92vw)', height: 420, boxShadow: '0 10px 30px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Participants</h2>
              <button type="button" onClick={() => setParticipantsOpen(false)} style={{ background: '#f0f0f0', color: '#222', border: '1px solid #ddd', borderRadius: 8, padding: '0.25rem 0.55rem', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, color: '#222' }}>Participants acceptés</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', paddingRight: 2 }}>
                {(jobParticipants[editingId] || []).map((p) => {
                  const key = `${editingId}:${p.userId}`;
                  const existingIds = new Set((jobParticipants[editingId] || []).map(pp => pp.userId));
                  const options = allUsers
                    .filter(u => !existingIds.has(u.uid) || u.uid === p.userId)
                    .map(u => ({ value: u.uid, label: (u.displayName || u.email || u.uid) as string }));
                  return (
                    <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, alignItems: 'stretch' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{p.displayName || p.email || p.userId}</div>
                        <div style={{ color: '#555', fontSize: '.9rem' }}>{p.email}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          title="Retirer"
                          aria-label="Retirer le participant"
                          onClick={async () => {
                            if (participantBusy) return;
                            const ok = window.confirm('Retirer ce participant du job ?');
                            if (!ok) return;
                            try {
                              setParticipantBusy(key);
                              const db = getFirestoreDb();
                              await deleteDoc(doc(db, `jobs/${editingId}/applications/${p.userId}`));
                            } catch (e) {
                              alert('Suppression impossible.');
                              console.error(e);
                            } finally {
                              setParticipantBusy(null);
                            }
                          }}
                          style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                        <div style={{ flex: '1 1 220px', minWidth: 180 }}>
                          <ComboSearch
                            value={replaceSelection[key] || ''}
                            onChange={(v) => setReplaceSelection(prev => ({ ...prev, [key]: v }))}
                            options={options}
                            placeholder="Remplacer par…"
                            maxItems={5}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            const newUid = replaceSelection[key];
                            if (!newUid) { alert('Choisissez un utilisateur.'); return; }
                            if (participantBusy) return;
                            try {
                              setParticipantBusy(key);
                              const db = getFirestoreDb();
                              if (newUid === p.userId) return;
                              const newDocSnap = await getDoc(doc(db, `jobs/${editingId}/applications/${newUid}`));
                              if (newDocSnap.exists()) { alert('Cet utilisateur est déjà participant.'); return; }
                              const userSnap = await getDoc(doc(db, 'users', newUid));
                              const udata = userSnap.data() as { displayName?: string | null; email?: string | null } | undefined;
                              const displayName = (udata?.displayName ?? null) || null;
                              const email = (udata?.email ?? null) || null;
                              await deleteDoc(doc(db, `jobs/${editingId}/applications/${p.userId}`));
                              await setDoc(doc(db, `jobs/${editingId}/applications/${newUid}`), {
                                displayName: displayName || undefined,
                                email: email || undefined,
                                replacedAt: serverTimestamp(),
                              });
                              setReplaceSelection(prev => ({ ...prev, [key]: '' }));
                            } catch (e) {
                              alert('Remplacement impossible.');
                              console.error(e);
                            } finally {
                              setParticipantBusy(null);
                            }
                          }}
                          style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 0.7rem', cursor: 'pointer' }}
                        >
                          Appliquer
                        </button>
                      </div>
                    </div>
                  );
                })}
                {(jobParticipants[editingId] || []).length === 0 && (
                  <div style={{ color: '#666' }}>Aucun participant pour l'instant.</div>
                )}
              </div>
              <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px dashed #eee' }}>
                <div style={{ fontWeight: 700, color: '#222', marginBottom: 8 }}>Ajouter un participant</div>
                {(() => {
                  if (!editingId) return null;
                  const existingIds = new Set((jobParticipants[editingId] || []).map(pp => pp.userId));
                  const options = allUsers
                    .filter(u => !existingIds.has(u.uid))
                    .map(u => ({ value: u.uid, label: (u.displayName || u.email || u.uid) as string }));
                  return (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 240px', minWidth: 180 }}>
                        <ComboSearch
                          value={replaceSelection[`${editingId}:__new__`] || ''}
                          onChange={(v) => setReplaceSelection(prev => ({ ...prev, [`${editingId}:__new__`]: v }))}
                          options={options}
                          placeholder="Choisir un utilisateur…"
                          maxItems={5}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!editingId) return;
                          const newUid = replaceSelection[`${editingId}:__new__`];
                          if (!newUid) { alert('Choisissez un utilisateur.'); return; }
                          if (participantBusy) return;
                          try {
                            setParticipantBusy(`${editingId}:__new__`);
                            const db = getFirestoreDb();
                            const existSnap = await getDoc(doc(db, `jobs/${editingId}/applications/${newUid}`));
                            if (existSnap.exists()) { alert('Cet utilisateur est déjà participant.'); return; }
                            const userSnap = await getDoc(doc(db, 'users', newUid));
                            const udata = userSnap.data() as { displayName?: string | null; email?: string | null } | undefined;
                            await setDoc(doc(db, `jobs/${editingId}/applications/${newUid}`), {
                              displayName: udata?.displayName || undefined,
                              email: udata?.email || undefined,
                              addedAt: serverTimestamp(),
                            });
                            setReplaceSelection(prev => ({ ...prev, [`${editingId}:__new__`]: '' }));
                          } catch (e) {
                            alert('Ajout impossible.');
                            console.error(e);
                          } finally {
                            setParticipantBusy(null);
                          }
                        }}
                        style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 0.9rem', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Ajouter
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobsPage;

// Edit Modal component inline for simplicity
// Rendered conditionally at the bottom of JobsPage JSX
