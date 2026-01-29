import React from 'react';
import type { Participant, User } from '../../types/job.types';
import { ComboSearch } from '../ui/ComboSearch';

interface ParticipantsModalProps {
  isOpen: boolean;
  jobId: string;
  participants: Participant[];
  allUsers: User[];
  replaceSelection: Record<string, string>;
  onClose: () => void;
  onRemove: (userId: string) => void;
  onReplace: (oldUserId: string, newUserId: string) => void;
  onAdd: (newUserId: string) => void;
  onReplaceSelectionChange: (key: string, value: string) => void;
}

export const ParticipantsModal: React.FC<ParticipantsModalProps> = ({
  isOpen,
  jobId,
  participants,
  allUsers,
  replaceSelection,
  onClose,
  onRemove,
  onReplace,
  onAdd,
  onReplaceSelectionChange
}) => {
  if (!isOpen) return null;

  const existingIds = new Set(participants.map(p => p.userId));
  const availableUsers = allUsers.filter(u => !existingIds.has(u.uid));

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 10050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          color: '#222',
          borderRadius: 12,
          padding: '0.8rem 0.9rem',
          width: 'min(340px, 92vw)',
          height: 420,
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Participants</h2>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, color: '#222' }}>Participants acceptés</div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              overflowY: 'auto',
              paddingRight: 2
            }}
          >
            {participants.map(p => {
              const key = `${jobId}:${p.userId}`;
              const replaceOptions = [...availableUsers, { uid: p.userId, displayName: p.displayName, email: p.email }].map(u => ({
                value: u.uid,
                label: (u.displayName || u.email || u.uid) as string
              }));

              return (
                <div
                  key={key}
                  style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, alignItems: 'stretch' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{p.displayName || p.email || p.userId}</div>
                    <div style={{ color: '#555', fontSize: '.9rem' }}>{p.email}</div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      title="Retirer"
                      aria-label="Retirer le participant"
                      onClick={() => onRemove(p.userId)}
                      style={{
                        background: '#fff',
                        border: '1px solid #ddd',
                        borderRadius: 8,
                        padding: 6,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center'
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

                    <div style={{ flex: '1 1 220px', minWidth: 180 }}>
                      <ComboSearch
                        value={replaceSelection[key] || ''}
                        onChange={(v) => onReplaceSelectionChange(key, v)}
                        options={replaceOptions}
                        placeholder="Remplacer par…"
                        maxItems={5}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const newUid = replaceSelection[key];
                        if (newUid) onReplace(p.userId, newUid);
                      }}
                      style={{
                        background: '#0ea5e9',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '0.45rem 0.7rem',
                        cursor: 'pointer'
                      }}
                    >
                      Appliquer
                    </button>
                  </div>
                </div>
              );
            })}

            {participants.length === 0 && (
              <div style={{ color: '#666' }}>Aucun participant pour l'instant.</div>
            )}
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px dashed #eee' }}>
            <div style={{ fontWeight: 700, color: '#222', marginBottom: 8 }}>
              Ajouter un participant
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px', minWidth: 180 }}>
                <ComboSearch
                  value={replaceSelection[`${jobId}:__new__`] || ''}
                  onChange={(v) => onReplaceSelectionChange(`${jobId}:__new__`, v)}
                  options={availableUsers.map(u => ({
                    value: u.uid,
                    label: (u.displayName || u.email || u.uid) as string
                  }))}
                  placeholder="Choisir un utilisateur…"
                  maxItems={5}
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  const newUid = replaceSelection[`${jobId}:__new__`];
                  if (newUid) onAdd(newUid);
                }}
                style={{
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.45rem 0.9rem',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
