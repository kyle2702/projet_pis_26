import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';


interface HourEntry {
  id: string;
  title: string;
  date: string;
  hours: number;
}

const HourPage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [entries, setEntries] = useState<HourEntry[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [showWelcome, setShowWelcome] = useState(!!location.state?.showWelcome);

  useEffect(() => {
    const fetchHours = async () => {
      if (!user) return;
      try {
        const response = await fetch('http://localhost:3000/hours/me/hours', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username: user.username }),
        });
        if (!response.ok) throw new Error('Erreur lors de la récupération des heures');
        const result = await response.json();
        setEntries(result.entries || []);
        setTotalHours(result.total || 0);
      } catch (error) {
        console.error(error);
      }
    };
    fetchHours();
    // Affiche le popup de bienvenue pendant 2 secondes
    if (showWelcome) {
      const timer = setTimeout(() => setShowWelcome(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [user, showWelcome]);

  if (!user) {
    return <div>Veuillez vous connecter pour voir vos heures.</div>;
  }

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: '2rem',
      textAlign: 'center',
    },
    total: {
      fontSize: '1.2rem',
      marginBottom: '1.5rem',
    },
    table: {
      width: '100%',
      maxWidth: '500px',
      borderCollapse: 'collapse',
      margin: '0 auto',
      backgroundColor: '#fdfdfd',
      boxShadow: '0 4px 8px rgba(0,0,0,0.05)',
      borderRadius: '8px',
      overflow: 'hidden',
    },
    th: {
      backgroundColor: '#646cff',
      color: 'white',
      padding: '0.75rem',
      fontWeight: 'bold',
    },
    td: {
      padding: '0.75rem',
      borderBottom: '1px solid #e0e0e0',
    },
    tr: {
      backgroundColor: '#fff',
      color: '#222',
    },
  };

  return (
    <div style={styles.container}>
      {showWelcome && user && (
        <div style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: '#646cff',
          color: 'white',
          padding: '2rem 3rem',
          borderRadius: '16px',
          fontSize: '1.5rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          zIndex: 2000,
        }}>
          Bienvenue, <strong>{user.username}</strong>
        </div>
      )}
      <h1>Mes heures prestées</h1>
      <div style={styles.total}>Total: <strong>{totalHours}</strong> heures</div>
      <table style={styles.table}>
        <thead>
          <tr style={styles.tr}>
            <th style={styles.th}>Titre</th>
            <th style={styles.th}>Date</th>
            <th style={styles.th}>Heures</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr key={entry.id} style={styles.tr}>
              <td style={styles.td}>{entry.title}</td>
              <td style={styles.td}>{entry.date}</td>
              <td style={styles.td}>{entry.hours}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default HourPage;
