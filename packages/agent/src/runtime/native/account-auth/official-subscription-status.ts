import {
  getSubscriptionStatus,
  type SubscriptionAccountStatus,
} from "@elizaos/agent/auth/credentials";
import { buildProviderStatus } from "./account-auth-helpers";
import { withOfficialAuthHome } from "./store";
import type { LinkedProviderAccountStatus } from "./types";

const CACHE_TTL_MS = 3_000;

type OfficialSubscriptionProvider = "claude-code" | "codex";

interface SubscriptionStatusCache {
  expiresAt: number;
  rows: SubscriptionAccountStatus[];
}

interface OfficialSubscriptionStatusDependencies {
  getSubscriptionStatus(): SubscriptionAccountStatus[];
  now(): number;
}

const defaultDependencies: OfficialSubscriptionStatusDependencies = {
  getSubscriptionStatus: () =>
    withOfficialAuthHome(() => getSubscriptionStatus()),
  now: Date.now,
};

let statusCache: SubscriptionStatusCache | undefined;

function sdkProvider(provider: OfficialSubscriptionProvider) {
  return provider === "codex" ? "openai-codex" : "anthropic-subscription";
}

function statusSource(row: SubscriptionAccountStatus): string {
  return row.source ? `@elizaos/agent:${row.source}` : "@elizaos/agent";
}

function statusExpiry(row: SubscriptionAccountStatus): string | undefined {
  if (typeof row.expiresAt !== "number" || !Number.isFinite(row.expiresAt)) {
    return undefined;
  }
  const date = new Date(row.expiresAt);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function preferredRow(
  rows: SubscriptionAccountStatus[],
  provider: OfficialSubscriptionProvider,
): SubscriptionAccountStatus | undefined {
  const matching = rows.filter((row) => row.provider === sdkProvider(provider));
  return (
    matching.find((row) => row.configured && row.valid) ??
    matching.find((row) => row.configured)
  );
}

function isClaudeCliOnly(row: SubscriptionAccountStatus): boolean {
  return row.source === "claude-code-cli";
}

function projectStatus(
  provider: OfficialSubscriptionProvider,
  rows: SubscriptionAccountStatus[],
): LinkedProviderAccountStatus | undefined {
  const row = preferredRow(rows, provider);
  if (!row) return undefined;

  const ready = row.configured && row.valid;
  const fallbackReady =
    provider === "claude-code" && isClaudeCliOnly(row) && ready;
  const nativeReady = ready && !fallbackReady;
  const allowedClient = row.allowedClient?.trim();
  const availabilityReason = row.availabilityReason?.trim();

  return buildProviderStatus({
    provider,
    available: row.available !== false,
    reusable: ready,
    nativeReady,
    fallbackReady,
    source: statusSource(row),
    authMode:
      row.source === "setup-token"
        ? "setup-token"
        : provider === "codex"
          ? "chatgpt"
          : "oauth",
    lastRefresh: statusExpiry(row),
    accountLabel: row.label,
    loginCommand: provider === "codex" ? "codex login" : "claude auth login",
    setupCommand: provider === "claude-code" ? "claude setup-token" : undefined,
    detail: ready
      ? fallbackReady
        ? `Eliza detected a signed-in Claude Code CLI subscription${allowedClient ? ` for ${allowedClient}` : ""}.`
        : `Eliza detected a ready ${provider === "codex" ? "Codex" : "Claude"} subscription account${allowedClient ? ` for ${allowedClient}` : ""}.`
      : availabilityReason ||
        `Eliza detected ${row.label}, but its subscription credential is expired or unavailable.`,
  });
}

function readCachedStatus(
  dependencies: OfficialSubscriptionStatusDependencies,
): SubscriptionAccountStatus[] {
  const now = dependencies.now();
  if (statusCache && statusCache.expiresAt > now) return statusCache.rows;

  const rows = dependencies.getSubscriptionStatus();
  statusCache = {
    expiresAt: now + CACHE_TTL_MS,
    rows,
  };
  return rows;
}

/**
 * Project Eliza's SDK-owned subscription truth into Doolittle's provider UX.
 *
 * The official helper intentionally reads the real OS home/keychain. Explicit
 * home overrides are used by tests and migration tooling, so those stay on the
 * existing path-aware readers instead of accidentally reporting host state.
 */
export function getOfficialSubscriptionProviderStatus(
  provider: OfficialSubscriptionProvider,
  homePath?: string,
  dependencies: OfficialSubscriptionStatusDependencies = defaultDependencies,
): LinkedProviderAccountStatus | undefined {
  if (homePath !== undefined) return undefined;
  try {
    return projectStatus(provider, readCachedStatus(dependencies));
  } catch {
    return undefined;
  }
}

export function invalidateOfficialSubscriptionStatusCache(): void {
  statusCache = undefined;
}

export const __officialSubscriptionStatusTestOnly = {
  projectStatus,
  readCachedStatus,
};
