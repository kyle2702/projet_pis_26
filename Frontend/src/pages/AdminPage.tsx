import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface User {
  id: number;
  username: string;
  totalHours: number;
}

const AdminPage: React.FC = () => {
  const { user, token, isLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [sortBy, setSortBy] = useState<'username' | 'totalHours' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.id !== 1) {
      setError('Accès interdit');
      setLoading(false);
      return;
    }
    fetch('http://localhost:3000/users/admin/users', {
      headers: {
        'x-user-id': user.id?.toString() ?? '',
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Erreur serveur');
        return res.json();
      })
      .then((data) => {
        setUsers(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [user, token, isLoading]);

  if (isLoading || loading) return <div>Chargement...</div>;
  if (error) return <div>{error}</div>;

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: '2rem',
      textAlign: 'center',
    },
    table: {
      width: '100%',
      maxWidth: '600px',
      borderCollapse: 'collapse',
      margin: '2rem auto',
      backgroundColor: '#fdfdfd',
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.05)',
      borderRadius: '8px',
      overflow: 'hidden',
    },
    th: {
      backgroundColor: '#646cff',
      color: 'white',
      fontWeight: 'bold',
      padding: '1rem',
      borderBottom: '1px solid #e0e0e0',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
      userSelect: 'none',
    },
    thInactive: {
      backgroundColor: '#646cff',
      color: 'white',
      fontWeight: 'bold',
      padding: '1rem',
      borderBottom: '1px solid #e0e0e0',
      cursor: 'default',
      userSelect: 'none',
    },
    td: {
      padding: '1rem',
      borderBottom: '1px solid #e0e0e0',
      color: '#333',
      textAlign: 'center',
    },
    h2: {
      marginBottom: '2rem',
      color: '#646cff',
    },
  };

  // Tri des utilisateurs
  const sortedUsers = [...users];
  if (sortBy) {
    sortedUsers.sort((a, b) => {
      if (sortBy === 'username') {
        if (a.username < b.username) return sortOrder === 'asc' ? -1 : 1;
        if (a.username > b.username) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      } else {
        return sortOrder === 'asc'
          ? a.totalHours - b.totalHours
          : b.totalHours - a.totalHours;
      }
    });
  }

  // Gestion du clic sur les entêtes pour trier
  const handleSort = (key: 'username' | 'totalHours') => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('asc');
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.h2}>Utilisateurs et heures prestées</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.thInactive}>ID</th>
            <th
              style={{
                ...styles.th,
                backgroundColor: sortBy === 'username' ? '#4b53c3' : styles.th.backgroundColor,
                textDecoration: 'underline',
              }}
              onClick={() => handleSort('username')}
            >
              Nom d'utilisateur {sortBy === 'username' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th
              style={{
                ...styles.th,
                backgroundColor: sortBy === 'totalHours' ? '#4b53c3' : styles.th.backgroundColor,
                textDecoration: 'underline',
              }}
              onClick={() => handleSort('totalHours')}
            >
              Heures prestées {sortBy === 'totalHours' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedUsers.map((u) => (
            <tr key={u.id}>
              <td style={styles.td}>{u.id}</td>
              <td style={styles.td}>{u.username}</td>
              <td style={styles.td}>{u.totalHours}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminPage;
