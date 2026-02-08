/**
 * Hook personnalisé pour gérer les fonctionnalités admin
 */

import { useState, useEffect } from 'react';
import { adminService } from '../api/admin.service';
import type { UserRow, JobApplication } from '../types/admin.types';

export const useAdmin = (userId?: string, token?: string | null, isLoading?: boolean) => {
  // États pour les utilisateurs
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  
  // États pour les candidatures
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  
  // États pour le tri des utilisateurs
  const [sortBy, setSortBy] = useState<'username' | 'totalHours' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  /**
   * Charge les utilisateurs et calcule leurs heures
   */
  useEffect(() => {
    if (isLoading || !userId) return;
    
    (async () => {
      try {
        // Vérifier les droits admin
        const isAdmin = await adminService.isUserAdmin(userId);
        if (!isAdmin) throw new Error('Accès interdit');
        
        // Calculer les heures
        const rows = await adminService.calculateUserHours();
        setUsers(rows);
        setUsersLoading(false);
      } catch (e) {
        setUsersError(e instanceof Error ? e.message : 'Erreur inconnue');
        setUsersLoading(false);
      }
    })();
  }, [userId, isLoading]);

  /**
   * Charge les candidatures en attente
   */
  useEffect(() => {
    if (isLoading) return;
    
    setApplicationsLoading(true);
    const fetchApplications = async () => {
      try {
        const apps = await adminService.getPendingApplications();
        setApplications(apps);
        setApplicationsLoading(false);
      } catch {
        setApplicationsError('Erreur lors du chargement des candidatures');
        setApplicationsLoading(false);
      }
    };
    
    fetchApplications();
  }, [isLoading]);

  /**
   * Met à jour le statut d'une candidature (OPTIMISÉ avec UI optimiste)
   */
  const updateApplicationStatus = async (id: string, status: 'accepted' | 'refused') => {
    // UI optimiste : retirer immédiatement de la liste
    const applicationToUpdate = applications.find(app => app.id === id);
    setApplications(apps => apps.filter(app => app.id !== id));

    try {
      await adminService.updateApplicationStatus(id, status, async (jobData) => {
        // Notification en arrière-plan (sans bloquer)
        adminService.sendApplicationAcceptedNotification({
          jobId: jobData.jobId,
          jobTitle: jobData.jobTitle,
          applicantId: jobData.userId,
          applicantName: jobData.displayName
        }).catch(err => {
          console.warn('Notification failed (ignored):', err);
        });
      });
    } catch {
      // Rollback en cas d'erreur
      if (applicationToUpdate) {
        setApplications(apps => [...apps, applicationToUpdate]);
      }
      throw new Error('Erreur lors de la mise à jour du statut.');
    }
  };

  /**
   * Met à jour les heures d'un utilisateur
   */
  const updateUserHours = async (userId: string, hours: number) => {
    await adminService.updateUserHours(userId, hours);
    
    // Mettre à jour l'état local
    setUsers(prevUsers =>
      prevUsers.map(u =>
        u.id === userId ? { ...u, totalHours: hours } : u
      )
    );
  };

  /**
   * Envoie une notification de test
   */
  const sendTestNotification = async (title: string, body: string) => {
    if (!userId) throw new Error('Utilisateur non authentifié');
    return await adminService.sendTestNotification(userId, title, body, token ?? undefined);
  };

  /**
   * Trie les utilisateurs
   */
  const sortedUsers = [...users];
  if (sortBy) {
    sortedUsers.sort((a, b) => {
      if (sortBy === 'username') {
        if (a.username < b.username) return sortOrder === 'asc' ? -1 : 1;
        if (a.username > b.username) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      } else {
        return sortOrder === 'asc'
          ? a.totalHours - b.totalHours
          : b.totalHours - a.totalHours;
      }
    });
  }

  /**
   * Gère le tri
   */
  const handleSort = (key: 'username' | 'totalHours') => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('asc');
    }
  };

  return {
    // Utilisateurs
    users: sortedUsers,
    usersLoading,
    usersError,
    sortBy,
    sortOrder,
    handleSort,
    updateUserHours,
    
    // Candidatures
    applications,
    applicationsLoading,
    applicationsError,
    updateApplicationStatus,
    
    // Notifications
    sendTestNotification
  };
};
