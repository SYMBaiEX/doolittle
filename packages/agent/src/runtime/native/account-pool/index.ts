import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type AccountCredentialRecord,
  loadAccount,
  saveAccount,
} from "@elizaos/agent/auth/account-storage";
import {
  deleteCredentials,
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
import { readJson, writeJson } from "@/runtime/native/account-auth/shared";
import {
  getProviderAuthStorePath,
  getStoredClaudeCodeCredentials,
  getStoredCodexCredentials,
} from "@/runtime/native/account-auth/store";

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

const CODING_BRIDGE_SYMBOL = Symbol.for("eliza.account-pool.coding-agent.v1");
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

const LEGACY_ACCOUNT_IDS = {
  "openai-codex": "doolittle-legacy-codex",
  "anthropic-subscription": "doolittle-legacy-claude-code",
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

type CodingBridge = {
  describe(): unknown;
  select(
    agentType: string,
    options?: { strategy?: AccountPoolStrategy; [key: string]: unknown },
  ): Promise<unknown>;
  markRateLimited(...args: unknown[]): Promise<void>;
  markNeedsReauth(...args: unknown[]): Promise<void>;
  recordUsage(...args: unknown[]): Promise<void>;
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
 * The official bridge deliberately only has a global environment strategy.
 * Wrap its selection call narrowly so Doolittle's persisted per-provider
 * strategy reaches Codex/Claude spawns while the SDK still owns credentials,
 * health, usage, and process-specific environment materialization.
 */
function installDoolittleCodingBridge(): void {
  const bridge = (globalThis as Record<symbol, unknown>)[
    CODING_BRIDGE_SYMBOL
  ] as CodingBridge | undefined;
  if (!bridge || bridge[DOOLITTLE_BRIDGE_MARKER]) return;
  const select = bridge.select.bind(bridge);
  (globalThis as Record<symbol, unknown>)[CODING_BRIDGE_SYMBOL] = {
    ...bridge,
    [DOOLITTLE_BRIDGE_MARKER]: true,
    select: (
      agentType: string,
      options?: { strategy?: AccountPoolStrategy },
    ) => {
      const providerId = providerForCodingAgent(agentType);
      return select(agentType, {
        ...options,
        strategy:
          options?.strategy ??
          (providerId ? readStrategy(providerId) : undefined),
      });
    },
  } satisfies CodingBridge;
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

function legacyCodexCredentials(): OAuthCredentials | undefined {
  const credentials = getStoredCodexCredentials();
  if (!credentials?.accessToken) return undefined;
  return {
    access: credentials.accessToken,
    refresh: credentials.refreshToken ?? "",
    ...(credentials.idToken ? { idToken: credentials.idToken } : {}),
    // Legacy Doolittle credentials do not carry an expiry; retain them for the
    // Codex CLI bridge, which will refresh when a refresh token is available.
    expires: Number.MAX_SAFE_INTEGER,
  };
}

function parseLegacyClaudeExpiry(
  expiresAt: string | undefined,
  hasRefreshToken: boolean,
): number {
  const value = expiresAt?.trim();
  if (!value) return hasRefreshToken ? 0 : Number.MAX_SAFE_INTEGER;

  const numericExpiry = Number(value);
  if (Number.isSafeInteger(numericExpiry)) return numericExpiry;

  const isoExpiry = /^\d{4}-\d{2}-\d{2}T/.test(value)
    ? Date.parse(value)
    : Number.NaN;
  return Number.isFinite(isoExpiry)
    ? isoExpiry
    : hasRefreshToken
      ? 0
      : Number.MAX_SAFE_INTEGER;
}

function legacyClaudeCredentials(): OAuthCredentials | undefined {
  const credentials = getStoredClaudeCodeCredentials();
  if (!credentials?.accessToken) return undefined;
  return {
    access: credentials.accessToken,
    refresh: credentials.refreshToken ?? "",
    expires: parseLegacyClaudeExpiry(
      credentials.expiresAt,
      Boolean(credentials.refreshToken?.trim()),
    ),
  };
}

function importLegacyAccount(
  providerId: AccountPoolProvider,
  credentials: OAuthCredentials | undefined,
  label: string,
  accountId: string = LEGACY_ACCOUNT_IDS[providerId],
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

function repairMatchingLegacyAccount(
  providerId: AccountPoolProvider,
  credentials: OAuthCredentials | undefined,
  label: string,
): boolean {
  const accountId = LEGACY_ACCOUNT_IDS[providerId];
  const existing = loadAccount(providerId, accountId);
  if (!existing || !credentials) return false;

  const accessMatches = existing.credentials.access === credentials.access;
  const refreshMatches =
    Boolean(existing.credentials.refresh) &&
    Boolean(credentials.refresh) &&
    existing.credentials.refresh === credentials.refresh;
  if (!accessMatches && !refreshMatches) return false;

  const unchanged =
    existing.credentials.access === credentials.access &&
    existing.credentials.refresh === credentials.refresh &&
    existing.credentials.expires === credentials.expires &&
    existing.credentials.idToken === credentials.idToken;
  if (unchanged) return false;

  return importLegacyAccount(
    providerId,
    credentials,
    label,
    accountId,
    undefined,
    true,
  );
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
  const codexCredentials =
    providerId === "openai-codex" ? getStoredCodexCredentials() : undefined;
  const imported = importLegacyAccount(
    providerId,
    providerId === "openai-codex"
      ? legacyCodexCredentials()
      : legacyClaudeCredentials(),
    normalizedLabel,
    normalizedId,
    codexCredentials?.accountId,
    true,
  );
  if (!imported && !loadAccount(providerId, normalizedId)) {
    return null;
  }
  const account = getDoolittleAccountPool().get(normalizedId, providerId);
  return account ? toSnapshot(account as never) : null;
}

/**
 * Imports legacy singleton credentials once, without modifying their source
 * file. The official credential storage remains the only pool backing store.
 */
export function importLegacyDoolittleAccounts(): number {
  const importCodex = listProviderAccounts("openai-codex").length === 0;
  const importClaude =
    listProviderAccounts("anthropic-subscription").length === 0;
  const codexCredentials = legacyCodexCredentials();
  const claudeCredentials = legacyClaudeCredentials();
  return (
    Number(
      importCodex &&
        importLegacyAccount(
          "openai-codex",
          codexCredentials,
          "Imported Codex account",
        ),
    ) +
    Number(
      importClaude &&
        importLegacyAccount(
          "anthropic-subscription",
          claudeCredentials,
          "Imported Claude Code account",
        ),
    ) +
    Number(
      repairMatchingLegacyAccount(
        "openai-codex",
        codexCredentials,
        "Imported Codex account",
      ),
    ) +
    Number(
      repairMatchingLegacyAccount(
        "anthropic-subscription",
        claudeCredentials,
        "Imported Claude Code account",
      ),
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
    bridgeInstalled: Boolean(
      (globalThis as Record<symbol, unknown>)[
        Symbol.for("eliza.account-pool.coding-agent.v1")
      ],
    ),
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
