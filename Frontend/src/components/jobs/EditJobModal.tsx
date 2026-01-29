import React from 'react';
import type { JobFormData } from '../../types/job.types';

interface EditJobModalProps {
  isOpen: boolean;
  formData: JobFormData;
  error: string | null;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onChange: (field: keyof JobFormData, value: string | number) => void;
  onClose: () => void;
  onOpenParticipants: () => void;
  isAdmin: boolean;
}

export const EditJobModal: React.FC<EditJobModalProps> = ({
  isOpen,
  formData,
  error,
  loading,
  onSubmit,
  onChange,
  onClose,
  onOpenParticipants,
  isAdmin
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        style={{
          background: '#fff',
          color: '#222',
          borderRadius: 12,
          padding: '1rem 1.25rem',
          width: 'min(340px, 92vw)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Modifier le job</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#f0f0f0',
              color: '#222',
              border: '1px solid #ddd',
              borderRadius: 8,
              padding: '0.25rem 0.55rem',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Titre</span>
            <input
              type="text"
              value={formData.title}
              onChange={e => onChange('title', e.target.value)}
              required
              style={{
                padding: '0.5rem 0.6rem',
                borderRadius: 8,
                border: '1px solid #ddd'
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Début</span>
            <input
              type="datetime-local"
              value={formData['date-begin']}
              onChange={e => onChange('date-begin', e.target.value)}
              required
              style={{
                padding: '0.5rem 0.6rem',
                borderRadius: 8,
                border: '1px solid #ddd'
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Fin</span>
            <input
              type="datetime-local"
              value={formData['date-end']}
              onChange={e => onChange('date-end', e.target.value)}
              required
              style={{
                padding: '0.5rem 0.6rem',
                borderRadius: 8,
                border: '1px solid #ddd'
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Adresse</span>
            <input
              type="text"
              value={formData.adress}
              onChange={e => onChange('adress', e.target.value)}
              required
              style={{
                padding: '0.5rem 0.6rem',
                borderRadius: 8,
                border: '1px solid #ddd'
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Description</span>
            <textarea
              value={formData.description}
              onChange={e => onChange('description', e.target.value)}
              required
              style={{
                padding: '0.5rem 0.6rem',
                borderRadius: 8,
                border: '1px solid #ddd'
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Rémunération</span>
            <input
              type="text"
              value={formData.remuneration}
              onChange={e => onChange('remuneration', e.target.value)}
              required
              style={{
                padding: '0.5rem 0.6rem',
                borderRadius: 8,
                border: '1px solid #ddd'
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Places</span>
            <input
              type="number"
              min={1}
              value={formData.places}
              onChange={e => onChange('places', Number(e.target.value))}
              required
              style={{
                padding: '0.5rem 0.6rem',
                borderRadius: 8,
                border: '1px solid #ddd'
              }}
            />
          </label>

          {isAdmin && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                onClick={onOpenParticipants}
                style={{
                  background: '#111827',
                  color: '#e5e7eb',
                  border: '1px solid #374151',
                  borderRadius: 8,
                  padding: '0.45rem 0.9rem',
                  cursor: 'pointer'
                }}
              >
                Participants...
              </button>
            </div>
          )}
        </div>

        {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#eee',
              color: '#222',
              border: '1px solid #ddd',
              borderRadius: 8,
              padding: '0.45rem 0.9rem',
              cursor: 'pointer'
            }}
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              background: '#0ea5e9',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '0.45rem 0.9rem',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
};
