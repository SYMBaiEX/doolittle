import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type AccountCredentialRecord,
  loadAccount,
  saveAccount,
} from "@elizaos/agent/auth/account-storage";
import {
  deleteCredentials,
  getAccessToken,
  listProviderAccounts,
  saveCredentials,
} from "@elizaos/agent/auth/credentials";
import type {
  AccountCredentialProvider,
  OAuthCredentials,
} from "@elizaos/agent/auth/types";
import {
  type AccountPool,
  configureDefaultAccountPoolSelection,
  getDefaultAccountPool,
  type Strategy,
  startAccountPoolKeepAlive,
} from "@elizaos/app-core/account-pool";
import * as elizaCore from "@elizaos/core";
import { readJson, writeJson } from "@/runtime/native/account-auth/shared";
import {
  DOOLITTLE_LINKED_ACCOUNT_IDS,
  getProviderAuthStorePath,
  getStoredClaudeCodeCredentials,
  getStoredCodexCredentials,
} from "@/runtime/native/account-auth/store";
import {
  type CodingBridge,
  getCodingAgentBridge,
  hasOfficialCodingAgentBridgeAccessors,
  setCodingAgentBridge,
} from "./coding-bridge-compat";

export const ACCOUNT_POOL_PROVIDERS = [
  "openai-codex",
  "anthropic-subscription",
] as const satisfies readonly AccountCredentialProvider[];

export const ACCOUNT_POOL_STRATEGIES = [
  "priority",
  "round-robin",
  "least-used",
  "quota-aware",
] as const satisfies readonly Strategy[];

export type AccountPoolProvider = (typeof ACCOUNT_POOL_PROVIDERS)[number];
export type AccountPoolStrategy = (typeof ACCOUNT_POOL_STRATEGIES)[number];

const DOOLITTLE_BRIDGE_MARKER = "__doolittleAccountPoolBridge";

export interface AccountPoolAccountSnapshot {
  providerId: AccountPoolProvider;
  accountId: string;
  label: string;
  source: "oauth" | "api-key";
  enabled: boolean;
  priority: number;
  createdAt: number;
  lastUsedAt?: number;
  health: string;
  healthDetail?: { until?: number; lastChecked?: number };
  usage?: {
    sessionPct?: number;
    weeklyPct?: number;
    resetsAt?: number;
    refreshedAt?: number;
  };
}

export interface AccountPoolSnapshot {
  bridgeInstalled: boolean;
  providers: Record<
    AccountPoolProvider,
    { strategy: AccountPoolStrategy; accounts: AccountPoolAccountSnapshot[] }
  >;
}

export interface AccountPoolCredentialTestResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface AccountPoolUsageRefreshResult {
  account: AccountPoolAccountSnapshot;
  source: "pool" | "credential";
  error?: string;
}

const LINKED_ACCOUNT_IDS = {
  "openai-codex": DOOLITTLE_LINKED_ACCOUNT_IDS.codex,
  "anthropic-subscription": DOOLITTLE_LINKED_ACCOUNT_IDS["claude-code"],
} as const;

function isStrategy(value: unknown): value is AccountPoolStrategy {
  return (
    typeof value === "string" &&
    ACCOUNT_POOL_STRATEGIES.includes(value as AccountPoolStrategy)
  );
}

function getStrategyStorePath(): string {
  return join(
    dirname(getProviderAuthStorePath()),
    "account-pool-strategies.json",
  );
}

function readStrategies(): Partial<
  Record<AccountPoolProvider, AccountPoolStrategy>
> {
  const path = getStrategyStorePath();
  if (!existsSync(path)) return {};
  const stored = readJson(path) as
    | { strategies?: Record<string, unknown> }
    | undefined;
  return Object.fromEntries(
    ACCOUNT_POOL_PROVIDERS.flatMap((providerId) => {
      const strategy = stored?.strategies?.[providerId];
      return isStrategy(strategy) ? [[providerId, strategy]] : [];
    }),
  );
}

function configurePoolSelection(): void {
  configureDefaultAccountPoolSelection({ accountStrategies: readStrategies() });
}

function readStrategy(providerId: AccountPoolProvider): AccountPoolStrategy {
  return readStrategies()[providerId] ?? "priority";
}

type DoolittleCodingBridge = CodingBridge & {
  [DOOLITTLE_BRIDGE_MARKER]?: boolean;
};

function providerForCodingAgent(
  agentType: string,
): AccountPoolProvider | undefined {
  switch (agentType.toLowerCase()) {
    case "codex":
      return "openai-codex";
    case "claude":
      return "anthropic-subscription";
    default:
      return undefined;
  }
}

