import type { PlatformName } from "@/types/gateway";
import type { PlatformHealth, PlatformLifecycleEvent } from "./platforms/base";

export interface GatewayTransportSummaryEntry {
  platform: PlatformName;
  source: string;
  operational: boolean;
  ready: boolean;
  transportState?: string;
  status?: PlatformHealth["status"];
  restartCount?: number;
  restartFailures?: number;
  backoffUntilAt?: string;
  traceCount: number;
  inboxCount: number;
  outboxCount: number;
  attachmentCount: number;
  mismatchFlags: string[];
  lastTraceKind?: string;
  lastEventKind?: PlatformLifecycleEvent["kind"];
  nativeMessagingSummary?: string;
}

export function summarizeTransportJournalEntry(
  entry: GatewayTransportSummaryEntry,
  lastActivityAt?: string,
): string {
  return [
    `${entry.platform}: source=${entry.source}`,
    `operational=${entry.operational}`,
    `ready=${entry.ready}`,
    `transportState=${entry.transportState ?? "n/a"}`,
    `status=${entry.status ?? "n/a"}`,
    `restarts=${entry.restartCount ?? 0}`,
    `failures=${entry.restartFailures ?? 0}`,
    entry.backoffUntilAt ? `backoffUntil=${entry.backoffUntilAt}` : null,
    `traces=${entry.traceCount}`,
    `inbox=${entry.inboxCount}`,
    `outbox=${entry.outboxCount}`,
    `attachments=${entry.attachmentCount}`,
    `mismatches=${entry.mismatchFlags.length ? entry.mismatchFlags.join("|") : "none"}`,
    `lastActivity=${lastActivityAt ?? "n/a"}`,
    `lastTrace=${entry.lastTraceKind ?? "n/a"}`,
    `lastEvent=${entry.lastEventKind ?? "n/a"}`,
    entry.nativeMessagingSummary
      ? `native=${entry.nativeMessagingSummary}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function countByPlatform<T, K extends PlatformName | "gateway">(
  records: T[],
  selector: (record: T) => K,
): Array<{ platform: K; count: number }> {
  const counts = new Map<K, { platform: K; count: number }>();
  for (const record of records) {
    const key = selector(record);
    const existing = counts.get(key) ?? { platform: key, count: 0 };
    existing.count += 1;
    counts.set(key, existing);
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

export function countByKind<T, K extends string>(
  records: T[],
  selector: (record: T) => K,
): Array<{ kind: K; count: number }> {
  const counts = new Map<K, { kind: K; count: number }>();
  for (const record of records) {
    const key = selector(record);
    const existing = counts.get(key) ?? { kind: key, count: 0 };
    existing.count += 1;
    counts.set(key, existing);
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

export function countByString<T>(
  records: T[],
  selector: (record: T) => string,
): Array<{ kind: string; count: number }> {
  const counts = new Map<string, { kind: string; count: number }>();
  for (const record of records) {
    const key = selector(record);
    const existing = counts.get(key) ?? { kind: key, count: 0 };
    existing.count += 1;
    counts.set(key, existing);
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}
