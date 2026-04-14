import type { LinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import type { NativeOwnershipCache } from "@/runtime/native/ownership-cache";
import type { RuntimeLike } from "@/runtime/native/service-bridge/runtime";
import type { getNativeTransportControlPlane } from "@/runtime/native/service-bridge/transport-control";
import type { EnvConfig } from "@/types";
import type { AgentSdkService } from "../../agent-sdk-service";
import type { AutocoderPipelineService } from "../../autocoder-pipeline/service";
import type { DiagnosticsService } from "../../diagnostics/service";
import type { EcosystemService } from "../../ecosystem-service";
import type { RepositoryService } from "../../repository-service";
import type { SetupSummary, UpdatePreview } from "../service/types";
import type { OperatorVersionSummary } from "../version";

export type TransportInventory = ReturnType<
  typeof getNativeTransportControlPlane
>["transportInventory"];

export interface OperatorRuntimeSummaryDependencies {
  config: EnvConfig;
  diagnostics: Pick<
    DiagnosticsService,
    "currentGatewayConfig" | "setupChecklist"
  >;
  repository: Pick<
    RepositoryService,
    "isRepository" | "status" | "recentCommits"
  >;
  version(): OperatorVersionSummary;
  autocoderPipeline?: Pick<AutocoderPipelineService, "summary">;
  agentSdk?: Pick<AgentSdkService, "overview">;
  nativeOwnership?: Pick<NativeOwnershipCache, "controlPlane">;
  ecosystemService?: Pick<EcosystemService, "summary">;
  runtime?: RuntimeLike;
}

export type SetupProviders = SetupSummary["providers"];
export type SetupTransports = SetupSummary["transports"];
export type LinkedAccounts = LinkedProviderAccountsSnapshot;
export type OperatorUpdatePreview = UpdatePreview;
