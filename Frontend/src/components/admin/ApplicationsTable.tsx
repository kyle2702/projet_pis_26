/**
 * Composant pour afficher le tableau des candidatures en attente
 */

import React from 'react';
import type { JobApplication } from '../../types/admin.types';

interface ApplicationsTableProps {
  applications: JobApplication[];
  loading: boolean;
  error: string | null;
  onUpdateStatus: (id: string, status: 'accepted' | 'refused') => void;
}

export const ApplicationsTable: React.FC<ApplicationsTableProps> = ({
  applications,
  loading,
  error,
  onUpdateStatus
}) => {
  const styles: { [key: string]: React.CSSProperties } = {
    scrollBox: {
      maxHeight: '320px',
      overflowY: 'auto',
      width: '100%',
      maxWidth: '360px',
      margin: '0 auto',
      borderRadius: '8px',
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.05)'
    },
    table: {
      width: '100%',
      maxWidth: '360px',
      borderCollapse: 'collapse',
      margin: 0,
      backgroundColor: '#fdfdfd',
      boxShadow: 'none',
      borderRadius: '8px',
      overflow: 'hidden',
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
      verticalAlign: 'middle',
    },
    actionCell: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 6,
    },
    iconBtn: {
      border: 'none',
      borderRadius: 6,
      width: 32,
      height: 32,
      minWidth: 32,
      minHeight: 32,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      color: 'white',
      fontWeight: 700,
      fontSize: 16,
      lineHeight: 1,
    }
  };

  if (loading) return <div>Chargement des candidatures...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div style={styles.scrollBox}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.thInactive}>Job</th>
            <th style={styles.thInactive}>Utilisateur</th>
            <th style={styles.thInactive}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {applications.length === 0 && (
            <tr><td colSpan={3} style={styles.td}>Aucune demande en attente</td></tr>
          )}
          {applications.map(app => (
            <tr key={app.id}>
              <td style={styles.td}>{app.jobTitle}</td>
              <td style={styles.td}>{app.displayName}</td>
              <td style={{ ...styles.td, ...styles.actionCell }}>
                <button
                  title="Accepter"
                  aria-label="Accepter"
                  style={{ ...styles.iconBtn, background: '#2e7d32' }}
                  onClick={() => onUpdateStatus(app.id, 'accepted')}
                >
                  ✓
                </button>
                <button
                  title="Refuser"
                  aria-label="Refuser"
                  style={{ ...styles.iconBtn, background: '#c62828' }}
                  onClick={() => onUpdateStatus(app.id, 'refused')}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
