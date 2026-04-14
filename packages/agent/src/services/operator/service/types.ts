import type { NativeOwnershipCache } from "@/runtime/native/ownership-cache";
import type { getNativeTransportControlPlane } from "@/runtime/native/service-bridge/transport-control";
import type { EnvConfig } from "@/types";
import type { AgentSdkService } from "../../agent-sdk-service";
import type { AutocoderPipelineService } from "../../autocoder-pipeline/service";
import type { DiagnosticsService } from "../../diagnostics/service";
import type { EcosystemService } from "../../ecosystem-service";
import type { RepositoryService } from "../../repository-service";
import type { OperatorVersionSummary } from "../version";
import type { OperatorRuntimeAttachment } from "./runtime";
import type { OperatorVersionAccess } from "./version";

export interface OperatorReadinessSummary {
  level: "ready" | "needs-attention" | "blocked";
  headline: string;
  detail: string;
  nextSteps: string[];
}

export interface SetupSummary {
  readiness: OperatorReadinessSummary;
  version: OperatorVersionSummary;
  directories: Array<{ label: string; path: string; exists: boolean }>;
  providers: Array<{ id: string; ready: boolean; detail: string }>;
  transports: Array<{ id: string; ready: boolean; detail: string }>;
  transportControl?: ReturnType<typeof getNativeTransportControlPlane>;
  transportInventory?: ReturnType<
    typeof getNativeTransportControlPlane
  >["transportInventory"];
  nativeServices: Array<{ group: string; services: string[]; count: number }>;
  ownership?: {
    serviceResolution: number;
    pluginManager: {
      available: boolean;
      total: number;
      enabled: number;
      official: number;
      vendored: number;
      categories: number;
    };
    identity?: {
      personality: number;
      rolodex: number;
      experience: number;
    };
  };
  ecosystem?: {
    registryAvailable: boolean;
    registryPlugins: number;
    skillCatalogAvailable: boolean;
    skillCatalogSkills: number;
    compatibilityFailures: number;
    benchmarkPacks?: number;
    distributionChannels?: number;
    modelingProfiles?: number;
  };
  pluginManager?: {
    available: boolean;
    total: number;
    enabled: number;
    official: number;
    vendored: number;
    categories: number;
  };
  pipeline?: {
    total: number;
    workflows: number;
    failed: number;
    failedWorkflows: number;
    latestKind?: string;
    latestTarget?: string;
  };
  checklist: string[];
}

export interface UpdatePreview {
  readiness: OperatorReadinessSummary;
  version: OperatorVersionSummary;
  repositoryAvailable: boolean;
  repositoryStatus: string;
  recentCommits: string;
  recommendedSteps: string[];
  ownership?: {
    serviceResolution: number;
    pluginManager: {
      available: boolean;
      total: number;
      enabled: number;
      official: number;
      vendored: number;
      categories: number;
    };
    identity?: {
      personality: number;
      rolodex: number;
      experience: number;
    };
  };
  ecosystem?: {
    registryAvailable: boolean;
    registryPlugins: number;
    skillCatalogAvailable: boolean;
    skillCatalogSkills: number;
    compatibilityFailures: number;
    benchmarkPacks?: number;
    distributionChannels?: number;
    modelingProfiles?: number;
  };
  transportControl?: ReturnType<
    typeof getNativeTransportControlPlane
  >["totals"];
  transportInventory?: ReturnType<
    typeof getNativeTransportControlPlane
  >["transportInventory"];
  pluginManager?: {
    available: boolean;
    total: number;
    enabled: number;
    official: number;
    vendored: number;
    categories: number;
  };
  pipeline?: {
    total: number;
    workflows: number;
    failed: number;
    failedWorkflows: number;
    latestKind?: string;
    latestTarget?: string;
  };
}

export interface OperatorServiceSummaryBindings {
  config: EnvConfig;
  diagnostics: DiagnosticsService;
  repository: RepositoryService;
  versionAccess: OperatorVersionAccess;
  runtimeAttachment: OperatorRuntimeAttachment;
  autocoderPipeline?: AutocoderPipelineService;
  agentSdk?: AgentSdkService;
  nativeOwnership?: NativeOwnershipCache;
  ecosystemService?: EcosystemService;
}
