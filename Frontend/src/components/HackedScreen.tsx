import React, { useState, useEffect, useRef } from 'react';

interface HackedScreenProps {
  onUnlock: () => void;
}

const attemptsKey = 'hackedAttemptsLeft';
const maxAttempts = 10;
// Date cible : 29 novembre 2025 à 23h59
const targetDate = new Date('2025-11-29T23:59:00').getTime();

const HackedScreen: React.FC<HackedScreenProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Animation states
  const [unlockingStep, setUnlockingStep] = useState<'none' | 'code' | 'progress' | 'granted'>('none');
  const [codeLines, setCodeLines] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

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

  // Animation Effect
  useEffect(() => {
    if (unlockingStep === 'code') {
        const fakeCode = [
            "Initializing recovery protocols...",
            "Bypassing firewall security...",
            "Decrypting user data...",
            "Restoring system integrity...",
            "Cleaning infected files...",
            "Rebooting core services...",
            "Establishing secure connection...",
            "Verifying admin privileges...",
            "System check: OK",
            "Patching vulnerabilities..."
        ];
        let lineIndex = 0;
        const interval = setInterval(() => {
            if (lineIndex < fakeCode.length) {
                setCodeLines(prev => [...prev, fakeCode[lineIndex]]);
                lineIndex++;
            } else {
                clearInterval(interval);
                setTimeout(() => setUnlockingStep('progress'), 500);
            }
        }, 150);
        return () => clearInterval(interval);
    } else if (unlockingStep === 'progress') {
        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    setTimeout(() => setUnlockingStep('granted'), 500);
                    return 100;
                }
                return prev + 1;
            });
        }, 30);
        return () => clearInterval(interval);
    } else if (unlockingStep === 'granted') {
        const timeout = setTimeout(() => {
            onUnlock();
        }, 10000);
        return () => clearTimeout(timeout);
    }
  }, [unlockingStep, onUnlock]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (attemptsLeft <= 0) return;

    if (password === 'Tr@H1$0N!') {
      localStorage.removeItem(attemptsKey); // Réinitialise les essais en cas de succès
      setUnlockingStep('code'); // Démarre l'animation
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

  if (unlockingStep !== 'none') {
      return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'black',
            color: 'lime',
            fontFamily: 'monospace',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000,
            padding: '20px',
            boxSizing: 'border-box'
        }}>
            {unlockingStep === 'code' && (
                <div style={{ width: '100%', maxWidth: '600px', textAlign: 'left' }}>
                    {codeLines.map((line, i) => (
                        <div key={i} style={{ marginBottom: '5px', textShadow: '0 0 5px lime' }}>
                            {`> ${line}`}
                        </div>
                    ))}
                    <div style={{ animation: 'blink 1s infinite' }}>_</div>
                </div>
            )}
            {unlockingStep === 'progress' && (
                <div style={{ width: '100%', maxWidth: '500px', textAlign: 'center' }}>
                    <div style={{ marginBottom: '15px', fontSize: '1.2rem' }}>RESTORING SYSTEM DATA...</div>
                    <div style={{ 
                        width: '100%', 
                        height: '30px', 
                        border: '2px solid lime', 
                        padding: '2px',
                        boxShadow: '0 0 10px lime'
                    }}>
                        <div style={{ 
                            width: `${progress}%`, 
                            height: '100%', 
                            backgroundColor: 'lime',
                            transition: 'width 0.03s linear'
                        }}></div>
                    </div>
                    <div style={{ marginTop: '10px' }}>{progress}%</div>
                </div>
            )}
            {unlockingStep === 'granted' && (
                <div style={{ textAlign: 'center', animation: 'pulse 0.5s infinite alternate' }}>
                    <img src="/giphy.gif" alt="Success" style={{ maxWidth: '300px', height: 'auto', marginBottom: '20px' }} />
                    <h1 style={{ 
                        fontSize: 'clamp(3rem, 8vw, 6rem)', 
                        border: '5px solid lime', 
                        padding: '20px',
                        textShadow: '0 0 20px lime',
                        boxShadow: '0 0 30px lime, inset 0 0 30px lime'
                    }}>
                        ACCESS GRANTED
                    </h1>
                </div>
            )}
            <style>{`
                @keyframes blink { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } }
                @keyframes pulse { from { transform: scale(1); opacity: 0.8; } to { transform: scale(1.05); opacity: 1; } }
            `}</style>
        </div>
      );
  }

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
