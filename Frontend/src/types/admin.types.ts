/**
 * Types pour la page Admin
 */

export interface UserRow {
  id: string;
  username: string;
  totalHours: number;
}

export interface JobApplication {
  id: string;
  jobId: string;
  jobTitle: string;
  userId: string;
  email: string;
  displayName: string;
  appliedAt: unknown;
  status: string;
}

export interface EditHoursModal {
  userId: string;
  username: string;
  currentHours: number;
  newHours: number;
}

export interface TestNotification {
  title: string;
  body: string;
}

export interface UserMeta {
  username: string;
  email?: string | null;
  displayName?: string | null;
}

export interface NotificationResult {
  sentFCM?: boolean;
  hasToken?: boolean;
  sentWebPush?: boolean;
  hasSub?: boolean;
}
