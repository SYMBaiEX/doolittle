import { getNativeServices } from "./runtime";
import type { RuntimeLike } from "./runtime-contracts";

export interface BrowserMcpServices {
  web: {
    status(): Promise<unknown>;
  };
  mcp: {
    status(): unknown;
    getCachedTools(): unknown[];
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
  services: BrowserMcpServices,
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

function resolveMcpIntegrationStatus(
  runtime: RuntimeLike,
  services: BrowserMcpServices,
) {
  const native = getNativeServices(runtime);
  if (native.mcp) {
    return {
      source: "native" as const,
      ownership: "plugin" as const,
      available: true,
      status: native.mcp.status(),
      cachedTools: native.mcp.getCachedTools(),
    };
  }
  return {
    source: "product" as const,
    ownership: "product" as const,
    available: false,
    status: services.mcp.status(),
    cachedTools: services.mcp.getCachedTools(),
  };
}

export async function getNativeIntegrationControlPlane(
  runtime: RuntimeLike,
  services: BrowserMcpServices,
): Promise<NativeIntegrationControlPlane> {
  const browser = await resolveBrowserIntegrationStatus(runtime, services);
  const mcp = resolveMcpIntegrationStatus(runtime, services);
  return {
    browser,
    mcp: {
      source: mcp.source,
      ownership: mcp.available ? "plugin" : "product",
      available: mcp.available,
      status: mcp.status,
      cachedTools: mcp.cachedTools,
    },
  };
}
