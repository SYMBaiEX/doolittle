export interface CronJobRuntimeOverrides {
  provider?: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  personalityId?: string;
}

export interface CronJobRecord {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  delivery: "origin" | "local" | "home";
  skills: string[];
  runtime?: CronJobRuntimeOverrides;
  status: "active" | "paused";
  oneShot: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CronServiceLike {
  list(): CronJobRecord[];
  recentRuns(limit?: number): unknown[];
  runs(limit?: number): unknown[];
  get(id: string): CronJobRecord | undefined;
  create(input: {
    name: string;
    prompt: string;
    schedule: string;
    skills?: string[];
    delivery?: "origin" | "local" | "home";
    runtime?: CronJobRuntimeOverrides;
  }): CronJobRecord;
  update(
    id: string,
    patch: {
      name?: string;
      prompt?: string;
      schedule?: string;
      skills?: string[];
      delivery?: "origin" | "local" | "home";
      runtime?: CronJobRuntimeOverrides;
      clearRuntime?: boolean;
    },
  ): CronJobRecord;
}
