import type {
  AutomationRunRecord,
  CronJobRecord,
  CronJobRuntimeOverrides,
} from "@/types";

export type CronExecutor = (job: CronJobRecord) => Promise<string>;

export interface CreateCronJobInput {
  name: string;
  prompt: string;
  schedule: string;
  skills?: string[];
  delivery?: "origin" | "local" | "home";
  runtime?: CronJobRuntimeOverrides;
}

export interface UpdateCronJobInput {
  name?: string;
  prompt?: string;
  schedule?: string;
  skills?: string[];
  delivery?: "origin" | "local" | "home";
  runtime?: CronJobRuntimeOverrides;
  clearRuntime?: boolean;
}

export interface CronTickResult {
  jobs: CronJobRecord[];
  dirty: boolean;
}

export type { AutomationRunRecord, CronJobRecord, CronJobRuntimeOverrides };
