import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, getDoc, updateDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirestoreDb } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { createPortal } from 'react-dom';

interface Job { id: string; title: string; 'date-begin': string; 'date-end': string; adress: string; description: string; remuneration: string; places: number; dateBeginSort?: number; dateEndSort?: number; dateBeginInput?: string; dateEndInput?: string }
interface Participant { userId: string; displayName?: string; email?: string }
interface JobParticipants { [jobId: string]: Participant[]; }

// ComboSearch (identique à JobsPage): menu en portal, champ de recherche intégré
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
      setMenuPos({ left: Math.round(rect.left), top: Math.round(openUp ? rect.top - Math.min(desiredMax, maxHeight) : rect.bottom), width: Math.round(rect.width), maxHeight, openUp });
    }, []);
    useEffect(() => {
      const onDocClick = (e: MouseEvent) => {
        const t = e.target as Node;
        if (wrapRef.current && wrapRef.current.contains(t)) return;
        if (menuRef.current && menuRef.current.contains(t)) return;
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
    useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);
    return (
      <div ref={wrapRef} style={{ position: 'relative', width: '100%', minWidth: 0 }}>
        <button ref={buttonRef} type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
          style={{ width: '100%', textAlign: 'left', background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 8, padding: '0.45rem 0.6rem', cursor: disabled ? 'not-allowed' : 'pointer' }}>
          {selected ? selected.label : <span style={{ color: '#9ca3af' }}>{placeholder}</span>}
        </button>
        {open && createPortal(
          <div ref={menuRef} role="listbox" style={{ position: 'fixed', zIndex: 100000, top: menuPos.top, left: menuPos.left, width: menuPos.width, background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 8, boxShadow: '0 10px 26px rgba(0,0,0,0.45)', padding: 8 }}>
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
          </div>, document.body)}
      </div>
    );
  };

const HistoryPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [participants, setParticipants] = useState<Record<string, string[]>>({});
  const [jobParticipants, setJobParticipants] = useState<JobParticipants>({});
  const [allUsers, setAllUsers] = useState<Array<{ uid: string; displayName?: string | null; email?: string | null }>>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', 'date-begin': '', 'date-end': '', adress: '', description: '', remuneration: '', places: 1 });
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [replaceSelection, setReplaceSelection] = useState<Record<string, string>>({});
  const [participantBusy, setParticipantBusy] = useState<string | null>(null);
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
        function toInputLocalString(val: unknown): string {
          if (!val) return '';
          if (typeof val === 'string') {
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val)) return val;
            const d = new Date(val);
            if (!Number.isNaN(d.getTime())) {
              const yyyy = d.getFullYear(); const mm = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0'); const hh = String(d.getHours()).padStart(2, '0'); const mi = String(d.getMinutes()).padStart(2, '0');
              return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
            }
            return '';
          }
          if (typeof val === 'object' && val !== null && 'seconds' in val) {
            const d = new Date((val as { seconds: number }).seconds * 1000);
            const yyyy = d.getFullYear(); const mm = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0'); const hh = String(d.getHours()).padStart(2, '0'); const mi = String(d.getMinutes()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
          }
          return '';
        }
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
            dateBeginInput: toInputLocalString(data['date-begin']),
            dateEndInput: toInputLocalString(data['date-end']),
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
        const partsMap: JobParticipants = {};
        for (const j of past) {
          try {
            const sub = await getDocs(collection(db, `jobs/${j.id}/applications`));
            parts[j.id] = sub.docs.map(p => {
              const pd = p.data();
              return (pd.displayName as string) || (pd.email as string) || p.id;
            });
            partsMap[j.id] = sub.docs.map(p => {
              const pd = p.data();
              return { userId: p.id, displayName: pd.displayName as string | undefined, email: pd.email as string | undefined };
            });
          } catch {
            parts[j.id] = [];
            partsMap[j.id] = [];
          }
        }
        if (!cancelled) { setParticipants(parts); setJobParticipants(partsMap); }
        if (!cancelled) setLoading(false);
  } catch {
        if (!cancelled) { setError('Erreur lors du chargement de l\'historique'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Charger la liste des utilisateurs (admin)
  useEffect(() => {
    (async () => {
      if (!isAdmin) return;
      try {
        const db = getFirestoreDb();
        const u = await getDocs(collection(db, 'users'));
        setAllUsers(u.docs.map(d => {
          const data = d.data() as { displayName?: string | null; email?: string | null };
          return { uid: d.id, displayName: data.displayName ?? null, email: data.email ?? null };
        }));
      } catch (e) {
        console.warn('Chargement users (history) impossible:', e);
      }
    })();
  }, [isAdmin]);

  if (!user) return <div style={{ padding: 24 }}>Accès interdit</div>;
  if (!isAdmin) return <div style={{ padding: 24 }}>Accès réservé aux admins</div>;
  if (loading) return <div style={{ padding: 24 }}>Chargement…</div>;
  if (error) return <div style={{ padding: 24 }}>{error}</div>;

  return (
    <div style={{ maxWidth: 340, margin: '2rem auto', padding: '1rem', position: 'relative' }} className="max-w-screen-sm w-full mx-auto px-4 sm:px-6">
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
      <h1>Historique des jobs</h1>
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
            className="animate-fade-in"
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xl)',
              padding: '1.75rem',
              background: 'var(--color-surface)',
              boxShadow: 'var(--shadow-md)',
              color: 'var(--color-text)',
              position: 'relative',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 220
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
              e.currentTarget.style.transform = 'translateY(-4px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
              e.currentTarget.style.transform = 'translateY(0)';
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
                  style={{ background: 'var(--color-surface)', border: '2px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '0.5rem', cursor: 'pointer', transition: 'all 0.3s ease' }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                </button>
              </div>
            )}
            <h2 style={{ margin: '0 0 0.75rem 0', color: 'var(--color-text)', fontWeight: 700, fontSize: '1.5rem', textAlign: 'center' }}>{job.title || 'Sans titre'}</h2>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              marginBottom: '1rem',
              padding: '0.75rem',
              background: 'var(--color-accent-bg)',
              borderRadius: 'var(--radius-lg)',
              justifyContent: 'center'
            }}>
              <span style={{ fontSize: '1.25rem' }}>🕐</span>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                {job['date-begin']} — {job['date-end']}
              </div>
            </div>
            <div style={{ 
              marginBottom: '0.75rem', 
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem'
            }}>
              <span style={{ fontSize: '1.1rem' }}>📍</span>
              <div><span style={{ fontWeight: 600, color: 'var(--color-text)' }}>Adresse :</span> <span style={{ color: 'var(--color-text-light)' }}>{job.adress}</span></div>
            </div>
            <div style={{ 
              marginBottom: '0.75rem', 
              fontSize: '0.95rem',
              lineHeight: '1.5',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem'
            }}>
              <span style={{ fontSize: '1.1rem' }}>📝</span>
              <div><span style={{ fontWeight: 600, color: 'var(--color-text)' }}>Description :</span> <span style={{ color: 'var(--color-text-light)' }}>{job.description}</span></div>
            </div>
            <div style={{ 
              marginBottom: '0.75rem', 
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem'
            }}>
              <span style={{ fontSize: '1.1rem' }}>💰</span>
              <div><span style={{ fontWeight: 600, color: 'var(--color-text)' }}>Rémunération :</span> <span style={{ color: 'var(--color-text-light)' }}>{job.remuneration}</span></div>
            </div>
            <div style={{ 
              marginBottom: '1rem', 
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem'
            }}>
              <span style={{ fontSize: '1.1rem' }}>👥</span>
              <div><span style={{ fontWeight: 600, color: 'var(--color-text)' }}>Places :</span> <span style={{ color: 'var(--color-text-light)' }}>{job.places}</span></div>
            </div>
            <div style={{ 
              marginTop: 'auto', 
              paddingTop: '1rem', 
              borderTop: '2px solid var(--color-border)', 
              fontSize: '0.95rem',
              fontWeight: 500
            }}>
              <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>✅ Participants :</span> <span style={{ color: 'var(--color-text-light)' }}>{participants[job.id]?.length ? participants[job.id].join(', ') : 'Aucun'}</span>
            </div>
          </div>
        ))}
      </div>
      {isAdmin && editOpen && editingId && (
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
                // MAJ locale basique pour affichage
                const toDisplay = (val: string) => {
                  const d = new Date(val);
                  if (Number.isNaN(d.getTime())) return val;
                  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                };
                setJobs(prev => prev.map(j => j.id !== editingId ? j : ({
                  ...j,
                  title: editForm.title,
                  'date-begin': toDisplay(editForm['date-begin']),
                  'date-end': toDisplay(editForm['date-end']),
                  dateBeginInput: editForm['date-begin'],
                  dateEndInput: editForm['date-end'],
                  adress: editForm.adress,
                  description: editForm.description,
                  remuneration: editForm.remuneration,
                  places: Number(editForm.places),
                })));
                setEditOpen(false);
                setEditingId(null);
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
                              // mise à jour locale
                              setJobParticipants(prev => ({ ...prev, [editingId]: (prev[editingId] || []).filter(pp => pp.userId !== p.userId) }));
                              setParticipants(prev => ({ ...prev, [editingId]: (prev[editingId] || []).filter(name => name !== (p.displayName || p.email || p.userId)) }));
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
                              // MAJ locale
                              setJobParticipants(prev => ({
                                ...prev,
                                [editingId]: (prev[editingId] || []).filter(pp => pp.userId !== p.userId).concat([{ userId: newUid, displayName: displayName || undefined, email: email || undefined }])
                              }));
                              setParticipants(prev => ({
                                ...prev,
                                [editingId]: (prev[editingId] || []).filter(name => name !== (p.displayName || p.email || p.userId)).concat([(displayName || email || newUid) as string])
                              }));
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
                            // MAJ locale
                            setJobParticipants(prev => ({ ...prev, [editingId]: [...(prev[editingId] || []), { userId: newUid, displayName: (udata?.displayName || undefined), email: (udata?.email || undefined) }] }));
                            setParticipants(prev => ({ ...prev, [editingId]: [ ...(prev[editingId] || []), (udata?.displayName || udata?.email || newUid) as string ] }));
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

export default HistoryPage;

// Edit & Participants Modals
// Inject modals directly below component (same file for simplicity)