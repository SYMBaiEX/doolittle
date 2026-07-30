import type { IAgentRuntime } from "@elizaos/core";
import { runModelAnalysis } from "@/runtime/model-analysis";
import type { EnvConfig } from "@/types";
import type { SettingsService } from "../../settings-service";
import type { MediaTextAnalysisPort } from "../types";

/**
 * Keeps media analysis on Eliza's model boundary. The runtime is bound during
 * bootstrap so model selection and linked-provider settings remain scoped to
 * the request instead of being copied into media provider HTTP calls.
 */
export class RuntimeMediaTextAnalysisPort implements MediaTextAnalysisPort {
  private runtime: IAgentRuntime | undefined;

  constructor(
    private readonly config: EnvConfig,
    private readonly settings: Pick<SettingsService, "get">,
  ) {}

  bindRuntime(runtime: IAgentRuntime): void {
    this.runtime = runtime;
  }

  async analyze(
    prompt: string,
    options: { abortSignal?: AbortSignal } = {},
  ): Promise<string> {
    if (!this.runtime) {
      throw new Error(
        "Media model analysis is unavailable before runtime bootstrap.",
      );
    }

    return runModelAnalysis(
      {
        config: this.config,
        runtime: this.runtime,
        services: { settings: this.settings },
      },
      prompt,
      { label: "media", abortSignal: options.abortSignal },
    );
  }
}
