/**
 * Service API pour les opérations admin
 */

import { collection, doc, getDoc, getDocs, updateDoc, query, where, Timestamp, setDoc, addDoc, serverTimestamp as getServerTimestamp } from 'firebase/firestore';
import { getFirestoreDb, getFirebaseAuth } from '../firebase/config';
import type { UserRow, JobApplication, UserMeta, NotificationResult } from '../types/admin.types';

class AdminService {
  /**
   * Vérifie si l'utilisateur est admin
   */
  async isUserAdmin(userId: string): Promise<boolean> {
    const db = getFirestoreDb();
    const userDoc = await getDoc(doc(db, 'users', userId));
    return userDoc.exists() && userDoc.data().isAdmin === true;
  }

  /**
   * Récupère toutes les candidatures en attente
   */
  async getPendingApplications(): Promise<JobApplication[]> {
    const db = getFirestoreDb();
    const q = query(collection(db, 'jobApplications'), where('status', '==', 'pending'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as JobApplication));
  }

  /**
   * Accepte ou refuse une candidature
   */
  async updateApplicationStatus(
    id: string,
    status: 'accepted' | 'refused',
    onAccepted?: (jobData: { jobId: string; jobTitle: string; userId: string; displayName: string }) => Promise<void>
  ): Promise<void> {
    const db = getFirestoreDb();
    
    // Récupérer la demande pour avoir jobId et userId
    const appDoc = await getDoc(doc(db, 'jobApplications', id));
    if (!appDoc.exists()) throw new Error('Demande introuvable');
    
    const appData = appDoc.data();
    await updateDoc(doc(db, 'jobApplications', id), { status });
    
    // Si accepté, créer l'application validée dans la sous-collection du job
    if (status === 'accepted') {
      await setDoc(doc(db, `jobs/${appData.jobId}/applications/${appData.userId}`), {
        userId: appData.userId,
        email: appData.email,
        displayName: appData.displayName,
        appliedAt: appData.appliedAt,
        approved: true
      });
      
      // Callback optionnel pour les notifications
      if (onAccepted) {
        await onAccepted({
          jobId: appData.jobId,
          jobTitle: appData.jobTitle,
          userId: appData.userId,
          displayName: appData.displayName
        });
      }
    }
  }

