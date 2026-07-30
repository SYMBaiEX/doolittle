import type { IAgentRuntime } from "@elizaos/core";
import type {
  ModelAnalysisOptions,
  ModelAnalysisPort,
} from "@/services/model-analysis-port";
import type { SettingsService } from "@/services/settings-service";
import type { EnvConfig } from "@/types";
import { runModelAnalysis } from "./model-analysis";

/** Eliza runtime adapter shared by model-assisted product services. */
export class RuntimeModelAnalysisPort implements ModelAnalysisPort {
  private runtime: IAgentRuntime | undefined;

  constructor(
    private readonly config: EnvConfig,
    private readonly settings: Pick<SettingsService, "get">,
    private readonly label: string,
  ) {}

  bindRuntime(runtime: IAgentRuntime): void {
    this.runtime = runtime;
  }

  async analyze(
    prompt: string,
    options: ModelAnalysisOptions = {},
  ): Promise<string> {
    if (!this.runtime) {
      throw new Error(
        `${this.label} model analysis is unavailable before runtime bootstrap.`,
      );
    }

    return runModelAnalysis(
      {
        config: this.config,
        runtime: this.runtime,
        services: { settings: this.settings },
      },
      prompt,
      { label: this.label, abortSignal: options.abortSignal },
    );
  }
}