/**
 * beta.7's bridge only applies its global environment strategy. Wrap that
 * legacy selection call narrowly so Doolittle's persisted per-provider choice
 * reaches Codex/Claude spawns. Newer SDKs expose public bridge accessors and
 * honor configured accountStrategies directly, so they bypass this wrapper.
 */
function installDoolittleCodingBridge(): void {
  if (hasOfficialCodingAgentBridgeAccessors(elizaCore)) return;
  const bridge = getCodingAgentBridge(
    elizaCore,
  ) as DoolittleCodingBridge | null;
  if (!bridge || bridge[DOOLITTLE_BRIDGE_MARKER]) return;
  const select = bridge.select.bind(bridge);
  const wrappedBridge: DoolittleCodingBridge = {
    ...bridge,
    [DOOLITTLE_BRIDGE_MARKER]: true,
    select: (
      agentType: string,
      options?: { strategy?: string; [key: string]: unknown },
    ) => {
      const providerId = providerForCodingAgent(agentType);
      return select(agentType, {
        ...options,
        strategy:
          options?.strategy ??
          (providerId ? readStrategy(providerId) : undefined),
      });
    },
  };
  setCodingAgentBridge(elizaCore, wrappedBridge);
}

export function setDoolittleAccountPoolStrategy(
  providerId: AccountPoolProvider,
  strategy: unknown,
): AccountPoolStrategy {
  if (!isStrategy(strategy)) {
    throw new Error(
      "strategy must be priority, round-robin, least-used, or quota-aware",
    );
  }
  const strategies = { ...readStrategies(), [providerId]: strategy };
  writeJson(getStrategyStorePath(), { version: 1, strategies });
  configurePoolSelection();
  return strategy;
}

function toSnapshot(account: {
  providerId: AccountPoolProvider;
  id: string;
  label: string;
  source: "oauth" | "api-key";
  enabled: boolean;
  priority: number;
  createdAt: number;
  lastUsedAt?: number;
  health: string;
  healthDetail?: { until?: number; lastChecked?: number };
  usage?: {
    sessionPct?: number;
    weeklyPct?: number;
    resetsAt?: number;
    refreshedAt?: number;
  };
}): AccountPoolAccountSnapshot {
  return {
    providerId: account.providerId,
    accountId: account.id,
    label: account.label,
    source: account.source,
    enabled: account.enabled,
    priority: account.priority,
    createdAt: account.createdAt,
    ...(account.lastUsedAt === undefined
      ? {}
      : { lastUsedAt: account.lastUsedAt }),
    health: account.health,
    ...(account.healthDetail === undefined
      ? {}
      : {
          healthDetail: {
            ...(typeof account.healthDetail.until === "number"
              ? { until: account.healthDetail.until }
              : {}),
            ...(typeof account.healthDetail.lastChecked === "number"
              ? { lastChecked: account.healthDetail.lastChecked }
              : {}),
          },
        }),
    ...(account.usage === undefined
      ? {}
      : {
          usage: {
            ...(typeof account.usage.sessionPct === "number"
              ? { sessionPct: account.usage.sessionPct }
              : {}),
            ...(typeof account.usage.weeklyPct === "number"
              ? { weeklyPct: account.usage.weeklyPct }
              : {}),
            ...(typeof account.usage.resetsAt === "number"
              ? { resetsAt: account.usage.resetsAt }
              : {}),
            ...(typeof account.usage.refreshedAt === "number"
              ? { refreshedAt: account.usage.refreshedAt }
              : {}),
          },
        }),
  };
}

function linkedOfficialAccount(
  providerId: AccountPoolProvider,
): AccountCredentialRecord | null {
  if (providerId === "openai-codex") getStoredCodexCredentials();
  else getStoredClaudeCodeCredentials();
  return loadAccount(providerId, LINKED_ACCOUNT_IDS[providerId]);
}

function importLegacyAccount(
  providerId: AccountPoolProvider,
  credentials: OAuthCredentials | undefined,
  label: string,
  accountId: string = LINKED_ACCOUNT_IDS[providerId],
  organizationId?: string,
  overwriteExisting = false,
): boolean {
  const existing = loadAccount(providerId, accountId);
  if (!credentials || (existing && !overwriteExisting)) {
    return false;
  }
  saveCredentials(providerId, credentials, accountId);
  const record = loadAccount(providerId, accountId);
  if (
    record &&
    ((!existing && record.label !== label) ||
      (organizationId && record.organizationId !== organizationId))
  ) {
    saveAccount({
      ...record,
      ...(!existing && record.label !== label ? { label } : {}),
      ...(organizationId ? { organizationId } : {}),
    });
  }
  return true;
}

