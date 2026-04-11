import { getNativeServices, type RuntimeLike } from "./runtime";

export interface NativeE2BService {
  capabilityDescription?: string;
  listSandboxes?: () => Array<{
    id?: string;
    path?: string;
    template?: string;
    metadata?: Record<string, string>;
    createdAt?: string;
  }>;
  createSandbox?: (options?: {
    template?: string;
    metadata?: Record<string, string>;
  }) => Promise<string>;
  killSandbox?: (id?: string) => Promise<void>;
  executeCode?: (code: string, language?: string) => Promise<unknown>;
}

function getSandboxRoot(
  sandboxes: Array<{ path?: string }>,
): string | undefined {
  return sandboxes.find((entry) => entry.path)?.path?.replace(/\/[^/]+$/, "");
}

export function getNativeE2BSandboxControlPlane(runtime: RuntimeLike) {
  const e2b = getNativeServices(runtime).e2b as NativeE2BService | undefined;
  const sandboxes = e2b?.listSandboxes?.() ?? [];
  const activeSandboxId = sandboxes[0]?.id;

  return {
    source: e2b ? ("native-plugin" as const) : ("product" as const),
    available: Boolean(e2b),
    capability:
      e2b?.capabilityDescription ??
      "Local E2B-style sandbox execution for native code generation flows.",
    sandboxes: sandboxes.length,
    activeSandboxId,
    sandboxRoot: getSandboxRoot(sandboxes),
    supportsExecution: typeof e2b?.executeCode === "function",
    detail: e2b
      ? `E2B runtime has ${sandboxes.length} active sandboxes${activeSandboxId ? ` with ${activeSandboxId} selected` : ""}.`
      : "E2B sandbox service is unavailable.",
  };
}
