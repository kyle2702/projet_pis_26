import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
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

// Composant réutilisable pour champs mot de passe — placé au niveau module pour conserver le focus
type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  marginTop?: number;
  styles: {
    label: React.CSSProperties;
    inputWrap: React.CSSProperties;
    input: React.CSSProperties;
    eyeBtn: React.CSSProperties;
  };
};

const PasswordField: React.FC<PasswordFieldProps> = ({ label, value, onChange, disabled, marginTop, styles }) => {
  const [show, setShow] = useState(false);
  return (
    <>
      <label style={{ ...styles.label, ...(marginTop ? { marginTop } : {}) }}>{label}</label>
      <div style={styles.inputWrap}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...styles.input, paddingRight: 40 }}
          disabled={disabled}
        />
        <button
          type="button"
          aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          onClick={() => setShow(s => !s)}
          style={styles.eyeBtn}
          title={show ? 'Masquer' : 'Afficher'}
        >
          {show ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 2l20 20" />
              <path d="M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 3-3 3 3 0 0 0-4.42-2.42" />
              <path d="M9.88 5.09A10.45 10.45 0 0 1 12 5c4.477 0 8.268 2.943 9.542 7-.558 1.777-1.615 3.334-2.98 4.556" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.75 16.057 2.458 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </>
  );
};

