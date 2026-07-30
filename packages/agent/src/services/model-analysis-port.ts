import type { IAgentRuntime } from "@elizaos/core";

export interface ModelAnalysisOptions {
  abortSignal?: AbortSignal;
}

/**
 * Service-facing boundary for non-conversational model work.
 *
 * Implementations must route through an Eliza runtime model handler. Services
 * use this contract instead of selecting providers or issuing provider HTTP.
 */
export interface ModelAnalysisPort {
  bindRuntime(runtime: IAgentRuntime): void;
  analyze(prompt: string, options?: ModelAnalysisOptions): Promise<string>;
}
