import { existsSync } from "node:fs";
import { getTransportRequirementRecords } from "@/gateway/transport";
import {
  getLinkedProviderAccountsSnapshot,
  type LinkedProviderAccountsSnapshot,
} from "@/runtime/native/account-auth/index";
import type { NativeOwnershipCache } from "@/runtime/native/ownership-cache";
import {
  getNativeOwnershipControlPlane,
  type getNativeTransportControlPlane,
  type RuntimeLike,
} from "@/runtime/native/service-bridge/index";
import type { EnvConfig } from "@/types";
import type { AgentSdkService } from "../agent-sdk-service";
import type { AutocoderPipelineService } from "../autocoder-pipeline/service";
import type { DiagnosticsService } from "../diagnostics/service";
import type { EcosystemService } from "../ecosystem-service";
import {
  createNativeServiceRegistry,
  describeNativeServiceRegistry,
} from "../native-service-registry";
import type { RepositoryService } from "../repository-service";
import type {
  OperatorVersionSummary,
  SetupSummary,
  UpdatePreview,
} from "./service";
import { buildOperatorCondensedSummary } from "./summary";

type TransportInventory = ReturnType<
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

function findInventoryEntry(
  inventory: TransportInventory | undefined,
  id: string,
): TransportInventory[number] | undefined {
  return inventory?.find((entry) => entry.platform === id);
}

function describeTransportSummary(
  id: string,
  label: string,
  inventory?: TransportInventory,
  fallbackReady?: boolean,
  fallbackDetail?: string,
): { id: string; ready: boolean; detail: string } {
  const entry = findInventoryEntry(inventory, id);
  if (entry) {
    return {
      id,
      ready: entry.operational,
      detail: `${label}: source=${entry.source} cfg=${entry.configEnabled ? "on" : "off"} gateway=${entry.gatewayEnabled ? "on" : "off"} operational=${entry.operational ? "yes" : "no"} reason=${entry.reason}`,
    };
  }
  return {
    id,
    ready: fallbackReady ?? false,
    detail: fallbackDetail ?? `${label} transport is not available.`,
  };
}

function buildProviderSummaries(
  config: EnvConfig,
  linkedAccounts: LinkedProviderAccountsSnapshot,
): SetupSummary["providers"] {
  return [
    {
      id: "codex",
      ready: linkedAccounts.codex.nativeReady ?? linkedAccounts.codex.reusable,
      detail:
        (linkedAccounts.codex.nativeReady ?? linkedAccounts.codex.reusable)
          ? "Linked Codex account is ready for Codex-native workflows."
          : linkedAccounts.codex.available
            ? linkedAccounts.codex.detail
            : "No reusable Codex account is linked.",
    },
    {
      id: "claude-code",
      ready:
        linkedAccounts.claudeCode.nativeReady ??
        linkedAccounts.claudeCode.reusable,
      detail:
        (linkedAccounts.claudeCode.nativeReady ??
        linkedAccounts.claudeCode.reusable)
          ? "Linked Claude Code account is ready for Claude-native workflows."
          : linkedAccounts.claudeCode.fallbackReady
            ? "Claude Code local CLI fallback is available, but native Eliza auth is not fully bound yet."
            : linkedAccounts.claudeCode.available
              ? linkedAccounts.claudeCode.detail
              : "No reusable Claude Code account is linked.",
    },
    {
      id: "openai",
      ready: Boolean(config.openAiApiKey),
      detail: config.openAiApiKey
        ? `Configured for ${config.openAiModel}.`
        : (linkedAccounts.codex.nativeReady ?? linkedAccounts.codex.reusable)
          ? "No OPENAI_API_KEY is set. A linked Codex account is available for Codex-native workflows, but the OpenAI provider path still needs an API key."
          : "Missing OPENAI_API_KEY.",
    },
    {
      id: "anthropic",
      ready: Boolean(config.anthropicApiKey),
      detail: config.anthropicApiKey
        ? `Configured for ${config.anthropicLargeModel}.`
        : (linkedAccounts.claudeCode.nativeReady ??
            linkedAccounts.claudeCode.reusable)
          ? "No ANTHROPIC_API_KEY is set. Linked Claude Code credentials are available for Claude-native workflows, but the Anthropic provider path still needs an API key."
          : "Missing ANTHROPIC_API_KEY.",
    },
  ];
}

