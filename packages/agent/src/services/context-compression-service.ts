/**
 * Context Compression Service
 *
 * Monitors token usage across a session's message history and triggers
 * summarization of middle turns when the context window approaches its
 * limit (default threshold: 85%).
 *
 * Key design decisions:
 *  - Token counts are estimated via a simple char/4 heuristic (no dependency
 *    on a tokenizer library) so the service works offline and with any model.
 *  - Compression is applied to the *middle* of the history – the first turn
 *    and the most-recent turns are always preserved verbatim so the model
 *    retains both the original task framing and the latest context.
 *  - A secondary prompt string is returned so callers can inject it as a
 *    synthetic "assistant" message carrying the compressed summary.
 */

import type { StoredMessage } from "@/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CompressionConfig {
  /**
   * Fraction of the model's context limit at which compression is triggered.
   * Defaults to a conversation-safe 85%.
   */
  threshold?: number;

  /**
   * Approximate maximum context window in tokens for the current model.
   * Falls back to a conservative 32 k default if not provided.
   */
  contextWindowTokens?: number;

  /**
   * How many of the most-recent turns to protect from compression so the
   * model always sees the freshest context (default 6).
   */
  preserveRecentTurns?: number;

  /**
   * How many turns at the very beginning of the conversation to keep verbatim
   * so the original task framing is never lost (default 2).
   */
  preserveLeadingTurns?: number;
}

export interface CompressionResult {
  /** True when compression was actually performed. */
  compressed: boolean;
  /** Estimated token count before compression. */
  tokensBefore: number;
  /** Estimated token count after compression. */
  tokensAfter: number;
  /** The compressed summary text (empty string when not compressed). */
  summary: string;
  /** Messages that survived compression (leading + summary turn + recent). */
  retained: StoredMessage[];
}

export interface UsageStats {
  estimatedTokens: number;
  contextWindowTokens: number;
  usageFraction: number;
  overThreshold: boolean;
}

