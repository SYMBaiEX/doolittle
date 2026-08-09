import type { StoredMessage } from "@/types";
import { estimateMessagesTokens } from "./estimators";
import type { CompressionConfig, UsageStats } from "./types";
import { DEFAULT_CONTEXT_WINDOW, resolveContextWindow } from "./windows";

export class ContextCompressionService {
  private readonly threshold: number;
  private readonly contextWindowTokens: number;

  constructor(config: CompressionConfig = {}) {
    this.threshold = config.threshold ?? 0.85;
    this.contextWindowTokens =
      config.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW;
  }

  static resolveContextWindow(modelId: string): number {
    return resolveContextWindow(modelId);
  }

  measure(messages: StoredMessage[]): UsageStats {
    const estimatedTokens = estimateMessagesTokens(messages);
    const usageFraction = estimatedTokens / this.contextWindowTokens;
    return {
      estimatedTokens,
      contextWindowTokens: this.contextWindowTokens,
      usageFraction,
      overThreshold: usageFraction >= this.threshold,
    };
  }

  isApproachingLimit(
    messages: StoredMessage[],
    warningThreshold = 0.7,
  ): boolean {
    const tokens = estimateMessagesTokens(messages);
    return tokens / this.contextWindowTokens >= warningThreshold;
  }

  describe(messages: StoredMessage[]): string {
    const stats = this.measure(messages);
    const pct = Math.round(stats.usageFraction * 100);
    return (
      `Context: ~${stats.estimatedTokens.toLocaleString()} tokens ` +
      `(${pct}% of ${stats.contextWindowTokens.toLocaleString()} limit)` +
      (stats.overThreshold ? " ⚠️ context threshold reached" : "")
    );
  }
}