  /**
   * Envoie une notification d'acceptation de candidature
   */
  async sendApplicationAcceptedNotification(jobData: {
    jobId: string;
    jobTitle: string;
    applicantId: string;
    applicantName: string;
  }): Promise<void> {
    try {
      const apiUrl = import.meta.env.VITE_NOTIFY_API_URL as string | undefined;
      if (!apiUrl) return;
      
      const auth = getFirebaseAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      await fetch(`${apiUrl.replace(/\/$/, '')}/notify/application-accepted`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify(jobData)
      });
    } catch {
      // Ignorer les erreurs de notification
    }
  }

  /**
   * Récupère tous les utilisateurs avec leurs métadonnées
   */
  async getUsersMetadata(): Promise<Map<string, UserMeta>> {
    const db = getFirestoreDb();
    const usersSnap = await getDocs(collection(db, 'users'));
    const userMeta = new Map<string, UserMeta>();
    
    usersSnap.forEach(d => {
      const data = d.data() as { displayName?: string | null; email?: string | null };
      const username = data.displayName || data.email || d.id;
      userMeta.set(d.id, {
        username,
        email: data.email ?? null,
        displayName: data.displayName ?? null
      });
    });
    
    return userMeta;
  }

  /**
   * Calcule les heures totales prestées pour tous les utilisateurs
   */
  async calculateUserHours(): Promise<UserRow[]> {
    const db = getFirestoreDb();
    
    // 1) Récupérer les métadonnées des utilisateurs
    const userMeta = await this.getUsersMetadata();
    const emailToUid = new Map<string, string>();
    const nameToUid = new Map<string, string>();
    
    userMeta.forEach((meta, uid) => {
      if (meta.email) emailToUid.set(meta.email.toLowerCase(), uid);
      if (meta.displayName) nameToUid.set(meta.displayName.trim().toLowerCase(), uid);
    });
    
    // 2) Récupérer tous les jobs passés
    const jobsSnap = await getDocs(collection(db, 'jobs'));
    const now = Date.now();
    const pastJobs = this.filterPastJobs(jobsSnap.docs, now);
    
    // 3) Calculer les heures pour chaque utilisateur
    const totals = new Map<string, number>();
    
    for (const job of pastJobs) {
      const durationHours = this.calculateJobDuration(job.start, job.end);
      
      try {
        const appsSnap = await getDocs(collection(db, `jobs/${job.id}/applications`));
        appsSnap.forEach(p => {
          const app = p.data() as { userId?: string; email?: string; displayName?: string };
          const uid = this.resolveUserId(app, p.id, userMeta, emailToUid, nameToUid);
          totals.set(uid, (totals.get(uid) || 0) + durationHours);
        });
      } catch {
        // Ignorer les erreurs de lecture
      }
    }
    
    // 4) Construire les lignes pour tous les utilisateurs
    const rows: UserRow[] = Array.from(userMeta.entries()).map(([uid, meta]) => ({
      id: uid,
      username: meta.username,
      totalHours: Number((totals.get(uid) || 0).toFixed(2))
    }));
    
    // 5) Appliquer les heures manuelles si définies
    for (const row of rows) {
      try {
        const userDoc = await getDoc(doc(db, 'users', row.id));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (typeof userData.manualHours === 'number') {
            row.totalHours = Number(userData.manualHours.toFixed(2));
          }
        }
      } catch {
        // Ignorer les erreurs
      }
    }
    
    return rows;
  }

  /**
   * Filtre les jobs passés
   */
  private filterPastJobs(jobs: Array<{ id: string; data: () => Record<string, unknown> }>, now: number): Array<{ id: string; start: number; end: number }> {
    const pastJobs: Array<{ id: string; start: number; end: number }> = [];
    
    jobs.forEach(d => {
      const data = d.data();
      const start = this.toEpoch(data['date-begin']);
      const end = this.toEpoch(data['date-end']);
      
      if (end !== undefined && end < now && start !== undefined) {
        pastJobs.push({ id: d.id, start, end });
      }
    });
    
    return pastJobs;
  }

  /**
   * Calcule la durée d'un job en heures
   */
  private calculateJobDuration(start?: number, end?: number): number {
    if (!start || !end) return 0;
    const diffMs = end - start;
    const minutes = diffMs > 0 ? Math.round(diffMs / 60000) : 0;
    return minutes / 60;
  }

  /**
   * Résout l'userId à partir des différentes sources possibles
   */
  private resolveUserId(
    app: { userId?: string; email?: string; displayName?: string },
    docId: string,
    userMeta: Map<string, UserMeta>,
    emailToUid: Map<string, string>,
    nameToUid: Map<string, string>
  ): string {
    // 1) userId direct
    if (app.userId && userMeta.has(app.userId)) return app.userId;
    
    // 2) via email
    if (app.email) {
      const viaEmail = emailToUid.get(app.email.toLowerCase());
      if (viaEmail) return viaEmail;
    }
    
    // 3) via displayName
    if (app.displayName) {
      const viaName = nameToUid.get(app.displayName.trim().toLowerCase());
      if (viaName) return viaName;
    }
    
    // 4) via docId
    if (userMeta.has(docId)) return docId;
    
    const viaEmailPid = emailToUid.get(docId.toLowerCase());
    if (viaEmailPid) return viaEmailPid;
    
    const viaNamePid = nameToUid.get(docId.trim().toLowerCase());
    if (viaNamePid) return viaNamePid;
    
    // Fallback
    return docId;
  }

  /**
   * Convertit une valeur en timestamp epoch (milliseconds)
   */
  private toEpoch(val: unknown): number | undefined {
    if (!val) return undefined;
    
    if (typeof val === 'string') {
      // ISO local format
      const tIso = this.parseIsoLocal(val);
      if (tIso !== undefined) return tIso;
      
      // DD/MM/YYYY format
      const tDdMm = this.parseDdMmYyyy(val);
      if (tDdMm !== undefined) return tDdMm;
      
      // Fallback
      const t = new Date(val).getTime();
      return Number.isNaN(t) ? undefined : t;
    }
    
    if (val instanceof Timestamp) {
      return val.toMillis();
    }
    
    return undefined;
  }

  /**
   * Parse format DD/MM/YYYY
   */
  private parseDdMmYyyy(s: string): number | undefined {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?$/);
    if (!m) return undefined;
    
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const HH = m[4] ? Number(m[4]) : 0;
    const MM = m[5] ? Number(m[5]) : 0;
    
    const d = new Date(yyyy, mm - 1, dd, HH, MM, 0, 0);
    const t = d.getTime();
    return Number.isNaN(t) ? undefined : t;
  }

  /**
   * Parse format ISO local
   */
  private parseIsoLocal(s: string): number | undefined {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return undefined;
    
    const yyyy = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    const HH = Number(m[4]);
    const MM = Number(m[5]);
    const SS = m[6] ? Number(m[6]) : 0;
    
    const d = new Date(yyyy, mm - 1, dd, HH, MM, SS, 0);
    const t = d.getTime();
    return Number.isNaN(t) ? undefined : t;
  }

  /**
   * Met à jour les heures manuelles d'un utilisateur
   */
  async updateUserHours(userId: string, hours: number): Promise<void> {
    const db = getFirestoreDb();
    await updateDoc(doc(db, 'users', userId), {
      manualHours: hours
    });
  }

  /**
   * Envoie une notification de test
   */
  async sendTestNotification(userId: string, title: string, body: string, token?: string): Promise<NotificationResult> {
    const db = getFirestoreDb();
    
    // Créer une notification dans Firestore
    await addDoc(collection(db, 'notifications'), {
      userId,
      type: 'test',
      title,
      description: body,
      createdAt: getServerTimestamp(),
      readBy: []
    });
    
    // Envoyer via FCM si disponible
    const apiUrl = import.meta.env.VITE_NOTIFY_API_URL as string | undefined;
    if (!apiUrl || !token) {
      return {};
    }
    
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/notify/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, body })
      });
      
      if (response.ok) {
        return await response.json();
      }
      
      throw new Error(await response.text());
    } catch (e) {
      console.error('[AdminService] Erreur envoi FCM:', e);
      throw e;
    }
  }
}

export const adminService = new AdminService();
