/**
 * Skeleton loader pour les JobCards pendant le chargement
 * Version optimisée pour mobile
 */

import React from 'react';

export const JobCardSkeleton: React.FC = () => {
  return (
    <div
      className="job-card-skeleton"
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)',
        padding: '1.75rem',
        background: 'var(--color-surface)',
        width: '100%',
        minHeight: 220,
        animation: 'pulse 1.5s ease-in-out infinite'
      }}
    >
      {/* Titre */}
      <div style={{
        height: '2rem',
        background: 'linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        borderRadius: 'var(--radius-md)',
        marginBottom: '1rem',
        width: '70%',
        margin: '0 auto 1rem'
      }} />

      {/* Dates et adresse */}
      <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{
          height: '1rem',
          background: 'linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          borderRadius: 'var(--radius-sm)',
          width: '80%'
        }} />
        <div style={{
          height: '1rem',
          background: 'linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          borderRadius: 'var(--radius-sm)',
          width: '60%'
        }} />
      </div>

      {/* Description */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{
          height: '0.8rem',
          background: 'linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          borderRadius: 'var(--radius-sm)',
          width: '100%',
          marginBottom: '0.5rem'
        }} />
        <div style={{
          height: '0.8rem',
          background: 'linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          borderRadius: 'var(--radius-sm)',
          width: '90%',
          marginBottom: '0.5rem'
        }} />
        <div style={{
          height: '0.8rem',
          background: 'linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          borderRadius: 'var(--radius-sm)',
          width: '75%'
        }} />
      </div>

      {/* Footer avec badges */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 'auto',
        paddingTop: '1rem',
        borderTop: '1px solid rgba(0, 0, 0, 0.06)'
      }}>
        <div style={{
          height: '2.5rem',
          width: '45%',
          background: 'linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          borderRadius: 'var(--radius-lg)'
        }} />
        <div style={{
          height: '2.5rem',
          width: '45%',
          background: 'linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          borderRadius: 'var(--radius-lg)'
        }} />
      </div>
    </div>
  );
};

// Container pour plusieurs skeletons
export const JobCardSkeletonList: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
      alignItems: 'center',
      width: '100%'
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <JobCardSkeleton key={i} />
      ))}
    </div>
  );
};
