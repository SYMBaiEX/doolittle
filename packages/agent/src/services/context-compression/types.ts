import type { StoredMessage } from "@/types";

export interface CompressionConfig {
  threshold?: number;
  contextWindowTokens?: number;
  preserveRecentTurns?: number;
  preserveLeadingTurns?: number;
}

export interface CompressionResult {
  compressed: boolean;
  tokensBefore: number;
  tokensAfter: number;
  summary: string;
  retained: StoredMessage[];
}

export interface UsageStats {
  estimatedTokens: number;
  contextWindowTokens: number;
  usageFraction: number;
  overThreshold: boolean;
}
