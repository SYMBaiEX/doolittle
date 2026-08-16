import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  fsyncSync,
  openSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { gatewayInboundIdempotencyKey } from "@/gateway/receive/idempotency";
import {
  appendGatewayJournalRecordDurably,
  ensureGatewayJournalFile,
  loadGatewayJournal,
} from "@/gateway/recording/journal";
import { redactTrajectoryText } from "@/services/trajectory/event-journal";
import type { IncomingPlatformMessage } from "@/types/gateway";

const VERSION = 1;
/** Retain recent terminal duplicate receipts; older provider retries fall back to receive idempotency. */
const MAX_TERMINAL_TOMBSTONES = 1_000;

export class GatewayIngressError extends Error {
  constructor(
    readonly code: "invalid_identity" | "digest_conflict" | "persistence",
    message: string,
  ) {
    super(message);
    this.name = "GatewayIngressError";
  }
}

export type GatewayIngressStatus =
  | "queued"
  | "processing"
  | "retrying"
  | "completed"
  | "rejected"
  | "failed"
  | "interrupted";

export interface GatewayIngressReceipt {
  receiptId: string;
  duplicate: boolean;
  status: GatewayIngressStatus;
}

interface GatewayIngressEvent {
  version: number;
  at: string;
  type: "accepted" | "status";
  receiptId: string;
  key: string;
  digest: string;
  message?: IncomingPlatformMessage;
  preview?: string;
  status: GatewayIngressStatus;
  error?: string;
  attempts?: number;
}

export interface GatewayIngressEntry {
  receiptId: string;
  key: string;
  digest: string;
  /** Present only while a receipt can still be processed or recovered. */
  message?: IncomingPlatformMessage;
  preview: string;
  status: GatewayIngressStatus;
  attempts: number;
  error?: string;
}

export interface GatewayIngressHistoryEntry {
  receiptId: string;
  status: GatewayIngressStatus;
  preview: string;
  error?: string;
}

export class GatewayIngressSpool {
  readonly pathname: string;
  private readonly entries = new Map<string, GatewayIngressEntry>();
  private readonly byKey = new Map<string, string>();

  constructor(
    journalDir: string,
    private readonly maxTerminalTombstones = MAX_TERMINAL_TOMBSTONES,
  ) {
    this.pathname = join(journalDir, "gateway-ingress.jsonl");
    ensureGatewayJournalFile(this.pathname);
    this.load();
    this.compactTerminalPayloads();
  }

  accept(
    message: IncomingPlatformMessage,
    abortSignal?: AbortSignal,
  ): GatewayIngressReceipt {
    if (abortSignal?.aborted) {
      throw new GatewayIngressError(
        "invalid_identity",
        "Request cancelled before inbound acceptance.",
      );
    }
    const messageId = message.messageId?.trim();
    const key = gatewayInboundIdempotencyKey(message);
    if (!messageId || !key) {
      throw new GatewayIngressError(
        "invalid_identity",
        "Inbound provider messages require a stable messageId.",
      );
    }
    const digest = digestIncomingMessage(message);
    const existingId = this.byKey.get(key);
    if (existingId) {
      const existing = this.entries.get(existingId);
      if (!existing) {
        throw new GatewayIngressError(
          "persistence",
          "Inbound receipt index is inconsistent.",
        );
      }
      if (existing.digest !== digest) {
        throw new GatewayIngressError(
          "digest_conflict",
          "Inbound message identity was reused with a different payload.",
        );
      }
      return {
        receiptId: existing.receiptId,
        duplicate: true,
        status: existing.status,
      };
    }
    const receiptId = deterministicReceiptId(key, digest);
    const entry: GatewayIngressEntry = {
      receiptId,
      key,
      digest,
      message,
      preview: message.text.slice(0, 280),
      status: "queued",
      attempts: 0,
    };
    // A request cancellation is only meaningful until the durable commit.
    if (abortSignal?.aborted) {
      throw new GatewayIngressError(
        "invalid_identity",
        "Request cancelled before inbound acceptance.",
      );
    }
    this.append({
      version: VERSION,
      at: new Date().toISOString(),
      type: "accepted",
      receiptId,
      key,
      digest,
      message,
      preview: entry.preview,
      status: "queued",
      attempts: 0,
    });
    this.entries.set(receiptId, entry);
    this.byKey.set(key, receiptId);
    return { receiptId, duplicate: false, status: "queued" };
  }

  pending(includeRetrying = true): GatewayIngressEntry[] {
    return [...this.entries.values()].filter(
      (entry) =>
        entry.status === "queued" ||
        (includeRetrying && entry.status === "retrying"),
    );
  }

  claim(receiptId: string): GatewayIngressEntry | undefined {
    const entry = this.entries.get(receiptId);
    if (!entry?.message) return undefined;
    if (entry.status !== "queued" && entry.status !== "retrying") {
      return undefined;
    }
    this.setStatus(entry, "processing", undefined, entry.attempts + 1);
    return this.entries.get(receiptId);
  }

