import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useJobs } from '../hooks/useJobs';
import type { JobFormData } from '../types/job.types';
import { JobCard } from '../components/jobs/JobCard';
import { JobForm } from '../components/jobs/JobForm';
import { EditJobModal } from '../components/jobs/EditJobModal';
import { ParticipantsModal } from '../components/jobs/ParticipantsModal';


const JobsPage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Hook personnalisé pour la gestion des jobs
  const {
    jobs,
    loading,
    error: fetchError,
    isAdmin,
    adminReady,
    applications,
    userApplications,
    userPendingApps,
    jobParticipants,
    allUsers,
    createJob,
    updateJob,
    deleteJob,
    applyToJob,
    removeParticipant,
    addParticipant,
    replaceParticipant
  } = useJobs();

  const [focusJobId, setFocusJobId] = useState<string | null>(null);
  
  // États pour la création de job
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<JobFormData>({
    title: '',
    'date-begin': '',
    'date-end': '',
    adress: '',
    description: '',
    remuneration: '',
    places: 1,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  
  // États pour l'édition de job
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<JobFormData>({
    title: '',
    'date-begin': '',
    'date-end': '',
    adress: '',
    description: '',
    remuneration: '',
    places: 1,
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  
  // États pour les participants
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [participantBusy, setParticipantBusy] = useState<string | null>(null);
  const [replaceSelection, setReplaceSelection] = useState<Record<string, string>>({});
  
  // États pour la postulation
  const [applyLoading, setApplyLoading] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);


  // Extraire jobId depuis query string pour highlight
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const jid = params.get('jobId');
    if (jid) {
      setFocusJobId(jid);
      setTimeout(() => {
        const el = document.getElementById(`job-${jid}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 250);
    } else {
      setFocusJobId(null);
    }
  }, [location.search]);

  // Handlers pour la création de job
  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    try {
      await createJob(form);
      setShowForm(false);
      setForm({
        title: '',
        'date-begin': '',
        'date-end': '',
        adress: '',
        description: '',
        remuneration: '',
        places: 1
      });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erreur lors de l\'ajout du job.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleFormChange = (field: keyof JobFormData, value: string | number) => {
    setForm(f => ({ ...f, [field]: value }));
  };

  // Handlers pour l'édition de job
  const handleEditJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    setEditError(null);
    setEditLoading(true);

    try {
      await updateJob(editingId, editForm);
      setEditOpen(false);
      setEditingId(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Mise à jour impossible.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleEditFormChange = (field: keyof JobFormData, value: string | number) => {
    setEditForm(f => ({ ...f, [field]: value }));
  };

  const handleOpenEdit = (jobId: string, jobData: JobFormData) => {
    setEditingId(jobId);
    setEditForm(jobData);
    setEditError(null);
    setEditOpen(true);
  };

  // Handlers pour la suppression
  const handleDeleteJob = async (jobId: string) => {
    if (deleteLoadingId) return;
    const ok = window.confirm('Supprimer définitivement ce job ?');
    if (!ok) return;

    try {
      setDeleteLoadingId(jobId);
      await deleteJob(jobId);
    } catch (e) {
      alert('Suppression impossible.');
      console.error(e);
    } finally {
      setDeleteLoadingId(null);
    }
  };

  // Handlers pour la postulation (OPTIMISÉ)
  const handleApplyToJob = async (jobId: string, jobTitle: string) => {
    setApplyLoading(jobId);
    try {
      await applyToJob(jobId, jobTitle);
      // Le feedback visuel est géré par l'UI optimiste via userPendingApps
    } catch (e) {
      alert('Erreur lors de la postulation.');
      console.error(e);
    } finally {
      setApplyLoading(null);
    }
  };

  // Handlers pour les participants
  const handleRemoveParticipant = async (jobId: string, userId: string) => {
    if (participantBusy) return;
    const ok = window.confirm('Retirer ce participant du job ?');
    if (!ok) return;

    const key = `${jobId}:${userId}`;
    try {
      setParticipantBusy(key);
      await removeParticipant(jobId, userId);
    } catch (e) {
      alert('Suppression impossible.');
      console.error(e);
    } finally {
      setParticipantBusy(null);
    }
  };

  const handleReplaceParticipant = async (jobId: string, oldUserId: string, newUserId: string) => {
    if (!newUserId) {
      alert('Choisissez un utilisateur.');
      return;
    }
    if (participantBusy) return;

    const key = `${jobId}:${oldUserId}`;
    try {
      setParticipantBusy(key);
      await replaceParticipant(jobId, oldUserId, newUserId);
      setReplaceSelection(prev => ({ ...prev, [key]: '' }));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Remplacement impossible.');
      console.error(e);
    } finally {
      setParticipantBusy(null);
    }
  };

  const handleAddParticipant = async (jobId: string, newUserId: string) => {
    if (!newUserId) {
      alert('Choisissez un utilisateur.');
      return;
    }
    if (participantBusy) return;

    try {
      setParticipantBusy(`${jobId}:__new__`);
      await addParticipant(jobId, newUserId);
      setReplaceSelection(prev => ({ ...prev, [`${jobId}:__new__`]: '' }));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ajout impossible.');
      console.error(e);
    } finally {
      setParticipantBusy(null);
    }
  };


  // Pendant la détermination du rôle, on garde la page en chargement
  if (!adminReady) {
    return (
      <div
        style={{ maxWidth: 400, margin: '2rem auto', padding: '1rem' }}
        className="max-w-screen-sm w-full mx-auto px-4 sm:px-6"
      >
        <h1>Jobs disponibles</h1>
        <div>Chargement...</div>
      </div>
    );
  }

  const now = Date.now();
  const upcomingJobs = jobs.filter(j => (j.dateBeginSort ?? Number.POSITIVE_INFINITY) >= now);

  return (
    <div
      style={{ maxWidth: 340, margin: '2rem auto', padding: '1rem' }}
      className="max-w-screen-sm w-full mx-auto px-4 sm:px-6"
    >
      <h1>Jobs disponibles</h1>

      {/* Boutons admin */}
      {isAdmin && !showForm && (
        <button
          style={{
            marginBottom: 24,
            background: '#646cff',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '0.7rem 1.5rem',
            fontSize: '1rem',
            cursor: 'pointer'
          }}
          onClick={() => setShowForm(true)}
        >
          Ajouter un job
        </button>
      )}
      {isAdmin && (
        <button
          style={{
            marginLeft: 12,
            marginBottom: 24,
            background: '#888',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '0.7rem 1.2rem',
            fontSize: '0.95rem',
            cursor: 'pointer'
          }}
          onClick={() => navigate('/history')}
        >
          Historique
        </button>
      )}

      {/* Formulaire de création */}
      {isAdmin && showForm && (
        <JobForm
          formData={form}
          error={formError}
          loading={formLoading}
          onSubmit={handleCreateJob}
          onChange={handleFormChange}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Messages d'erreur/chargement */}
      {fetchError && <div style={{ color: 'red', marginBottom: 16 }}>{fetchError}</div>}

      {loading ? (
        <div>Chargement...</div>
      ) : (
        <>
          {upcomingJobs.length === 0 && !isAdmin ? (
            <div>Aucun job disponible.</div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                alignItems: 'center',
                width: '100%'
              }}
            >
              {upcomingJobs.map(job => {
                const participants = isAdmin ? (jobParticipants[job.id] || []) : [];
                const nbApplications = applications[job.id] || 0;
                const placesRestantes = Math.max(0, job.places - nbApplications);
                const dejaPostule = userApplications[job.id];
                const pending = userPendingApps[job.id];

                return (
                  <JobCard
                    key={job.id}
                    job={job}
                    isAdmin={isAdmin}
                    isFocused={focusJobId === job.id}
                    placesRestantes={placesRestantes}
                    user={user}
                    dejaPostule={dejaPostule}
                    pending={pending}
                    applyLoading={applyLoading}
                    participants={participants}
                    onEdit={() =>
                      handleOpenEdit(job.id, {
                        title: job.title,
                        'date-begin': job.dateBeginInput || '',
                        'date-end': job.dateEndInput || '',
                        adress: job.adress,
                        description: job.description,
                        remuneration: job.remuneration,
                        places: job.places
                      })
                    }
                    onDelete={() => handleDeleteJob(job.id)}
                    onApply={() => handleApplyToJob(job.id, job.title)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal d'édition */}
      <EditJobModal
        isOpen={editOpen}
        formData={editForm}
        error={editError}
        loading={editLoading}
        onSubmit={handleEditJob}
        onChange={handleEditFormChange}
        onClose={() => setEditOpen(false)}
        onOpenParticipants={() => setParticipantsOpen(true)}
        isAdmin={isAdmin}
      />

      {/* Modal des participants */}
      {editingId && (
        <ParticipantsModal
          isOpen={participantsOpen}
          jobId={editingId}
          participants={jobParticipants[editingId] || []}
          allUsers={allUsers}
          replaceSelection={replaceSelection}
          onClose={() => setParticipantsOpen(false)}
          onRemove={(userId) => handleRemoveParticipant(editingId, userId)}
          onReplace={(oldUserId, newUserId) =>
            handleReplaceParticipant(editingId, oldUserId, newUserId)
          }
          onAdd={(newUserId) => handleAddParticipant(editingId, newUserId)}
          onReplaceSelectionChange={(key, value) =>
            setReplaceSelection(prev => ({ ...prev, [key]: value }))
          }
        />
      )}
    </div>
  );
};

export default JobsPage;