/**
 * Captures the currently linked native sign-in into a new official account
 * record. The request carries only an account id and a display label; tokens
 * are read locally and never returned by this adapter or its HTTP routes.
 */
export function importCurrentDoolittleAccount(
  providerId: AccountPoolProvider,
  accountId: string,
  label: string,
): AccountPoolAccountSnapshot | null {
  const normalizedId = accountId.trim();
  const normalizedLabel = label.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(normalizedId)) {
    throw new Error(
      "accountId must contain 1 to 120 letters, numbers, dots, underscores, or hyphens",
    );
  }
  if (!normalizedLabel || normalizedLabel.length > 120) {
    throw new Error(
      "label must be a non-empty string of at most 120 characters",
    );
  }
  const linked = linkedOfficialAccount(providerId);
  const imported = importLegacyAccount(
    providerId,
    linked?.credentials,
    normalizedLabel,
    normalizedId,
    linked?.organizationId,
    true,
  );
  if (!imported && !loadAccount(providerId, normalizedId)) {
    return null;
  }
  const account = getDoolittleAccountPool().get(normalizedId, providerId);
  return account ? toSnapshot(account as never) : null;
}

/**
 * Migrates legacy singleton credentials into stable official account records.
 * The account-auth adapter removes each legacy key only after verified SDK
 * persistence; existing official records always win over stale legacy input.
 */
export function importLegacyDoolittleAccounts(): number {
  const codexId = LINKED_ACCOUNT_IDS["openai-codex"];
  const claudeId = LINKED_ACCOUNT_IDS["anthropic-subscription"];
  const hadCodex = Boolean(loadAccount("openai-codex", codexId));
  const hadClaude = Boolean(loadAccount("anthropic-subscription", claudeId));
  getStoredCodexCredentials();
  getStoredClaudeCodeCredentials();
  return (
    Number(!hadCodex && Boolean(loadAccount("openai-codex", codexId))) +
    Number(
      !hadClaude && Boolean(loadAccount("anthropic-subscription", claudeId)),
    )
  );
}

/** Construct the SDK singleton and its official orchestrator bridge at boot. */
export function initializeDoolittleAccountPool(dataDir?: string): AccountPool {
  // The official storage helpers resolve ELIZA_HOME themselves. Bind it once
  // before the first SDK call so pool metadata and credentials share
  // Doolittle's configured data root, while respecting an operator override.
  if (dataDir?.trim()) {
    process.env.DOOLITTLE_DATA_DIR ??= dataDir;
    process.env.ELIZA_HOME ??= dataDir;
  }
  configurePoolSelection();
  importLegacyDoolittleAccounts();
  const pool = getDefaultAccountPool();
  installDoolittleCodingBridge();
  startAccountPoolKeepAlive();
  return pool;
}

export function getDoolittleAccountPool(): AccountPool {
  return getDefaultAccountPool();
}

export function isAccountPoolProvider(
  value: unknown,
): value is AccountPoolProvider {
  return (
    typeof value === "string" &&
    ACCOUNT_POOL_PROVIDERS.includes(value as AccountPoolProvider)
  );
}

export function snapshotDoolittleAccountPool(
  pool = getDoolittleAccountPool(),
): AccountPoolSnapshot {
  return {
    bridgeInstalled: Boolean(getCodingAgentBridge(elizaCore)),
    providers: Object.fromEntries(
      ACCOUNT_POOL_PROVIDERS.map((providerId) => [
        providerId,
        {
          strategy: readStrategy(providerId),
          accounts: pool
            .list(providerId)
            .map((account) => toSnapshot(account as never)),
        },
      ]),
    ) as AccountPoolSnapshot["providers"],
  };
}

export async function selectDoolittleAccount(
  providerId: AccountPoolProvider,
  input: { strategy?: unknown; sessionKey?: unknown } = {},
  pool = getDoolittleAccountPool(),
): Promise<AccountPoolAccountSnapshot | null> {
  const strategy = isStrategy(input.strategy)
    ? input.strategy
    : readStrategy(providerId);
  const account = await pool.select({
    providerId,
    strategy,
    ...(typeof input.sessionKey === "string" && input.sessionKey.trim()
      ? { sessionKey: input.sessionKey.trim() }
      : {}),
  });
  return account ? toSnapshot(account as never) : null;
}

function credentialError(): string {
  // Refresh grants can include provider response details. Keep those out of
  // the operator surface, which is also rendered in desktop logs.
  return "Unable to resolve credentials for this account.";
}

async function markCredentialFailure(
  pool: AccountPool,
  providerId: AccountPoolProvider,
  accountId: string,
  error?: unknown,
): Promise<void> {
  const status =
    error &&
    typeof error === "object" &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : undefined;
  if (status === 429) {
    await pool.markRateLimited(
      accountId,
      Date.now() + 60_000,
      "Usage request was rate limited.",
      { providerId },
    );
    return;
  }
  await pool.markNeedsReauth(accountId, credentialError(), { providerId });
}

