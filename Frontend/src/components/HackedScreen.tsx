import React, { useState, useEffect, useRef } from 'react';

interface HackedScreenProps {
  onUnlock: () => void;
}

const attemptsKey = 'hackedAttemptsLeft';
const maxAttempts = 30;
// Date cible : 30 novembre 2025 à 11h00
const targetDate = new Date('2025-11-30T11:00:00').getTime();

const HackedScreen: React.FC<HackedScreenProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const getInitialAttempts = () => {
    const savedAttempts = localStorage.getItem(attemptsKey);
    // Si la valeur est 0, on la garde, sinon on met maxAttempts par défaut
    return savedAttempts !== null ? parseInt(savedAttempts, 10) : maxAttempts;
  };

  const [attemptsLeft, setAttemptsLeft] = useState(getInitialAttempts());

  const getInitialTimeLeft = () => {
    const now = Date.now();
    const difference = targetDate - now;
    return difference > 0 ? Math.round(difference / 1000) : 0;
  };

  const [timeLeft, setTimeLeft] = useState(getInitialTimeLeft());

  const startTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const difference = targetDate - now;
      if (difference <= 0) {
        setTimeLeft(0);
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setTimeLeft(Math.round(difference / 1000));
      }
    }, 1000);
  };

  useEffect(() => {
    // On ne démarre le timer que s'il reste du temps et des essais
    if (timeLeft > 0 && attemptsLeft > 0) {
        startTimer();
    } else {
        setTimeLeft(0); // S'il n'y a plus d'essais, on arrête le temps
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Exécuté une seule fois au montage

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (attemptsLeft <= 0) return;

    if (password === 'Tr@Hi$oN!') {
      localStorage.removeItem(attemptsKey); // Réinitialise les essais en cas de succès
      onUnlock();
    } else {
      const newAttempts = attemptsLeft - 1;
      setAttemptsLeft(newAttempts);
      localStorage.setItem(attemptsKey, newAttempts.toString());
      setError(true);
      setPassword('');
      if (newAttempts <= 0) {
        setTimeLeft(0); // Arrête le timer visuellement
        if(timerRef.current) clearInterval(timerRef.current); // Arrête le timer en arrière-plan
      }
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundImage: `url('/hacked.gif')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
      color: 'lime',
      fontFamily: 'monospace',
    }}>
      <div style={{
        fontSize: 'clamp(2rem, 10vw, 5rem)',
        textShadow: '0 0 10px lime, 0 0 20px lime',
        marginBottom: '5px'
      }}>
        {formatTime(timeLeft)}
      </div>
      <p style={{ 
        fontSize: 'clamp(0.8rem, 2.5vw, 1rem)', 
        marginBottom: '20px', 
        textShadow: '0 0 5px lime',
        textAlign: 'center'
      }}>
        Time remaining until complete deletion of your data
      </p>
      <div style={{
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        padding: '30px',
        borderRadius: '10px',
        textAlign: 'center',
        border: '2px solid lime',
        boxShadow: '0 0 25px lime, 0 0 10px white inset',
        maxWidth: '90%',
        width: '400px'
      }}>
        <img src="/skull.gif" alt="Crâne" style={{ width: '120px', height: 'auto', marginBottom: '0px' }} />
        <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', marginBottom: '20px', textShadow: '0 0 5px lime' }}>
          You have been hacked!
        </h1>
        <p style={{ marginBottom: '25px', fontSize: 'clamp(0.9rem, 3vw, 1rem)' }}>
            To regain access, please enter the password.
            But be careful, you only have a limited number of attempts.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(false);
            }}
            placeholder="password"
            disabled={attemptsLeft <= 0}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '15px',
              backgroundColor: '#111',
              border: `1px solid ${error ? 'red' : 'lime'}`,
              borderRadius: '5px',
              color: 'lime',
              textAlign: 'center',
              outline: 'none',
              boxSizing: 'border-box',
              cursor: attemptsLeft <= 0 ? 'not-allowed' : 'text',
              opacity: attemptsLeft <= 0 ? 0.5 : 1
            }}
          />
          <button
            type="submit"
            disabled={attemptsLeft <= 0}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#0a3d0a',
              border: '1px solid lime',
              borderRadius: '5px',
              color: 'lime',
              cursor: attemptsLeft <= 0 ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              transition: 'background-color 0.3s, box-shadow 0.3s',
              opacity: attemptsLeft <= 0 ? 0.5 : 1
            }}
            onMouseOver={(e) => {
                if (attemptsLeft > 0) {
                    e.currentTarget.style.backgroundColor = '#1e5e1e';
                    e.currentTarget.style.boxShadow = '0 0 15px lime';
                }
            }}
            onMouseOut={(e) => {
                if (attemptsLeft > 0) {
                    e.currentTarget.style.backgroundColor = '#0a3d0a';
                    e.currentTarget.style.boxShadow = 'none';
                }
            }}
          >
            Submit
          </button>
          {error && attemptsLeft > 0 && (
            <p style={{ color: 'red', marginTop: '10px', textShadow: '0 0 5px red' }}>
              Access denied. {attemptsLeft} {attemptsLeft > 1 ? 'tries' : 'try'} left.
            </p>
          )}
          {attemptsLeft <= 0 && (
            <p style={{ color: 'red', marginTop: '10px', textShadow: '0 0 5px red' }}>
              No more attempts left. System locked.
            </p>
          )}
        </form>
      </div>
    </div>
  );
};

export default HackedScreen;
