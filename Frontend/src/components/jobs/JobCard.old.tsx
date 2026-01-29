import React from 'react';
import type { Job } from '../../types/job.types';

interface JobCardProps {
  job: Job;
  isAdmin: boolean;
  isFocused: boolean;
  placesRestantes: number;
  user: { uid: string; email: string | null; displayName: string | null } | null;
  dejaPostule: boolean;
  pending: boolean;
  applyLoading: string | null;
  participants: Array<{ displayName?: string; email?: string; userId: string }>;
  onEdit: () => void;
  onDelete: () => void;
  onApply: () => void;
}

export const JobCard: React.FC<JobCardProps> = ({
  job,
  isAdmin,
  isFocused,
  placesRestantes,
  user,
  dejaPostule,
  pending,
  applyLoading,
  participants,
  onEdit,
  onDelete,
  onApply
}) => {
  return (
    <div
      id={`job-${job.id}`}
      style={{
        border: isFocused ? '2px solid #646cff' : '1px solid #bbb',
        borderRadius: 10,
        padding: '1.5rem',
        background: isFocused ? '#f0f2ff' : '#fff',
        boxShadow: '0 2px 8px rgba(100,108,255,0.07)',
        color: '#222',
        position: 'relative',
        transition: 'background .4s, border-color .4s',
        width: '100%',
        minHeight: 220,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {isAdmin && (
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8 }}>
          <button
            title="Modifier"
            aria-label="Modifier"
            onClick={onEdit}
            style={{
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: 8,
              padding: 6,
              cursor: 'pointer'
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0ea5e9"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
          <button
            title="Supprimer"
            aria-label="Supprimer"
            onClick={onDelete}
            style={{
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: 8,
              padding: 6,
              cursor: 'pointer'
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      )}

      <h2 style={{ margin: 0, color: '#222', fontWeight: 700 }}>
        {job.title && job.title.trim() ? job.title : 'Sans titre'}
      </h2>

      <div style={{ color: '#646cff', fontWeight: 600, marginBottom: 8 }}>
        {job['date-begin']} — {job['date-end']}
      </div>

      <div
        style={{
          marginBottom: 8,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        <span style={{ fontWeight: 600, color: '#222' }}>Adresse :</span> {job.adress}
      </div>

      <div
        style={{
          marginBottom: 8,
          lineHeight: '1.4em',
          maxHeight: '4.2em',
          overflow: 'hidden'
        }}
      >
        <span style={{ fontWeight: 600, color: '#222' }}>Description :</span> {job.description}
      </div>

      <div style={{ marginBottom: 8 }}>
        <span style={{ fontWeight: 600, color: '#222' }}>Rémunération :</span> {job.remuneration}
      </div>

      <div style={{ marginBottom: 8 }}>
        <span style={{ fontWeight: 600, color: '#222' }}>Places restantes :</span>{' '}
        {placesRestantes}/{job.places}
      </div>

      {!user && (
        <div style={{ color: '#888', fontWeight: 500, marginTop: 8, fontStyle: 'italic' }}>
          Connectez-vous pour postuler à ce job
        </div>
      )}

      {user && !isAdmin && !dejaPostule && !pending && placesRestantes > 0 && (
        <button
          style={{
            background: '#646cff',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '0.7rem 1.5rem',
            fontSize: '1rem',
            cursor: 'pointer',
            marginTop: 'auto'
          }}
          disabled={applyLoading === job.id}
          onClick={onApply}
        >
          Postuler
        </button>
      )}

      {user && dejaPostule && (
        <div style={{ color: '#2e7d32', fontWeight: 700, marginTop: 8 }}>
          Candidature acceptée
        </div>
      )}

      {user && !dejaPostule && pending && (
        <div style={{ color: '#ff8f00', fontWeight: 600, marginTop: 8 }}>
          Votre demande est en attente
        </div>
      )}

      {placesRestantes === 0 && (
        <div style={{ color: '#c62828', fontWeight: 600, marginTop: 8 }}>Complet</div>
      )}

      {isAdmin && participants.length > 0 && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 8,
            borderTop: '1px solid #eee',
            color: '#222',
            fontWeight: 500,
            fontSize: '.95rem'
          }}
        >
          <span style={{ color: '#646cff', fontWeight: 700 }}>Participants :</span>{' '}
          {participants.map(p => p.displayName || p.email || p.userId).join(', ')}
        </div>
      )}
    </div>
  );
};
