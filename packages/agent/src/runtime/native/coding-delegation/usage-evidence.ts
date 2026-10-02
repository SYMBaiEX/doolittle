import { isRecord } from "@/utils/records";
import type { DelegatedUsageEvidence } from "./types";

const MAX_USAGE_EVENTS = 128;
const TOKEN_FIELDS = [
  "inputTokens",
  "outputTokens",
  "reasoningTokens",
  "cacheTokens",
] as const;

type TokenField = (typeof TOKEN_FIELDS)[number];
type UsageSample = Record<TokenField, number> & { costUsd: number | null };

/** Validate the SDK's already-normalized wire shape; do not guess provider aliases. */
function usageSample(value: unknown): UsageSample | undefined {
  if (!isRecord(value) || value.state !== "measured") return undefined;
  for (const field of TOKEN_FIELDS) {
    const count = value[field];
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)
      return undefined;
  }
  if (
    value.costUsd !== undefined &&
    (typeof value.costUsd !== "number" ||
      !Number.isFinite(value.costUsd) ||
      value.costUsd < 0)
  )
    return undefined;
  const sample: UsageSample = {
    inputTokens: value.inputTokens as number,
    outputTokens: value.outputTokens as number,
    reasoningTokens: value.reasoningTokens as number,
    cacheTokens: value.cacheTokens as number,
    costUsd: (value.costUsd as number | undefined) ?? null,
  };
  return TOKEN_FIELDS.some((field) => sample[field] > 0) ||
    sample.costUsd !== null
    ? sample
    : undefined;
}

/**
 * One awaited SDK prompt may report multiple usage events. IDs deduplicate
 * repeated delivery; contradictory IDs are excluded rather than last-write-wins.
 * Raw IDs, provider payloads and labels never enter the receipt.
 */
export class DelegatedUsageCollector {
  private readonly samples = new Map<string, UsageSample>();
  private readonly conflicts = new Set<string>();
  private duplicateEvents = 0;
  private conflictingEvents = 0;
  private rejectedEvents = 0;
  private truncatedEvents = 0;

  observe(data: unknown): void {
    const id = isRecord(data) ? data.sourceEventId : undefined;
    const sample = usageSample(data);
    if (typeof id !== "string" || !id.trim() || id.length > 512 || !sample) {
      this.rejectedEvents += 1;
      return;
    }
    if (this.conflicts.has(id)) {
      this.conflictingEvents += 1;
      return;
    }
    const previous = this.samples.get(id);
    if (previous) {
      if (JSON.stringify(previous) === JSON.stringify(sample)) {
        this.duplicateEvents += 1;
      } else {
        this.samples.delete(id);
        this.conflicts.add(id);
        this.conflictingEvents += 1;
      }
      return;
    }
    if (this.samples.size + this.conflicts.size >= MAX_USAGE_EVENTS) {
      this.truncatedEvents += 1;
      return;
    }
    this.samples.set(id, sample);
  }

  receipt(): DelegatedUsageEvidence {
    const samples = [...this.samples.values()];
    const sum = (field: TokenField): number | null => {
      if (!samples.length) return null;
      const total = samples.reduce((count, sample) => count + sample[field], 0);
      return Number.isSafeInteger(total) ? total : null;
    };
    const costCoverageEvents = samples.filter(
      (sample) => sample.costUsd !== null,
    ).length;
    const cost = samples.reduce(
      (total, sample) => total + (sample.costUsd ?? 0),
      0,
    );
    const completeCostCoverage =
      samples.length > 0 &&
      costCoverageEvents === samples.length &&
      this.conflictingEvents === 0 &&
      this.rejectedEvents === 0 &&
      this.truncatedEvents === 0;
    return {
      source: "eliza-sdk-session-usage-update",
      coverage: "reported-sdk-events-only",
      state: samples.length ? "measured" : "unavailable",
      acceptedEvents: samples.length,
      duplicateEvents: this.duplicateEvents,
      conflictingEvents: this.conflictingEvents,
      rejectedEvents: this.rejectedEvents,
      truncatedEvents: this.truncatedEvents,
      inputTokens: sum("inputTokens"),
      outputTokens: sum("outputTokens"),
      reasoningTokens: sum("reasoningTokens"),
      cacheTokens: sum("cacheTokens"),
      costCoverageEvents,
      costUsd: completeCostCoverage && Number.isFinite(cost) ? cost : null,
    };
  }
}
