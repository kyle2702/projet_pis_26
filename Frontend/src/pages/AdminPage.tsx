import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAdmin } from '../hooks/useAdmin';
import { UsersTable } from '../components/admin/UsersTable';
import { ApplicationsTable } from '../components/admin/ApplicationsTable';
import { EditHoursModal } from '../components/admin/EditHoursModal';
import { TestNotification } from '../components/admin/TestNotification';
import type { EditHoursModal as EditHoursModalType } from '../types/admin.types';

const AdminPage: React.FC = () => {
  const { user, token, isLoading } = useAuth();
  
  const {
    users,
    usersLoading,
    usersError,
    sortBy,
    sortOrder,
    handleSort,
    updateUserHours,
    applications,
    applicationsLoading,
    applicationsError,
    updateApplicationStatus,
    sendTestNotification
  } = useAdmin(user?.uid, token, isLoading);
  
  // États pour la modification des heures
  const [editHoursModal, setEditHoursModal] = useState<EditHoursModalType | null>(null);
  const [editHoursLoading, setEditHoursLoading] = useState(false);
  
  // Ouvrir le modal de modification des heures
  const handleOpenEditHours = (userId: string, username: string, currentHours: number) => {
    setEditHoursModal({
      userId,
      username,
      currentHours,
      newHours: currentHours
    });
  };

  // Annuler la modification
  const handleCancelEditHours = () => {
    setEditHoursModal(null);
  };

  // Valider la modification des heures
  const handleConfirmEditHours = async () => {
    if (!editHoursModal) return;
    
    setEditHoursLoading(true);
    try {
      await updateUserHours(editHoursModal.userId, editHoursModal.newHours);
      setEditHoursModal(null);
      setEditHoursLoading(false);
    } catch (e) {
      console.error('Erreur lors de la mise à jour des heures:', e);
      alert('Erreur lors de la mise à jour des heures');
      setEditHoursLoading(false);
    }
  };

  // Gérer le changement des heures dans le modal
  const handleEditHoursChange = (newHours: number) => {
    if (editHoursModal) {
      setEditHoursModal({ ...editHoursModal, newHours });
    }
  };

  // Gérer les candidatures
  const handleAppStatus = async (id: string, status: 'accepted' | 'refused') => {
    try {
      await updateApplicationStatus(id, status);
    } catch {
      alert('Erreur lors de la mise à jour du statut.');
    }
  };

  if (isLoading || usersLoading) return <div>Chargement...</div>;
  if (usersError) return <div>{usersError}</div>;

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: '2rem',
      textAlign: 'center',
    },
    h2: {
      marginBottom: '2rem',
      color: '#646cff',
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.h2}>Utilisateurs et heures prestées</h2>
      
      <UsersTable
        users={users}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onEditHours={handleOpenEditHours}
      />

      {editHoursModal && (
        <EditHoursModal
          modal={editHoursModal}
          loading={editHoursLoading}
          onClose={handleCancelEditHours}
          onConfirm={handleConfirmEditHours}
          onChange={handleEditHoursChange}
        />
      )}

      <TestNotification onSend={sendTestNotification} />

      <h2 style={{...styles.h2, marginTop: 60}}>Demandes de candidature</h2>
      <ApplicationsTable
        applications={applications}
        loading={applicationsLoading}
        error={applicationsError}
        onUpdateStatus={handleAppStatus}
      />
    </div>
  );
};

export default AdminPage;
