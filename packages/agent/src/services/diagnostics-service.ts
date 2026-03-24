import { existsSync, constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { resolveCloudApiBaseUrl } from "@elizaos/agent/cloud/base-url";
import { validateCloudBaseUrl } from "@elizaos/agent/cloud/validate-url";
import {
  getTransportRequirementRecords,
  summarizeTransportInventory,
} from "@/gateway/transport-contract";
import { getLinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import { describeAutonomousAlignment } from "@/runtime/native/autonomous-stack";
import type { NativeOwnershipCache } from "@/runtime/native/ownership-cache";
import {
  getLatestRuntimeLine,
  getNativePackageAudit,
} from "@/runtime/native/package-audit";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import {
  getNativeExecutionControlPlane,
  getNativeFormsControlPlane,
  getNativeIntegrationControlPlane,
  getNativeMediaControlPlane,
  getNativeOwnershipControlPlane,
  getNativeResearchControlPlane,
  type RuntimeLike,
} from "@/runtime/native/service-bridge";
import type { DiagnosticCheck, EnvConfig, GatewayConfig } from "@/types";
import type { AgentSdkService } from "./agent-sdk-service";
import type { AwarenessService } from "./awareness-service";
import type { EcosystemService } from "./ecosystem-service";
import type { RunControllerService } from "./run-controller-service";
import type { SettingsService } from "./settings-service";
import type { StartupStateService } from "./startup-state-service";

export class DiagnosticsService {
  private runtime?: RuntimeLike;

  constructor(
    private readonly config: EnvConfig,
    private readonly gatewayConfig: GatewayConfig,
    private readonly agentSdk?: AgentSdkService,
    private readonly nativeOwnership?: NativeOwnershipCache,
    private readonly ecosystemService?: EcosystemService,
    private readonly settings?: SettingsService,
    private readonly runController?: RunControllerService,
    private readonly startupState?: StartupStateService,
    private readonly awareness?: AwarenessService,
  ) {}

  attachRuntime(runtime: RuntimeLike): void {
    this.runtime = runtime;
  }

  currentGatewayConfig(): GatewayConfig {
    return this.gatewayConfig;
  }

  async run(input: {
    skillsCount: number;
    skillsSummary?: {
      total: number;
      workspace: number;
      generated: number;
      bundled: number;
      managed: number;
      project: number;
      invocable: number;
    };
    contextFilesCount: number;
    recentCronRuns: number;
    recentTerminalCommands: number;
    repositoryAvailable: boolean;
    gatewayTransportOverview?: {
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
  }): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];
    const transportRequirements = getTransportRequirementRecords(
      this.config,
      this.gatewayConfig,
    );

    checks.push({
      id: "workspace.exists",
      status: existsSync(this.config.workspaceDir) ? "pass" : "fail",
      summary: "Workspace directory",
      detail: this.config.workspaceDir,
    });

    checks.push({
      id: "workspace.writeable",
      status: (await this.isWritable(this.config.workspaceDir))
        ? "pass"
        : "fail",
      summary: "Workspace write access",
      detail: this.config.workspaceDir,
    });

    checks.push({
      id: "data.exists",
      status: existsSync(this.config.dataDir) ? "pass" : "fail",
      summary: "Agent data directory",
      detail: this.config.dataDir,
    });

    const onboardingSummaryPath = join(this.config.dataDir, "onboarding.json");
    const onboardingStatePath = join(
      this.config.dataDir,
      "onboarding.state.json",
    );
    checks.push({
      id: "onboarding.summary",
      status: existsSync(onboardingSummaryPath) ? "pass" : "warn",
      summary: "Product onboarding summary",
      detail: onboardingSummaryPath,
    });
    checks.push({
      id: "onboarding.native",
      status: existsSync(onboardingStatePath) ? "pass" : "warn",
      summary: "Native onboarding state mirror",
      detail: onboardingStatePath,
    });

    const nativeWorkspacePath = join(
      this.config.workspaceDir,
      "packages",
      "plugins",
    );
    const nativeAudit = getNativePackageAudit(this.config);
    const nativePlugins = getNativePluginCatalog(this.config);
    const ecosystem = this.agentSdk
      ? await this.agentSdk.overview()
      : undefined;
    const workspaceEcosystem = this.ecosystemService?.summary();
    const compatibility = this.agentSdk
      ? await this.agentSdk.compatibility()
      : undefined;
    const registrySnapshot = ecosystem?.registry;
    const skillCatalog = ecosystem?.skillCatalog;
    const ownership =
      this.nativeOwnership?.controlPlane() ??
      (this.runtime
        ? getNativeOwnershipControlPlane(
            this.runtime,
            undefined,
            this.config,
            this.gatewayConfig,
          )
        : undefined);
    const integrationControl = this.runtime
      ? await getNativeIntegrationControlPlane(this.runtime, {
          web: {
            status: async () => ({
              provider: this.config.browserProvider,
              ready: Boolean(this.config.browserCommand),
              mode:
                this.config.browserProvider === "lightpanda"
                  ? "browser"
                  : "fallback",
              detail:
                this.config.browserProvider === "lightpanda"
                  ? `Lightpanda is configured as the default browser backend via ${this.config.browserCommand}.`
                  : "Basic HTTP fetch mode is configured as the browser fallback.",
              artifacts: {
                snapshot: Boolean(this.config.browserCommand),
                screenshot: Boolean(this.config.browserCommand),
                comparison: Boolean(this.config.browserCommand),
              },
            }),
          },
          mcp: {
            status: () => ({
              enabled: Boolean(this.config.mcpServerCommand),
              detail: this.config.mcpServerCommand
                ? `MCP bridge command configured: ${this.config.mcpServerCommand}`
                : "MCP_SERVER_COMMAND is not configured.",
              command: this.config.mcpServerCommand || undefined,
              timeoutMs: this.config.mcpTimeoutMs,
              discoveredTools: 0,
              cachedToolNames: [],
            }),
            getCachedTools: () => [],
          },
        } as unknown as Parameters<typeof getNativeIntegrationControlPlane>[1])
      : undefined;
    const formsControl = this.runtime
      ? getNativeFormsControlPlane(this.runtime)
      : undefined;
    const runtimeExecutionControl = this.runtime
      ? getNativeExecutionControlPlane(this.runtime)
      : undefined;
    checks.push({
      id: "native.workspace",
      status: existsSync(nativeWorkspacePath) ? "pass" : "warn",
      summary: "Native Eliza workspace packages",
      detail: nativeWorkspacePath,
    });

    checks.push({
      id: "cron.output",
      status: existsSync(this.config.cronOutputDir) ? "pass" : "warn",
      summary: "Automation artifact directory",
      detail: this.config.cronOutputDir,
    });

    checks.push({
      id: "gateway.data",
      status: existsSync(this.config.gatewayDataDir) ? "pass" : "warn",
      summary: "Gateway state directory",
      detail: this.config.gatewayDataDir,
    });

    const linkedAccounts = getLinkedProviderAccountsSnapshot();
    const normalizedCloudBaseUrl = resolveCloudApiBaseUrl(
      this.config.elizaCloudBaseUrl,
    );
    const cloudBaseUrlValidation = await validateCloudBaseUrl(
      normalizedCloudBaseUrl,
    );
    checks.push({
      id: "provider.configured",
      status:
        this.config.openAiApiKey ||
        this.config.anthropicApiKey ||
        linkedAccounts.elizaCloud.nativeReady ||
        linkedAccounts.elizaCloud.reusable ||
        linkedAccounts.codex.nativeReady ||
        linkedAccounts.claudeCode.nativeReady ||
        linkedAccounts.codex.reusable ||
        linkedAccounts.claudeCode.reusable
          ? "pass"
          : "warn",
      summary: "Model provider credentials",
      detail:
        this.config.openAiApiKey || this.config.anthropicApiKey
          ? "At least one provider key is present."
          : this.config.offlineBootstrapMode
            ? "Explicit offline bootstrap mode is enabled; runtime can answer without a live provider while onboarding."
            : linkedAccounts.elizaCloud.nativeReady ||
                linkedAccounts.elizaCloud.reusable
              ? "A managed Eliza Cloud account is available."
              : linkedAccounts.codex.nativeReady ||
                  linkedAccounts.claudeCode.nativeReady
                ? "A native linked Codex or Claude Code account is available."
                : linkedAccounts.codex.reusable ||
                    linkedAccounts.claudeCode.reusable
                  ? "A linked provider fallback path is available, but native auth may still need to be completed."
                  : "No OpenAI, Anthropic, Eliza Cloud, Codex, or Claude Code provider credentials are configured, and explicit offline bootstrap mode is disabled.",
    });

    checks.push({
      id: "provider.linked-accounts",
      status:
        linkedAccounts.elizaCloud.nativeReady ||
        linkedAccounts.elizaCloud.reusable ||
        linkedAccounts.codex.nativeReady ||
        linkedAccounts.claudeCode.nativeReady ||
        linkedAccounts.codex.reusable ||
        linkedAccounts.claudeCode.reusable
          ? "pass"
          : "warn",
      summary: "Linked CLI account detection",
      detail: `elizacloud=${linkedAccounts.elizaCloud.nativeReady ? "native" : linkedAccounts.elizaCloud.available ? "detected" : "missing"} codex=${linkedAccounts.codex.nativeReady ? "native" : linkedAccounts.codex.available ? "detected" : "missing"} claudeCode=${linkedAccounts.claudeCode.nativeReady ? "native" : linkedAccounts.claudeCode.fallbackReady ? "fallback" : linkedAccounts.claudeCode.available ? "detected" : "missing"}`,
    });

    checks.push({
      id: "provider.elizacloud-base-url",
      status: cloudBaseUrlValidation ? "warn" : "pass",
      summary: "Eliza Cloud API base URL",
      detail: cloudBaseUrlValidation
        ? `${cloudBaseUrlValidation} normalized=${normalizedCloudBaseUrl}`
        : `normalized=${normalizedCloudBaseUrl}`,
    });

    checks.push({
      id: "native.runtime-line",
      status:
        nativeAudit.runtime.alpha === getLatestRuntimeLine().alpha
          ? "pass"
          : "warn",
      summary: "Alpha Eliza runtime line",
      detail: `alpha=${nativeAudit.runtime.alpha} latest=${nativeAudit.runtime.latest}`,
    });

    checks.push({
      id: "native.package-alignment",
      status:
        nativeAudit.summary.alphaOnly > 0 ||
        nativeAudit.summary.laggingLatest > 0 ||
        nativeAudit.summary.workspaceOnly > 0 ||
        nativeAudit.summary.vendored > 0
          ? "warn"
          : "pass",
      summary: "Native package compatibility audit",
      detail: `aligned=${nativeAudit.summary.aligned} vendored=${nativeAudit.summary.vendored} alphaOnly=${nativeAudit.summary.alphaOnly} laggingLatest=${nativeAudit.summary.laggingLatest} workspaceOnly=${nativeAudit.summary.workspaceOnly}`,
    });

    checks.push({
      id: "ecosystem.registry",
      status: registrySnapshot?.available ? "pass" : "warn",
      summary: "ElizaOS registry snapshot",
      detail: registrySnapshot?.available
        ? `Registry snapshot available with ${registrySnapshot.total} entries and ${registrySnapshot.nonAppPlugins} non-app plugins.`
        : `Registry snapshot unavailable: ${registrySnapshot?.error ?? "unknown error"}`,
    });

    checks.push({
      id: "ecosystem.skills.catalog",
      status: skillCatalog?.available ? "pass" : "warn",
      summary: "ElizaOS skill catalog",
      detail: skillCatalog?.available
        ? `Skill catalog available with ${skillCatalog.total} cached skills.`
        : `Skill catalog unavailable: ${skillCatalog?.error ?? "unknown error"}`,
    });

    checks.push({
      id: "ecosystem.compatibility",
      status: compatibility
        ? compatibility.compatible
          ? "pass"
          : "warn"
        : "warn",
      summary: "ElizaOS plugin compatibility",
      detail: compatibility
        ? compatibility.compatible
          ? `All ${compatibility.checked} checked plugins are compatible with core ${compatibility.coreVersion}.`
          : `${compatibility.failures}/${compatibility.checked} plugins need attention for core ${compatibility.coreVersion}: ${compatibility.failing.map((entry) => entry.plugin).join(", ")}`
        : "Compatibility report unavailable.",
    });

    if (workspaceEcosystem) {
      checks.push({
        id: "ecosystem.workspace.benchmarks",
        status: workspaceEcosystem.benchmarkPacks > 0 ? "pass" : "warn",
        summary: "Benchmark workspace packs",
        detail: `benchmark packs=${workspaceEcosystem.benchmarkPacks}`,
      });
      checks.push({
        id: "ecosystem.workspace.distributions",
        status: workspaceEcosystem.distributionChannels > 0 ? "pass" : "warn",
        summary: "Distribution workspace channels",
        detail: `distribution channels=${workspaceEcosystem.distributionChannels}`,
      });
      checks.push({
        id: "ecosystem.workspace.modeling",
        status: workspaceEcosystem.modelingProfiles > 0 ? "pass" : "warn",
        summary: "Modeling workspace profiles",
        detail: `modeling profiles=${workspaceEcosystem.modelingProfiles}`,
      });
    }

    checks.push({
      id: "native.transport-mediation",
      status: nativePlugins.some((entry) => entry.category === "messaging")
        ? "pass"
        : "warn",
      summary: "Native messaging plugin mediation",
      detail: nativePlugins
        .filter((entry) => entry.category === "messaging")
        .map(
          (entry) =>
            `${entry.id}:${entry.enabled ? "enabled" : "disabled"}:${entry.source}`,
        )
        .join(", "),
    });

    if (ownership) {
      const controlPlane = ownership.transportControl;
      const pluginManager = ownership.pluginManager;
      const messagingBridge = controlPlane.messagingBridge;
      checks.push({
        id: "native.messaging.services",
        status: messagingBridge.some((entry) => entry.live) ? "pass" : "warn",
        summary: "Native messaging runtime services",
        detail: messagingBridge
          .map(
            (entry) =>
              `${entry.platform}:available=${entry.serviceAvailable}:live=${entry.live}:plugin=${entry.pluginId ?? "n/a"}`,
          )
          .join(", "),
      });
      checks.push({
        id: "native.messaging.control-plane",
        status: controlPlane.totals.operationalTransports > 0 ? "pass" : "warn",
        summary: "Native messaging control plane",
        detail: `configured=${controlPlane.totals.configured} gatewayEnabled=${controlPlane.totals.gatewayEnabled} enabled=${controlPlane.totals.enabledPlugins} available=${controlPlane.totals.availableServices} live=${controlPlane.totals.liveServices} operational=${controlPlane.totals.operationalTransports} official=${controlPlane.totals.officialPlugins} vendored=${controlPlane.totals.vendoredPlugins} custom=${controlPlane.totals.customTransports} product=${controlPlane.totals.productTransports}`,
      });
      checks.push({
        id: "native.plugin-manager",
        status: pluginManager?.summary.total ? "pass" : "warn",
        summary: "Native plugin manager summary",
        detail: pluginManager
          ? `total=${pluginManager.summary.total} enabled=${pluginManager.summary.enabled} official=${pluginManager.summary.official} vendored=${pluginManager.summary.vendored} categories=${pluginManager.summary.categories}`
          : "Plugin manager inventory unavailable.",
      });
      checks.push({
        id: "gateway.transport.inventory",
        status:
          controlPlane.transportInventory.filter((entry) => entry.operational)
            .length > 0
            ? "pass"
            : "warn",
        summary: "Gateway transport inventory",
        detail: summarizeTransportInventory(
          controlPlane.transportInventory,
          "diagnostics",
        ),
      });
      checks.push({
        id: "native.ownership.snapshot",
        status: ownership.serviceResolution.length > 0 ? "pass" : "warn",
        summary: "Native ownership control plane",
        detail: `serviceResolution=${ownership.serviceResolution.length} transportOperational=${controlPlane.totals.operationalTransports} pluginManagerEnabled=${pluginManager?.summary.enabled ?? 0}`,
      });
      if (input.gatewayTransportOverview) {
        checks.push({
          id: "gateway.transport.overview",
          status:
            input.gatewayTransportOverview.mismatchCount > 0 ? "warn" : "pass",
          summary: "Gateway transport overview",
          detail: `operational=${input.gatewayTransportOverview.operationalCount} mismatches=${input.gatewayTransportOverview.mismatchCount}; ${input.gatewayTransportOverview.details
            .map(
              (entry) =>
                `${entry.platform}:${entry.mismatchFlags.length ? entry.mismatchFlags.join("|") : "ok"}`,
            )
            .join(", ")}`,
        });
      }
    }

    if (formsControl) {
      checks.push({
        id: "native.forms",
        status: formsControl.available ? "pass" : "warn",
        summary: "Native forms ownership",
        detail: `available=${formsControl.available} templates=${formsControl.templates} total=${formsControl.forms.total} active=${formsControl.forms.active} persistence=${formsControl.persistenceAvailable}`,
      });
    }

    if (runtimeExecutionControl) {
      checks.push({
        id: "native.execution.e2b",
        status: runtimeExecutionControl.e2b.available ? "pass" : "warn",
        summary: "Native E2B sandbox ownership",
        detail: `available=${runtimeExecutionControl.e2b.available} sandboxes=${runtimeExecutionControl.e2b.sandboxes} execution=${runtimeExecutionControl.e2b.supportsExecution} root=${runtimeExecutionControl.e2b.sandboxRoot ?? "n/a"}`,
      });
      checks.push({
        id: "native.execution.codegen",
        status: runtimeExecutionControl.codeGeneration.ready ? "pass" : "warn",
        summary: "Native code generation ownership",
        detail: `available=${runtimeExecutionControl.codeGeneration.available} ready=${runtimeExecutionControl.codeGeneration.ready} methods=${runtimeExecutionControl.codeGeneration.methods.join(",") || "none"} github=${runtimeExecutionControl.github.available} secrets=${runtimeExecutionControl.secretsManager.available}`,
      });
    }

    checks.push({
      id: "skills.present",
      status: input.skillsCount > 0 ? "pass" : "warn",
      summary: "Installed skills",
      detail: input.skillsSummary
        ? `${input.skillsSummary.total} skills available (workspace=${input.skillsSummary.workspace} generated=${input.skillsSummary.generated} bundled=${input.skillsSummary.bundled} managed=${input.skillsSummary.managed} project=${input.skillsSummary.project} invocable=${input.skillsSummary.invocable})`
        : `${input.skillsCount} skill documents found in ${this.config.skillsDir}`,
    });

    checks.push({
      id: "context.present",
      status: input.contextFilesCount > 0 ? "pass" : "warn",
      summary: "Workspace context files",
      detail:
        input.contextFilesCount > 0
          ? `${input.contextFilesCount} context files detected`
          : "No AGENTS.md, SOUL.md, MISSION.md, or ROADMAP.md file found.",
    });

    const enabledPlatforms = Object.entries(this.gatewayConfig.platforms)
      .filter(([, platform]) => platform.enabled)
      .map(([platform]) => platform);
    checks.push({
      id: "gateway.platforms",
      status: enabledPlatforms.length > 0 ? "pass" : "warn",
      summary: "Enabled gateway platforms",
      detail: enabledPlatforms.length
        ? enabledPlatforms.join(", ")
        : "No gateway platforms enabled.",
    });

    for (const requirement of transportRequirements) {
      checks.push({
        id: `${requirement.platform}.readiness`,
        status: requirement.status,
        summary: `${requirement.label} transport readiness`,
        detail: requirement.summary,
      });
    }

    checks.push({
      id: "media.tts.readiness",
      status: this.config.falApiKey ? "pass" : "warn",
      summary: "Text-to-speech plugin readiness",
      detail: this.config.falApiKey
        ? "FAL API key configured for the official TTS plugin."
        : "FAL_API_KEY is not configured, so the official TTS plugin stays disabled.",
    });

    checks.push({
      id: "repository.available",
      status: input.repositoryAvailable ? "pass" : "warn",
      summary: "Repository inspection",
      detail: input.repositoryAvailable
        ? "Git repository detected."
        : "Workspace is not inside a git repository.",
    });

    checks.push({
      id: "cron.activity",
      status: input.recentCronRuns > 0 ? "pass" : "warn",
      summary: "Automation run history",
      detail:
        input.recentCronRuns > 0
          ? `${input.recentCronRuns} recent automation runs recorded.`
          : "No recent cron runs recorded yet.",
    });

    checks.push({
      id: "terminal.activity",
      status: input.recentTerminalCommands > 0 ? "pass" : "warn",
      summary: "Terminal execution history",
      detail:
        input.recentTerminalCommands > 0
          ? `${input.recentTerminalCommands} recent terminal commands recorded.`
          : "No terminal commands recorded yet.",
    });

    checks.push({
      id: "execution.backends",
      status: "pass",
      summary: "Execution backend model",
      detail: `Execution layer supports ${this.config.executionBackend} as the active backend with timeout=${this.config.executionCommandTimeoutMs}ms and health timeout=${this.config.executionHealthTimeoutMs}ms.`,
    });

    checks.push({
      id: "daytona.readiness",
      status:
        this.config.executionBackend === "daytona" && !this.config.daytonaTarget
          ? "fail"
          : this.config.daytonaTarget
            ? "pass"
            : "warn",
      summary: "Daytona execution readiness",
      detail: this.config.daytonaTarget
        ? `Daytona sandbox target configured: ${this.config.daytonaTarget}. Shell=${this.config.daytonaCommand || "daytona"} ${this.config.daytonaShell || "/bin/sh"} workspace=${this.config.daytonaWorkspacePath || "/workspace"}${this.config.daytonaSnapshot ? ` snapshot=${this.config.daytonaSnapshot}` : ""}.`
        : "ELIZA_AGENT_DAYTONA_TARGET is not configured.",
    });

    checks.push({
      id: "daytona.shell",
      status: this.config.daytonaShell ? "pass" : "warn",
      summary: "Daytona shell strategy",
      detail: this.config.daytonaShell
        ? `Daytona commands execute through ${this.config.daytonaShell} with an info probe and exec path.`
        : "Daytona shell strategy is not configured.",
    });

    checks.push({
      id: "daytona.snapshot",
      status: this.config.daytonaSnapshot ? "pass" : "warn",
      summary: "Daytona snapshot reference",
      detail: this.config.daytonaSnapshot
        ? `Daytona snapshot configured: ${this.config.daytonaSnapshot}.`
        : "No Daytona snapshot reference configured; the backend will use the live sandbox target.",
    });

    checks.push({
      id: "daytona.inspect",
      status: this.config.daytonaInspectCommand ? "pass" : "warn",
      summary: "Daytona inspect command",
      detail: this.config.daytonaInspectCommand
        ? `Daytona inspect command configured: ${this.config.daytonaInspectCommand}.`
        : "Daytona inspect command will be synthesized from the configured target.",
    });

    checks.push({
      id: "modal.readiness",
      status:
        this.config.executionBackend === "modal" && !this.config.modalTarget
          ? "fail"
          : this.config.modalTarget
            ? "pass"
            : "warn",
      summary: "Modal execution readiness",
      detail: this.config.modalTarget
        ? `Modal shell target configured: ${this.config.modalTarget}. Shell=${this.config.modalCommand || "modal"} ${this.config.modalShell || "/bin/bash"} workspace=${this.config.modalWorkspacePath || "/workspace"}${this.config.modalEnvironment ? ` env=${this.config.modalEnvironment}` : ""}.`
        : "ELIZA_AGENT_MODAL_TARGET is not configured.",
    });

    checks.push({
      id: "modal.shell",
      status: this.config.modalShell ? "pass" : "warn",
      summary: "Modal shell strategy",
      detail: this.config.modalShell
        ? `Modal shell runs commands through ${this.config.modalShell} and can be bound to ${this.config.modalEnvironment || "the active profile"}.`
        : "Modal shell strategy is not configured.",
    });

    checks.push({
      id: "modal.environment",
      status: this.config.modalEnvironment ? "pass" : "warn",
      summary: "Modal environment selection",
      detail: this.config.modalEnvironment
        ? `Modal environment configured: ${this.config.modalEnvironment}.`
        : "No explicit Modal environment configured; the active profile will be used.",
    });

    checks.push({
      id: "modal.inspect",
      status: this.config.modalInspectCommand ? "pass" : "warn",
      summary: "Modal inspect command",
      detail: this.config.modalInspectCommand
        ? `Modal inspect command configured: ${this.config.modalInspectCommand}.`
        : "Modal inspect command will be synthesized from the configured target.",
    });

    checks.push({
      id: "browser.backend",
      status:
        this.config.browserProvider === "lightpanda" &&
        !this.config.browserCommand
          ? "fail"
          : "pass",
      summary: "Browser backend configuration",
      detail:
        this.config.browserProvider === "lightpanda"
          ? `Lightpanda is configured as the default browser backend via ${this.config.browserCommand}.`
          : "Basic HTTP fetch mode is configured as the browser fallback.",
    });

    if (integrationControl) {
      checks.push({
        id: "integration.browser.native",
        status:
          integrationControl.browser.source === "native" ? "pass" : "warn",
        summary: "Native browser integration",
        detail:
          integrationControl.browser.source === "native"
            ? "Browser status is resolved through the native Eliza service bridge."
            : "Browser status is still resolved through the product fallback service.",
      });
      checks.push({
        id: "integration.mcp.native",
        status: integrationControl.mcp.source === "native" ? "pass" : "warn",
        summary: "Native MCP integration",
        detail:
          integrationControl.mcp.source === "native"
            ? `MCP status is resolved through the native Eliza service bridge with ${integrationControl.mcp.cachedTools.length} cached tool(s).`
            : "MCP status is still resolved through the product fallback service.",
      });
    }

    const mediaControl = getNativeMediaControlPlane(this.config);
    checks.push({
      id: "media.tts.native",
      status: mediaControl.tts.ready ? "pass" : "warn",
      summary: "Native TTS ownership",
      detail: mediaControl.tts.detail,
    });

    if (this.runtime) {
      const researchControl = getNativeResearchControlPlane(this.runtime);
      const memoryStorageAvailable = Boolean(
        this.runtime.getService?.("memoryStorage"),
      );
      checks.push({
        id: "research.action-bench.native",
        status: researchControl.actionBench.available ? "pass" : "warn",
        summary: "Action-bench plugin ownership",
        detail: researchControl.actionBench.detail,
      });
      checks.push({
        id: "research.autocoder.native",
        status: researchControl.autocoder.ready ? "pass" : "warn",
        summary: "Autocoder runtime readiness",
        detail: researchControl.autocoder.detail,
      });
      checks.push({
        id: "runtime.memory-storage",
        status: memoryStorageAvailable ? "pass" : "warn",
        summary: "Advanced memory storage bridge",
        detail: memoryStorageAvailable
          ? "memoryStorage service is registered; advanced session summaries and long-term memories can persist locally."
          : "memoryStorage service is not registered; core advanced memory will disable storage-backed summaries and long-term memory.",
      });
    }

    checks.push({
      id: "execution.remote.sync",
      status: this.config.remoteSyncInclude.length > 0 ? "pass" : "warn",
      summary: "Remote workspace sync planning",
      detail: `Mode=${this.config.remoteSyncMode}; include=${this.config.remoteSyncInclude.join(", ") || "none"}; exclude=${this.config.remoteSyncExclude.join(", ") || "none"}; workspace label=${this.config.remoteWorkspaceLabel}.`,
    });

    checks.push({
      id: "execution.remote.artifacts",
      status: this.config.remoteArtifactPaths.length > 0 ? "pass" : "warn",
      summary: "Remote artifact policy",
      detail: `Policy=${this.config.remoteArtifactPolicy}; artifact paths=${this.config.remoteArtifactPaths.join(", ") || "none"}; snapshots persist metadata only.`,
    });

    checks.push({
      id: "mcp.bridge",
      status: this.config.mcpServerCommand ? "pass" : "warn",
      summary: "MCP bridge configuration",
      detail: this.config.mcpServerCommand
        ? `MCP bridge command configured: ${this.config.mcpServerCommand}`
        : "MCP_SERVER_COMMAND is not configured.",
    });

    checks.push({
      id: "acp.bridge",
      status: this.config.acpServerCommand ? "pass" : "warn",
      summary: "ACP bridge configuration",
      detail: this.config.acpServerCommand
        ? `ACP bridge command configured: ${this.config.acpServerCommand}`
        : "ACP_SERVER_COMMAND is not configured.",
    });

    const runtimeSettings = this.settings?.get();
    const runDepth = runtimeSettings?.agent.runDepth ?? this.config.runDepth;
    const maxIterations =
      runtimeSettings?.agent.maxIterations ?? this.config.maxIterations;
    const toolProgressMode =
      runtimeSettings?.agent.toolProgressMode ?? this.config.toolProgressMode;
    const autonomousAlignment = describeAutonomousAlignment(this.config);
    const startupSnapshot = this.startupState?.getSnapshot();
    const runtimeBridgeAttached =
      this.runController?.hasRuntimeBridge() ?? false;
    const agentEventBridgeAttached =
      this.runController?.hasAgentEventBridge() ?? false;
    checks.push({
      id: "agentic.loop",
      status: runtimeBridgeAttached ? "pass" : "warn",
      summary: "Observed multi-step runtime bridge",
      detail: `multiStep=true runtimeBridge=${runtimeBridgeAttached ? "attached" : "missing"} runDepth=${runDepth} maxIterations=${maxIterations} toolProgress=${toolProgressMode}`,
    });
    checks.push({
      id: "runtime.awareness",
      status: this.awareness?.isInitialized() ? "pass" : "warn",
      summary: "Native autonomous awareness registry",
      detail: this.awareness?.isInitialized()
        ? `registry=initialized contributors=${this.awareness.contributorCount()} runtimeBridge=${runtimeBridgeAttached} agentEvents=${agentEventBridgeAttached} runDepth=${runDepth} toolProgress=${toolProgressMode}`
        : "Awareness registry is not initialized; autonomous self-status injection is inactive.",
    });
    checks.push({
      id: "runtime.startup-hydration",
      status:
        startupSnapshot?.hotPathReady && startupSnapshot?.deferredReady
          ? "pass"
          : startupSnapshot?.hotPathReady
            ? "warn"
            : "warn",
      summary: "Startup hydration state",
      detail: startupSnapshot
        ? `hotPath=${startupSnapshot.hotPathReady ? "ready" : "warming"} runtime=${startupSnapshot.phases.runtime.status} gateway=${startupSnapshot.phases.gateway.status} cron=${startupSnapshot.phases.cron.status} diagnostics=${startupSnapshot.phases.diagnostics.status} operator=${startupSnapshot.phases.operator.status} ecosystem=${startupSnapshot.phases.ecosystem.status} skills=${startupSnapshot.phases.skills.status}`
        : "Startup hydration state is unavailable.",
    });
    checks.push({
      id: "autonomous.connection",
      status: autonomousAlignment.connection.configured ? "pass" : "warn",
      summary: "Native autonomous connection view",
      detail: `${autonomousAlignment.connection.kind} source=${autonomousAlignment.connection.source} ${autonomousAlignment.connection.detail}`,
    });
    checks.push({
      id: "provider.offline-bootstrap",
      status: this.config.offlineBootstrapMode ? "warn" : "pass",
      summary: "Explicit offline bootstrap fallback",
      detail: this.config.offlineBootstrapMode
        ? "Offline bootstrap mode is enabled; product fallback models may answer when no official provider is configured."
        : "Offline bootstrap mode is disabled; a real provider is required for model-backed answers.",
    });
    checks.push({
      id: "runtime.approvals",
      status: runtimeExecutionControl?.approvals.available ? "pass" : "warn",
      summary: "Native approval service bridge",
      detail: runtimeExecutionControl
        ? `native=${runtimeExecutionControl.approvals.available} asyncRequest=${runtimeExecutionControl.approvals.asyncRequest} selectionHandling=${runtimeExecutionControl.approvals.selectionHandling}`
        : "Runtime not attached; approval bridge cannot be inspected.",
    });
    checks.push({
      id: "runtime.agent-events",
      status:
        runtimeExecutionControl?.agentEvents.available &&
        agentEventBridgeAttached
          ? "pass"
          : "warn",
      summary: "Native agent-event progress stream",
      detail: runtimeExecutionControl
        ? `native=${runtimeExecutionControl.agentEvents.available} heartbeat=${runtimeExecutionControl.agentEvents.heartbeat} lastHeartbeat=${runtimeExecutionControl.agentEvents.lastHeartbeatStatus ?? "none"} bridge=${agentEventBridgeAttached}`
        : "Runtime not attached; agent-event bridge cannot be inspected.",
    });
    checks.push({
      id: "runtime.tool-policy",
      status: runtimeExecutionControl?.toolPolicy.available ? "pass" : "warn",
      summary: "Native tool policy service",
      detail: runtimeExecutionControl
        ? `native=${runtimeExecutionControl.toolPolicy.available} actions=${runtimeExecutionControl.toolPolicy.actions} codingAllowed=${runtimeExecutionControl.toolPolicy.codingAllowed} messagingAllowed=${runtimeExecutionControl.toolPolicy.messagingAllowed} fullAllowed=${runtimeExecutionControl.toolPolicy.fullAllowed}`
        : "Runtime not attached; tool policy bridge cannot be inspected.",
    });

    return checks;
  }

  async setupChecklist(): Promise<string[]> {
    const steps = [
      "Copy .env.example to .env and fill in at least one provider credential or linked account setting.",
      "Choose a primary provider: Codex, Claude Code, OpenAI, or Anthropic.",
      "Run bun install so the vendored native Eliza workspace packages resolve before booting the runtime.",
      "Add workspace context files like AGENTS.md or MISSION.md if you want persistent operator guidance.",
      "Enable gateway platforms in gateway.json only after their credentials are configured.",
      "Run /doctor after configuration changes.",
    ];

    for (const requirement of getTransportRequirementRecords(
      this.config,
      this.gatewayConfig,
    )) {
      if (requirement.checklist) {
        steps.push(requirement.checklist);
      }
    }
    if (!this.config.falApiKey) {
      steps.push(
        "Set FAL_API_KEY before relying on the official TTS plugin for voice synthesis.",
      );
    }
    if (this.config.browserProvider === "lightpanda") {
      steps.push(
        "Install Lightpanda or set ELIZA_AGENT_BROWSER_PROVIDER=basic if you want browser tasks to fall back to plain HTTP fetch mode.",
      );
    }
    steps.push(
      "Review ELIZA_AGENT_REMOTE_SYNC_MODE, ELIZA_AGENT_REMOTE_SYNC_INCLUDE, ELIZA_AGENT_REMOTE_SYNC_EXCLUDE, ELIZA_AGENT_REMOTE_ARTIFACT_PATHS, and ELIZA_AGENT_REMOTE_ARTIFACT_POLICY so Daytona and Modal snapshots stay metadata-only and operator-visible.",
    );
    if (!this.config.remoteSyncInclude.length) {
      steps.push(
        "Set ELIZA_AGENT_REMOTE_SYNC_INCLUDE and ELIZA_AGENT_REMOTE_SYNC_EXCLUDE to describe which paths should be mirrored or snapshotted for remote workspaces.",
      );
    }
    if (!this.config.remoteArtifactPaths.length) {
      steps.push(
        "Set ELIZA_AGENT_REMOTE_ARTIFACT_PATHS if you want operator-visible artifact metadata recorded for Daytona and Modal runs.",
      );
    }
    if (!this.config.remoteWorkspaceLabel) {
      steps.push(
        "Set ELIZA_AGENT_REMOTE_WORKSPACE_LABEL so remote lifecycle snapshots have a stable operator-facing label.",
      );
    }
    if (!this.config.mcpServerCommand) {
      steps.push(
        "Set MCP_SERVER_COMMAND if you want MCP-backed tool discovery and invocation.",
      );
    }
    if (!this.config.acpServerCommand) {
      steps.push(
        "Set ACP_SERVER_COMMAND if you want ACP-backed editor and protocol integrations.",
      );
    }
    if (this.config.executionBackend !== "local") {
      steps.push(
        `Validate ${this.config.executionBackend} runtime access and run /execution status before relying on remote or containerized execution.`,
      );
    }
    if (
      this.config.executionBackend === "singularity" &&
      !this.config.singularityImage
    ) {
      steps.push(
        "Set ELIZA_AGENT_SINGULARITY_IMAGE before relying on the Singularity execution backend.",
      );
    }
    if (
      this.config.executionBackend === "daytona" &&
      !this.config.daytonaTarget
    ) {
      steps.push(
        "Set ELIZA_AGENT_DAYTONA_TARGET before relying on the Daytona execution backend.",
      );
    }
    if (
      this.config.executionBackend === "daytona" &&
      !this.config.daytonaWorkspacePath
    ) {
      steps.push(
        "Set ELIZA_AGENT_DAYTONA_WORKSPACE_PATH before relying on the Daytona execution backend.",
      );
    }
    if (!this.config.daytonaShell) {
      steps.push(
        "Set ELIZA_AGENT_DAYTONA_SHELL to choose the shell used inside Daytona sandboxes.",
      );
    }
    if (
      this.config.executionBackend === "daytona" &&
      !this.config.daytonaSnapshot
    ) {
      steps.push(
        "Optionally set ELIZA_AGENT_DAYTONA_SNAPSHOT if you want Daytona execution to anchor to a named sandbox snapshot.",
      );
    }
    if (!this.config.daytonaInspectCommand) {
      steps.push(
        "Optionally set ELIZA_AGENT_DAYTONA_INSPECT_COMMAND if you want to override the synthesized Daytona sandbox inspect command.",
      );
    }
    if (this.config.executionBackend === "modal" && !this.config.modalTarget) {
      steps.push(
        "Set ELIZA_AGENT_MODAL_TARGET before relying on the Modal execution backend.",
      );
    }
    if (
      this.config.executionBackend === "modal" &&
      !this.config.modalWorkspacePath
    ) {
      steps.push(
        "Set ELIZA_AGENT_MODAL_WORKSPACE_PATH before relying on the Modal execution backend.",
      );
    }
    if (!this.config.modalShell) {
      steps.push(
        "Set ELIZA_AGENT_MODAL_SHELL to choose the shell used inside Modal sandboxes.",
      );
    }
    if (!this.config.modalEnvironment) {
      steps.push(
        "Optionally set ELIZA_AGENT_MODAL_ENVIRONMENT so Modal shells bind to an explicit environment instead of the active profile.",
      );
    }
    if (!this.config.modalInspectCommand) {
      steps.push(
        "Optionally set ELIZA_AGENT_MODAL_INSPECT_COMMAND if you want to override the synthesized Modal shell inspect command.",
      );
    }

    return steps;
  }

  private async isWritable(path: string): Promise<boolean> {
    try {
      await access(path, fsConstants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}
