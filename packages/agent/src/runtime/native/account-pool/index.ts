import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type AccountPool,
  applyAccountPoolApiCredentials as applyOfficialAccountPoolApiCredentials,
  configureDefaultAccountPoolSelection,
  getDefaultAccountPool,
  type Strategy,
} from "@elizaos/auth/accounts";
import {
  type AccountCredentialRecord,
  loadAccount,
  saveAccount,
} from "@elizaos/auth/auth/account-storage";
import {
  deleteCredentials,
  getAccessToken,
  listProviderAccounts,
  saveCredentials,
} from "@elizaos/auth/auth/credentials";
import type {
  AccountCredentialProvider,
  OAuthCredentials,
} from "@elizaos/auth/auth/types";
import { getCodingAgentSelectorBridge } from "@elizaos/core";
import { invalidateOfficialSubscriptionStatusCache } from "../account-auth";
import { readJson, writeJson } from "../account-auth/shared";
import {
  DOOLITTLE_LINKED_ACCOUNT_IDS,
  getOfficialAccountStoragePolicy,
  getProviderAuthStorePath,
  getStoredClaudeCodeCredentials,
  getStoredCodexCredentials,
} from "../account-auth/store";

export const ACCOUNT_POOL_PROVIDERS = [
  "openai-codex",
  "anthropic-subscription",
  "openai-api",
  "anthropic-api",
] as const satisfies readonly AccountCredentialProvider[];

export const ACCOUNT_POOL_STRATEGIES = [
  "priority",
  "round-robin",
  "least-used",
  "quota-aware",
] as const satisfies readonly Strategy[];

export type AccountPoolProvider = (typeof ACCOUNT_POOL_PROVIDERS)[number];
export type AccountPoolStrategy = (typeof ACCOUNT_POOL_STRATEGIES)[number];

const DIRECT_API_PROVIDERS = ["openai-api", "anthropic-api"] as const;
type DirectApiProvider = (typeof DIRECT_API_PROVIDERS)[number];

const MATERIALIZED_API_ENV_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_BASE_URL",
] as const;
type MaterializedApiEnvKey = (typeof MATERIALIZED_API_ENV_KEYS)[number];
let projectedAccountApiBackend: string | undefined;
const materializedApiEnv = new Map<
  MaterializedApiEnvKey,
  { value: string; previous?: string }
>();

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
  inventory: "unchecked" | "ready" | "unavailable";
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
  providerId: Exclude<AccountPoolProvider, DirectApiProvider>,
): AccountCredentialRecord | null {
  if (providerId === "openai-codex") getStoredCodexCredentials();
  else getStoredClaudeCodeCredentials();
  return loadAccount(
    providerId,
    LINKED_ACCOUNT_IDS[providerId],
    getOfficialAccountStoragePolicy(),
  );
}

function isDirectApiProvider(value: unknown): value is DirectApiProvider {
  return (
    typeof value === "string" &&
    DIRECT_API_PROVIDERS.includes(value as DirectApiProvider)
  );
}

export function isDoolittleDirectApiProvider(
  value: unknown,
): value is DirectApiProvider {
  return isDirectApiProvider(value);
}

function validateAccountImport(accountId: string, label: string) {
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
  return { normalizedId, normalizedLabel };
}

