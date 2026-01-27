import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { getFirestoreDb } from '../firebase/config';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
} from 'firebase/firestore';

interface Team {
  id: string;
  name: string;
  score: number;
}

export default function PointsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [tempScore, setTempScore] = useState<number>(0);

  useEffect(() => {
    // Vérifier si déjà authentifié dans la session
    const authenticated = sessionStorage.getItem('points-auth') === 'true';
    setIsAuthenticated(authenticated);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

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

    return () => unsubscribe();
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'Azara') {
      setIsAuthenticated(true);
      sessionStorage.setItem('points-auth', 'true');
      setError('');
    } else {
      setError('Mot de passe incorrect');
    }
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    if (teams.length >= 22) {
      alert('Maximum 22 équipes atteint');
      return;
    }

    // Vérifier si le nom existe déjà (insensible à la casse)
    const nameExists = teams.some(
      team => team.name.toLowerCase() === newTeamName.trim().toLowerCase()
    );
    if (nameExists) {
      alert('Une équipe avec ce nom existe déjà');
      return;
    }

    setIsAdding(true);
    try {
      const db = getFirestoreDb();
      await addDoc(collection(db, 'quizz-teams'), {
        name: newTeamName.trim(),
        score: 0,
      });
      setNewTeamName('');
      setShowAddForm(false);
    } catch (err) {
      console.error('Erreur lors de l\'ajout de l\'équipe:', err);
      alert('Erreur lors de l\'ajout de l\'équipe');
    } finally {
      setIsAdding(false);
    }
  };

  const handleSelectTeam = (teamId: string, currentScore: number) => {
    setSelectedTeamId(teamId);
    setTempScore(currentScore);
  };

  const handleCancelEdit = () => {
    setSelectedTeamId(null);
    setTempScore(0);
  };

  const handleValidateScore = async () => {
    if (!selectedTeamId) return;
    
    try {
      const db = getFirestoreDb();
      const teamRef = doc(db, 'quizz-teams', selectedTeamId);
      await updateDoc(teamRef, { score: tempScore });
      setSelectedTeamId(null);
      setTempScore(0);
    } catch (err) {
      console.error('Erreur lors de la mise à jour du score:', err);
      alert('Erreur lors de la mise à jour du score');
    }
  };


  const handleDeleteTeam = async (teamId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette équipe ?')) return;

    try {
      const db = getFirestoreDb();
      await deleteDoc(doc(db, 'quizz-teams', teamId));
    } catch (err) {
      console.error('Erreur lors de la suppression de l\'équipe:', err);
      alert('Erreur lors de la suppression de l\'équipe');
    }
  };

  if (!isAuthenticated) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <h1>🔒 Accès Protégé</h1>
          <p>Cette page nécessite un mot de passe</p>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              style={styles.passwordInput}
              autoFocus
            />
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" style={styles.loginBtn}>
              Accéder
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>⚙️ Gestion des Points</h1>
        <div style={styles.teamsCount}>
          {teams.length} / 22 équipes
        </div>
      </div>

      <div style={styles.addTeamSection}>
        {!showAddForm ? (
          <button
            style={{
              ...styles.addTeamBtn,
              ...(teams.length >= 22 ? styles.btnDisabled : {})
            }}
            onClick={() => setShowAddForm(true)}
            disabled={teams.length >= 22}
          >
            ➕ Ajouter une équipe
          </button>
        ) : (
          <form onSubmit={handleAddTeam} style={styles.addTeamForm}>
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Nom de l'équipe"
              style={{
                ...styles.teamNameInput,
                ...(isAdding ? styles.inputDisabled : {})
              }}
              maxLength={50}
              disabled={isAdding}
              autoFocus
            />
            <button
              type="submit"
              style={{
                ...styles.addTeamBtnSmall,
                ...(isAdding || !newTeamName.trim() ? styles.btnDisabled : {})
              }}
              disabled={isAdding || !newTeamName.trim()}
            >
              {isAdding ? '...' : '✓'}
            </button>
            <button
              type="button"
              style={styles.cancelBtn}
              onClick={() => {
                setShowAddForm(false);
                setNewTeamName('');
              }}
            >
              ✕
            </button>
          </form>
        )}
      </div>

      {teams.length === 0 ? (
        <div style={styles.noTeams}>
          <p style={styles.noTeamsText}>Aucune équipe créée</p>
          <p style={styles.hint}>Ajoutez votre première équipe ci-dessus</p>
        </div>
      ) : (
        <div style={styles.teamsList}>
          {teams.map((team, index) => {
            const isSelected = selectedTeamId === team.id;
            const displayScore = isSelected ? tempScore : team.score;
            
            return (
              <div 
                key={team.id} 
                style={{
                  ...styles.teamItem,
                  ...(isSelected ? styles.teamItemSelected : {}),
                }}
                onClick={() => !isSelected && handleSelectTeam(team.id, team.score)}
              >
                <div style={styles.teamPosition}>#{index + 1}</div>
                <div style={styles.teamDetails}>
                  <h3 style={styles.teamNameHeader}>{team.name}</h3>
                  <div style={styles.teamScore}>{displayScore} pts</div>
                </div>
                {!isSelected ? (
                  <div style={styles.selectHint}>Cliquer pour modifier</div>
                ) : (
                  <div style={styles.teamControls}>
                    <div style={styles.scoreControls}>
                      <button
                        style={styles.scoreBtnDecrease}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTempScore(Math.max(0, tempScore - 1));
                        }}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        value={tempScore}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setTempScore(Math.max(0, val));
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={styles.scoreInput}
                      />
                      <button
                        style={styles.scoreBtnIncrease}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTempScore(tempScore + 1);
                        }}
                      >
                        +
                      </button>
                    </div>
                    <button
                      style={styles.validateBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleValidateScore();
                      }}
                      title="Valider les changements"
                    >
                      ✓
                    </button>
                    <button
                      style={styles.cancelEditBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelEdit();
                      }}
                      title="Annuler"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {isSelected && (
                  <button
                    style={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTeam(team.id);
                    }}
                    title="Supprimer l'équipe"
                  >
                    🗑️
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: CSSProperties } = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    padding: '2rem',
  },
  header: {
    textAlign: 'center',
    marginBottom: '2rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
  },
  title: {
    color: 'white',
    fontSize: '2.5rem',
    margin: 0,
    textShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)',
  },
  teamsCount: {
    background: 'rgba(255, 255, 255, 0.2)',
    padding: '0.5rem 1rem',
    borderRadius: '20px',
    color: 'white',
    fontWeight: 600,
  },
  addTeamSection: {
    maxWidth: '600px',
    margin: '0 auto 2rem',
    background: 'white',
    padding: '1.5rem',
    borderRadius: '16px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  addTeamForm: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
  },
  teamNameInput: {
    flex: 1,
    padding: '0.75rem 1rem',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '1rem',
    transition: 'border-color 0.3s',
  },
  inputDisabled: {
    backgroundColor: '#f3f4f6',
    cursor: 'not-allowed',
  },
  addTeamBtn: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    whiteSpace: 'nowrap',
    width: '100%',
  },
  addTeamBtnSmall: {
    width: '40px',
    height: '40px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1.2rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    width: '40px',
    height: '40px',
    background: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1.2rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
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
  teamsList: {
    maxWidth: '900px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  teamItem: {
    background: 'white',
    borderRadius: '12px',
    padding: '1.25rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    transition: 'transform 0.2s, box-shadow 0.2s',
    cursor: 'pointer',
  },
  teamItemSelected: {
    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
    boxShadow: '0 4px 12px rgba(245, 87, 108, 0.3)',
    transform: 'scale(1.02)',
    cursor: 'default',
  },
  teamPosition: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#6b7280',
    minWidth: '50px',
    textAlign: 'center',
  },
  teamDetails: {
    flex: 1,
  },
  teamNameHeader: {
    margin: 0,
    fontSize: '1.3rem',
    color: '#1f2937',
  },
  teamScore: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#f5576c',
    marginTop: '0.25rem',
  },
  selectHint: {
    marginLeft: 'auto',
    color: '#9ca3af',
    fontSize: '0.875rem',
    fontStyle: 'italic',
  },
  teamControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  scoreControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#f3f4f6',
    padding: '0.5rem',
    borderRadius: '8px',
  },
  scoreBtnDecrease: {
    width: '36px',
    height: '36px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fee2e2',
    color: '#dc2626',
  },
  scoreBtnIncrease: {
    width: '36px',
    height: '36px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#dcfce7',
    color: '#16a34a',
  },
  scoreInput: {
    width: '70px',
    padding: '0.5rem',
    border: '2px solid #e5e7eb',
    borderRadius: '6px',
    textAlign: 'center',
    fontSize: '1.2rem',
    fontWeight: 600,
    color: '#1f2937',
    backgroundColor: '#ffffff',
  },
  deleteBtn: {
    width: '40px',
    height: '40px',
    border: 'none',
    background: '#fee2e2',
    borderRadius: '8px',
    fontSize: '1.2rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  validateBtn: {
    width: '40px',
    height: '40px',
    border: 'none',
    background: '#dcfce7',
    color: '#16a34a',
    borderRadius: '8px',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelEditBtn: {
    width: '40px',
    height: '40px',
    border: 'none',
    background: '#fee2e2',
    color: '#dc2626',
    borderRadius: '8px',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    padding: '2rem',
  },
  loginCard: {
    background: 'white',
    borderRadius: '16px',
    padding: '3rem',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    maxWidth: '400px',
    width: '100%',
    textAlign: 'center',
    color: '#1f2937',
  },
  passwordInput: {
    padding: '1rem',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '1rem',
    width: '100%',
    boxSizing: 'border-box',
    marginBottom: '1rem',
  },
  error: {
    color: '#ef4444',
    margin: '0 0 1rem 0',
    fontSize: '0.875rem',
  },
  loginBtn: {
    padding: '1rem',
    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
};