const ProfilePage: React.FC = () => {
  const { user, token: idToken } = useAuth();
  const [profileName, setProfileName] = useState<string | null>(null);
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
  // Les champs mot de passe utilisent un composant réutilisable (défini au niveau module)
  useEffect(() => {
    // Récupérer le displayName depuis auth ou Firestore (fallback)
    let cancelled = false;
    (async () => {
      if (!user) { if (!cancelled) setProfileName(null); return; }
      if (user.displayName && user.displayName.trim()) {
        if (!cancelled) setProfileName(user.displayName);
        return;
      }
      try {
        const db = getFirestoreDb();
        const snap = await getDoc(doc(db, 'users', user.uid));
        const name = snap.exists() ? ((snap.data() as { displayName?: string | null })?.displayName ?? null) : null;
        if (!cancelled) setProfileName(typeof name === 'string' && name.trim() ? name : null);
      } catch {
        if (!cancelled) setProfileName(null);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, user?.displayName]);

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
  container: { margin: '2rem auto', padding: 0, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' },
  section: { background: 'var(--color-surface)', color:'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: '1.5rem', margin: '0 auto 1.5rem', width: '100%', maxWidth: 320, alignSelf: 'center', boxShadow: 'var(--shadow-md)' },
  table: { width:'100%', margin:'0 auto', borderCollapse:'separate', borderSpacing: 0, borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
    th: { background:'var(--primary-gradient)', color:'#fff', padding:'0.75rem', textAlign:'left', fontWeight: 600, fontSize: '0.9rem' },
    thFirst: { borderTopLeftRadius: 'var(--radius-lg)' },
    thLast: { borderTopRightRadius: 'var(--radius-lg)' },
    td: { borderBottom:'1px solid var(--color-border)', padding:'0.75rem', color: 'var(--color-text)', background: 'var(--color-surface)' },
    tdLastRow: { borderBottom: 'none' },
    label: { display:'block', marginBottom: 6, fontWeight: 600, color: 'var(--color-text)' },
  input: { width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border:'2px solid var(--color-border)', fontSize: '1rem', boxSizing: 'border-box', background: 'var(--color-surface)', color: 'var(--color-text)' },
  inputWrap: { position: 'relative', width: '100%', maxWidth: 320, margin: '0 auto' },
    eyeBtn: { position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'transparent', border:'none', cursor:'pointer', color:'var(--color-text-light)', padding:4, fontSize: '.9rem' },
    btn: { background:'var(--primary-gradient)', color:'#fff', border:'none', borderRadius:'var(--radius-lg)', padding:'0.75rem 1.25rem', cursor:'pointer', boxShadow: 'var(--shadow-md)', transition: 'all 0.3s ease' }
  };
  const passwordFieldStyles = { label: styles.label, inputWrap: styles.inputWrap, input: styles.input, eyeBtn: styles.eyeBtn };

  

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
    <div style={styles.container} className="max-w-screen-sm w-full mx-auto">
      <h1 style={{ color: 'var(--color-text)' }}>Mon profil</h1>
      {profileName && (
        <div style={{ marginTop: 6, marginBottom: 8, fontSize: '1.25rem', color: 'var(--color-text)' }}>{profileName}</div>
      )}

  <section style={styles.section} className="w-full">
        <h2 style={{ marginTop:0, color: 'var(--color-text)' }}>Mes jobs terminés</h2>
        <div style={{ margin: '0.3rem 0 0.8rem' }}>Total: <strong>{totalHours}</strong> heures</div>
        {jobs.length === 0 ? (
          <div>Aucun job terminé.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{...styles.th, ...styles.thFirst}}>Titre</th>
                <th style={styles.th}>Début</th>
                <th style={{...styles.th, ...styles.thLast}}>Heures</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j, idx) => (
                <tr key={j.id}>
                  <td style={{...styles.td, ...(idx === jobs.length - 1 ? styles.tdLastRow : {}), borderBottomLeftRadius: idx === jobs.length - 1 ? 'var(--radius-lg)' : 0}}>{j.title}</td>
                  <td style={{...styles.td, ...(idx === jobs.length - 1 ? styles.tdLastRow : {})}}>{j.begin}</td>
                  <td style={{...styles.td, ...(idx === jobs.length - 1 ? styles.tdLastRow : {}), borderBottomRightRadius: idx === jobs.length - 1 ? 'var(--radius-lg)' : 0}}>{(j.minutes/60).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {notifPermission !== 'unsupported' && (
  <section style={styles.section} className="w-full">
          <h2 style={{ marginTop:0, color: 'var(--color-text)' }}>Notifications</h2>
          {notifPermission === 'granted' ? (
            <div>Notifications déjà activées.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
              <div style={{ maxWidth: 320 }}>Activez les notifications pour recevoir les alertes des nouveaux jobs et mises à jour.</div>
              <button style={styles.btn} onClick={handleEnableNotifications} disabled={notifBusy}>
                {notifBusy ? 'Activation…' : 'Activer les notifications'}
              </button>
              {notifPermission === 'denied' && (
                <div style={{ color:'var(--color-danger)', maxWidth: 320, fontWeight: 500 }}>Notifications refusées dans le navigateur. Allez dans Réglages &gt; Notifications &gt; Pionniers 26 et activez-les.</div>
              )}
              {notifMsg && <div style={{ maxWidth: 320 }}>{notifMsg}</div>}
            </div>
          )}
        </section>
      )}

      <ThemeSection />

  <section style={styles.section} className="w-full">
        <h2 style={{ marginTop:0, color: 'var(--color-text)' }}>Changer mon mot de passe</h2>
        <form onSubmit={handleChangePassword} style={{ maxWidth: 320, margin:'0 auto' }}>
          <PasswordField label="Ancien mot de passe" value={oldPwd} onChange={setOldPwd} disabled={submitting} styles={passwordFieldStyles} />
          <PasswordField label="Nouveau mot de passe" value={newPwd} onChange={setNewPwd} disabled={submitting} marginTop={10} styles={passwordFieldStyles} />
          <PasswordField label="Confirmer le nouveau mot de passe" value={confirmPwd} onChange={setConfirmPwd} disabled={submitting} marginTop={10} styles={passwordFieldStyles} />
          {pwdMsg && <div style={{ marginTop: 10, color: pwdSuccess ? 'var(--color-success)' : 'var(--color-danger)', maxWidth: 320, fontWeight: 500 }}>{pwdMsg}</div>}
          <div style={{ marginTop: 14 }}>
            <button type="submit" style={styles.btn} disabled={submitting}>{hasPasswordProvider ? 'Mettre à jour' : 'Définir un mot de passe'}</button>
          </div>
        </form>
      </section>
    </div>
  );
};

// Composant pour la section thème
const ThemeSection: React.FC = () => {
  const { themeMode, setThemeMode } = useTheme();
  const [saving, setSaving] = useState(false);

  const handleThemeChange = async (mode: 'light' | 'dark' | 'auto') => {
    setSaving(true);
    try {
      await setThemeMode(mode);
    } catch (error) {
      console.error('Erreur lors du changement de thème:', error);
    } finally {
      setSaving(false);
    }
  };

  const styles: { [k:string]: React.CSSProperties } = {
    section: { background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: '1.5rem', margin: '0 auto 1.5rem', width: '100%', maxWidth: 320, boxShadow: 'var(--shadow-md)' },
    optionBtn: {
      width: '100%',
      padding: '1rem',
      margin: '0.5rem 0',
      border: '2px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--color-surface)',
      color: 'var(--color-text)',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      fontSize: '1rem',
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: 'var(--shadow-sm)'
    },
    activeBtn: {
      borderColor: 'var(--color-primary)',
      background: 'rgba(102, 126, 234, 0.1)',
      fontWeight: 600
    }
  };

  return (
    <section style={styles.section} className="w-full">
      <h2 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.25rem' }}>🎨 Thème</h2>
      <div style={{ maxWidth: 320, margin: '0 auto' }}>
        <button
          style={{
            ...styles.optionBtn,
            ...(themeMode === 'light' ? styles.activeBtn : {})
          }}
          onClick={() => handleThemeChange('light')}
          disabled={saving}
          onMouseEnter={(e) => {
            if (themeMode !== 'light') {
              e.currentTarget.style.borderColor = 'var(--color-primary)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }
          }}
          onMouseLeave={(e) => {
            if (themeMode !== 'light') {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.transform = 'translateY(0)';
            }
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
            Clair
          </span>
          {themeMode === 'light' && <span style={{ color: 'var(--color-primary)' }}>✓</span>}
        </button>

        <button
          style={{
            ...styles.optionBtn,
            ...(themeMode === 'dark' ? styles.activeBtn : {})
          }}
          onClick={() => handleThemeChange('dark')}
          disabled={saving}
          onMouseEnter={(e) => {
            if (themeMode !== 'dark') {
              e.currentTarget.style.borderColor = 'var(--color-primary)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }
          }}
          onMouseLeave={(e) => {
            if (themeMode !== 'dark') {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.transform = 'translateY(0)';
            }
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
            Sombre
          </span>
          {themeMode === 'dark' && <span style={{ color: 'var(--color-primary)' }}>✓</span>}
        </button>

        <button
          style={{
            ...styles.optionBtn,
            ...(themeMode === 'auto' ? styles.activeBtn : {})
          }}
          onClick={() => handleThemeChange('auto')}
          disabled={saving}
          onMouseEnter={(e) => {
            if (themeMode !== 'auto') {
              e.currentTarget.style.borderColor = 'var(--color-primary)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }
          }}
          onMouseLeave={(e) => {
            if (themeMode !== 'auto') {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.transform = 'translateY(0)';
            }
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            Auto (système)
          </span>
          {themeMode === 'auto' && <span style={{ color: 'var(--color-primary)' }}>✓</span>}
        </button>
        
        {saving && (
          <div style={{ marginTop: '0.5rem', textAlign: 'center', color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
            Sauvegarde...
          </div>
        )}
      </div>
    </section>
  );
};

export default ProfilePage;
