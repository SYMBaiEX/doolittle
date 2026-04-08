import type { StoredMessage } from "@/types";
import { estimateMessagesTokens } from "./estimators";
import type { CompressionConfig, CompressionResult, UsageStats } from "./types";
import { DEFAULT_CONTEXT_WINDOW, resolveContextWindow } from "./windows";

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
      (stats.overThreshold ? " ⚠️ compression triggered" : "")
    );
  }

  private buildSummaryPrompt(middleTurns: StoredMessage[]): string {
    const transcript = middleTurns
      .map((message) => `[${message.role.toUpperCase()}] ${message.text}`)
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