function resolveOwnership(dependencies: OperatorRuntimeSummaryDependencies) {
  return (
    dependencies.nativeOwnership?.controlPlane() ??
    (dependencies.runtime
      ? getNativeOwnershipControlPlane(
          dependencies.runtime,
          undefined,
          dependencies.config,
          dependencies.diagnostics.currentGatewayConfig(),
        )
      : undefined)
  );
}

export async function buildOperatorSetupSummary(
  dependencies: OperatorRuntimeSummaryDependencies,
): Promise<SetupSummary> {
  const linkedAccounts = getLinkedProviderAccountsSnapshot();
  const ecosystem = dependencies.agentSdk
    ? await dependencies.agentSdk.overview()
    : undefined;
  const ownership = resolveOwnership(dependencies);
  const transportControl = ownership?.transportControl;
  const pipeline = dependencies.autocoderPipeline?.summary();
  const workspaceEcosystem = dependencies.ecosystemService?.summary();
  const condensed = buildOperatorCondensedSummary({
    ownership,
    ecosystem,
    workspaceEcosystem,
    pipeline,
  });

  return {
    version: dependencies.version(),
    directories: [
      {
        label: "workspace",
        path: dependencies.config.workspaceDir,
        exists: existsSync(dependencies.config.workspaceDir),
      },
      {
        label: "data",
        path: dependencies.config.dataDir,
        exists: existsSync(dependencies.config.dataDir),
      },
      {
        label: "skills",
        path: dependencies.config.skillsDir,
        exists: existsSync(dependencies.config.skillsDir),
      },
      {
        label: "gateway",
        path: dependencies.config.gatewayDataDir,
        exists: existsSync(dependencies.config.gatewayDataDir),
      },
    ],
    providers: buildProviderSummaries(dependencies.config, linkedAccounts),
    transports: getTransportRequirementRecords(
      dependencies.config,
      dependencies.diagnostics.currentGatewayConfig(),
    ).map((requirement) =>
      describeTransportSummary(
        requirement.platform,
        requirement.label,
        transportControl?.transportInventory,
        requirement.configured,
        requirement.summary,
      ),
    ),
    transportControl,
    transportInventory: transportControl?.transportInventory,
    nativeServices: describeNativeServiceRegistry(
      createNativeServiceRegistry(),
    ),
    ownership: condensed.ownership,
    ecosystem: condensed.ecosystem,
    pluginManager: condensed.pluginManager,
    pipeline: condensed.pipeline,
    checklist: await dependencies.diagnostics.setupChecklist(),
  };
}

export async function buildOperatorUpdatePreview(
  dependencies: OperatorRuntimeSummaryDependencies,
): Promise<UpdatePreview> {
  const ecosystem = dependencies.agentSdk
    ? await dependencies.agentSdk.overview()
    : undefined;
  const repositoryAvailable = dependencies.repository.isRepository();
  const status = repositoryAvailable
    ? await dependencies.repository.status()
    : "(workspace is not inside a git repository)";
  const recentCommits = repositoryAvailable
    ? await dependencies.repository.recentCommits(8)
    : "(no git history available)";
  const ownership = resolveOwnership(dependencies);
  const transportControl = ownership?.transportControl;
  const pipeline = dependencies.autocoderPipeline?.summary();
  const workspaceEcosystem = dependencies.ecosystemService?.summary();
  const condensed = buildOperatorCondensedSummary({
    ownership,
    ecosystem,
    workspaceEcosystem,
    pipeline,
  });

  return {
    version: dependencies.version(),
    repositoryAvailable,
    status,
    recentCommits,
    transportControl: transportControl?.totals,
    transportInventory: transportControl?.transportInventory,
    ownership: condensed.ownership,
    recommendedSteps: repositoryAvailable
      ? [
          "Review git status before updating runtime dependencies.",
          "Run bun install after dependency changes.",
          "Re-run bun run typecheck, bun test, and bun run build after updating.",
        ]
      : [
          "Initialize a git repository if you want update previews tied to commit history.",
          "Keep bun install, bun run typecheck, bun test, and bun run build as the standard update validation flow.",
        ],
    ecosystem: condensed.ecosystem,
    pluginManager: condensed.pluginManager,
    pipeline: condensed.pipeline,
  };
}
