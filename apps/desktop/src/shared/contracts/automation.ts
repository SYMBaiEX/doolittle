export interface CronJob {
  id?: string;
  name?: string;
  schedule?: string;
  prompt?: string;
  status?: string;
  delivery?: string;
  nextRunAt?: string;
  createdAt?: string;
  updatedAt?: string;
  skills?: unknown[];
  runtime?: unknown;
}
export interface CronJobRun {
  id?: string;
  jobId?: string;
  state?: string;
  startedAt?: string;
  endedAt?: string;
  error?: string;
  output?: string;
}
export interface CronJobsResponse {
  jobs: CronJob[];
}
export interface CronRunsResponse {
  runs: CronJobRun[];
}
export interface CronMutationResponse {
  job?: CronJob;
}
export interface CronCreateRequest {
  name?: string;
  prompt: string;
  schedule: string;
  skills?: string[];
  delivery?: "origin" | "local" | "home";
  runtime?: {
    provider?: string;
    model?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
    personalityId?: string;
  };
}
export interface CronPatchRequest extends CronCreateRequest {
  clearRuntime?: boolean;
}
