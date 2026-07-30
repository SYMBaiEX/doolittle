import {
  getLinkedProviderAccountsSnapshot as getBootstrapAccountsSnapshot,
  type LinkedProviderAccountStatus,
  type LinkedProviderAccountsSnapshot,
  type LinkedProviderName,
} from "./account-auth";

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
  devin: "devin",
  elizacloud: "elizacloud",
} as const satisfies Record<LinkedProviderName, string>;

const SNAPSHOT_KEY_BY_PROVIDER = {
  codex: "codex",
  "claude-code": "claudeCode",
  devin: "devin",
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

export function getRuntimeProviderAccountsSnapshot(
  runtime?: ProviderAccountRuntime | null,
): LinkedProviderAccountsSnapshot {
  const snapshot = getBootstrapAccountsSnapshot();
  for (const provider of Object.keys(
    SERVICE_TYPE_BY_PROVIDER,
  ) as LinkedProviderName[]) {
    const runtimeStatus = getRuntimeAccountStatus(runtime, provider);
    if (!runtimeStatus) continue;
    const key = SNAPSHOT_KEY_BY_PROVIDER[provider];
    snapshot[key] = {
      ...snapshot[key],
      ...runtimeStatus,
      provider,
    };
  }
  return snapshot;
}

export function getRuntimeProviderAccountStatus(
  runtime: ProviderAccountRuntime | null | undefined,
  provider: LinkedProviderName,
): LinkedProviderAccountStatus {
  const snapshot = getRuntimeProviderAccountsSnapshot(runtime);
  return snapshot[SNAPSHOT_KEY_BY_PROVIDER[provider]];
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
