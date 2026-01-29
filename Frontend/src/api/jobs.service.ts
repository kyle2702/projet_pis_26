import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  setDoc,
  serverTimestamp,
  getCountFromServer,
  type Unsubscribe
} from 'firebase/firestore';
import { getFirestoreDb, getFirebaseAuth } from '../firebase/config';
import type { Job, JobFormData, Participant, User } from '../types/job.types';
import { toDateString, toEpochMillis, toInputLocalString } from '../utils/date.utils';

/**
 * Service API pour les jobs - architecture REST
 */
export class JobsService {
  private db = getFirestoreDb();

  /**
   * GET /jobs - Récupère tous les jobs
   */
  async getAllJobs(): Promise<Job[]> {
    const snap = await getDocs(collection(this.db, 'jobs'));
    const jobs: Job[] = [];

    snap.docs.forEach((d) => {
      const data = d.data();
      jobs.push(this.mapToJob(d.id, data));
    });

    return jobs.sort((a, b) => {
      const ta = a.dateBeginSort ?? Number.POSITIVE_INFINITY;
      const tb = b.dateBeginSort ?? Number.POSITIVE_INFINITY;
      return ta - tb;
    });
  }

  /**
   * GET /jobs/:id - Récupère un job par ID
   */
  async getJobById(jobId: string): Promise<Job | null> {
    const docSnap = await getDoc(doc(this.db, 'jobs', jobId));
    if (!docSnap.exists()) return null;
    return this.mapToJob(docSnap.id, docSnap.data());
  }

  /**
   * POST /jobs - Crée un nouveau job
   */
  async createJob(formData: JobFormData): Promise<string> {
    const newJobRef = await addDoc(collection(this.db, 'jobs'), {
      ...formData,
      places: Number(formData.places),
      createdAt: serverTimestamp(),
    });
    return newJobRef.id;
  }

  /**
   * PUT /jobs/:id - Met à jour un job
   */
  async updateJob(jobId: string, formData: JobFormData): Promise<void> {
    await updateDoc(doc(this.db, 'jobs', jobId), {
      title: formData.title,
      'date-begin': formData['date-begin'],
      'date-end': formData['date-end'],
      adress: formData.adress,
      description: formData.description,
      remuneration: formData.remuneration,
      places: Number(formData.places),
    });
  }

  /**
   * DELETE /jobs/:id - Supprime un job
   */
  async deleteJob(jobId: string): Promise<void> {
    await deleteDoc(doc(this.db, 'jobs', jobId));
  }

  /**
   * GET /jobs/:id/applications - Compte les candidatures pour un job
   */
  async getApplicationsCount(jobId: string): Promise<number> {
    try {
      const countSnap = await getCountFromServer(
        collection(this.db, `jobs/${jobId}/applications`)
      );
      return countSnap.data().count || 0;
    } catch {
      return 0;
    }
  }

  /**
   * GET /jobs/:id/applications/:userId - Vérifie si l'utilisateur a postulé
   */
  async hasUserApplied(jobId: string, userId: string): Promise<boolean> {
    try {
      const userAppSnap = await getDoc(
        doc(this.db, `jobs/${jobId}/applications/${userId}`)
      );
      return userAppSnap.exists();
    } catch {
      return false;
    }
  }

  /**
   * GET /jobApplications/:jobId_:userId - Vérifie si candidature en attente
   */
  async hasUserPendingApplication(jobId: string, userId: string): Promise<boolean> {
    try {
      const pendingSnap = await getDoc(
        doc(this.db, 'jobApplications', `${jobId}_${userId}`)
      );
      return pendingSnap.exists() && pendingSnap.data()?.status === 'pending';
    } catch {
      return false;
    }
  }

  /**
   * POST /jobs/:id/apply - Postuler à un job
   */
  async applyToJob(
    jobId: string,
    jobTitle: string,
    userId: string,
    email: string,
    displayName: string
  ): Promise<void> {
    const appDocId = `${jobId}_${userId}`;
    await setDoc(
      doc(this.db, 'jobApplications', appDocId),
      {
        jobId,
        jobTitle,
        userId,
        email,
        displayName,
        appliedAt: serverTimestamp(),
        status: 'pending'
      },
      { merge: false }
    );
  }

