export interface CompressionConfig {
  threshold?: number;
  contextWindowTokens?: number;
}

export interface UsageStats {
  estimatedTokens: number;
  contextWindowTokens: number;
  usageFraction: number;
  overThreshold: boolean;
}
