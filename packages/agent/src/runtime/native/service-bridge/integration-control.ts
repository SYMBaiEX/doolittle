import { requireNativeBrowser } from "./browser";
import type { RuntimeLike } from "./runtime-contracts";
import { requireNativeMcp } from "./tooling/native-services";

export interface NativeIntegrationControlPlane {
  browser: {
    source: "native";
    ownership: "plugin";
    available: true;
    status: unknown;
  };
  mcp: {
    source: "native";
    ownership: "plugin";
    available: true;
    status: unknown;
    cachedTools: unknown[];
  };
}

async function resolveBrowserIntegrationStatus(runtime: RuntimeLike) {
  const browser = requireNativeBrowser(runtime);
  return {
    source: "native" as const,
    ownership: "plugin" as const,
    available: true as const,
    status: await browser.status(),
  };
}

function resolveMcpIntegrationStatus(runtime: RuntimeLike) {
  const mcp = requireNativeMcp(runtime);
  return {
    source: "native" as const,
    ownership: "plugin" as const,
    available: true as const,
    status: mcp.status(),
    cachedTools: mcp.getCachedTools(),
  };
}

export async function getNativeIntegrationControlPlane(
  runtime: RuntimeLike,
): Promise<NativeIntegrationControlPlane> {
  const browser = await resolveBrowserIntegrationStatus(runtime);
  const mcp = resolveMcpIntegrationStatus(runtime);
  return {
    browser,
    mcp,
  };
}
