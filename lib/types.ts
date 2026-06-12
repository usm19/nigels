// Shared types for Nigel's. Safe to import from both server and client code.

export type JobSource = "adzuna" | "reed";
export type JobStatus = "active" | "applied";

/** Whether the source gave a full timestamp (Adzuna) or just a date (Reed). */
export type PostedTimePrecision = "exact" | "date_only";

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

export const CONTRACT_TYPES = ["permanent", "contract"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  permanent: "Permanent",
  contract: "Contract",
};

export const EXPERIENCE_LEVELS = ["entry", "mid", "senior"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  entry: "Entry level",
  mid: "Mid level",
  senior: "Senior",
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
  /** The REAL posting time from the source site. Drives the displayed age
   *  and the 24-hour lifecycle. Adzuna: full timestamp; Reed: date only. */
  source_posted_date: string | null;
  posted_time_precision: PostedTimePrecision;
  /** When Nigel's first saw the job. ONLY used for the "NEW" badge —
   *  never for the displayed age. */
  first_seen_at: string;
  status: JobStatus;
  applied_at: string | null;
  is_government: boolean;
  experience_level: ExperienceLevel | null;
  contract_type: ContractType | null;
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
  posted_time_precision: PostedTimePrecision;
  is_government: boolean;
  experience_level: ExperienceLevel | null;
  contract_type: ContractType | null;
}

/** A saved search (the alerts table doubles as saved-search storage). */
export interface Alert {
  id: string;
  name: string;
  tags: string[];
  employment_types: EmploymentType[];
  is_active: boolean;
  created_at: string;
  keywords: string | null;
  salary_min: number | null;
  salary_max: number | null;
  government_only: boolean;
  experience_levels: ExperienceLevel[];
  contract_types: ContractType[];
}

export type SortOption = "newest" | "salary";

/** The full state of the main search bar. Drives both the server fetch
 *  (terms, employment, contract, salary) and the on-screen filtering. */
export interface SearchState {
  /** Job-title terms (chips). Matched against the TITLE only, unless
   *  searchDescriptions is on. */
  terms: string[];
  /** Words that must NOT appear in the title. Display-side only. */
  excludeTerms: string[];
  /** Off by default: when on, terms may also match the description. */
  searchDescriptions: boolean;
  employmentTypes: EmploymentType[];
  contractTypes: ContractType[];
  experienceLevels: ExperienceLevel[];
  governmentOnly: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  /** Display filter using the REAL posting time. null = any time. */
  postedWithinHours: number | null;
  sort: SortOption;
}

export const DEFAULT_SEARCH: SearchState = {
  terms: [],
  excludeTerms: [],
  searchDescriptions: false,
  employmentTypes: [],
  contractTypes: [],
  experienceLevels: [],
  governmentOnly: false,
  salaryMin: null,
  salaryMax: null,
  postedWithinHours: null,
  sort: "newest",
};

/** The slice of SearchState the server needs to fetch from the sources. */
export interface RefreshRequest {
  terms: string[];
  searchDescriptions: boolean;
  employmentTypes: EmploymentType[];
  contractTypes: ContractType[];
  salaryMin: number | null;
  salaryMax: number | null;
}

/** One concrete query against a job source (server-side fetch planning). */
export interface SourceQuery {
  keyword: string | null;
  flag: "full" | "part" | null;
  contractFlag: ContractType | null;
  salaryMin: number | null;
  salaryMax: number | null;
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
  /** Database ids of jobs that arrived in THIS refresh (drives the NEW badge). */
  newJobIds: string[];
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
