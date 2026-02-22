import React, { Suspense, useEffect, useMemo, useState } from 'react';
import type { EventInput } from '@fullcalendar/core';
const CalendarView = React.lazy(() => import('../components/CalendarView'));
import type { EventClickArg } from '@fullcalendar/core';
// Styles FullCalendar (v6) — importer uniquement les plugins utilisés
// Note: Les CSS des plugins ne sont pas importées ici pour compatibilité Vite; le calendrier fonctionne sans.
import { collection, addDoc, onSnapshot, doc, getDoc, Timestamp, deleteDoc, updateDoc } from 'firebase/firestore';
import { getFirestoreDb } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

type FirestoreDateLike = Timestamp | { seconds: number } | string | number | Date | null | undefined;

type Job = {
  id: string;
  title: string;
  'date-begin': FirestoreDateLike;
  'date-end': FirestoreDateLike;
};

type Meeting = {
  id: string;
  title: string;
  start: Date;
  end?: Date;
};

type Weekend = {
  id: string;
  start: Date;
  end: Date; // exclusif (all-day)
  title?: string;
  location?: string;
};

const CalendarPage: React.FC = () => {
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const [isAdmin, setIsAdmin] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [weekends, setWeekends] = useState<Weekend[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{
    id: string;
    title: string;
    start?: Date | null;
    end?: Date | null;
  type: 'job' | 'meeting' | 'weekend';
  location?: string | null;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<{ title: string; date: string; start: string; end: string }>({
    title: '',
    date: '',
    start: '',
    end: '',
  });
  const [addWeekendOpen, setAddWeekendOpen] = useState(false);
  const [weekendForm, setWeekendForm] = useState<{ title: string; location: string; startDate: string; startTime: string; endDate: string; endTime: string }>(
    { title: 'Week-end', location: '', startDate: '', startTime: '00:00', endDate: '', endTime: '23:59' }
  );

  // États pour édition
  const [editMeetingOpen, setEditMeetingOpen] = useState(false);
  const [editMeetingForm, setEditMeetingForm] = useState<{ title: string; date: string; start: string; end: string }>({ title: '', date: '', start: '', end: '' });
  const [editWeekendOpen, setEditWeekendOpen] = useState(false);
  const [editWeekendForm, setEditWeekendForm] = useState<{ title: string; location: string; startDate: string; startTime: string; endDate: string; endTime: string }>({ title: 'Week-end', location: '', startDate: '', startTime: '00:00', endDate: '', endTime: '23:59' });
  const [dateSelectionModal, setDateSelectionModal] = useState<{ show: boolean; date: Date | null }>({ show: false, date: null });

  useEffect(() => {
    let cancelled = false;
    const db = getFirestoreDb();
    setLoading(true);

    (async () => {
      // 1) Déterminer admin (non bloquant)
      try {
        if (user) {
          const me = await getDoc(doc(db, 'users', user.uid));
      const data = (me.data() as { isAdmin?: boolean } | undefined) || undefined;
      const admin = me.exists() && data?.isAdmin === true;
          if (!cancelled) setIsAdmin(!!admin);
        } else {
          if (!cancelled) setIsAdmin(false);
        }
      } catch (e) {
        console.warn('Calendrier: impossible de déterminer le rôle admin', e);
        if (!cancelled) setIsAdmin(false);
      }
    })();

    // 2) Écouter jobs, meetings, weekends en temps réel
    let jobsReady = false, meetingsReady = false, weekendsReady = false;

    const unsubJobs = onSnapshot(
      collection(db, 'jobs'),
      (snap) => {
        if (cancelled) return;
        const jlist: Job[] = snap.docs.map(d => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            title: (data.title as string) ?? '',
            'date-begin': data['date-begin'] as FirestoreDateLike,
            'date-end': data['date-end'] as FirestoreDateLike,
          };
        });
        setJobs(jlist);
        jobsReady = true;
  if (jobsReady && meetingsReady && weekendsReady) setLoading(false);
      },
      (err) => console.warn('Calendrier: échec écoute jobs', err)
    );

    const unsubMeetings = onSnapshot(
      collection(db, 'meetings'),
      (snap) => {
        if (cancelled) return;
        const mlist: Meeting[] = snap.docs.map(d => {
          const data = d.data() as { title?: string; start: Timestamp | string | number | Date; end?: Timestamp | string | number | Date };
          const start = data.start instanceof Timestamp ? data.start.toDate() : new Date(data.start);
          const end = data.end ? (data.end instanceof Timestamp ? data.end.toDate() : new Date(data.end)) : undefined;
          return { id: d.id, title: data.title || 'Réunion', start, end };
        });
        setMeetings(mlist);
        meetingsReady = true;
  if (jobsReady && meetingsReady && weekendsReady) setLoading(false);
      },
      (err) => console.warn('Calendrier: échec écoute réunions', err)
    );

    const unsubWeekends = onSnapshot(
      collection(db, 'weekends'),
      (snap) => {
        if (cancelled) return;
        const wlist: Weekend[] = snap.docs.map(d => {
          const data = d.data() as { title?: string; location?: string; start: Timestamp | string | number | Date; end: Timestamp | string | number | Date };
          const start = data.start instanceof Timestamp ? data.start.toDate() : new Date(data.start);
          const end = data.end instanceof Timestamp ? data.end.toDate() : new Date(data.end);
          return { id: d.id, start, end, title: data.title, location: data.location };
        });
        setWeekends(wlist);
        weekendsReady = true;
  if (jobsReady && meetingsReady && weekendsReady) setLoading(false);
      },
      (err) => console.warn('Calendrier: échec écoute weekends', err)
    );

    return () => {
      cancelled = true;
      unsubJobs();
      unsubMeetings();
      unsubWeekends();
    };
  }, [user]);

  const events = useMemo(() => {
    function toDate(val: FirestoreDateLike): Date | undefined {
      if (!val) return undefined;
      if (val instanceof Timestamp) return val.toDate();
      if (typeof val === 'object' && 'seconds' in val) return new Date(val.seconds * 1000);
      if (typeof val === 'string' || typeof val === 'number') return new Date(val);
      return undefined;
    }
    const toDateOnlyString = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const isMidnight = (d: Date): boolean => d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
    const endExclusiveDateOnly = (d: Date): string => {
      // Prend la date calendrier locale de d, et si une heure est présente, ajoute +1 jour pour rendre l'événement inclusif
      const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (!isMidnight(d)) {
        base.setDate(base.getDate() + 1);
      }
      return toDateOnlyString(base);
    };
    const jobEvents = jobs
      .map(j => ({
        id: `job_${j.id}`,
        title: j.title || 'Job',
        start: toDate(j['date-begin']),
    end: toDate(j['date-end']),
    extendedProps: { kind: 'job' as const }
      }))
      .filter(evt => !!evt.start);
  const meetingEvents = meetings.map(m => ({ id: `meeting_${m.id}`, title: m.title || 'Réunion', start: m.start, end: m.end, extendedProps: { kind: 'meeting' as const } }));
  // Utiliser des chaînes date-only pour éviter les décalages liés au fuseau.
  // Pour l'end, appliquer exclusivité: si une heure est présente (ex: dim 17h), passer à minuit du lendemain pour inclure le jour final.
  const weekendEvents = weekends.map(w => ({
    id: `weekend_${w.id}`,
    title: w.title || 'Week-end',
    start: toDateOnlyString(w.start),
    end: endExclusiveDateOnly(w.end),
    allDay: true,
    // Conserver les dates/heures réelles pour l'affichage dans la modale
    extendedProps: { kind: 'weekend' as const, location: w.location || '', preciseStart: w.start, preciseEnd: w.end }
  }));
    return [...jobEvents, ...meetingEvents, ...weekendEvents];
  }, [jobs, meetings, weekends]);

  const openAddModal = (selectedDate?: Date) => {
    const now = selectedDate || new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    setForm({ title: '', date: `${yyyy}-${mm}-${dd}`, start: '09:00', end: '10:00' });
    setAddOpen(true);
  };

  const openAddWeekendModal = (selectedDate?: Date) => {
    const now = selectedDate || new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
  setWeekendForm({ title: 'Week-end', location: '', startDate: `${yyyy}-${mm}-${dd}`, startTime: '09:00', endDate: `${yyyy}-${mm}-${dd}`, endTime: '18:00' });
    setAddWeekendOpen(true);
  };

  const submitAddMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const title = form.title.trim();
    if (!title) { alert('Titre requis'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) { alert('Date invalide'); return; }
    if (!/^([01]?\d|2[0-3]):([0-5]\d)$/.test(form.start) || !/^([01]?\d|2[0-3]):([0-5]\d)$/.test(form.end)) {
      alert('Heures invalides (HH:MM)');
      return;
    }
    const [sh, sm] = form.start.split(':').map(Number);
    const [eh, em] = form.end.split(':').map(Number);
    const [y, m, d] = form.date.split('-').map(Number);
    const start = new Date(y, (m - 1), d, sh, sm, 0, 0);
    const end = new Date(y, (m - 1), d, eh, em, 0, 0);
    if (end <= start) { alert('Fin doit être après le début'); return; }

    try {
      const db = getFirestoreDb();
      const ref = await addDoc(collection(db, 'meetings'), {
        title,
        start: Timestamp.fromDate(start),
        end: Timestamp.fromDate(end),
        createdBy: user?.uid || null,
        createdAt: Timestamp.now(),
      });
      setMeetings(prev => [...prev, { id: ref.id, title, start, end }]);
      setAddOpen(false);
    } catch  {
      alert("Impossible d'ajouter la réunion");
    }
  };

  const submitAddWeekend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekendForm.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(weekendForm.endDate)) {
      alert('Dates invalides');
      return;
    }
    if (!/^([01]?\d|2[0-3]):([0-5]\d)$/.test(weekendForm.startTime) || !/^([01]?\d|2[0-3]):([0-5]\d)$/.test(weekendForm.endTime)) {
      alert('Heures invalides (HH:MM)');
      return;
    }
    const [ys, ms, ds] = weekendForm.startDate.split('-').map(Number);
    const [ye, me, de] = weekendForm.endDate.split('-').map(Number);
    const [sh, sm] = weekendForm.startTime.split(':').map(Number);
    const [eh, em] = weekendForm.endTime.split(':').map(Number);
    const start = new Date(ys, ms - 1, ds, sh, sm, 0, 0);
    const end = new Date(ye, me - 1, de, eh, em, 0, 0);
    if (end <= start) { alert('La fin doit être après le début'); return; }
    try {
      const db = getFirestoreDb();
      const ref = await addDoc(collection(db, 'weekends'), {
        title: (weekendForm.title || 'Week-end').trim() || 'Week-end',
        location: (weekendForm.location || '').trim(),
        start: Timestamp.fromDate(start),
        end: Timestamp.fromDate(end),
        createdBy: user?.uid || null,
        createdAt: Timestamp.now(),
      });
      setWeekends(prev => [...prev, { id: ref.id, start, end, title: (weekendForm.title || 'Week-end').trim() || 'Week-end', location: (weekendForm.location || '').trim() }]);
      setAddWeekendOpen(false);
    } catch {
      alert("Impossible d'ajouter le week-end");
    }
  };

  // Ouvrir édition réunion
  const openEditMeeting = () => {
    if (!selected || selected.type !== 'meeting' || !selected.start) return;
    const s = selected.start;
    const e = selected.end || new Date(s.getTime() + 60 * 60 * 1000);
    const y = s.getFullYear();
    const m = String(s.getMonth() + 1).padStart(2, '0');
    const d = String(s.getDate()).padStart(2, '0');
    const sh = String(s.getHours()).padStart(2, '0');
    const sm = String(s.getMinutes()).padStart(2, '0');
    const eh = String(e.getHours()).padStart(2, '0');
    const em = String(e.getMinutes()).padStart(2, '0');
    setEditMeetingForm({ title: selected.title || 'Réunion', date: `${y}-${m}-${d}`, start: `${sh}:${sm}`, end: `${eh}:${em}` });
    setEditMeetingOpen(true);
  };

  const submitEditMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !selected || selected.type !== 'meeting') return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editMeetingForm.date)) { alert('Date invalide'); return; }
    if (!/^([01]?\d|2[0-3]):([0-5]\d)$/.test(editMeetingForm.start) || !/^([01]?\d|2[0-3]):([0-5]\d)$/.test(editMeetingForm.end)) { alert('Heures invalides (HH:MM)'); return; }
    const [y, m, d] = editMeetingForm.date.split('-').map(Number);
    const [sh, sm] = editMeetingForm.start.split(':').map(Number);
    const [eh, em] = editMeetingForm.end.split(':').map(Number);
    const start = new Date(y, m - 1, d, sh, sm, 0, 0);
    const end = new Date(y, m - 1, d, eh, em, 0, 0);
    if (end <= start) { alert('Fin doit être après le début'); return; }
    try {
      const db = getFirestoreDb();
      const id = selected.id.replace(/^meeting_/, '');
      await updateDoc(doc(db, 'meetings', id), {
        title: editMeetingForm.title.trim() || 'Réunion',
        start: Timestamp.fromDate(start),
        end: Timestamp.fromDate(end),
        updatedAt: Timestamp.now(),
      });
      setEditMeetingOpen(false);
      setSelected(null);
    } catch {
      alert("Impossible de modifier la réunion");
    }
  };

  // Ouvrir édition week-end
  const openEditWeekend = () => {
    if (!selected || selected.type !== 'weekend' || !selected.start || !selected.end) return;
    const s = selected.start; const e = selected.end;
    const ys = s.getFullYear(); const ms = String(s.getMonth() + 1).padStart(2, '0'); const ds = String(s.getDate()).padStart(2, '0');
    const ye = e.getFullYear(); const me = String(e.getMonth() + 1).padStart(2, '0'); const de = String(e.getDate()).padStart(2, '0');
    const sh = String(s.getHours()).padStart(2, '0'); const sm = String(s.getMinutes()).padStart(2, '0');
    const eh = String(e.getHours()).padStart(2, '0'); const em = String(e.getMinutes()).padStart(2, '0');
    setEditWeekendForm({
      title: selected.title || 'Week-end',
      location: selected.location || '',
      startDate: `${ys}-${ms}-${ds}`,
      startTime: `${sh}:${sm}`,
      endDate: `${ye}-${me}-${de}`,
      endTime: `${eh}:${em}`,
    });
    setEditWeekendOpen(true);
  };

  const submitEditWeekend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !selected || selected.type !== 'weekend') return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editWeekendForm.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(editWeekendForm.endDate)) { alert('Dates invalides'); return; }
    if (!/^([01]?\d|2[0-3]):([0-5]\d)$/.test(editWeekendForm.startTime) || !/^([01]?\d|2[0-3]):([0-5]\d)$/.test(editWeekendForm.endTime)) { alert('Heures invalides (HH:MM)'); return; }
    const [ys, ms, ds] = editWeekendForm.startDate.split('-').map(Number);
    const [ye, me, de] = editWeekendForm.endDate.split('-').map(Number);
    const [sh, sm] = editWeekendForm.startTime.split(':').map(Number);
    const [eh, em] = editWeekendForm.endTime.split(':').map(Number);
    const start = new Date(ys, ms - 1, ds, sh, sm, 0, 0);
    const end = new Date(ye, me - 1, de, eh, em, 0, 0);
    if (end <= start) { alert('La fin doit être après le début'); return; }
    try {
      const db = getFirestoreDb();
      const id = selected.id.replace(/^weekend_/, '');
      await updateDoc(doc(db, 'weekends', id), {
        title: editWeekendForm.title.trim() || 'Week-end',
        location: (editWeekendForm.location || '').trim(),
        start: Timestamp.fromDate(start),
        end: Timestamp.fromDate(end),
        updatedAt: Timestamp.now(),
      });
      setEditWeekendOpen(false);
      setSelected(null);
    } catch {
      alert("Impossible de modifier le week-end");
    }
  };

  if (loading) return <div style={{ padding: 24 }}>Chargement…</div>;

  return (
    <div style={{ padding: 16 }} className="w-full mx-auto px-4 sm:px-6 max-w-screen-sm md:max-w-3xl lg:max-w-5xl pb-4">
      <h1 style={{ textAlign: 'center', margin: '0 0 1rem' }}>Calendrier</h1>
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => openAddModal()}
            style={{
              background: '#646cff', color: '#fff', border: 'none', borderRadius: 8,
              padding: '0.5rem 0.9rem', cursor: 'pointer', fontWeight: 600
            }}
          >
            Réunion +
          </button>
          <button
            type="button"
            onClick={() => openAddWeekendModal()}
            style={{
              background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8,
              padding: '0.5rem 0.9rem', cursor: 'pointer', fontWeight: 600
            }}
          >
            Week-end +
          </button>
        </div>
      )}
      <div style={{ maxWidth: 900, margin: '0 auto' }} className="w-full">
        <Suspense fallback={<div>Chargement du calendrier…</div>}>
          <CalendarView
            events={events as EventInput[]}
            selectable={isAdmin}
            onSelect={(selectInfo) => {
              if (!isAdmin) return;
              setDateSelectionModal({ show: true, date: selectInfo.start });
            }}
            onEventClick={(arg: EventClickArg) => {
              const kind = (arg.event.extendedProps?.kind as 'job' | 'meeting' | 'weekend') || (arg.event.id.startsWith('job_') ? 'job' : arg.event.id.startsWith('weekend_') ? 'weekend' : 'meeting');
              const preciseStart = (arg.event.extendedProps?.preciseStart as Date | undefined) ?? arg.event.start ?? null;
              const preciseEnd = (arg.event.extendedProps?.preciseEnd as Date | undefined) ?? arg.event.end ?? null;
              setSelected({
                id: arg.event.id,
                title: arg.event.title,
                start: preciseStart,
                end: preciseEnd,
                type: kind,
                location: (arg.event.extendedProps?.location as string | undefined) ?? null,
              });
            }}
          />
        </Suspense>
      </div>

      {dateSelectionModal.show && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setDateSelectionModal({ show: false, date: null })}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ 
              background: 'var(--color-surface)', 
              color: 'var(--color-text)', 
              borderRadius: 12, 
              padding: '1.5rem 1.75rem', 
              width: 'min(420px, 92vw)', 
              boxShadow: 'var(--shadow-xl)',
              border: '1px solid var(--color-border)'
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: '1.25rem', fontSize: '1.25rem', textAlign: 'center', color: 'var(--color-text)' }}>Que souhaitez-vous créer ?</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                onClick={() => {
                  setDateSelectionModal({ show: false, date: null });
                  openAddModal(dateSelectionModal.date || undefined);
                }}
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.75rem 1.25rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '1rem',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
                }}
              >
                📅 Réunion
              </button>
              <button
                onClick={() => {
                  setDateSelectionModal({ show: false, date: null });
                  openAddWeekendModal(dateSelectionModal.date || undefined);
                }}
                style={{
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.75rem 1.25rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '1rem',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  boxShadow: '0 2px 8px rgba(14, 165, 233, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(14, 165, 233, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(14, 165, 233, 0.3)';
                }}
              >
                🏕️ Week-end
              </button>
              <button
                onClick={() => setDateSelectionModal({ show: false, date: null })}
                style={{
                  background: resolvedTheme === 'dark' ? 'rgba(255,255,255,0.1)' : '#f3f4f6',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: '0.65rem 1.25rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '0.95rem',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = resolvedTheme === 'dark' ? 'rgba(255,255,255,0.15)' : '#e5e7eb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = resolvedTheme === 'dark' ? 'rgba(255,255,255,0.1)' : '#f3f4f6';
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setAddOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitAddMeeting}
            style={{ 
              background: 'var(--color-surface)', 
              color: 'var(--color-text)', 
              borderRadius: 12, 
              padding: '1rem 1.25rem', 
              width: 'min(520px, 92vw)', 
              boxShadow: 'var(--shadow-xl)',
              border: '1px solid var(--color-border)'
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: '1.15rem', color: 'var(--color-text)' }}>Nouvelle réunion</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: 'var(--color-text)' }}>Titre</span>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  style={{ 
                    padding: '0.5rem 0.6rem', 
                    borderRadius: 8, 
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text)'
                  }}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: 'var(--color-text)' }}>Date</span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                    style={{ 
                      padding: '0.5rem 0.6rem', 
                      borderRadius: 8, 
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text)'
                    }}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: 'var(--color-text)' }}>Début</span>
                  <input
                    type="time"
                    value={form.start}
                    onChange={(e) => setForm({ ...form, start: e.target.value })}
                    required
                    style={{ 
                      padding: '0.5rem 0.6rem', 
                      borderRadius: 8, 
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text)'
                    }}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: 'var(--color-text)' }}>Fin</span>
                  <input
                    type="time"
                    value={form.end}
                    onChange={(e) => setForm({ ...form, end: e.target.value })}
                    required
                    style={{ 
                      padding: '0.5rem 0.6rem', 
                      borderRadius: 8, 
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text)'
                    }}
                  />
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button 
                type="button" 
                onClick={() => setAddOpen(false)} 
                style={{ 
                  background: resolvedTheme === 'dark' ? 'rgba(255,255,255,0.1)' : '#eee', 
                  color: 'var(--color-text)', 
                  border: '1px solid var(--color-border)', 
                  borderRadius: 8, 
                  padding: '0.45rem 0.9rem', 
                  cursor: 'pointer' 
                }}
              >
                Annuler
              </button>
              <button type="submit" style={{ background: '#646cff', color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 0.9rem', cursor: 'pointer', fontWeight: 600 }}>Créer</button>
            </div>
          </form>
        </div>
      )}

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{ 
              background: 'var(--color-surface)', 
              color: 'var(--color-text)', 
              borderRadius: 12, 
              padding: '1rem 1.25rem', 
              width: 'min(520px, 92vw)', 
              boxShadow: 'var(--shadow-xl)',
              border: '1px solid var(--color-border)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text)' }}>{selected.title}</h2>
              <button
                onClick={() => setSelected(null)}
                aria-label="Fermer"
                title="Fermer"
                style={{
                  background: resolvedTheme === 'dark' ? 'rgba(255,255,255,0.1)' : '#f0f0f0',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: '0.25rem 0.55rem',
                  fontSize: 16,
                  lineHeight: 1,
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: '.95rem', lineHeight: 1.5, color: 'var(--color-text)' }}>
              <div><strong>Type:</strong> {selected.type === 'job' ? 'Job' : selected.type === 'meeting' ? 'Réunion' : 'Week-end'}</div>
              {selected.location ? (
                <div><strong>Lieu:</strong> {selected.location}</div>
              ) : null}
              <div><strong>Début:</strong> {selected.start ? selected.start.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</div>
              <div><strong>Fin:</strong> {selected.end ? selected.end.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</div>
            </div>
            {isAdmin && selected.type !== 'job' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    if (selected.type === 'meeting') openEditMeeting();
                    else if (selected.type === 'weekend') openEditWeekend();
                  }}
                  style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 0.9rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  Modifier
                </button>
                <button
                  onClick={async () => {
                    const ok = window.confirm(`Supprimer définitivement cet ${selected.type === 'meeting' ? 'événement' : 'week-end'} ?`);
                    if (!ok) return;
                    try {
                      const db = getFirestoreDb();
                      if (selected.type === 'meeting') {
                        const id = selected.id.replace(/^meeting_/, '');
                        await deleteDoc(doc(db, 'meetings', id));
                        setMeetings(prev => prev.filter(m => `meeting_${m.id}` !== selected.id));
                      } else if (selected.type === 'weekend') {
                        const id = selected.id.replace(/^weekend_/, '');
                        await deleteDoc(doc(db, 'weekends', id));
                        setWeekends(prev => prev.filter(w => `weekend_${w.id}` !== selected.id));
                      }
                      setSelected(null);
                    } catch {
                      alert("Suppression impossible. Vérifiez vos droits ou réessayez.");
                    }
                  }}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 0.9rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  Supprimer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {addWeekendOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setAddWeekendOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitAddWeekend}
            style={{ 
              background: 'var(--color-surface)', 
              color: 'var(--color-text)', 
              borderRadius: 12, 
              padding: '1rem 1.25rem', 
              width: 'min(520px, 92vw)', 
              boxShadow: 'var(--shadow-xl)',
              border: '1px solid var(--color-border)'
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: '1.15rem', color: 'var(--color-text)' }}>Nouveau week-end</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: 'var(--color-text)' }}>Titre</span>
                <input
                  type="text"
                  value={weekendForm.title}
                  onChange={(e) => setWeekendForm({ ...weekendForm, title: e.target.value })}
                  style={{ 
                    padding: '0.5rem 0.6rem', 
                    borderRadius: 8, 
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text)'
                  }}
                  placeholder="Week-end"
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: 'var(--color-text)' }}>Lieu</span>
                <input
                  type="text"
                  value={weekendForm.location}
                  onChange={(e) => setWeekendForm({ ...weekendForm, location: e.target.value })}
                  style={{ 
                    padding: '0.5rem 0.6rem', 
                    borderRadius: 8, 
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text)'
                  }}
                  placeholder="Ex: Local, Adresse..."
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: 'var(--color-text)' }}>Début — Date</span>
                    <input 
                      type="date" 
                      value={weekendForm.startDate} 
                      onChange={(e) => setWeekendForm({ ...weekendForm, startDate: e.target.value })} 
                      required 
                      style={{ 
                        padding: '0.5rem 0.6rem', 
                        borderRadius: 8, 
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        color: 'var(--color-text)'
                      }} 
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: 'var(--color-text)' }}>Début — Heure</span>
                    <input 
                      type="time" 
                      value={weekendForm.startTime} 
                      onChange={(e) => setWeekendForm({ ...weekendForm, startTime: e.target.value })} 
                      required 
                      style={{ 
                        padding: '0.5rem 0.6rem', 
                        borderRadius: 8, 
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        color: 'var(--color-text)'
                      }} 
                    />
                  </label>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: 'var(--color-text)' }}>Fin — Date</span>
                    <input 
                      type="date" 
                      value={weekendForm.endDate} 
                      onChange={(e) => setWeekendForm({ ...weekendForm, endDate: e.target.value })} 
                      required 
                      style={{ 
                        padding: '0.5rem 0.6rem', 
                        borderRadius: 8, 
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        color: 'var(--color-text)'
                      }} 
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: 'var(--color-text)' }}>Fin — Heure</span>
                    <input 
                      type="time" 
                      value={weekendForm.endTime} 
                      onChange={(e) => setWeekendForm({ ...weekendForm, endTime: e.target.value })} 
                      required 
                      style={{ 
                        padding: '0.5rem 0.6rem', 
                        borderRadius: 8, 
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        color: 'var(--color-text)'
                      }} 
                    />
                  </label>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button 
                type="button" 
                onClick={() => setAddWeekendOpen(false)} 
                style={{ 
                  background: resolvedTheme === 'dark' ? 'rgba(255,255,255,0.1)' : '#eee', 
                  color: 'var(--color-text)', 
                  border: '1px solid var(--color-border)', 
                  borderRadius: 8, 
                  padding: '0.45rem 0.9rem', 
                  cursor: 'pointer' 
                }}
              >
                Annuler
              </button>
              <button type="submit" style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 0.9rem', cursor: 'pointer', fontWeight: 600 }}>Créer</button>
            </div>
          </form>
        </div>
      )}

      {editMeetingOpen && selected && selected.type === 'meeting' && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setEditMeetingOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={submitEditMeeting} style={{ background: 'var(--color-surface)', color: 'var(--color-text)', borderRadius: 12, padding: '1rem 1.25rem', width: 'min(520px, 92vw)', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--color-border)' }}>
            <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: '1.15rem', color: 'var(--color-text)' }}>Modifier la réunion</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: 'var(--color-text)' }}>Titre</span>
                <input type="text" value={editMeetingForm.title} onChange={(e) => setEditMeetingForm({ ...editMeetingForm, title: e.target.value })} required style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: 'var(--color-text)' }}>Date</span>
                  <input type="date" value={editMeetingForm.date} onChange={(e) => setEditMeetingForm({ ...editMeetingForm, date: e.target.value })} required style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: 'var(--color-text)' }}>Début</span>
                  <input type="time" value={editMeetingForm.start} onChange={(e) => setEditMeetingForm({ ...editMeetingForm, start: e.target.value })} required style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: 'var(--color-text)' }}>Fin</span>
                  <input type="time" value={editMeetingForm.end} onChange={(e) => setEditMeetingForm({ ...editMeetingForm, end: e.target.value })} required style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button type="button" onClick={() => setEditMeetingOpen(false)} style={{ background: resolvedTheme === 'dark' ? 'rgba(255,255,255,0.1)' : '#eee', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.45rem 0.9rem', cursor: 'pointer' }}>Annuler</button>
              <button type="submit" style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 0.9rem', cursor: 'pointer', fontWeight: 600 }}>Enregistrer</button>
            </div>
          </form>
        </div>
      )}

      {editWeekendOpen && selected && selected.type === 'weekend' && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setEditWeekendOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={submitEditWeekend} style={{ background: 'var(--color-surface)', color: 'var(--color-text)', borderRadius: 12, padding: '1rem 1.25rem', width: 'min(520px, 92vw)', boxShadow: 'var(--shadow-xl)', border: '1px solid var(--color-border)' }}>
            <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: '1.15rem', color: 'var(--color-text)' }}>Modifier le week-end</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: 'var(--color-text)' }}>Titre</span>
                <input type="text" value={editWeekendForm.title} onChange={(e) => setEditWeekendForm({ ...editWeekendForm, title: e.target.value })} style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }} placeholder="Week-end" />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: 'var(--color-text)' }}>Lieu</span>
                <input type="text" value={editWeekendForm.location} onChange={(e) => setEditWeekendForm({ ...editWeekendForm, location: e.target.value })} style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }} placeholder="Ex: Local, Adresse..." />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: 'var(--color-text)' }}>Début — Date</span>
                    <input type="date" value={editWeekendForm.startDate} onChange={(e) => setEditWeekendForm({ ...editWeekendForm, startDate: e.target.value })} required style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: 'var(--color-text)' }}>Début — Heure</span>
                    <input type="time" value={editWeekendForm.startTime} onChange={(e) => setEditWeekendForm({ ...editWeekendForm, startTime: e.target.value })} required style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                  </label>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: 'var(--color-text)' }}>Fin — Date</span>
                    <input type="date" value={editWeekendForm.endDate} onChange={(e) => setEditWeekendForm({ ...editWeekendForm, endDate: e.target.value })} required style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: 'var(--color-text)' }}>Fin — Heure</span>
                    <input type="time" value={editWeekendForm.endTime} onChange={(e) => setEditWeekendForm({ ...editWeekendForm, endTime: e.target.value })} required style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }} />
                  </label>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button type="button" onClick={() => setEditWeekendOpen(false)} style={{ background: resolvedTheme === 'dark' ? 'rgba(255,255,255,0.1)' : '#eee', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.45rem 0.9rem', cursor: 'pointer' }}>Annuler</button>
              <button type="submit" style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, padding: '0.45rem 0.9rem', cursor: 'pointer', fontWeight: 600 }}>Enregistrer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
