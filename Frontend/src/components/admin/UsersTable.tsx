/**
 * Composant pour afficher le tableau des utilisateurs avec tri
 */

import React from 'react';
import type { UserRow } from '../../types/admin.types';

interface UsersTableProps {
  users: UserRow[];
  sortBy: 'username' | 'totalHours' | null;
  sortOrder: 'asc' | 'desc';
  onSort: (key: 'username' | 'totalHours') => void;
  onEditHours: (userId: string, username: string, currentHours: number) => void;
}

export const UsersTable: React.FC<UsersTableProps> = ({
  users,
  sortBy,
  sortOrder,
  onSort,
  onEditHours
}) => {
  const styles: { [key: string]: React.CSSProperties } = {
    table: {
      width: '100%',
      maxWidth: '500px',
      borderCollapse: 'separate',
      borderSpacing: '0 0.5rem',
      margin: '2rem auto',
    },
    th: {
      background: 'var(--primary-gradient)',
      color: 'white',
      fontWeight: 600,
      padding: '1.25rem',
      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      userSelect: 'none',
      fontSize: '0.95rem',
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      boxShadow: 'var(--shadow-md)',
    },
    td: {
      padding: '1.25rem',
      color: 'var(--color-text)',
      textAlign: 'center',
      verticalAlign: 'middle',
      background: 'var(--color-surface)',
      fontSize: '1rem',
    }
  };

  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th
            style={{
              ...styles.th,
              background: sortBy === 'username' 
                ? 'linear-gradient(135deg, #5568d3 0%, #6b4fa0 100%)'
                : 'var(--primary-gradient)',
              borderTopLeftRadius: 'var(--radius-lg)',
              borderBottomLeftRadius: 'var(--radius-lg)',
            }}
            onClick={() => onSort('username')}
          >
            Totem {sortBy === 'username' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
          </th>
          <th
            style={{
              ...styles.th,
              background: sortBy === 'totalHours'
                ? 'linear-gradient(135deg, #5568d3 0%, #6b4fa0 100%)'
                : 'var(--primary-gradient)',
              borderTopRightRadius: 'var(--radius-lg)',
              borderBottomRightRadius: 'var(--radius-lg)',
            }}
            onClick={() => onSort('totalHours')}
          >
            Heures prestées {sortBy === 'totalHours' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
          </th>
        </tr>
      </thead>
      <tbody>
        {users.map((u, idx) => (
          <tr 
            key={u.id}
            className="animate-fade-in"
            style={{ 
              animationDelay: `${idx * 0.05}s`,
              opacity: 0,
              animation: 'fadeIn 0.5s ease-out forwards'
            }}
          >
            <td style={{
              ...styles.td,
              borderTopLeftRadius: 'var(--radius-md)',
              borderBottomLeftRadius: 'var(--radius-md)',
              fontWeight: 600,
              boxShadow: 'var(--shadow-sm)',
            }}>{u.username}</td>
            <td style={{
              ...styles.td,
              borderTopRightRadius: 'var(--radius-md)',
              borderBottomRightRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <span style={{
                  padding: '0.5rem 1rem',
                  background: 'var(--success-gradient)',
                  borderRadius: 'var(--radius-lg)',
                  color: 'white',
                  fontWeight: 600,
                  boxShadow: '0 2px 8px rgba(67, 233, 123, 0.3)'
                }}>{u.totalHours}h</span>
                <button
                  onClick={() => onEditHours(u.id, u.username, u.totalHours)}
                  style={{
                    border: 'none',
                    background: 'rgba(102, 126, 234, 0.1)',
                    cursor: 'pointer',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    borderRadius: 'var(--radius-md)',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(102, 126, 234, 0.2)';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  title="Modifier les heures"
                >
                  ✏️
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
