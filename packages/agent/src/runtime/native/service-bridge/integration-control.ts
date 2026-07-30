import { getNativeServices } from "./runtime";
import type { RuntimeLike } from "./runtime-contracts";
import { requireNativeMcp } from "./tooling/native-services";

export interface BrowserIntegrationServices {
  web: {
    status(): Promise<unknown>;
  };
}

export interface NativeIntegrationControlPlane {
  browser: {
    source: "native" | "product";
    ownership: "plugin" | "product";
    available: boolean;
    status: unknown;
  };
  mcp: {
    source: "native" | "product";
    ownership: "plugin" | "product";
    available: boolean;
    status: unknown;
    cachedTools: unknown[];
  };
}

async function resolveBrowserIntegrationStatus(
  runtime: RuntimeLike,
  services: BrowserIntegrationServices,
) {
  const native = getNativeServices(runtime);
  if (native.browser) {
    return {
      source: "native" as const,
      ownership: "plugin" as const,
      available: true,
      status:
        (await native.browser.status?.()) ??
        native.browser.summary?.() ??
        (await services.web.status()),
    };
  }
  return {
    source: "product" as const,
    ownership: "product" as const,
    available: false,
    status: await services.web.status(),
  };
}

function resolveMcpIntegrationStatus(runtime: RuntimeLike) {
  const mcp = requireNativeMcp(runtime);
  return {
    source: "native" as const,
    ownership: "plugin" as const,
    available: true,
    status: mcp.status(),
    cachedTools: mcp.getCachedTools(),
  };
}

export async function getNativeIntegrationControlPlane(
  runtime: RuntimeLike,
  services: BrowserIntegrationServices,
): Promise<NativeIntegrationControlPlane> {
  const browser = await resolveBrowserIntegrationStatus(runtime, services);
  const mcp = resolveMcpIntegrationStatus(runtime);
  return {
    browser,
    mcp,
  };
}
