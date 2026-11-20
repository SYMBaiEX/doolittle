import {
  getLinkedProviderAccountsSnapshot as getBootstrapAccountsSnapshot,
  type LinkedProviderAccountStatus,
  type LinkedProviderAccountsSnapshot,
  type LinkedProviderName,
} from "./account-auth";

import { buildProviderStatus } from "./account-auth/account-auth-helpers";

interface RuntimeProviderAccountService {
  status(): LinkedProviderAccountStatus;
  refreshRuntimeCredentials?(): Promise<unknown>;
}

type ProviderAccountRuntime = {
  getService?(serviceType: string): unknown | null;
};

const SERVICE_TYPE_BY_PROVIDER = {
  codex: "codex",
  "claude-code": "claude_code",
  elizacloud: "elizacloud",
} as const satisfies Record<LinkedProviderName, string>;

const SNAPSHOT_KEY_BY_PROVIDER = {
  codex: "codex",
  "claude-code": "claudeCode",
  elizacloud: "elizaCloud",
} as const satisfies Record<
  LinkedProviderName,
  keyof LinkedProviderAccountsSnapshot
>;

function getRuntimeAccountStatus(
  runtime: ProviderAccountRuntime | null | undefined,
  provider: LinkedProviderName,
): LinkedProviderAccountStatus | undefined {
  const service = getRuntimeProviderAccountService(runtime, provider);
  if (!service) return undefined;
  try {
    return service.status();
  } catch {
    return undefined;
  }
}

function getRuntimeProviderAccountService(
  runtime: ProviderAccountRuntime | null | undefined,
  provider: LinkedProviderName,
): RuntimeProviderAccountService | undefined {
  if (!runtime?.getService) return undefined;
  try {
    return (
      (runtime.getService(
        SERVICE_TYPE_BY_PROVIDER[provider],
      ) as RuntimeProviderAccountService | null) ?? undefined
    );
  } catch {
    return undefined;
  }
}

const observedAccounts = new WeakMap<
  ProviderAccountRuntime,
  LinkedProviderAccountsSnapshot
>();

const LINKED_PROVIDERS = Object.keys(
  SERVICE_TYPE_BY_PROVIDER,
) as LinkedProviderName[];

/** Presentation-only read. Never call an SDK service or open a managed vault. */
export function getRuntimeProviderAccountsSnapshot(
  runtime?: ProviderAccountRuntime | null,
): LinkedProviderAccountsSnapshot {
  return (
    (runtime && observedAccounts.get(runtime)) ??
    getBootstrapAccountsSnapshot(undefined, [])
  );
}

export function probeRuntimeProviderAccounts(
  runtime?: ProviderAccountRuntime | null,
  providers: readonly LinkedProviderName[] = LINKED_PROVIDERS,
): LinkedProviderAccountsSnapshot {
  const snapshot = { ...getRuntimeProviderAccountsSnapshot(runtime) };
  const probed = getBootstrapAccountsSnapshot(undefined, providers);
  for (const provider of providers) {
    const key = SNAPSHOT_KEY_BY_PROVIDER[provider];
    // Project SDK status fields before the result crosses the HTTP boundary.
    snapshot[key] = buildProviderStatus({
      ...probed[key],
      ...getRuntimeAccountStatus(runtime, provider),
      provider,
      loginCommand: probed[key].loginCommand ?? "",
    });
  }
  if (runtime) observedAccounts.set(runtime, snapshot);
  return snapshot;
}

export function getRuntimeProviderAccountStatus(
  runtime: ProviderAccountRuntime | null | undefined,
  provider: LinkedProviderName,
): LinkedProviderAccountStatus {
  return probeRuntimeProviderAccounts(runtime, [provider])[
    SNAPSHOT_KEY_BY_PROVIDER[provider]
  ];
}

export async function refreshRuntimeProviderAccount(
  runtime: ProviderAccountRuntime | null | undefined,
  provider: LinkedProviderName,
): Promise<boolean> {
  const service = getRuntimeProviderAccountService(runtime, provider);
  if (!service) return false;
  await service.refreshRuntimeCredentials?.();
  return true;
}