function importLegacyAccount(
  providerId: Exclude<AccountPoolProvider, DirectApiProvider>,
  credentials: OAuthCredentials | undefined,
  label: string,
  accountId: string = LINKED_ACCOUNT_IDS[providerId],
  organizationId?: string,
  overwriteExisting = false,
): boolean {
  const existing = loadAccount(
    providerId,
    accountId,
    getOfficialAccountStoragePolicy(),
  );
  if (!credentials || (existing && !overwriteExisting)) {
    return false;
  }
  saveCredentials(
    providerId,
    credentials,
    accountId,
    getOfficialAccountStoragePolicy(),
  );
  const record = loadAccount(
    providerId,
    accountId,
    getOfficialAccountStoragePolicy(),
  );
  if (
    record &&
    ((!existing && record.label !== label) ||
      (organizationId && record.organizationId !== organizationId))
  ) {
    saveAccount(
      {
        ...record,
        ...(!existing && record.label !== label ? { label } : {}),
        ...(organizationId ? { organizationId } : {}),
      },
      getOfficialAccountStoragePolicy(),
    );
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
  if (isDirectApiProvider(providerId)) {
    throw new Error("provider must be a subscription account provider");
  }
  const { normalizedId, normalizedLabel } = validateAccountImport(
    accountId,
    label,
  );
  const linked = linkedOfficialAccount(providerId);
  const imported = importLegacyAccount(
    providerId,
    linked?.credentials,
    normalizedLabel,
    normalizedId,
    linked?.organizationId,
    true,
  );
  if (
    !imported &&
    !loadAccount(providerId, normalizedId, getOfficialAccountStoragePolicy())
  ) {
    return null;
  }
  invalidateOfficialSubscriptionStatusCache();
  const pool = getDoolittleAccountPool();
  const account = pool.get(normalizedId, providerId);
  return account
    ? rememberPoolAccount(pool, toSnapshot(account as never))
    : null;
}

/** Import a resolved API key into the SDK-owned direct-provider account store. */
export function importDoolittleApiAccount(
  providerId: AccountPoolProvider,
  accountId: string,
  label: string,
  secretValue: string,
): AccountPoolAccountSnapshot | null {
  if (!isDirectApiProvider(providerId)) {
    throw new Error("provider must be openai-api or anthropic-api");
  }
  const { normalizedId, normalizedLabel } = validateAccountImport(
    accountId,
    label,
  );
  const value = secretValue.trim();
  if (!value) throw new Error("resolved secret value must be non-empty");
  const existing = loadAccount(
    providerId,
    normalizedId,
    getOfficialAccountStoragePolicy(),
  );
  const now = Date.now();
  saveAccount(
    {
      id: normalizedId,
      providerId,
      label: normalizedLabel,
      source: "api-key",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      credentials: {
        access: value,
        refresh: "",
        expires: Number.MAX_SAFE_INTEGER,
      },
    },
    getOfficialAccountStoragePolicy(),
  );
  const pool = getDoolittleAccountPool();
  const account = pool.get(normalizedId, providerId);
  return account
    ? rememberPoolAccount(pool, toSnapshot(account as never))
    : null;
}

/**
 * Migrates legacy singleton credentials into stable official account records.
 * The account-auth adapter removes each legacy key only after verified SDK
 * persistence; existing official records always win over stale legacy input.
 */
export function importLegacyDoolittleAccounts(): number {
  const codexId = LINKED_ACCOUNT_IDS["openai-codex"];
  const claudeId = LINKED_ACCOUNT_IDS["anthropic-subscription"];
  const hadCodex = Boolean(
    loadAccount("openai-codex", codexId, getOfficialAccountStoragePolicy()),
  );
  const hadClaude = Boolean(
    loadAccount(
      "anthropic-subscription",
      claudeId,
      getOfficialAccountStoragePolicy(),
    ),
  );
  getStoredCodexCredentials();
  getStoredClaudeCodeCredentials();
  const imported =
    Number(
      !hadCodex &&
        Boolean(
          loadAccount(
            "openai-codex",
            codexId,
            getOfficialAccountStoragePolicy(),
          ),
        ),
    ) +
    Number(
      !hadClaude &&
        Boolean(
          loadAccount(
            "anthropic-subscription",
            claudeId,
            getOfficialAccountStoragePolicy(),
          ),
        ),
    );
  if (imported > 0) invalidateOfficialSubscriptionStatusCache();
  return imported;
}

/** Install SDK routing at boot without opening or migrating saved credentials. */
export function initializeDoolittleAccountPool(dataDir?: string): AccountPool {
  // The official storage helpers resolve ELIZA_HOME themselves. Bind it once
  // before the first SDK call so pool metadata and credentials share
  // Doolittle's configured data root, while respecting an operator override.
  if (dataDir?.trim()) {
    process.env.DOOLITTLE_DATA_DIR ??= dataDir;
    process.env.ELIZA_HOME ??= dataDir;
    process.env.ELIZA_STATE_DIR ??= process.env.ELIZA_HOME;
  }
  configurePoolSelection();
  const pool = getDefaultAccountPool();
  return pool;
}

/** Apply the official SDK account-pool API credential bridge. */
export function applyAccountPoolApiCredentials(
  options: Parameters<typeof applyOfficialAccountPoolApiCredentials>[0] = {},
): Promise<void> {
  clearMaterializedAccountPoolApiCredentials();

  const previous = Object.fromEntries(
    MATERIALIZED_API_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<MaterializedApiEnvKey, string | undefined>;
  return applyOfficialAccountPoolApiCredentials(options).then(() => {
    projectedAccountApiBackend = options.activeBackend ?? undefined;
    for (const key of MATERIALIZED_API_ENV_KEYS) {
      const value = process.env[key];
      if (value && value !== previous[key]) {
        materializedApiEnv.set(key, { value, previous: previous[key] });
      }
    }
  });
}

export async function ensureActiveDirectApiAccountCredentials(
  backend: "openai" | "anthropic",
): Promise<void> {
  const envKey = backend === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
  const current = process.env[envKey];
  const explicitlyConfigured =
    current?.trim() && current !== materializedApiEnv.get(envKey)?.value;
  if (!explicitlyConfigured && projectedAccountApiBackend !== backend) {
    await applyAccountPoolApiCredentials({ activeBackend: backend });
  }
}

/**
 * Restore operator-owned environment values before a linked provider takes
 * over. The official bridge applies all direct API accounts, so activation of
 * an OAuth/cloud provider must clear Doolittle's tracked projection without
 * immediately re-materializing another direct token.
 */
export function clearMaterializedAccountPoolApiCredentials(): void {
  projectedAccountApiBackend = undefined;
  for (const [key, materialized] of materializedApiEnv) {
    if (process.env[key] !== materialized.value) continue;
    if (materialized.previous === undefined) delete process.env[key];
    else process.env[key] = materialized.previous;
  }
  materializedApiEnv.clear();
}

export function getDoolittleAccountPool(): AccountPool {
  return getDefaultAccountPool();
}

/** Resolve one selected SDK account without falling back to ambient credentials. */
export function isDoolittleAccountEnabled(
  provider: AccountPoolProvider,
  accountId: string,
): boolean {
  return getDoolittleAccountPool().get(accountId, provider)?.enabled === true;
}

export async function resolveEnabledDoolittleAccountToken(
  provider: AccountPoolProvider,
  accountId: string,
): Promise<string | null> {
  if (!isDoolittleAccountEnabled(provider, accountId)) return null;
  const token = await getAccessToken(provider, accountId, {
    storagePolicy: getOfficialAccountStoragePolicy(),
  });
  return isDoolittleAccountEnabled(provider, accountId) ? token : null;
}

export function isAccountPoolProvider(
  value: unknown,
): value is AccountPoolProvider {
  return (
    typeof value === "string" &&
    ACCOUNT_POOL_PROVIDERS.includes(value as AccountPoolProvider)
  );
}

type ObservedAccountPool = {
  inventory: AccountPoolSnapshot["inventory"];
  accounts: AccountPoolAccountSnapshot[];
};

const observedPoolAccounts = new WeakMap<AccountPool, ObservedAccountPool>();

/** Read only metadata captured during explicitly authorized account actions. */
export function readDoolittleAccountPoolSnapshot(
  pool = getDoolittleAccountPool(),
): AccountPoolSnapshot {
  const observed = observedPoolAccounts.get(pool);
  const accounts = observed?.accounts ?? [];
  const strategies = readStrategies();
  return {
    bridgeInstalled: Boolean(getCodingAgentSelectorBridge()),
    inventory: observed?.inventory ?? "unchecked",
    providers: Object.fromEntries(
      ACCOUNT_POOL_PROVIDERS.map((providerId) => [
        providerId,
        {
          strategy: strategies[providerId] ?? "priority",
          accounts: accounts.filter(
            (account) => account.providerId === providerId,
          ),
        },
      ]),
    ) as AccountPoolSnapshot["providers"],
  };
}

export class AccountPoolInventoryUnavailableError extends Error {}

export function markDoolittleAccountPoolInventoryUnavailable(
  pool = getDoolittleAccountPool(),
): void {
  observedPoolAccounts.set(pool, {
    inventory: "unavailable",
    accounts: observedPoolAccounts.get(pool)?.accounts ?? [],
  });
}

export function refreshDoolittleAccountPoolInventory(
  pool = getDoolittleAccountPool(),
): AccountPoolSnapshot {
  try {
    const accounts = pool
      .list()
      .filter((account) => isAccountPoolProvider(account.providerId))
      .map((account) => toSnapshot(account as never));
    observedPoolAccounts.set(pool, { inventory: "ready", accounts });
    return readDoolittleAccountPoolSnapshot(pool);
  } catch (error) {
    markDoolittleAccountPoolInventoryUnavailable(pool);
    throw new AccountPoolInventoryUnavailableError(
      "Saved accounts could not be read. Unlock credential storage and try Check accounts again.",
      { cause: error },
    );
  }
}

function rememberPoolAccount(
  pool: AccountPool,
  account: AccountPoolAccountSnapshot,
): AccountPoolAccountSnapshot {
  const observed = observedPoolAccounts.get(pool);
  const accounts = observed?.accounts ?? [];
  const index = accounts.findIndex(
    (entry) =>
      entry.providerId === account.providerId &&
      entry.accountId === account.accountId,
  );
  observedPoolAccounts.set(pool, {
    inventory: observed?.inventory ?? "unchecked",
    accounts:
      index < 0
        ? [...accounts, account]
        : accounts.map((entry, current) =>
            current === index ? account : entry,
          ),
  });
  return account;
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
  return account
    ? rememberPoolAccount(pool, toSnapshot(account as never))
    : null;
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
  let failure: string | undefined;
  try {
    const token = await resolveAccessToken(providerId, accountId, {
      storagePolicy: getOfficialAccountStoragePolicy(),
    });
    if (token) {
      await pool.markHealthy(accountId, { providerId });
    } else {
      failure = credentialError();
      await markCredentialFailure(pool, providerId, accountId);
    }
  } catch (error) {
    failure = credentialError();
    await markCredentialFailure(pool, providerId, accountId, error);
  }
  const latencyMs = Date.now() - startedAt;
  const updated = pool.get(accountId, providerId);
  if (updated) rememberPoolAccount(pool, toSnapshot(updated as never));
  return failure
    ? { ok: false, latencyMs, error: failure }
    : { ok: true, latencyMs };
}

/**
 * Reconcile pool health after the native provider layer refreshes its local
 * CLI credential. The token remains inside the official Eliza credential
 * service; this only updates health metadata used by routing and the desktop.
 */
export async function reconcileDoolittleAccountPoolCredentials(
  providerId: AccountPoolProvider | "all" = "all",
  pool = getDoolittleAccountPool(),
  resolveAccessToken: typeof getAccessToken = getAccessToken,
): Promise<AccountPoolSnapshot> {
  const providers =
    providerId === "all" ? ACCOUNT_POOL_PROVIDERS : [providerId];
  for (const candidateProvider of providers) {
    for (const account of pool.list(candidateProvider)) {
      await testDoolittleAccountCredentials(
        candidateProvider,
        account.id,
        pool,
        resolveAccessToken,
      );
    }
  }
  return refreshDoolittleAccountPoolInventory(pool);
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
    const accessToken = await resolveAccessToken(providerId, accountId, {
      storagePolicy: getOfficialAccountStoragePolicy(),
    });
    if (!accessToken) {
      await markCredentialFailure(pool, providerId, accountId);
      const account = pool.get(accountId, providerId);
      return account
        ? {
            account: rememberPoolAccount(pool, toSnapshot(account as never)),
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
      ? {
          account: rememberPoolAccount(pool, toSnapshot(account as never)),
          source: "pool",
        }
      : null;
  } catch (error) {
    await markCredentialFailure(pool, providerId, accountId, error);
    const account = pool.get(accountId, providerId);
    return account
      ? {
          account: rememberPoolAccount(pool, toSnapshot(account as never)),
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
  const credentialRecord = loadAccount(
    providerId,
    accountId,
    getOfficialAccountStoragePolicy(),
  );
  if (label && credentialRecord) {
    saveAccount(
      { ...credentialRecord, label },
      getOfficialAccountStoragePolicy(),
    );
  }
  await pool.upsert({
    ...account,
    ...(label ? { label } : {}),
    ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
    ...(typeof priority === "number" ? { priority } : {}),
  });
  return rememberPoolAccount(
    pool,
    toSnapshot(pool.get(accountId, providerId) as never),
  );
}

/** Removes the official credential record and its SDK metadata overlay. */
export async function deleteDoolittleAccount(
  providerId: AccountPoolProvider,
  accountId: string,
  pool = getDoolittleAccountPool(),
): Promise<boolean> {
  if (!pool.get(accountId, providerId)) return false;
  await pool.deleteMetadata(providerId, accountId);
  deleteCredentials(
    providerId as Parameters<typeof deleteCredentials>[0],
    accountId,
    getOfficialAccountStoragePolicy(),
  );
  const observed = observedPoolAccounts.get(pool);
  if (observed) {
    observedPoolAccounts.set(pool, {
      inventory: observed.inventory,
      accounts: observed.accounts.filter(
        (entry) =>
          entry.providerId !== providerId || entry.accountId !== accountId,
      ),
    });
  }
  invalidateOfficialSubscriptionStatusCache();
  return true;
}

export function listDoolittleProviderCredentials(
  providerId: AccountPoolProvider,
): AccountCredentialRecord[] {
  return listProviderAccounts(providerId, getOfficialAccountStoragePolicy());
}
