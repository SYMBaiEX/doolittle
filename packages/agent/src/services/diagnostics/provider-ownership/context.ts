import { join } from "node:path";
import { resolveCloudApiBaseUrl } from "@elizaos/autonomous/cloud/base-url";
import { validateCloudBaseUrl } from "@elizaos/autonomous/cloud/validate-url";
import { getLinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import { getNativePackageAudit } from "@/runtime/native/package-audit";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import type { BrowserMcpServices } from "@/runtime/native/service-bridge/control-planes";
import {
  getNativeExecutionControlPlane,
  getNativeFormsControlPlane,
  getNativeIntegrationControlPlane,
} from "@/runtime/native/service-bridge/control-planes";
import { getNativeOwnershipControlPlane } from "@/runtime/native/service-bridge/ownership";
import type { EnvConfig } from "@/types";
import type { AgentSdkService } from "../../agent-sdk-service";
import type { EcosystemService } from "../../ecosystem-service";
import { buildBrowserMcpServices } from "./integration-services";
import type {
  ProviderOwnershipCollectInput,
  ProviderOwnershipContext,
  ProviderOwnershipNativeExecutionControl,
  ProviderOwnershipNativeFormsControl,
  ProviderOwnershipNativeIntegrationControl,
  ProviderOwnershipNativeOwnershipControl,
} from "./types";

type ProviderOwnershipDependencies = {
  getNativePackageAudit: typeof getNativePackageAudit;
  getNativePluginCatalog: typeof getNativePluginCatalog;
  getLinkedProviderAccountsSnapshot: typeof getLinkedProviderAccountsSnapshot;
  resolveCloudApiBaseUrl: typeof resolveCloudApiBaseUrl;
  validateCloudBaseUrl: typeof validateCloudBaseUrl;
  getNativeOwnershipControlPlane: typeof getNativeOwnershipControlPlane;
  getNativeFormsControlPlane: typeof getNativeFormsControlPlane;
  getNativeIntegrationControlPlane: typeof getNativeIntegrationControlPlane;
  getNativeExecutionControlPlane: typeof getNativeExecutionControlPlane;
  buildBrowserMcpServices: (config: EnvConfig) => BrowserMcpServices;
};

const defaultDependencies: ProviderOwnershipDependencies = {
  getNativePackageAudit,
  getNativePluginCatalog,
  getLinkedProviderAccountsSnapshot,
  resolveCloudApiBaseUrl,
  validateCloudBaseUrl,
  getNativeOwnershipControlPlane,
  getNativeFormsControlPlane,
  getNativeIntegrationControlPlane,
  getNativeExecutionControlPlane,
  buildBrowserMcpServices,
};

export async function collectProviderOwnershipContext(
  input: ProviderOwnershipCollectInput & {
    agentSdk?: AgentSdkService;
    ecosystemService?: EcosystemService;
    dependencies?: Partial<ProviderOwnershipDependencies>;
  },
): Promise<ProviderOwnershipContext> {
  const {
    config,
    gatewayConfig,
    runtime,
    nativeOwnership,
    agentSdk,
    ecosystemService,
    dependencies,
  } = input;
  const mergedDeps: ProviderOwnershipDependencies = {
    ...defaultDependencies,
    ...dependencies,
  };
  const nativeWorkspacePath = join(config.workspaceDir, "packages", "plugins");
  const nativeAudit = mergedDeps.getNativePackageAudit(config);
  const nativePlugins = mergedDeps.getNativePluginCatalog(config);
  const ecosystem = agentSdk ? await agentSdk.overview() : undefined;
  const workspaceEcosystem = ecosystemService?.summary();
  const compatibility = agentSdk ? await agentSdk.compatibility() : undefined;
  const registrySnapshot = ecosystem?.registry;
  const skillCatalog = ecosystem?.skillCatalog;
  const ownership =
    nativeOwnership?.controlPlane() ??
    (runtime
      ? mergedDeps.getNativeOwnershipControlPlane(
          runtime,
          undefined,
          config,
          gatewayConfig,
        )
      : undefined);
  const formsControl: ProviderOwnershipNativeFormsControl | undefined = runtime
    ? mergedDeps.getNativeFormsControlPlane(runtime)
    : undefined;
  const integrationControl:
    | ProviderOwnershipNativeIntegrationControl
    | undefined = runtime
    ? await mergedDeps.getNativeIntegrationControlPlane(runtime, {
        ...mergedDeps.buildBrowserMcpServices(config),
      })
    : undefined;
  const runtimeExecutionControl:
    | ProviderOwnershipNativeExecutionControl
    | undefined = runtime
    ? mergedDeps.getNativeExecutionControlPlane(runtime)
    : undefined;

  const linkedAccounts = mergedDeps.getLinkedProviderAccountsSnapshot();
  const normalizedCloudBaseUrl = mergedDeps.resolveCloudApiBaseUrl(
    config.elizaCloudBaseUrl,
  );
  const cloudBaseUrlValidation = await mergedDeps.validateCloudBaseUrl(
    normalizedCloudBaseUrl,
  );

  return {
    config,
    gatewayConfig,
    nativeWorkspacePath,
    nativeAudit,
    nativePlugins,
    linkedAccounts,
    normalizedCloudBaseUrl,
    cloudBaseUrlValidation: cloudBaseUrlValidation || undefined,
    ecosystem: {
      registry: registrySnapshot
        ? {
            available: registrySnapshot.available,
            total: registrySnapshot.total,
            nonAppPlugins: registrySnapshot.nonAppPlugins,
            error: registrySnapshot.error,
          }
        : undefined,
      skillCatalog: skillCatalog
        ? {
            available: skillCatalog.available,
            total: skillCatalog.total,
            error: skillCatalog.error,
          }
        : undefined,
    },
    compatibility: compatibility
      ? {
          compatible: compatibility.compatible,
          checked: compatibility.checked,
          coreVersion: compatibility.coreVersion,
          failures: compatibility.failures,
          failing: compatibility.failing,
        }
      : undefined,
    workspaceEcosystem,
    ownership: ownership as ProviderOwnershipNativeOwnershipControl | undefined,
    formsControl,
    integrationControl,
    runtimeExecutionControl,
    browserServices: mergedDeps.buildBrowserMcpServices(config),
  };
}
