import type { getLinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import type { NativeOwnershipCache } from "@/runtime/native/ownership-cache";
import type { getNativePackageAudit } from "@/runtime/native/package-audit";
import type { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import type {
  BrowserMcpServices,
  getNativeExecutionControlPlane,
  getNativeFormsControlPlane,
  getNativeIntegrationControlPlane,
} from "@/runtime/native/service-bridge/control-planes";
import type { getNativeOwnershipControlPlane } from "@/runtime/native/service-bridge/ownership";
import type { RuntimeLike } from "@/runtime/native/service-bridge/runtime";
import type { DiagnosticCheck, EnvConfig, GatewayConfig } from "@/types";
import type { AgentSdkService } from "../../agent-sdk-service";
import type { EcosystemService } from "../../ecosystem-service";

export type GatewayTransportOverview = {
  mismatchCount: number;
  operationalCount: number;
  details: Array<{
    platform: string;
    mismatchFlags: string[];
    inventory?: {
      detail: string;
    };
    platformState?: {
      detail?: string;
    };
  }>;
};

export interface DiagnosticsProviderOwnershipChecksInput {
  config: EnvConfig;
  gatewayConfig: GatewayConfig;
  runtime?: RuntimeLike;
  nativeOwnership?: NativeOwnershipCache;
  agentSdk?: AgentSdkService;
  ecosystemService?: EcosystemService;
  gatewayTransportOverview?: GatewayTransportOverview;
}

export interface ProviderOwnershipCollectInput {
  config: EnvConfig;
  gatewayConfig: GatewayConfig;
  runtime?: RuntimeLike;
  nativeOwnership?: NativeOwnershipCache;
  agentSdk?: AgentSdkService;
  ecosystemService?: EcosystemService;
}

export type ProviderOwnershipNativeIntegrationControl = Awaited<
  ReturnType<typeof getNativeIntegrationControlPlane>
>;
export type ProviderOwnershipNativeExecutionControl = ReturnType<
  typeof getNativeExecutionControlPlane
>;
export type ProviderOwnershipNativeOwnershipControl = ReturnType<
  typeof getNativeOwnershipControlPlane
>;
export type ProviderOwnershipNativeFormsControl = ReturnType<
  typeof getNativeFormsControlPlane
>;
export type ProviderOwnershipNativePackageAudit = ReturnType<
  typeof getNativePackageAudit
>;
export type ProviderOwnershipNativePluginCatalog = ReturnType<
  typeof getNativePluginCatalog
>;
export type ProviderOwnershipLinkedProviderAccounts = ReturnType<
  typeof getLinkedProviderAccountsSnapshot
>;

export interface ProviderOwnershipContext {
  config: EnvConfig;
  gatewayConfig: GatewayConfig;
  nativeWorkspacePath: string;
  nativeAudit: ProviderOwnershipNativePackageAudit;
  nativePlugins: ProviderOwnershipNativePluginCatalog;
  linkedAccounts: ProviderOwnershipLinkedProviderAccounts;
  normalizedCloudBaseUrl: string;
  cloudBaseUrlValidation?: string;
  ecosystem?: {
    registry?: {
      available: boolean;
      total: number;
      nonAppPlugins: number;
      error?: string;
    };
    skillCatalog?: {
      available: boolean;
      total: number;
      error?: string;
    };
  };
  compatibility?: {
    compatible: boolean;
    checked: number;
    coreVersion: string;
    failures: number;
    failing: Array<{ plugin: string }>;
  };
  workspaceEcosystem?: {
    benchmarkPacks: number;
    distributionChannels: number;
    modelingProfiles: number;
  };
  ownership?: ProviderOwnershipNativeOwnershipControl;
  formsControl?: ProviderOwnershipNativeFormsControl;
  integrationControl?: ProviderOwnershipNativeIntegrationControl;
  runtimeExecutionControl?: ProviderOwnershipNativeExecutionControl;
  browserServices: BrowserMcpServices;
}

export interface DiagnosticsProviderOwnershipChecksResult {
  checks: DiagnosticCheck[];
  integrationControl?: ProviderOwnershipNativeIntegrationControl;
  runtimeExecutionControl?: ProviderOwnershipNativeExecutionControl;
}
