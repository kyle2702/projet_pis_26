/* eslint-disable no-useless-catch */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { jobsService } from '../api/jobs.service';
import type {
  Job,
  JobFormData,
  JobParticipants,
  User
} from '../types/job.types';

interface UseJobsReturn {
  jobs: Job[];
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  adminReady: boolean;
  applications: Record<string, number>;
  userApplications: Record<string, boolean>;
  userPendingApps: Record<string, boolean>;
  jobParticipants: JobParticipants;
  allUsers: User[];
  createJob: (formData: JobFormData) => Promise<void>;
  updateJob: (jobId: string, formData: JobFormData) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  applyToJob: (jobId: string, jobTitle: string) => Promise<void>;
  removeParticipant: (jobId: string, userId: string) => Promise<void>;
  addParticipant: (jobId: string, userId: string) => Promise<void>;
  replaceParticipant: (jobId: string, oldUserId: string, newUserId: string) => Promise<void>;
  refreshJobs: () => Promise<void>;
}

/**
 * Hook personnalisé pour la gestion des jobs
 */
export const useJobs = (): UseJobsReturn => {
  const { user, isLoading: authLoading, isAdmin: ctxIsAdmin, rolesReady } = useAuth();
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminReady, setAdminReady] = useState(false);
  const [applications, setApplications] = useState<Record<string, number>>({});
  const [userApplications, setUserApplications] = useState<Record<string, boolean>>({});
  const [userPendingApps, setUserPendingApps] = useState<Record<string, boolean>>({});
  const [jobParticipants, setJobParticipants] = useState<JobParticipants>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Synchroniser l'état admin avec le contexte
  useEffect(() => {
    if (authLoading || !rolesReady) return;
    setIsAdmin(!!ctxIsAdmin);
    setAdminReady(true);
  }, [ctxIsAdmin, rolesReady, authLoading]);

  // Charger tous les utilisateurs (admin uniquement)
  useEffect(() => {
    if (!adminReady || !isAdmin) return;

    (async () => {
      try {
        const users = await jobsService.getAllUsers();
        setAllUsers(users);
      } catch (e) {
        console.warn('Chargement des utilisateurs impossible (admin):', e);
      }
    })();
  }, [adminReady, isAdmin]);

  // Souscription temps réel aux jobs et leurs dépendances
  useEffect(() => {
    if (!adminReady) return;
    setLoading(true);

    const unsubs: Array<() => void> = [];

    // Écouter les jobs
    const jobsUnsub = jobsService.subscribeToJobs(
      async (jobsList) => {
        setJobs(jobsList);

        // Pour chaque job, écouter les candidatures
        for (const job of jobsList) {
          const appsUnsub = jobsService.subscribeToApplications(
            job.id,
            (count, participants) => {
              setApplications(prev => ({ ...prev, [job.id]: count }));
              if (isAdmin) {
                setJobParticipants(prev => ({ ...prev, [job.id]: participants }));
              }
            }
          );
          unsubs.push(appsUnsub);

          // Si utilisateur connecté, écouter son statut de candidature
          if (user) {
            const userAppUnsub = jobsService.subscribeToUserApplication(
              job.id,
              user.uid,
              (hasApplied, isPending) => {
                setUserApplications(prev => ({ ...prev, [job.id]: hasApplied }));
                setUserPendingApps(prev => ({ ...prev, [job.id]: isPending }));
              }
            );
            unsubs.push(userAppUnsub);
          }
        }

        setLoading(false);
      },
      (err) => {
        console.error('onSnapshot jobs error:', err);
        setError('Erreur lors de la récupération des jobs');
        setLoading(false);
      }
    );

    unsubs.push(jobsUnsub);

    return () => {
      unsubs.forEach(u => {
        try {
          u();
        } catch (e) {
          console.warn('jobs unsubscribe failed', e);
        }
      });
    };
  }, [adminReady, isAdmin, user]);

  // Créer un job
  const createJob = useCallback(async (formData: JobFormData) => {
    try {
      // Validation
      if (!formData.title.trim() || !formData['date-begin'].trim() || 
          !formData['date-end'].trim() || !formData.adress.trim() || 
          !formData.description.trim() || !formData.remuneration.trim() || 
          !formData.places) {
        throw new Error('Tous les champs sont obligatoires.');
      }

      if (formData['date-begin'] === formData['date-end']) {
        throw new Error('La date/heure de fin doit être différente de la date/heure de début.');
      }

      const jobId = await jobsService.createJob(formData);
      
      // Notification (best effort)
      await jobsService.notifyNewJob(jobId, formData);
    } catch (e) {
      throw e;
    }
  }, []);

  // Mettre à jour un job
  const updateJob = useCallback(async (jobId: string, formData: JobFormData) => {
    try {
      // Validation
      if (!formData.title.trim() || !formData['date-begin'].trim() || 
          !formData['date-end'].trim() || !formData.adress.trim() || 
          !formData.description.trim() || !formData.remuneration.trim() || 
          !formData.places) {
        throw new Error('Tous les champs sont obligatoires.');
      }

      if (formData['date-begin'] === formData['date-end']) {
        throw new Error('La date/heure de fin doit être différente de la date/heure de début.');
      }

      await jobsService.updateJob(jobId, formData);
    } catch (e) {
      throw e;
    }
  }, []);

  // Supprimer un job
  const deleteJob = useCallback(async (jobId: string) => {
    await jobsService.deleteJob(jobId);
  }, []);

  // Postuler à un job
  const applyToJob = useCallback(async (jobId: string, jobTitle: string) => {
    if (!user) throw new Error('Utilisateur non connecté');

    // Récupérer le displayName depuis Firestore si possible
    let displayName = user.displayName;
    try {
      const userInfo = await jobsService.getUserInfo(user.uid);
      if (userInfo?.displayName) {
        displayName = userInfo.displayName;
      }
    } catch {
      // Ignoré intentionnellement
    }

    if (!displayName) displayName = user.email || 'Utilisateur inconnu';

    await jobsService.applyToJob(
      jobId,
      jobTitle,
      user.uid,
      user.email || '',
      displayName
    );

    // Notification (best effort)
    await jobsService.notifyNewApplication(jobId, jobTitle, user.uid, displayName);
  }, [user]);

  // Retirer un participant
  const removeParticipant = useCallback(async (jobId: string, userId: string) => {
    await jobsService.removeParticipant(jobId, userId);
  }, []);

  // Ajouter un participant
  const addParticipant = useCallback(async (jobId: string, userId: string) => {
    const userInfo = await jobsService.getUserInfo(userId);
    if (!userInfo) throw new Error('Utilisateur introuvable');

    await jobsService.addParticipant(
      jobId,
      userId,
      userInfo.displayName,
      userInfo.email
    );
  }, []);

  // Remplacer un participant
  const replaceParticipant = useCallback(
    async (jobId: string, oldUserId: string, newUserId: string) => {
      const userInfo = await jobsService.getUserInfo(newUserId);
      if (!userInfo) throw new Error('Utilisateur introuvable');

      await jobsService.replaceParticipant(
        jobId,
        oldUserId,
        newUserId,
        userInfo.displayName,
        userInfo.email
      );
    },
    []
  );

  // Rafraîchir les jobs manuellement
  const refreshJobs = useCallback(async () => {
    // La mise à jour se fait automatiquement via les subscriptions
    // Cette fonction est maintenue pour compatibilité
  }, []);

  return {
    jobs,
    loading,
    error,
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
    replaceParticipant,
    refreshJobs
  };
};
