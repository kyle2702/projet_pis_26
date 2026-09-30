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
  debug?: {
    uid?: string;
    nid?: string;
    tokenCount?: number;
    tokenSuffixes?: string[];
    webPushConfigured?: boolean;
    fcmSuccessCount?: number;
    fcmFailureCount?: number;
    invalidTokenCleanupCount?: number;
    fcmErrors?: Array<{
      tokenSuffix: string;
      code: string;
      message: string;
    }>;
    webPushError?: {
      statusCode?: number;
      message: string;
    } | null;
  };
}