  /**
   * GET /jobs/:id/participants - Récupère les participants d'un job (admin)
   */
  async getParticipants(jobId: string): Promise<Participant[]> {
    try {
      const participantsSnap = await getDocs(
        collection(this.db, `jobs/${jobId}/applications`)
      );
      return participantsSnap.docs.map(p => {
        const pdata = p.data();
        return {
          userId: p.id,
          displayName: pdata.displayName as string | undefined,
          email: pdata.email as string | undefined
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * DELETE /jobs/:id/participants/:userId - Retirer un participant
   */
  async removeParticipant(jobId: string, userId: string): Promise<void> {
    await deleteDoc(doc(this.db, `jobs/${jobId}/applications/${userId}`));
  }

  /**
   * POST /jobs/:id/participants - Ajouter un participant
   */
  async addParticipant(
    jobId: string,
    userId: string,
    displayName?: string | null,
    email?: string | null
  ): Promise<void> {
    await setDoc(doc(this.db, `jobs/${jobId}/applications/${userId}`), {
      displayName: displayName || undefined,
      email: email || undefined,
      addedAt: serverTimestamp(),
    });
  }

  /**
   * PUT /jobs/:id/participants/:oldUserId/replace/:newUserId - Remplacer un participant
   */
  async replaceParticipant(
    jobId: string,
    oldUserId: string,
    newUserId: string,
    newDisplayName?: string | null,
    newEmail?: string | null
  ): Promise<void> {
    // Vérifier que le nouveau participant n'existe pas déjà
    const newDocSnap = await getDoc(
      doc(this.db, `jobs/${jobId}/applications/${newUserId}`)
    );
    if (newDocSnap.exists()) {
      throw new Error('Cet utilisateur est déjà participant.');
    }

    // Supprimer l'ancien
    await deleteDoc(doc(this.db, `jobs/${jobId}/applications/${oldUserId}`));

    // Ajouter le nouveau
    await setDoc(doc(this.db, `jobs/${jobId}/applications/${newUserId}`), {
      displayName: newDisplayName || undefined,
      email: newEmail || undefined,
      replacedAt: serverTimestamp(),
    });
  }

  /**
   * GET /users - Récupère tous les utilisateurs (admin)
   */
  async getAllUsers(): Promise<User[]> {
    const snap = await getDocs(collection(this.db, 'users'));
    return snap.docs.map(d => {
      const data = d.data() as { displayName?: string | null; email?: string | null };
      return {
        uid: d.id,
        displayName: data.displayName ?? null,
        email: data.email ?? null
      };
    });
  }

  /**
   * GET /users/:userId - Récupère les infos d'un utilisateur
   */
  async getUserInfo(userId: string): Promise<User | null> {
    const userSnap = await getDoc(doc(this.db, 'users', userId));
    if (!userSnap.exists()) return null;

    const data = userSnap.data() as { displayName?: string | null; email?: string | null };
    return {
      uid: userId,
      displayName: data.displayName ?? null,
      email: data.email ?? null
    };
  }

  /**
   * Souscription temps réel aux jobs
   */
  subscribeToJobs(
    callback: (jobs: Job[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    return onSnapshot(
      query(collection(this.db, 'jobs')),
      (snapshot) => {
        const jobs: Job[] = [];
        snapshot.docs.forEach((d) => {
          jobs.push(this.mapToJob(d.id, d.data()));
        });

        jobs.sort((a, b) => {
          const ta = a.dateBeginSort ?? Number.POSITIVE_INFINITY;
          const tb = b.dateBeginSort ?? Number.POSITIVE_INFINITY;
          return ta - tb;
        });

        callback(jobs);
      },
      (error) => {
        if (onError) onError(error);
      }
    );
  }

  /**
   * Souscription temps réel aux candidatures d'un job
   */
  subscribeToApplications(
    jobId: string,
    callback: (count: number, participants: Participant[]) => void
  ): Unsubscribe {
    return onSnapshot(collection(this.db, `jobs/${jobId}/applications`), (snapshot) => {
      const participants: Participant[] = snapshot.docs.map(p => {
        const pdata = p.data();
        return {
          userId: p.id,
          displayName: pdata.displayName as string | undefined,
          email: pdata.email as string | undefined
        };
      });
      callback(snapshot.size, participants);
    });
  }

  /**
   * Souscription temps réel à l'état de candidature d'un utilisateur
   */
  subscribeToUserApplication(
    jobId: string,
    userId: string,
    callback: (hasApplied: boolean, isPending: boolean) => void
  ): Unsubscribe {
    const unsubApp = onSnapshot(
      doc(this.db, `jobs/${jobId}/applications/${userId}`),
      (docSnap) => {
        const hasApplied = docSnap.exists();
        
        // Vérifier aussi le statut pending
        onSnapshot(
          doc(this.db, 'jobApplications', `${jobId}_${userId}`),
          (pendingSnap) => {
            const isPending = pendingSnap.exists() && pendingSnap.data()?.status === 'pending';
            callback(hasApplied, isPending);
          }
        );
      }
    );

    return unsubApp;
  }

  /**
   * Envoie une notification de nouveau job via backend
   */
  async notifyNewJob(jobId: string, formData: JobFormData): Promise<void> {
    try {
      const apiUrl = import.meta.env.VITE_NOTIFY_API_URL as string | undefined;
      if (!apiUrl) return;

      const auth = getFirebaseAuth();
      const idToken = await auth.currentUser?.getIdToken();

      await fetch(`${apiUrl.replace(/\/$/, '')}/notify/new-job`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          jobId,
          ...formData,
          places: Number(formData.places)
        })
      });
    } catch (error) {
      console.warn('Notification email backend failed (ignored):', error);
    }
  }

  /**
   * Envoie une notification de nouvelle candidature via backend
   */
  async notifyNewApplication(
    jobId: string,
    jobTitle: string,
    applicantId: string,
    applicantName: string
  ): Promise<void> {
    try {
      const apiUrl = import.meta.env.VITE_NOTIFY_API_URL as string | undefined;
      if (!apiUrl) return;

      const auth = getFirebaseAuth();
      const idToken = await auth.currentUser?.getIdToken();

      await fetch(`${apiUrl.replace(/\/$/, '')}/notify/new-application`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          jobId,
          jobTitle,
          applicantId,
          applicantName
        })
      });
    } catch (error) {
      console.warn('Notification email backend failed (ignored):', error);
    }
  }

  /**
   * Helper : mapper les données Firestore vers Job
   */
  private mapToJob(id: string, data: Record<string, unknown>): Job {
    return {
      id,
      title: typeof data.title === 'string' ? data.title : '',
      'date-begin': toDateString(data['date-begin']),
      'date-end': toDateString(data['date-end']),
      dateBeginInput: toInputLocalString(data['date-begin']),
      dateEndInput: toInputLocalString(data['date-end']),
      adress: typeof data.adress === 'string' ? data.adress : '',
      description: typeof data.description === 'string' ? data.description : '',
      remuneration: typeof data.remuneration === 'string' ? data.remuneration : '',
      places: typeof data.places === 'number' ? data.places : 0,
      dateBeginSort: toEpochMillis(data['date-begin'])
    };
  }
}

// Instance singleton
export const jobsService = new JobsService();