// ---------------------------------------------------------------------------
// Per-model context window sizes.
// These are pragmatic lookup values used for compression heuristics and should
// track the model IDs this workspace actually uses.
// ---------------------------------------------------------------------------

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // -------------------------------------------------------------------------
  // Anthropic Claude 4.x series (1M context window)
  // Released: late 2025 – early 2026
  // -------------------------------------------------------------------------
  "claude-opus-4-6": 1_000_000,
  "claude-sonnet-4-6": 1_000_000,
  "claude-sonnet-4-5": 1_000_000, // 1M via beta header; 200k default
  "claude-sonnet-4-5-20250929": 1_000_000,
  "claude-opus-4-5": 200_000,
  "claude-opus-4-5-20251101": 200_000,
  "claude-opus-4-1": 200_000,
  "claude-opus-4-1-20250805": 200_000,
  "claude-sonnet-4-20250514": 1_000_000, // 1M via beta header; 200k default
  "claude-opus-4-20250514": 200_000,
  // Anthropic Claude 3.x series (200k)
  "claude-3-5-haiku-20241022": 200_000,
  "claude-haiku-4-5-20251001": 200_000,
  "claude-3-5-haiku": 200_000,
  "claude-3-5-sonnet": 200_000,
  "claude-3-haiku-20240307": 200_000,
  "claude-3-haiku": 200_000,
  "claude-3-opus": 200_000,
  // Short aliases / partial matches used in config
  "claude-sonnet-4.6": 1_000_000,
  "claude-sonnet-4.5": 1_000_000,
  "claude-opus-4": 200_000,

  // -------------------------------------------------------------------------
  // OpenAI GPT-5.x series (released March 2026)
  // -------------------------------------------------------------------------
  "gpt-5.4": 1_050_000,
  "gpt-5.4-mini": 400_000,
  "gpt-5.4-nano": 400_000,
  // OpenAI o-series reasoning models
  o3: 200_000,
  "o4-mini": 200_000,
  "o3-mini": 200_000,
  // Legacy OpenAI (retired Feb 2026 but kept for graceful degradation)
  "gpt-4o": 128_000,
  "gpt-4.1": 1_000_000,
  "gpt-4.1-mini": 1_000_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
  o1: 200_000,
  "o1-preview": 128_000,
  "o1-mini": 128_000,

  // -------------------------------------------------------------------------
  // Google Gemini (all ~1M context)
  // -------------------------------------------------------------------------
  // Gemini 3.x series (2026 previews)
  "gemini-3.1-pro-preview": 1_048_576,
  "gemini-3-flash-preview": 1_048_576,
  "gemini-3.1-flash-lite-preview": 1_048_576,
  // Gemini 2.5 series (stable)
  "gemini-2.5-pro": 1_048_576,
  "gemini-2.5-flash": 1_048_576,
  "gemini-2.5-flash-lite": 1_048_576,
  // Gemini 2.0 series
  "gemini-2.0-flash": 1_048_576,
  "gemini-2.0-flash-lite": 1_048_576,

  // -------------------------------------------------------------------------
  // Meta Llama 4 (released April 2025)
  // -------------------------------------------------------------------------
  "meta-llama/Llama-4-Scout-17B-16E-Instruct": 10_000_000, // 10M context
  "meta-llama/Llama-4-Maverick-17B-128E-Instruct": 1_000_000,
  // Llama 3.x (still widely used)
  "meta-llama/Llama-3.3-70B-Instruct": 128_000,
  "meta-llama/Llama-3.1-405B-Instruct": 128_000,
  "meta-llama/Llama-3.1-70B-Instruct": 128_000,

  // -------------------------------------------------------------------------
  // Mistral (March 2026)
  // -------------------------------------------------------------------------
  "magistral-medium-2509": 40_000,
  "magistral-small-2509": 40_000,
  "mistral-large-3-25-12": 128_000, // official docs don't specify; 128k assumed
  "mistral-medium-3-1-25-08": 128_000,
  "mistral-small-4-0-26-03": 128_000,
  "devstral-2-25-12": 128_000,
  "codestral-2508": 256_000,

  // -------------------------------------------------------------------------
  // Eliza Cloud / OpenRouter prefixed IDs
  // -------------------------------------------------------------------------
  "anthropic/claude-sonnet-4-6": 1_000_000,
  "anthropic/claude-sonnet-4.6": 1_000_000,
  "anthropic/claude-sonnet-4.5": 1_000_000,
  "anthropic/claude-opus-4-6": 1_000_000,
  "openai/gpt-5-mini": 400_000,
  "openai/gpt-5.4": 1_050_000,
  "openai/gpt-5.4-mini": 400_000,
  "google/gemini-2.5-pro": 1_048_576,
  "google/gemini-3.1-pro-preview": 1_048_576,
  "meta-llama/llama-4-scout": 10_000_000,
  "meta-llama/llama-4-maverick": 1_000_000,
};

/**
 * Conservative default for unknown models.
 * 128k is a safe floor for any serious 2025-2026 frontier model.
 */
const DEFAULT_CONTEXT_WINDOW = 128_000;

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Rough token estimate: ~4 chars per token on average for English text.
 * This deliberately over-estimates so we compress conservatively.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: StoredMessage[]): number {
  return messages.reduce(
    (sum, msg) => sum + estimateTokens(`[${msg.role}] ${msg.text}`) + 8,
    0,
  );
}

// ---------------------------------------------------------------------------
// Context Compression Service
// ---------------------------------------------------------------------------

export class ContextCompressionService {
  private readonly threshold: number;
  private readonly contextWindowTokens: number;
  private readonly preserveRecentTurns: number;
  private readonly preserveLeadingTurns: number;

