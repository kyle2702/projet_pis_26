import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, doc, getDoc, getDocs, Timestamp } from 'firebase/firestore';
import { getFirestoreDb, getFirebaseAuth, getGoogleProvider } from '../firebase/config';
import { reauthenticateWithCredential, EmailAuthProvider, updatePassword, fetchSignInMethodsForEmail, reauthenticateWithPopup } from 'firebase/auth';
import { initMessagingAndGetToken } from '../firebase/messaging';
import { isWebPushSupported, subscribeWebPush } from '../webpush';

type Job = { id: string; title?: string; ['date-begin']?: string | Timestamp; ['date-end']?: string | Timestamp; adress?: string };

function parseIsoLocal(s: string): number | undefined {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return undefined;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const HH = Number(m[4]);
  const MM = Number(m[5]);
  const SS = m[6] ? Number(m[6]) : 0;
  const d = new Date(yyyy, mm - 1, dd, HH, MM, SS, 0);
  const t = d.getTime();
  return Number.isNaN(t) ? undefined : t;
}
function parseDdMmYyyy(s: string): number | undefined {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?$/);
  if (!m) return undefined;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  const HH = m[4] ? Number(m[4]) : 0;
  const MM = m[5] ? Number(m[5]) : 0;
  const d = new Date(yyyy, mm - 1, dd, HH, MM, 0, 0);
  const t = d.getTime();
  return Number.isNaN(t) ? undefined : t;
}
function toMillis(val: unknown): number | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') {
    const t1 = parseIsoLocal(val); if (t1 !== undefined) return t1;
    const t2 = parseDdMmYyyy(val); if (t2 !== undefined) return t2;
    const t = new Date(val).getTime(); return Number.isNaN(t) ? undefined : t;
  }
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'object' && val !== null && 'seconds' in val) return (val as { seconds: number }).seconds * 1000;
  return undefined;
}
function fmtDate(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') {
    const m = val.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
    return val;
  }
  if (val instanceof Timestamp) return new Date(val.toMillis()).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  if (typeof val === 'object' && val !== null && 'seconds' in val) return new Date((val as { seconds:number }).seconds*1000).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  return String(val);
}

