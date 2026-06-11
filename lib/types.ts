// Shared types for Nigel's. Safe to import from both server and client code.

export type JobSource = "adzuna" | "reed";
export type JobStatus = "active" | "applied";

export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "remote",
  "hybrid",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  remote: "Remote",
  hybrid: "Hybrid",
};

/** A job row as stored in (and returned from) the database. */
export interface Job {
  id: string;
  source: JobSource;
  source_job_id: string;
  title: string;
  company: string | null;
  location: string | null;
  description: string | null;
  url: string;
  contract_time: "full_time" | "part_time" | null;
  is_remote: boolean;
  is_hybrid: boolean;
  salary_min: number | null;
  salary_max: number | null;
  source_posted_date: string | null;
  first_seen_at: string;
  status: JobStatus;
  applied_at: string | null;
}

/** A job as fetched and normalised from a source, before it is stored. */
export interface FetchedJob {
  source: JobSource;
  source_job_id: string;
  title: string;
  company: string | null;
  location: string | null;
  description: string | null;
  url: string;
  contract_time: "full_time" | "part_time" | null;
  is_remote: boolean;
  is_hybrid: boolean;
  salary_min: number | null;
  salary_max: number | null;
  source_posted_date: string | null;
}

export interface Alert {
  id: string;
  name: string;
  tags: string[];
  employment_types: EmploymentType[];
  is_active: boolean;
  created_at: string;
}

export type SourceHealth = "ok" | "partial" | "error" | "skipped";

export interface SourceStatus {
  adzuna: SourceHealth;
  reed: SourceHealth;
}

export interface RefreshResponse {
  ok: boolean;
  /** False when the rate-limit guard served stored jobs without calling the live APIs. */
  live: boolean;
  refreshedAt: string;
  jobs: Job[];
  newJobs: number;
  removedJobs: number;
  sourceStatus: SourceStatus;
  message: string | null;
}

export interface JobsResponse {
  jobs: Job[];
}

export interface JobDetailResponse {
  job: Job;
  /**
   * Sanitised HTML of the full description. Only present for Reed jobs
   * (fetched live from Reed's details endpoint). Adzuna only ever provides
   * a snippet via its API; the complete advert lives on the external page.
   */
  fullDescriptionHtml: string | null;
}

export interface AlertsResponse {
  alerts: Alert[];
}