  constructor(config: CompressionConfig = {}) {
    this.threshold = config.threshold ?? 0.85;
    this.contextWindowTokens =
      config.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW;
    this.preserveRecentTurns = config.preserveRecentTurns ?? 6;
    this.preserveLeadingTurns = config.preserveLeadingTurns ?? 2;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns a context-window size for a given model identifier.
   */
  static resolveContextWindow(modelId: string): number {
    // Exact match first
    if (MODEL_CONTEXT_WINDOWS[modelId]) {
      return MODEL_CONTEXT_WINDOWS[modelId];
    }
    // Substring match (e.g. "claude-sonnet-4.6-20250101")
    for (const [key, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
      if (modelId.includes(key) || key.includes(modelId)) {
        return size;
      }
    }
    return DEFAULT_CONTEXT_WINDOW;
  }

  /**
   * Reports current token usage statistics without modifying anything.
   */
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

  /**
   * Checks whether the given messages need compression and, if so, produces
   * a summary + the reduced message list.
   *
   * Compression is NOT performed here – the caller is responsible for sending
   * `summaryPrompt` to the model and storing the result. This keeps the
   * service side-effect-free and easy to test.
   *
   * @returns CompressionResult with compressed=false when below threshold.
   */
  analyze(messages: StoredMessage[]): CompressionResult & {
    summaryPrompt: string;
    middleTurns: StoredMessage[];
  } {
    const tokensBefore = estimateMessagesTokens(messages);
    const noop = {
      compressed: false,
      tokensBefore,
      tokensAfter: tokensBefore,
      summary: "",
      retained: messages,
      summaryPrompt: "",
      middleTurns: [],
    };

    if (tokensBefore / this.contextWindowTokens < this.threshold) {
      return noop;
    }

    // Not enough turns to compress
    const minRequired =
      this.preserveLeadingTurns + this.preserveRecentTurns + 1;
    if (messages.length < minRequired) {
      return noop;
    }

    const leading = messages.slice(0, this.preserveLeadingTurns);
    const recent = messages.slice(-this.preserveRecentTurns);
    const middleTurns = messages.slice(
      this.preserveLeadingTurns,
      messages.length - this.preserveRecentTurns,
    );

    if (!middleTurns.length) {
      return noop;
    }

    const summaryPrompt = this.buildSummaryPrompt(middleTurns);

    // Estimated retained size (leading + placeholder summary turn + recent)
    const placeholderSummaryTokens = Math.round(
      estimateMessagesTokens(middleTurns) * 0.25,
    );
    const tokensAfter =
      estimateMessagesTokens(leading) +
      placeholderSummaryTokens +
      estimateMessagesTokens(recent);

    return {
      compressed: true,
      tokensBefore,
      tokensAfter,
      summary: "",
      retained: [...leading, ...recent],
      summaryPrompt,
      middleTurns,
    };
  }

  /**
   * Applies the compression result once the caller has obtained a summary
   * string from the model. Returns the final reduced message list with a
   * synthetic summary turn inserted between leading and recent turns.
   */
  applyCompression(
    messages: StoredMessage[],
    summary: string,
    sessionId: string,
  ): StoredMessage[] {
    if (
      messages.length <
      this.preserveLeadingTurns + this.preserveRecentTurns
    ) {
      return messages;
    }

    const leading = messages.slice(0, this.preserveLeadingTurns);
    const recent = messages.slice(-this.preserveRecentTurns);

    const summaryTurn: StoredMessage = {
      id: `compression-${Date.now()}`,
      sessionId,
      roomId: messages[0]?.roomId ?? sessionId,
      entityId: "system",
      role: "assistant",
      text: `[CONTEXT SUMMARY — earlier turns compressed]\n\n${summary}`,
      createdAt: new Date().toISOString(),
    };

    return [...leading, summaryTurn, ...recent];
  }

  /**
   * Convenience: checks if messages are approaching the context limit.
   */
  isApproachingLimit(
    messages: StoredMessage[],
    warningThreshold = 0.7,
  ): boolean {
    const tokens = estimateMessagesTokens(messages);
    return tokens / this.contextWindowTokens >= warningThreshold;
  }

  /**
   * Returns a human-readable summary of context usage.
   */
  describe(messages: StoredMessage[]): string {
    const stats = this.measure(messages);
    const pct = Math.round(stats.usageFraction * 100);
    return (
      `Context: ~${stats.estimatedTokens.toLocaleString()} tokens ` +
      `(${pct}% of ${stats.contextWindowTokens.toLocaleString()} limit)` +
      (stats.overThreshold ? " ⚠️ compression triggered" : "")
    );
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildSummaryPrompt(middleTurns: StoredMessage[]): string {
    const transcript = middleTurns
      .map((m) => `[${m.role.toUpperCase()}] ${m.text}`)
      .join("\n\n");

    return [
      "You are a concise summarizer. The following is a portion of a conversation between a user and an AI agent.",
      "Summarize the key points, decisions made, code written, commands run, and any open questions.",
      "Be comprehensive but concise. Use bullet points where helpful.",
      "This summary will replace the original turns to free context window space.",
      "",
      "CONVERSATION EXCERPT TO SUMMARIZE:",
      "---",
      transcript,
      "---",
      "",
      "Write the summary now:",
    ].join("\n");
  }
}
