/**
 * Composant modal pour modifier les heures d'un utilisateur
 */

import React from 'react';
import type { EditHoursModal as EditHoursModalType } from '../../types/admin.types';

interface EditHoursModalProps {
  modal: EditHoursModalType;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onChange: (newHours: number) => void;
}

export const EditHoursModal: React.FC<EditHoursModalProps> = ({
  modal,
  loading,
  onClose,
  onConfirm,
  onChange
}) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '450px',
        width: '100%',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: '#dc2626', fontSize: '1.3rem' }}>
          ⚠️ Confirmation de modification
        </h3>
        
        <p style={{ marginBottom: '1rem', color: '#333', fontSize: '1rem', lineHeight: '1.6' }}>
          Attention, êtes-vous sûr de vouloir enregistrer la modification ?
        </p>
        
        <div style={{
          backgroundColor: '#f3f4f6',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem'
        }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <strong style={{ color: '#646cff' }}>Personne :</strong>
            <span style={{ marginLeft: '0.5rem', color: '#333' }}>{modal.username}</span>
          </div>
          
          <div style={{ marginBottom: '0.75rem' }}>
            <strong style={{ color: '#646cff' }}>Heures actuelles :</strong>
            <span style={{ marginLeft: '0.5rem', color: '#333', fontSize: '1.1rem', fontWeight: '600' }}>
              {modal.currentHours}h
            </span>
          </div>
          
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ color: '#646cff' }}>Nouvelles heures :</strong>
            <span style={{ marginLeft: '0.5rem', color: '#16a34a', fontSize: '1.1rem', fontWeight: '600' }}>
              {modal.newHours}h
            </span>
          </div>
          
          <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: '0.75rem' }}>
            <strong style={{ color: '#646cff' }}>Différence :</strong>
            <span style={{
              marginLeft: '0.5rem',
              color: modal.newHours > modal.currentHours ? '#16a34a' : '#dc2626',
              fontSize: '1.1rem',
              fontWeight: '700'
            }}>
              {modal.newHours > modal.currentHours ? '+' : ''}
              {(modal.newHours - modal.currentHours).toFixed(2)}h
            </span>
          </div>
        </div>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#333' }}>
            Modifier le nombre d'heures :
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={modal.newHours}
            onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1.1rem',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontWeight: '600',
              textAlign: 'center'
            }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: '2px solid #e5e7eb',
              backgroundColor: 'white',
              color: '#6b7280',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#16a34a',
              color: 'white',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'Enregistrement...' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
};
