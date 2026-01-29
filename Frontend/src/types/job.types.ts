export interface Job {
  id: string;
  title: string;
  'date-begin': string; // affichage (ex: 28/11/2025 17:00)
  'date-end': string;   // affichage
  dateBeginInput?: string; // pour input datetime-local (YYYY-MM-DDTHH:mm)
  dateEndInput?: string;   // pour input datetime-local
  adress: string;
  description: string;
  remuneration: string;
  places: number;
  dateBeginSort?: number;
}

export interface Participant {
  userId: string;
  displayName?: string;
  email?: string;
}

export interface JobParticipants {
  [jobId: string]: Participant[];
}

export interface JobFormData {
  title: string;
  'date-begin': string;
  'date-end': string;
  adress: string;
  description: string;
  remuneration: string;
  places: number;
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

export interface User {
  uid: string;
  displayName?: string | null;
  email?: string | null;
}
