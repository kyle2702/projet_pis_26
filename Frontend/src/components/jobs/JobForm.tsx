import React from 'react';
import type { JobFormData } from '../../types/job.types';

interface JobFormProps {
  formData: JobFormData;
  error: string | null;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onChange: (field: keyof JobFormData, value: string | number) => void;
  onCancel: () => void;
}

export const JobForm: React.FC<JobFormProps> = ({
  formData,
  error,
  loading,
  onSubmit,
  onChange,
  onCancel
}) => {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.875rem 1.25rem',
    fontSize: '1rem',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    background: 'var(--color-surface)',
    transition: 'all 0.3s ease',
    fontFamily: 'inherit',
    color: 'var(--color-text)',
    boxSizing: 'border-box'
  };

  return (
    <>
      {/* Overlay de fond sombre */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          zIndex: 999,
          backdropFilter: 'blur(4px)'
        }}
        onClick={onCancel}
      />
      
      {/* Formulaire modal */}
      <form
        onSubmit={onSubmit}
        className="animate-scale-in"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          background: 'var(--color-surface)',
          border: 'none',
          borderRadius: 'var(--radius-xl)',
          padding: '2rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          width: '90%',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
      <div style={{ marginBottom: '0.5rem' }}>
        <h3 style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          marginBottom: '0.5rem',
          background: 'var(--primary-gradient)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          ✨ Créer un nouveau job
        </h3>
        <p style={{ color: 'var(--color-text-light)', fontSize: '0.9rem' }}>
          Remplissez tous les champs pour publier votre job
        </p>
      </div>

      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem', 
          fontWeight: 600,
          color: 'var(--color-text)',
          fontSize: '0.9rem'
        }}>
          📋 Titre du job
        </label>
        <input
          style={inputStyle}
          type="text"
          placeholder="Ex: Aide déménagement"
          value={formData.title}
          onChange={e => onChange('title', e.target.value)}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.1)'}
          required
        />
      </div>

      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem', 
          fontWeight: 600,
          color: 'var(--color-text)',
          fontSize: '0.9rem'
        }}>
          🕐 Début
        </label>
        <input
          style={inputStyle}
          type="datetime-local"
          value={formData['date-begin']}
          onChange={e => onChange('date-begin', e.target.value)}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.1)'}
          required
        />
      </div>

      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem', 
          fontWeight: 600,
          color: 'var(--color-text)',
          fontSize: '0.9rem'
        }}>
          🕑 Fin
        </label>
        <input
          style={inputStyle}
          type="datetime-local"
          value={formData['date-end']}
          onChange={e => onChange('date-end', e.target.value)}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.1)'}
          required
        />
      </div>

      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem', 
          fontWeight: 600,
          color: 'var(--color-text)',
          fontSize: '0.9rem'
        }}>
          📍 Adresse
        </label>
        <input
          style={inputStyle}
          type="text"
          placeholder="Ex: 123 rue de la Paix, Paris"
          value={formData.adress}
          onChange={e => onChange('adress', e.target.value)}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.1)'}
          required
        />
      </div>

      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem', 
          fontWeight: 600,
          color: 'var(--color-text)',
          fontSize: '0.9rem'
        }}>
          📝 Description
        </label>
        <textarea
          style={{
            ...inputStyle,
            minHeight: '120px',
            resize: 'vertical'
          }}
          placeholder="Décrivez le job en détail..."
          value={formData.description}
          onChange={e => onChange('description', e.target.value)}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.1)'}
          required
        />
      </div>

      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem', 
          fontWeight: 600,
          color: 'var(--color-text)',
          fontSize: '0.9rem'
        }}>
          💰 Rémunération
        </label>
        <input
          style={inputStyle}
          type="text"
          placeholder="Ex: 8€/h ou 300€"
          value={formData.remuneration}
          onChange={e => onChange('remuneration', e.target.value)}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.1)'}
          required
        />
      </div>

      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem', 
          fontWeight: 600,
          color: 'var(--color-text)',
          fontSize: '0.9rem'
        }}>
          👥 Places
        </label>
        <input
          style={inputStyle}
          type="number"
          min={1}
          placeholder="1"
          value={formData.places}
          onChange={e => onChange('places', Number(e.target.value))}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.1)'}
          required
        />
      </div>

      {error && (
        <div style={{ 
          color: 'var(--color-danger)', 
          background: 'rgba(245, 87, 108, 0.1)',
          padding: '0.875rem 1.25rem',
          borderRadius: 'var(--radius-lg)',
          fontSize: '0.9rem',
          fontWeight: 500,
          border: '2px solid rgba(245, 87, 108, 0.2)',
          animation: 'shake 0.4s ease-in-out'
        }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.875rem', marginTop: '0.5rem' }}>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary"
          style={{
            flex: 1,
            background: loading ? '#999' : 'var(--primary-gradient)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem 1.75rem',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: loading ? 'none' : 'var(--shadow-md)',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = loading ? 'none' : 'var(--shadow-md)';
          }}
        >
          {loading ? '⏳ Création...' : '✅ Valider'}
        </button>
        <button
          type="button"
          disabled={loading}
          style={{
            flex: 1,
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '2px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem 1.75rem',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: loading ? 0.5 : 1
          }}
          onClick={onCancel}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.borderColor = 'var(--color-primary)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.2)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          ❌ Annuler
        </button>
      </div>
      </form>
    </>
  );
};