const ProfilePage: React.FC = () => {
  const { user, token: idToken } = useAuth();
  const [jobs, setJobs] = useState<Array<{ id:string; title:string; begin:string; end:string; minutes:number }>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [notifMsg, setNotifMsg] = useState<string | null>(null);
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default');

  // Password form state
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<boolean>(false);
  const [hasPasswordProvider, setHasPasswordProvider] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const auth = getFirebaseAuth();
  const email = user?.email;
  if (!email) { if (!cancelled) setHasPasswordProvider(false); return; }
  const methods = await fetchSignInMethodsForEmail(auth, email);
  if (!cancelled) setHasPasswordProvider(methods.includes('password'));
      } catch {
  if (!cancelled) setHasPasswordProvider(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.email]);

  // Détecter l'état des notifications pour afficher/masquer le bouton
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setNotifPermission('unsupported');
      return;
    }
    setNotifPermission(Notification.permission);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setLoading(false); return; }
      try {
        const db = getFirestoreDb();
        const all = await getDocs(collection(db, 'jobs'));
        const now = Date.now();
        const list: Array<{ id:string; title:string; begin:string; end:string; minutes:number }> = [];
        for (const d of all.docs) {
          const data = d.data() as Job;
          const start = toMillis(data['date-begin']);
          const end = toMillis(data['date-end']);
          if (start === undefined || end === undefined) continue;
          if (end >= now) continue; // job non terminé
          // check participation validée
          try {
            const pdoc = await getDoc(doc(db, `jobs/${d.id}/applications/${user.uid}`));
            if (!pdoc.exists()) continue;
            const diffMs = end - start;
            const minutes = diffMs > 0 ? Math.round(diffMs / 60000) : 0;
            list.push({ id: d.id, title: data.title || 'Sans titre', begin: fmtDate(data['date-begin']), end: fmtDate(data['date-end']), minutes });
          } catch {
            // ignore
          }
        }
        if (!cancelled) {
          const withSort = list.map(j => ({ ...j, _start: toMillis(j.begin) ?? 0 }));
          withSort.sort((a,b) => (b._start - a._start));
          const cleaned = withSort.map(j => ({ id: j.id, title: j.title, begin: j.begin, end: j.end, minutes: j.minutes }));
          setJobs(cleaned);
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setErr('Erreur lors du chargement du profil'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!user) return <div style={{ padding: 24 }}>Veuillez vous connecter.</div>;
  if (loading) return <div style={{ padding: 24 }}>Chargement…</div>;
  if (err) return <div style={{ padding: 24 }}>{err}</div>;

  const totalMinutes = jobs.reduce((s, j) => s + j.minutes, 0);
  const totalHours = (totalMinutes / 60).toFixed(2);

  const styles: { [k:string]: React.CSSProperties } = {
    container: { maxWidth: 900, margin: '2rem auto', padding: '1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    section: { background: '#fff', color:'#222', border: '1px solid #ddd', borderRadius: 10, padding: '1rem', margin: '0 auto 1.5rem', width: 'fit-content', maxWidth: '90vw', alignSelf: 'center' },
    table: { width:'fit-content', maxWidth:'90vw', margin:'0 auto', borderCollapse:'collapse' },
    th: { background:'#646cff', color:'#fff', padding:'0.6rem', textAlign:'left' },
    td: { borderBottom:'1px solid #eee', padding:'0.6rem' },
    label: { display:'block', marginBottom: 6, fontWeight: 600 },
  input: { width: 'min(320px, 90vw)', padding: '0.6rem', borderRadius: 8, border:'1px solid #ccc' },
    btn: { background:'#646cff', color:'#fff', border:'none', borderRadius:8, padding:'0.6rem 1rem', cursor:'pointer' }
  };

  async function handleEnableNotifications() {
    setNotifMsg(null);
    if (!user) { setNotifMsg('Veuillez vous connecter.'); return; }
    if (notifPermission === 'unsupported') { setNotifMsg('Notifications non supportées sur cet appareil.'); return; }
    try {
      setNotifBusy(true);
      // S'assurer que le SW est prêt
  try { await navigator.serviceWorker.register('/firebase-messaging-sw.js'); } catch { /* noop */ }
      const current = Notification.permission;
      if (current === 'denied') {
        setNotifMsg('Notifications refusées. Activez-les dans Réglages/Paramètres puis réessayez.');
        return;
      }
      let granted = current === 'granted';
      if (!granted) {
        const res: NotificationPermission = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
        granted = res === 'granted';
        setNotifPermission(res);
        if (!granted) {
          setNotifMsg('Permission non accordée.');
          return;
        }
      }
      // D'abord tenter FCM (Android/Chrome)
      const fcmTok = await initMessagingAndGetToken(user.uid);
      if (fcmTok) {
        setNotifMsg('Notifications activées (FCM).');
        setNotifPermission('granted');
        return;
      }
      // Sinon fallback Web Push
      if (isWebPushSupported()) {
        if (!idToken) {
          setNotifMsg('Session invalide, reconnectez-vous.');
          return;
        }
        const ok = await subscribeWebPush(user.uid, idToken);
        setNotifMsg(ok ? 'Notifications activées (Web Push).' : "Impossible d'activer les notifications (Web Push).");
        if (ok) setNotifPermission('granted');
      } else {
        setNotifMsg('Notifications non supportées sur ce navigateur.');
      }
    } finally {
      setNotifBusy(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMsg(null);
    setPwdSuccess(false);
    if (!user?.email) { setPwdMsg('Email manquant sur le compte.'); return; }
    // validations communes
    if (!newPwd || !confirmPwd) { setPwdMsg('Tous les champs sont requis.'); return; }
    if (newPwd !== confirmPwd) { setPwdMsg('Les deux nouveaux mots de passe ne correspondent pas.'); return; }
    if (newPwd.length < 6) { setPwdMsg('Le nouveau mot de passe doit contenir au moins 6 caractères.'); return; }
    setSubmitting(true);
    try {
      const auth = getFirebaseAuth();
      if (!auth.currentUser) { setPwdMsg('Session expirée, reconnectez-vous.'); return; }
      // Si l'utilisateur fournit l'ancien mot de passe, on réauth par mot de passe
      if (oldPwd) {
        const cred = EmailAuthProvider.credential(user.email, oldPwd);
        await reauthenticateWithCredential(auth.currentUser, cred);
        await updatePassword(auth.currentUser, newPwd);
      } else {
        // Sinon on tente directement updatePassword et on gère requires-recent-login
        try {
          await updatePassword(auth.currentUser, newPwd);
        } catch (err: unknown) {
          const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : '';
          if (code.includes('requires-recent-login')) {
            const hasGoogle = auth.currentUser.providerData.some(p => p.providerId === 'google.com');
            if (hasGoogle) {
              try {
                await reauthenticateWithPopup(auth.currentUser, getGoogleProvider());
                await updatePassword(auth.currentUser, newPwd);
              } catch (reauthErr) {
                const rCode = typeof reauthErr === 'object' && reauthErr && 'code' in reauthErr ? String((reauthErr as { code?: unknown }).code) : '';
                setPwdMsg(rCode ? `Échec de réauthentification (${rCode}).` : 'Échec de réauthentification.');
                return;
              }
            } else {
              setPwdMsg('Veuillez vous reconnecter puis réessayer.');
              return;
            }
          } else {
            throw err;
          }
        }
      }
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
      setPwdMsg('Mot de passe mis à jour.');
      setPwdSuccess(true);
    } catch (e: unknown) {
      const code = typeof e === 'object' && e && 'code' in e ? String((e as { code?: unknown }).code) : '';
      if (code.includes('wrong-password')) setPwdMsg('Ancien mot de passe incorrect.');
      else if (code.includes('too-many-requests')) setPwdMsg("Trop de tentatives, réessayez plus tard.");
  else if (code.includes('credential-already-in-use')) setPwdMsg('Ce compte a déjà une méthode mot de passe.');
      else if (code.includes('requires-recent-login')) setPwdMsg('Veuillez vous reconnecter puis réessayer.');
      else setPwdMsg(code ? `Erreur lors de la mise à jour du mot de passe (${code}).` : 'Erreur lors de la mise à jour du mot de passe.');
      setPwdSuccess(false);
    }
    finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.container} className="max-w-screen-sm w-full mx-auto px-4 sm:px-6">
      <h1>Mon profil</h1>

  <section style={styles.section} className="w-full">
        <h2 style={{ marginTop:0 }}>Mes jobs terminés</h2>
        <div style={{ margin: '0.3rem 0 0.8rem' }}>Total: <strong>{totalHours}</strong> heures</div>
        {jobs.length === 0 ? (
          <div>Aucun job terminé.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Titre</th>
                <th style={styles.th}>Début</th>
                <th style={styles.th}>Fin</th>
                <th style={styles.th}>Heures</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.id}>
                  <td style={styles.td}>{j.title}</td>
                  <td style={styles.td}>{j.begin}</td>
                  <td style={styles.td}>{j.end}</td>
                  <td style={styles.td}>{(j.minutes/60).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {notifPermission !== 'unsupported' && (
  <section style={styles.section} className="w-full">
          <h2 style={{ marginTop:0 }}>Notifications</h2>
          {notifPermission === 'granted' ? (
            <div>Notifications déjà activées.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
              <div style={{ maxWidth: 420 }}>Activez les notifications pour recevoir les alertes des nouveaux jobs et mises à jour.</div>
              <button style={styles.btn} onClick={handleEnableNotifications} disabled={notifBusy}>
                {notifBusy ? 'Activation…' : 'Activer les notifications'}
              </button>
              {notifPermission === 'denied' && (
                <div style={{ color:'#b71c1c', maxWidth: 420 }}>Notifications refusées dans le navigateur. Allez dans Réglages &gt; Notifications &gt; Pionniers 26 et activez-les.</div>
              )}
              {notifMsg && <div style={{ maxWidth: 420 }}>{notifMsg}</div>}
            </div>
          )}
        </section>
      )}

  <section style={styles.section} className="w-full">
        <h2 style={{ marginTop:0 }}>Changer mon mot de passe</h2>
        <form onSubmit={handleChangePassword} style={{ maxWidth: 420, margin:'0 auto' }}>
          <label style={styles.label}>Ancien mot de passe</label>
          <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} style={styles.input} disabled={submitting} />
          <label style={{...styles.label, marginTop: 10}}>Nouveau mot de passe</label>
          <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} style={styles.input} disabled={submitting} />
          <label style={{...styles.label, marginTop: 10}}>Confirmer le nouveau mot de passe</label>
          <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} style={styles.input} disabled={submitting} />
          {pwdMsg && <div style={{ marginTop: 10, color: pwdSuccess ? 'green' : '#b71c1c', maxWidth: 420 }}>{pwdMsg}</div>}
          <div style={{ marginTop: 14 }}>
            <button type="submit" style={styles.btn} disabled={submitting}>{hasPasswordProvider ? 'Mettre à jour' : 'Définir un mot de passe'}</button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default ProfilePage;
