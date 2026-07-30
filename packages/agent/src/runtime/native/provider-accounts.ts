import {
  getLinkedProviderAccountsSnapshot as getBootstrapAccountsSnapshot,
  type LinkedProviderAccountStatus,
  type LinkedProviderAccountsSnapshot,
  type LinkedProviderName,
} from "./account-auth";

interface RuntimeProviderAccountService {
  status(): LinkedProviderAccountStatus;
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
  if (!runtime) return undefined;
  try {
    const service = runtime.getService?.(
      SERVICE_TYPE_BY_PROVIDER[provider],
    ) as RuntimeProviderAccountService | null;
    return service?.status();
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