  setStatus(
    entry: GatewayIngressEntry,
    status: GatewayIngressStatus,
    error?: string,
    attempts = entry.attempts,
  ): void {
    this.append({
      version: VERSION,
      at: new Date().toISOString(),
      type: "status",
      receiptId: entry.receiptId,
      key: entry.key,
      digest: entry.digest,
      status,
      error,
      attempts,
    });
    const next = { ...entry, status, error, attempts };
    this.entries.set(entry.receiptId, next);
    if (isTerminalIngressStatus(status)) {
      this.compactTerminalPayloads();
    }
  }

  markInterrupted(): void {
    for (const entry of this.entries.values()) {
      if (entry.status === "processing") this.setStatus(entry, "interrupted");
    }
  }

  history(limit = 20): GatewayIngressHistoryEntry[] {
    return [...this.entries.values()]
      .slice(-limit)
      .reverse()
      .map((entry) => ({
        receiptId: entry.receiptId,
        status: entry.status,
        preview: entry.preview,
        ...(entry.error ? { error: entry.error } : {}),
      }));
  }

  private append(event: GatewayIngressEvent): void {
    try {
      appendGatewayJournalRecordDurably(this.pathname, event);
    } catch (error) {
      throw new GatewayIngressError(
        "persistence",
        `Could not persist inbound receipt: ${sanitizeIngressError(error)}`,
      );
    }
  }

  private load(): void {
    for (const event of loadGatewayJournal<GatewayIngressEvent>(
      this.pathname,
    )) {
      if (
        event.version !== VERSION ||
        !event.receiptId ||
        !event.key ||
        !event.digest
      )
        continue;
      if (event.type === "accepted") {
        const entry: GatewayIngressEntry = {
          receiptId: event.receiptId,
          key: event.key,
          digest: event.digest,
          ...(event.message ? { message: event.message } : {}),
          preview: event.preview ?? event.message?.text.slice(0, 280) ?? "",
          status: event.status,
          attempts: event.attempts ?? 0,
        };
        this.entries.set(entry.receiptId, entry);
        this.byKey.set(entry.key, entry.receiptId);
      } else {
        const entry = this.entries.get(event.receiptId);
        if (entry)
          this.entries.set(entry.receiptId, {
            ...entry,
            status: event.status,
            error: event.error,
            attempts: event.attempts ?? entry.attempts,
          });
      }
    }
  }

  /**
   * Terminal receipt tombstones retain duplicate safety, but not private
   * payload. The rewrite is atomic: an interruption leaves either the old
   * complete journal or the new compact one, never a partially-written log.
   */
  private compactTerminalPayloads(): void {
    if (
      ![...this.entries.values()].some(
        (entry) => isTerminalIngressStatus(entry.status) && entry.message,
      )
    )
      return;
    const terminal = [...this.entries.values()].filter((entry) =>
      isTerminalIngressStatus(entry.status),
    );
    const discarded = terminal.slice(
      0,
      Math.max(0, terminal.length - this.maxTerminalTombstones),
    );
    const discardedIds = new Set(discarded.map((entry) => entry.receiptId));
    const retained = [...this.entries.values()].filter(
      (entry) => !discardedIds.has(entry.receiptId),
    );
    const compacted = retained.map(
      (entry): GatewayIngressEvent => ({
        version: VERSION,
        at: new Date().toISOString(),
        type: "accepted",
        receiptId: entry.receiptId,
        key: entry.key,
        digest: entry.digest,
        status: entry.status,
        attempts: entry.attempts,
        ...(entry.error ? { error: entry.error } : {}),
        preview: entry.preview,
        ...(!isTerminalIngressStatus(entry.status) && entry.message
          ? { message: entry.message }
          : {}),
      }),
    );
    const temporary = `${this.pathname}.compact`;
    try {
      writeFileSync(
        temporary,
        `${compacted.map((event) => JSON.stringify(event)).join("\n")}\n`,
        {
          encoding: "utf8",
          mode: 0o600,
        },
      );
      const descriptor = openSync(temporary, "r");
      try {
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      renameSync(temporary, this.pathname);
      chmodSync(this.pathname, 0o600);
      if (process.platform !== "win32") {
        const directory = openSync(dirname(this.pathname), "r");
        try {
          fsyncSync(directory);
        } finally {
          closeSync(directory);
        }
      }
      for (const entry of discarded) {
        this.entries.delete(entry.receiptId);
        this.byKey.delete(entry.key);
      }
      for (const [receiptId, entry] of this.entries) {
        if (isTerminalIngressStatus(entry.status)) {
          this.entries.set(receiptId, { ...entry, message: undefined });
        }
      }
    } catch {
      // Retain the original payload and retry compaction on the next terminal
      // transition/startup. Never sacrifice recoverability to compaction.
    }
  }
}

function isTerminalIngressStatus(status: GatewayIngressStatus): boolean {
  return status === "completed" || status === "rejected" || status === "failed";
}

export function digestIncomingMessage(
  message: IncomingPlatformMessage,
): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(message)))
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function deterministicReceiptId(key: string, digest: string): string {
  return createHash("sha256")
    .update(`${key}:${digest}`)
    .digest("hex")
    .slice(0, 32);
}

export function sanitizeIngressError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Inbound processing failed.";
  return redactTrajectoryText(message)
    .replace(/[\r\n]+/g, " ")
    .slice(0, 240);
}
