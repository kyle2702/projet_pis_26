/**
 * JobCard moderne avec design system mis à jour
 * Optimisé pour mobile avec React.memo
 */

import React, { useMemo } from 'react';
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

const JobCardComponent: React.FC<JobCardProps> = ({
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
  // Détection mobile pour désactiver les animations hover
  const isMobile = useMemo(() => {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  }, []);

  return (
    <div
      id={`job-${job.id}`}
      className="animate-fade-in"
      style={{
        border: isFocused ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)',
        padding: '0.5rem',
        background: 'var(--color-surface)',
        boxShadow: isFocused ? 'var(--shadow-xl)' : 'var(--shadow-md)',
        color: 'var(--color-text)',
        position: 'relative',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        width: '100%',
        minHeight: 220,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
      onMouseEnter={!isMobile ? (e) => {
        if (!isFocused) {
          e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
          e.currentTarget.style.transform = 'translateY(-4px)';
        }
      } : undefined}
      onMouseLeave={!isMobile ? (e) => {
        if (!isFocused) {
          e.currentTarget.style.boxShadow = 'var(--shadow-md)';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      } : undefined}
    >
      {/* Effet de gradient au survol */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: 'var(--primary-gradient)',
          opacity: isFocused ? 1 : 0,
          transition: 'opacity 0.3s ease'
        }}
      />
      
      {/* Header avec titre centré et boutons admin */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: isAdmin ? 'space-between' : 'center',
        marginBottom: '0.75rem',
        gap: '1rem'
      }}>
        {/* Spacer gauche pour équilibrer si admin */}
        {isAdmin && <div style={{ width: '76px', flexShrink: 0 }} />}
        
        <h3 style={{ 
          fontSize: '1.5rem', 
          fontWeight: 700, 
          color: 'var(--color-text)',
          textAlign: 'center',
          flex: isAdmin ? 1 : 'initial',
          margin: 0
        }}>
          {job.title}
        </h3>
        
        {/* Boutons admin à droite */}
        {isAdmin && (
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button
              title="Modifier"
              aria-label="Modifier"
              onClick={onEdit}
              style={{
                background: 'rgba(14, 165, 233, 0.1)',
                border: '1px solid rgba(14, 165, 233, 0.2)',
                borderRadius: 'var(--radius-md)',
                padding: 10,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '38px',
                height: '38px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(14, 165, 233, 0.2)';
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(14, 165, 233, 0.1)';
                e.currentTarget.style.transform = 'scale(1)';
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
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 'var(--radius-md)',
                padding: 10,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '38px',
                height: '38px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.style.transform = 'scale(1)';
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
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        )}
      </div>
      
      <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-light)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <span style={{ fontSize: '0.9rem' }}>
            {job['date-begin']} → {job['date-end']}
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-light)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <span style={{ fontSize: '0.9rem' }}>{job.adress}</span>
        </div>
      </div>
      
      <p style={{ 
        marginBottom: '1rem', 
        color: 'var(--color-text-light)', 
        lineHeight: 1.6,
        flex: 1,
        textAlign: 'center'
      }}>
        {job.description}
      </p>
      
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        marginTop: 'auto',
        paddingTop: '1rem',
        borderTop: '1px solid rgba(0, 0, 0, 0.06)',
        gap: '1rem'
      }}>
        {/* Prix et places */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
            borderRadius: 'var(--radius-lg)',
            color: 'white',
            fontSize: '0.9rem',
            fontWeight: 600,
            boxShadow: '0 2px 8px rgba(251, 191, 36, 0.3)',
            minWidth: 'fit-content'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <circle cx="12" cy="12" r="10" fill="currentColor"/>
              <text x="12" y="16" fontSize="12" fontWeight="bold" textAnchor="middle" fill="#f59e0b">€</text>
            </svg>
            {job.remuneration}
          </div>
          
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: placesRestantes > 0 ? 'rgba(102, 126, 234, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            borderRadius: 'var(--radius-lg)',
            color: placesRestantes > 0 ? 'var(--color-primary)' : '#ef4444',
            fontSize: '0.9rem',
            fontWeight: 600,
            minWidth: 'fit-content'
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            {placesRestantes}/{job.places} places
          </div>
        </div>
        
        {/* Bouton Postuler */}
        {!isAdmin && user && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={onApply}
              disabled={pending || applyLoading === job.id || placesRestantes === 0}
              style={{
                padding: '0.75rem 2rem',
                borderRadius: 'var(--radius-lg)',
                border: 'none',
                background: dejaPostule 
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : pending
                  ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
                  : placesRestantes === 0
                  ? '#e2e8f0'
                  : 'var(--primary-gradient)',
                color: placesRestantes === 0 ? '#94a3b8' : 'white',
                fontWeight: 600,
                cursor: (placesRestantes === 0 || pending || applyLoading === job.id) ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: placesRestantes === 0 ? 'none' : 'var(--shadow-md)',
                fontSize: '0.95rem',
                opacity: (applyLoading === job.id) ? 0.7 : 1,
                position: 'relative',
                overflow: 'hidden',
                width: '100%',
                maxWidth: '300px'
              }}
              onMouseEnter={(e) => {
                if (!pending && !applyLoading && placesRestantes > 0) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = placesRestantes === 0 ? 'none' : 'var(--shadow-md)';
              }}
            >
              {applyLoading === job.id ? (
                <>
                  <span style={{ 
                    display: 'inline-block',
                    animation: 'spin 1s linear infinite',
                    marginRight: '0.5rem'
                  }}>⏳</span>
                  Envoi...
                </>
              ) : dejaPostule ? (
                <>✓ Accepté</>
              ) : pending ? (
                <>
                  <span style={{ 
                    display: 'inline-block',
                    animation: 'pulse 2s ease-in-out infinite'
                  }}>⏳</span>
                  {' '}En attente
                </>
              ) : placesRestantes === 0 ? (
                'Complet'
              ) : (
                'Postuler'
              )}
            </button>
          </div>
        )}
      </div>
      
      {participants.length > 0 && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.85rem',
          color: 'var(--color-text-light)'
        }}>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: 'var(--color-text)' }}>
            👥 Participants :
          </div>
          {participants.map((p, i) => (
            <span key={i}>
              {p.displayName || p.email}{i < participants.length - 1 ? ', ' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// Mémoisation du composant pour éviter les re-renders inutiles
export const JobCard = React.memo(JobCardComponent, (prevProps, nextProps) => {
  // Re-render uniquement si ces props changent
  return (
    prevProps.job.id === nextProps.job.id &&
    prevProps.isFocused === nextProps.isFocused &&
    prevProps.placesRestantes === nextProps.placesRestantes &&
    prevProps.dejaPostule === nextProps.dejaPostule &&
    prevProps.pending === nextProps.pending &&
    prevProps.applyLoading === nextProps.applyLoading &&
    prevProps.participants.length === nextProps.participants.length &&
    prevProps.isAdmin === nextProps.isAdmin
  );
});
