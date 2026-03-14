import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { getFirestoreDb } from '../firebase/config';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

interface Team {
  id: string;
  name: string;
  score: number;
}

export default function QuizzPage() {
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    const db = getFirestoreDb();
    const teamsCollection = collection(db, 'quizz-teams');
    const q = query(teamsCollection, orderBy('score', 'desc'));

    // Observer pattern via Firestore listeners
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const teamsData: Team[] = [];
        snapshot.forEach((doc) => {
          teamsData.push({
            id: doc.id,
            ...doc.data(),
          } as Team);
        });
        setTeams(teamsData);
      },
      (err) => {
        console.error('Erreur lors de la récupération des équipes:', err);
      }
    );

    // Cleanup listener
    return () => unsubscribe();
  }, []);

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.2);
          }
        }
      `}</style>
      <div style={styles.header}>
        <h1 style={styles.title}>🏆 Classement Quizz 26</h1>
        <div style={styles.liveIndicator}>
          <span style={styles.pulseDot}></span>
          <span>En direct</span>
        </div>
      </div>

      {teams.length === 0 ? (
        <div style={styles.noTeams}>
          <p style={styles.noTeamsText}>Aucune équipe pour le moment</p>
          <p style={styles.hint}>Les équipes apparaîtront ici dès qu'elles seront créées</p>
        </div>
      ) : (
        <div style={styles.teamsRanking}>
          {teams.map((team, index) => (
            <div
              key={team.id}
              style={{
                ...styles.teamCard,
                ...(index === 0 ? styles.teamCardRank1 : {}),
                ...(index === 1 ? styles.teamCardRank2 : {}),
                ...(index === 2 ? styles.teamCardRank3 : {}),
              }}
            >
              <div style={styles.teamRank}>
                {index === 0 && '🥇'}
                {index === 1 && '🥈'}
                {index === 2 && '🥉'}
                {index > 2 && `#${index + 1}`}
              </div>
              <div style={styles.teamInfo}>
                <h3 style={styles.teamName}>{team.name}</h3>
              </div>
              <div style={{
                ...styles.teamScore,
                ...(index === 0 ? styles.teamScoreRank1 : {}),
              }}>
                {team.score}
                <span style={styles.pointsLabel}>pts</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: CSSProperties } = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '2rem',
  },
  header: {
    textAlign: 'center',
    marginBottom: '3rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
  },
  title: {
    color: 'white',
    fontSize: '3rem',
    margin: 0,
    fontWeight: 'bold',
    opacity: 1,
    background: 'none',
    WebkitTextFillColor: 'white',
    backgroundClip: 'unset',
    textShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)',
  },
  liveIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: 'rgba(255, 255, 255, 0.2)',
    padding: '0.5rem 1rem',
    borderRadius: '20px',
    color: 'white',
    fontWeight: 500,
  },
  pulseDot: {
    width: '10px',
    height: '10px',
    backgroundColor: '#10b981',
    borderRadius: '50%',
    animation: 'pulse 2s infinite',
  },
  noTeams: {
    textAlign: 'center',
    color: 'white',
    marginTop: '4rem',
  },
  noTeamsText: {
    fontSize: '1.5rem',
    margin: '1rem 0',
  },
  hint: {
    fontSize: '1rem',
    opacity: 0.8,
  },
  teamsRanking: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  teamCard: {
    background: 'white',
    borderRadius: '16px',
    padding: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
  },
  teamCardRank1: {
    background: 'linear-gradient(135deg, #ffd700 0%, #ffed4e 100%)',
    transform: 'scale(1.05)',
  },
  teamCardRank2: {
    background: 'linear-gradient(135deg, #c0c0c0 0%, #e8e8e8 100%)',
  },
  teamCardRank3: {
    background: 'linear-gradient(135deg, #cd7f32 0%, #e8a87c 100%)',
  },
  teamRank: {
    fontSize: '2.5rem',
    fontWeight: 'bold',
    minWidth: '60px',
    textAlign: 'center',
    color: '#1f2937',
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    margin: 0,
    fontSize: '1.8rem',
    color: '#1f2937',
  },
  teamScore: {
    fontSize: '3rem',
    fontWeight: 'bold',
    color: '#667eea',
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.5rem',
  },
  teamScoreRank1: {
    color: '#92400e',
  },
  pointsLabel: {
    fontSize: '1rem',
    color: '#6b7280',
    fontWeight: 'normal',
  },
};
