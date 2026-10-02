import type { IAgentRuntime } from "@elizaos/core";

/** Caller-owned bytes, never a path or a URL for the model to fetch. */
export interface ModelAnalysisImage {
  data: Uint8Array;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
}

export interface ModelAnalysisOptions {
  abortSignal?: AbortSignal;
  images?: readonly ModelAnalysisImage[];
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
