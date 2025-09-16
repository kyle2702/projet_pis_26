import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

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

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: '2rem',
      textAlign: 'center',
    },
    loginForm: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      width: 'fit-content',
      minWidth: '280px',
      maxWidth: '90vw',
      padding: '2rem',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      backgroundColor: '#fdfdfd',
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.05)',
      alignItems: 'center',
      margin: '0 auto'
    },
    formGroup: {
      display: 'flex',
      flexDirection: 'column',
      textAlign: 'left',
    },
    label: {
      marginBottom: '0.5rem',
      fontWeight: 'bold',
      color: '#333',
    },
    input: {
      padding: '0.75rem',
      border: '1px solid #ccc',
      borderRadius: '4px',
      fontSize: '1rem',
  width: '280px',
  boxSizing: 'border-box'
    },
    button: {
      padding: '0.75rem',
      border: 'none',
      borderRadius: '4px',
      color: 'white',
      fontSize: '1rem',
      fontWeight: 'bold',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
    },
    loginButton: {
      backgroundColor: '#646cff',
    },
    logoutButton: {
      backgroundColor: '#d9534f',
      marginTop: '1rem',
    },
    errorMessage: {
      color: '#d9534f',
      textAlign: 'center',
      marginTop: 0,
      marginBottom: '1rem',
    },
    passwordWrapper: { position: 'relative', width: 'fit-content', minWidth: '280px', maxWidth: '90vw' },
    toggleBtn: {
      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
      background: 'transparent', border: 'none', cursor: 'pointer', color: '#555',
      padding: 4, fontSize: '.9rem'
    }
  };

  // Afficher un message de chargement pendant la vérification de l'authentification
  if (isLoading) {
    return <div style={styles.container}><p>Loading...</p></div>;
  }

  return (
    <div style={styles.container} className="max-w-screen-sm w-full mx-auto px-4 sm:px-6">
      {token ? (
        // Vue si l'utilisateur est connecté
        <div>
          <h1>Bienvenue, {firestoreName || loggedInUser?.displayName || 'Utilisateur'}</h1>
          
          <button 
            onClick={handleLogout} 
            style={{ ...styles.button, ...styles.logoutButton }}
          >
            Logout
          </button>
        </div>
      ) : (
        // Vue si l'utilisateur n'est pas connecté (formulaire)
        <>
      <h1>Connexion</h1>
          <form onSubmit={handleSubmit} style={styles.loginForm} className="w-full">
            <div style={styles.formGroup}>
        <label htmlFor="username" style={styles.label}>Email</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label htmlFor="password" style={styles.label}>Password</label>
              <div style={styles.passwordWrapper}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ ...styles.input, paddingRight: 40 }}
                />
                <button
                  type="button"
                  aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  onClick={() => setShowPwd(s => !s)}
                  style={styles.toggleBtn}
                  title={showPwd ? 'Masquer' : 'Afficher'}
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
            {error && <p style={styles.errorMessage}>{error}</p>}
            <button 
              type="submit" 
              style={{ ...styles.button, ...styles.loginButton }}
            >
              Connexion
            </button>
          
          </form>
        </>
      )}
    </div>
  );
};

export default HomePage;