/** Resolve (and, when necessary, refresh) a credential without exposing it. */
export async function testDoolittleAccountCredentials(
  providerId: AccountPoolProvider,
  accountId: string,
  pool = getDoolittleAccountPool(),
  resolveAccessToken: typeof getAccessToken = getAccessToken,
): Promise<AccountPoolCredentialTestResult | null> {
  if (!pool.get(accountId, providerId)) return null;
  const startedAt = Date.now();
  try {
    const accessToken = await resolveAccessToken(providerId, accountId);
    const latencyMs = Date.now() - startedAt;
    if (!accessToken) {
      await markCredentialFailure(pool, providerId, accountId);
      return { ok: false, latencyMs, error: credentialError() };
    }
    await pool.markHealthy(accountId, { providerId });
    return { ok: true, latencyMs };
  } catch (error) {
    await markCredentialFailure(pool, providerId, accountId, error);
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: credentialError(),
    };
  }
}

/** Refresh the SDK-owned usage view after resolving the account credential. */
export async function refreshDoolittleAccountUsage(
  providerId: AccountPoolProvider,
  accountId: string,
  pool = getDoolittleAccountPool(),
  resolveAccessToken: typeof getAccessToken = getAccessToken,
): Promise<AccountPoolUsageRefreshResult | null> {
  const linked = pool.get(accountId, providerId);
  if (!linked) return null;
  try {
    const accessToken = await resolveAccessToken(providerId, accountId);
    if (!accessToken) {
      await markCredentialFailure(pool, providerId, accountId);
      const account = pool.get(accountId, providerId);
      return account
        ? {
            account: toSnapshot(account as never),
            source: "credential",
            error: credentialError(),
          }
        : null;
    }
    await pool.refreshUsage(accountId, accessToken, {
      providerId,
      ...(providerId === "openai-codex" && linked.organizationId
        ? { codexAccountId: linked.organizationId }
        : {}),
    });
    const account = pool.get(accountId, providerId);
    return account
      ? { account: toSnapshot(account as never), source: "pool" }
      : null;
  } catch (error) {
    await markCredentialFailure(pool, providerId, accountId, error);
    const account = pool.get(accountId, providerId);
    return account
      ? {
          account: toSnapshot(account as never),
          source: "credential",
          error: credentialError(),
        }
      : null;
  }
}

export async function updateDoolittleAccount(
  providerId: AccountPoolProvider,
  accountId: string,
  patch: { label?: unknown; enabled?: unknown; priority?: unknown },
  pool = getDoolittleAccountPool(),
): Promise<AccountPoolAccountSnapshot | null> {
  const account = pool.get(accountId, providerId);
  if (!account) return null;
  const label =
    typeof patch.label === "string" ? patch.label.trim() : undefined;
  if (patch.label !== undefined && (!label || label.length > 120)) {
    throw new Error(
      "label must be a non-empty string of at most 120 characters",
    );
  }
  if (patch.enabled !== undefined && typeof patch.enabled !== "boolean") {
    throw new Error("enabled must be a boolean");
  }
  const priority = patch.priority;
  if (
    priority !== undefined &&
    (typeof priority !== "number" ||
      !Number.isInteger(priority) ||
      priority < 0 ||
      priority > 10_000)
  ) {
    throw new Error("priority must be an integer from 0 to 10000");
  }
  if (
    label === undefined &&
    patch.enabled === undefined &&
    patch.priority === undefined
  ) {
    throw new Error("set at least one of label, enabled, or priority");
  }
  const credentialRecord = loadAccount(providerId, accountId);
  if (label && credentialRecord) {
    saveAccount({ ...credentialRecord, label });
  }
  await pool.upsert({
    ...account,
    ...(label ? { label } : {}),
    ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
    ...(typeof priority === "number" ? { priority } : {}),
  });
  return toSnapshot(pool.get(accountId, providerId) as never);
}

/** Removes the official credential record and its SDK metadata overlay. */
export async function deleteDoolittleAccount(
  providerId: AccountPoolProvider,
  accountId: string,
  pool = getDoolittleAccountPool(),
): Promise<boolean> {
  if (!pool.get(accountId, providerId)) return false;
  await pool.deleteMetadata(providerId, accountId);
  deleteCredentials(providerId, accountId);
  return true;
}

export function listDoolittleProviderCredentials(
  providerId: AccountPoolProvider,
): AccountCredentialRecord[] {
  return listProviderAccounts(providerId);
}
