import React, { useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import frLocale from '@fullcalendar/core/locales/fr';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg } from '@fullcalendar/core';
import { collection, addDoc, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { getFirestoreDb } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';

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

const CalendarPage: React.FC = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  // plus d'état d'erreur global: l'UI reste affichée même en cas d'échec partiel

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = getFirestoreDb();
      // 1) Déterminer admin (non bloquant)
      try {
        if (user) {
          const me = await getDoc(doc(db, 'users', user.uid));
          const admin = me.exists() && me.data().isAdmin === true;
          if (!cancelled) setIsAdmin(!!admin);
        } else {
          if (!cancelled) setIsAdmin(false);
        }
      } catch (e) {
        console.warn('Calendrier: impossible de déterminer le rôle admin', e);
        if (!cancelled) setIsAdmin(false);
      }

      // 2) Charger jobs (tolérant)
      try {
        const snap = await getDocs(collection(db, 'jobs'));
        const jlist: Job[] = snap.docs.map(d => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            title: (data.title as string) ?? '',
            'date-begin': data['date-begin'] as FirestoreDateLike,
            'date-end': data['date-end'] as FirestoreDateLike,
          };
        });
        if (!cancelled) setJobs(jlist);
      } catch (e) {
        console.warn('Calendrier: échec du chargement des jobs', e);
      }

      // 3) Charger meetings (tolérant)
      try {
        const msnap = await getDocs(collection(db, 'meetings'));
        const mlist: Meeting[] = msnap.docs.map(d => {
          const data = d.data() as { title?: string; start: Timestamp | string | number | Date; end?: Timestamp | string | number | Date };
          const start = data.start instanceof Timestamp ? data.start.toDate() : new Date(data.start);
          const end = data.end ? (data.end instanceof Timestamp ? data.end.toDate() : new Date(data.end)) : undefined;
          return { id: d.id, title: data.title || 'Réunion', start, end };
        });
        if (!cancelled) setMeetings(mlist);
      } catch (e) {
        console.warn('Calendrier: échec du chargement des réunions', e);
      }

      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const events = useMemo(() => {
    function toDate(val: FirestoreDateLike): Date | undefined {
      if (!val) return undefined;
      if (val instanceof Timestamp) return val.toDate();
      if (typeof val === 'object' && 'seconds' in val) return new Date(val.seconds * 1000);
      if (typeof val === 'string' || typeof val === 'number') return new Date(val);
      return undefined;
    }
    const jobEvents = jobs
      .map(j => ({
        id: `job_${j.id}`,
        title: j.title || 'Job',
        start: toDate(j['date-begin']),
        end: toDate(j['date-end'])
      }))
      .filter(evt => !!evt.start);
    const meetingEvents = meetings.map(m => ({ id: `meeting_${m.id}`, title: m.title || 'Réunion', start: m.start, end: m.end }));
    return [...jobEvents, ...meetingEvents];
  }, [jobs, meetings]);

  const handleSelect = async (sel: DateSelectArg) => {
    if (!isAdmin) return;
    const title = window.prompt('Titre de la réunion ?');
    if (!title) return;

    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dateLabel = fmt(sel.start);
    const startStr = window.prompt(`Heure de début le ${dateLabel} (HH:MM) ?`, '09:00');
    if (!startStr) return;
    const endStr = window.prompt(`Heure de fin le ${dateLabel} (HH:MM) ?`, '10:00');
    if (!endStr) return;

    const hhmm = /^([01]?\d|2[0-3]):([0-5]\d)$/;
    if (!hhmm.test(startStr) || !hhmm.test(endStr)) {
      alert('Format invalide. Utilisez HH:MM.');
      return;
    }
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    const start = new Date(sel.start);
    start.setHours(sh, sm, 0, 0);
    const end = new Date(sel.end || sel.start);
    end.setHours(eh, em, 0, 0);
    if (end <= start) {
      alert('L\'heure de fin doit être après l\'heure de début.');
      return;
    }

    try {
      const db = getFirestoreDb();
      const ref = await addDoc(collection(db, 'meetings'), {
        title,
        start: Timestamp.fromDate(start),
        end: Timestamp.fromDate(end),
        createdBy: user?.uid || null,
        createdAt: Timestamp.now(),
      });
      // Mise à jour locale rapide
      setMeetings(prev => [...prev, { id: ref.id, title, start, end }]);
    } catch {
      alert('Impossible d\'ajouter la réunion');
    }
  };

  if (loading) return <div style={{ padding: 24 }}>Chargement…</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ textAlign: 'center', margin: '0 0 1rem' }}>Calendrier</h1>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
          initialView="dayGridMonth"
          locales={[frLocale]}
          locale="fr"
          firstDay={1}
          selectable={isAdmin}
          selectMirror={true}
          weekends={true}
          views={{
            timeGridWeek: {
              slotMinTime: '00:00:00',
              slotMaxTime: '24:00:00',
              scrollTime: '07:00:00',
              slotDuration: '01:00:00',
              slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
              allDaySlot: false,
            },
            timeGridDay: {
              slotMinTime: '00:00:00',
              slotMaxTime: '24:00:00',
              scrollTime: '07:00:00',
              slotDuration: '01:00:00',
              slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
              allDaySlot: false,
            },
          }}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          events={events}
          select={handleSelect}
          height={650}
        />
      </div>
      {!isAdmin && (
        <div style={{ textAlign: 'center', marginTop: 8, color: '#666' }}>
          Seuls les admins peuvent ajouter des réunions (sélectionnez une plage sur le calendrier).
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
