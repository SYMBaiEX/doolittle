import type {
  AutomationRunRecord,
  CreateCronJobInput,
  CronExecutor,
  CronJobRecord,
  UpdateCronJobInput,
} from "./types";

/**
 * Compatibility surface for callers that are initialized before the Eliza
 * runtime. Automation state and scheduling live exclusively in Trigger Tasks.
 */
export class CronService {
  // biome-ignore lint/complexity/noUselessConstructor: Preserve the pre-runtime constructor contract while removing its local state.
  constructor(
    _baseDir: string,
    _outputDir: string,
    _tickSeconds: number,
    _timezone = "UTC",
  ) {}

  setExecutor(_executor: CronExecutor): void {}
  start(): void {}
  stop(): void {}
  list(): CronJobRecord[] {
    return [];
  }
  recentRuns(_limit = 25): AutomationRunRecord[] {
    return [];
  }
  runs(limit = 25): AutomationRunRecord[] {
    return this.recentRuns(limit);
  }
  get(_id: string): CronJobRecord | undefined {
    return undefined;
  }

  create(_input: CreateCronJobInput): CronJobRecord {
    return this.unavailable();
  }
  pause(_id: string): CronJobRecord {
    return this.unavailable();
  }
  resume(_id: string): CronJobRecord {
    return this.unavailable();
  }
  runNow(_id: string): CronJobRecord {
    return this.unavailable();
  }
  remove(_id: string): void {
    this.unavailable();
  }
  updateConfig(_id: string, _input: UpdateCronJobInput): CronJobRecord {
    return this.unavailable();
  }
  update(id: string, input: UpdateCronJobInput): CronJobRecord {
    return this.updateConfig(id, input);
  }
  async triggerNow(
    _id: string,
    _source?: "manual" | "webhook",
    _payload?: Record<string, unknown>,
  ): Promise<AutomationRunRecord> {
    return this.unavailable();
  }
  async triggerWebhook(
    _token: string,
    _payload?: Record<string, unknown>,
  ): Promise<AutomationRunRecord> {
    return this.unavailable();
  }
  async tick(): Promise<void> {}

  private unavailable(): never {
    throw new Error(
      "Cron jobs are managed by the Eliza Trigger runtime service.",
    );
  }
}
