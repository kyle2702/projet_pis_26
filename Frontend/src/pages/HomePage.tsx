import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const HomePage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const { user: loggedInUser, logout, isLoading, token, loginWithEmail, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await loginWithEmail(username, password);
      navigate('/hours', { state: { showWelcome: true } });
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
      width: '100%',
      maxWidth: '400px',
      padding: '2rem',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      backgroundColor: '#fdfdfd',
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.05)',
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
  };

  // Afficher un message de chargement pendant la vérification de l'authentification
  if (isLoading) {
    return <div style={styles.container}><p>Loading...</p></div>;
  }

  return (
    <div style={styles.container}>
      {token ? (
        // Vue si l'utilisateur est connecté
        <div>
          <h1>Welcome, {loggedInUser?.displayName || loggedInUser?.email}</h1>
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
      <h1>Home Page</h1>
          <form onSubmit={handleSubmit} style={styles.loginForm}>
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
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={styles.input}
              />
            </div>
            {error && <p style={styles.errorMessage}>{error}</p>}
            <button 
              type="submit" 
              style={{ ...styles.button, ...styles.loginButton }}
            >
              Login
            </button>
            <button
              type="button"
              onClick={async () => {
                setError('');
                try {
                  await loginWithGoogle();
                  navigate('/hours', { state: { showWelcome: true } });
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Erreur Google Sign-In');
                }
              }}
              style={{ ...styles.button, backgroundColor: '#34a853' }}
            >
              Se connecter avec Google
            </button>
          </form>
        </>
      )}
    </div>
  );
};

export default HomePage;