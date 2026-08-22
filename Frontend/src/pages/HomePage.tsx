import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';

const HomePage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');

  const { user: loggedInUser, logout, isLoading, token, loginWithEmail } = useAuth();
  const [firestoreName, setFirestoreName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchName() {
      if (!loggedInUser?.uid) { setFirestoreName(null); return; }
      try {
        const { getFirestoreDb } = await import('../firebase/config');
        const { doc, getDoc } = await import('firebase/firestore');
        const db = getFirestoreDb();
        const snap = await getDoc(doc(db, 'users', loggedInUser.uid));
        if (!cancelled && snap.exists()) {
          const name = snap.data().displayName;
          setFirestoreName(typeof name === 'string' && name.trim() ? name : null);
        }
      } catch {
        if (!cancelled) setFirestoreName(null);
      }
    }
    fetchName();
    return () => { cancelled = true; };
  }, [loggedInUser?.uid]);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await loginWithEmail(username, password);
  navigate('/jobs', { state: { showWelcome: true } });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message || 'Identifiants invalides');
      } else {
        setError('Une erreur est survenue lors de la connexion.');
      }
    }
  };

  const handleLogout = () => {
    logout();
  };

  // Afficher un message de chargement pendant la vérification de l'authentification
  if (isLoading) {
    return (
      <section className="home-shell" aria-live="polite">
        <div className="home-bg-orb home-bg-orb-a" />
        <div className="home-bg-orb home-bg-orb-b" />
        <div className="home-card home-loading">Chargement...</div>
      </section>
    );
  }

  return (
    <section className="home-shell" aria-live="polite">
      <div className="home-bg-orb home-bg-orb-a" />
      <div className="home-bg-orb home-bg-orb-b" />
      {token ? (
        // Vue si l'utilisateur est connecté
        <div className="home-card home-card-logged">
          <p className="home-kicker">Session active</p>
          <h1 className="home-title">Bienvenue, {firestoreName || loggedInUser?.displayName || 'Utilisateur'}</h1>
          <p className="home-subtitle">Tu es connecté. Tu peux acceder aux jobs et au calendrier.</p>
          <button onClick={handleLogout} className="home-logout-btn">
            Se deconnecter
          </button>
        </div>
      ) : (
        // Vue si l'utilisateur n'est pas connecté (formulaire)
        <div className="home-card">
          <p className="home-kicker">Espace equipe</p>
          <h1 className="home-title">Connexion</h1>
          <p className="home-subtitle">Accede a ton tableau de bord en quelques secondes.</p>
          <form onSubmit={handleSubmit} className="home-form" noValidate>
            <div className="home-form-group">
              <label htmlFor="username" className="home-label">Email</label>
              <input
                type="email"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="home-input"
                autoComplete="email"
              />
            </div>
            <div className="home-form-group">
              <label htmlFor="password" className="home-label">Mot de passe</label>
              <div className="home-password-wrap">
                <input
                  type={showPwd ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="home-input home-password-input"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  onClick={() => setShowPwd(s => !s)}
                  title={showPwd ? 'Masquer' : 'Afficher'}
                  className="home-toggle-btn"
                >
                  {showPwd ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.458 12C3.732 7.943 7.523 5 12 5c1.246 0 2.442.196 3.556.56" />
                      <path d="M21.542 12c-.557 1.775-1.6 3.33-2.96 4.553" />
                      <path d="M14.121 14.121A3 3 0 0 1 9.88 9.88" />
                      <path d="M12 5c4.477 0 8.268 2.943 9.542 7-.38 1.212-1.005 2.33-1.818 3.287" />
                      <path d="M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.75 16.057 2.458 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {error && <p className="home-error">{error}</p>}
            <button type="submit" className="home-submit-btn">
              Connexion
            </button>
          </form>
        </div>
      )}
    </section>
  );
};

export default HomePage;