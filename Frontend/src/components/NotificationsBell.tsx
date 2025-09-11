import React, { useEffect, useState, useCallback } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit, updateDoc, doc, writeBatch, Timestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import './NotificationsBell.css';
import { getFirestoreDb } from '../firebase/config';

interface NotificationDoc {
  id: string;
  type: string;
  jobId?: string;
  title?: string;
  description?: string;
  createdAt?: { seconds: number; nanoseconds: number } | Date;
  readBy?: string[];
  userId: string;
}

const formatDate = (input?: NotificationDoc['createdAt']) => {
  if (!input) return '';
  let d: Date;
  if (input instanceof Date) d = input; else if (typeof input === 'object' && 'seconds' in input) d = new Date(input.seconds * 1000); else return '';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const NotificationsBell: React.FC = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifs, setNotifs] = useState<NotificationDoc[]>([]);
  // const [error, setError] = useState<string | null>(null); // Conservé si besoin future UI erreurs

  const unreadCount = notifs.filter(n => !n.readBy || !n.readBy.includes(user?.uid || '')).length;

  const fetch = useCallback(() => {
    if (!user) { setNotifs([]); return; }
    setLoading(true);
    try {
      const db = getFirestoreDb();
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(25)
      );
  return onSnapshot(q, (snap) => {
        const list: NotificationDoc[] = [];
        snap.forEach(d => {
          const data = d.data() as Partial<NotificationDoc>;
          list.push({
            id: d.id,
            type: data.type || 'unknown',
            jobId: data.jobId,
            title: data.title,
    description: data.description,
    createdAt: data.createdAt as (Timestamp | { seconds: number; nanoseconds: number } | Date | undefined),
            readBy: data.readBy || [],
            userId: data.userId || user.uid
          });
        });
        setNotifs(list);
        setLoading(false);
      }, (e) => {
        console.error(e);
    // setError('Erreur notifications');
        setLoading(false);
      });
    } catch (e) {
      console.error(e);
  // setError('Erreur notifications');
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const unsub = fetch();
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [fetch]);

  // Marquer une notification comme lue
  const markOne = async (id: string) => {
    if (!user) return;
    try {
      const db = getFirestoreDb();
      const ref = doc(db, 'notifications', id);
      const notif = notifs.find(n => n.id === id);
      if (notif && notif.readBy && notif.readBy.includes(user.uid)) return;
      await updateDoc(ref, { readBy: [...(notif?.readBy || []), user.uid] });
    } catch (e) {
      console.error('markOne error', e);
    }
  };

  const markAll = async () => {
    if (!user) return;
    try {
      const db = getFirestoreDb();
      const batch = writeBatch(db);
      notifs.forEach(n => {
        if (!n.readBy || !n.readBy.includes(user.uid)) {
          const ref = doc(db, 'notifications', n.id);
            batch.update(ref, { readBy: [...(n.readBy || []), user.uid] });
        }
      });
      await batch.commit();
    } catch (e) {
      console.error('markAll error', e);
    }
  };

  return (
    <div className="notif-bell-wrapper">
      <button className="notif-bell-btn" onClick={() => setOpen(o => !o)} aria-label="Notifications">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#222" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-mark-all">
            <strong style={{ fontSize: '.8rem', letterSpacing: '.5px' }}>NOTIFICATIONS</strong>
            {unreadCount > 0 && <button onClick={markAll}>Tout marquer lu</button>}
          </div>
          {loading && <div className="notif-empty">Chargement...</div>}
          {!loading && notifs.length === 0 && <div className="notif-empty">Aucune notification</div>}
          {!loading && notifs.map(n => {
            const isUnread = !n.readBy || !n.readBy.includes(user?.uid || '');
            return (
              <div key={n.id} className={`notif-item ${isUnread ? 'unread' : ''}`} onClick={() => markOne(n.id)}>
                <div style={{ fontWeight: 600, fontSize: '.85rem', color: '#222' }}>{n.title || 'Notification'}</div>
                {n.description && <div style={{ fontSize: '.75rem', color: '#444' }}>{n.description}</div>}
                {n.jobId && (
                  <a
                    href={`/jobs?jobId=${encodeURIComponent(n.jobId)}`}
                    style={{ fontSize: '.7rem', color: '#646cff', textDecoration: 'none', fontWeight: 600 }}
                  >Voir le job</a>
                )}
                <time>{formatDate(n.createdAt)}</time>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default NotificationsBell;
