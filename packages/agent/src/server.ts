import { createHmac, timingSafeEqual } from "node:crypto";
import { featureMap } from "@/config/feature-map";
import { loadGatewayConfig, saveGatewayConfig } from "@/config/gateway";
import {
  buildTransportDrilldown,
  parseGatewayFiltersFromUrl,
  parseTransportPlatform,
} from "@/gateway/control-plane";
import { normalizeInboundMessage } from "@/gateway/message-normalization";
import type { AppContext } from "@/runtime/bootstrap";
import {
  handleAgentTurn,
  runDelegationTaskInWorker,
  runModelAnalysisTurn,
  syncProviderSettings,
} from "@/runtime/chat";
import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
} from "@/runtime/native/plugin-catalog";
import {
  analyzeEffectiveBrowserComparison,
  analyzeEffectiveBrowserPage,
  cancelEffectiveForm,
  captureEffectiveBrowserPage,
  compareEffectiveBrowserPages,
  createEffectiveDelegationTask,
  createEffectiveForm,
  createEffectiveRepository,
  createEffectiveSandbox,
  deleteEffectiveRepository,
  describeEffectiveCachedMcpTools,
  describeEffectiveMcpTool,
  discoverEffectiveMcpTools,
  executeEffectiveSandboxCode,
  exportEffectiveSkillHubManifest,
  fetchEffectiveBrowserPage,
  generateEffectiveCode,
  generateEffectivePrd,
  getAutonomousControlPlane,
  getEffectiveBrowserStatus,
  getEffectiveCachedMcpTools,
  getEffectiveDelegationChildren,
  getEffectiveDelegationQueue,
  getEffectiveDelegationTask,
  getEffectiveDelegationTasks,
  getEffectiveDelegationTree,
  getEffectiveExperienceSummary,
  getEffectiveForm,
  getEffectiveFormTemplates,
  getEffectiveGeneratedSkills,
  getEffectiveMcpStatus,
  getEffectiveMemorySnapshot,
  getEffectivePersonalityList,
  getEffectivePersonalitySummary,
  getEffectivePluginManagerInventory,
  getEffectiveRolodexSummary,
  getEffectiveSecret,
  getEffectiveShellHistory,
  getEffectiveShellStatus,
  getEffectiveSkillHubCatalog,
  getEffectiveSkillHubFamilies,
  getEffectiveSkillHubFamily,
  getEffectiveSkillHubGenerated,
  getEffectiveSkillHubInstalled,
  getEffectiveSkillHubInstalledManifest,
  getEffectiveSkillHubSummary,
  getEffectiveSkillHubWorkspace,
  getEffectiveSkills,
  getEffectiveSkillsSummary,
  getEffectiveUserBeliefs,
  getEffectiveUserEngagement,
  getEffectiveUserProfileSearch,
  getEffectiveUserProfileSummary,
  getEffectiveUserRelationship,
  getNativeEcosystemSnapshot,
  getNativeExecutionControlPlane,
  getNativeFormsControlPlane,
  getNativeIntegrationControlPlane,
  getNativeMediaControlPlane,
  getNativeOwnershipControlPlane,
  getNativeOwnershipSnapshot,
  getNativeResearchControlPlane,
  getNativeServices,
  getNativeTransportControlPlane,
  importEffectiveSkillHubManifest,
  inspectEffectiveBrowserPage,
  installEffectiveSkillHubManifest,
  invokeEffectiveMcp,
  invokeEffectiveMcpTool,
  killEffectiveSandbox,
  listEffectiveForms,
  listEffectiveSandboxes,
  listEffectiveSecretKeys,
  performEffectiveCodeQa,
  performEffectiveCodeResearch,
  probeEffectiveMcp,
  retryEffectiveDelegationTask,
  runEffectiveShellCommand,
  screenshotEffectiveBrowserPage,
  searchEffectiveCachedMcpTools,
  searchEffectiveSkillHubCatalog,
  setEffectiveSecret,
  snapshotEffectiveBrowserPage,
  syncEffectiveSkillHub,
} from "@/runtime/native/service-bridge";
import { DiagnosticsService } from "@/services/diagnostics-service";
import { OperatorService } from "@/services/operator-service";
import { RepositoryService } from "@/services/repository-service";
import type {
  GatewayConfig,
  IncomingPlatformMessage,
  PlatformName,
} from "@/types";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function sse(events: Array<{ event: string; data: unknown }>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const entry of events) {
        controller.enqueue(
          encoder.encode(
            `event: ${entry.event}\ndata: ${JSON.stringify(entry.data)}\n\n`,
          ),
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    },
  });
}

function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  signingSecret?: string,
): boolean {
  if (!signingSecret) {
    return true;
  }
  if (!timestamp || !signature) {
    return false;
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function parseJsonBody<T>(
  request: Request,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  try {
    return {
      ok: true,
      value: (await request.json()) as T,
    };
  } catch {
    return {
      ok: false,
      response: json({ error: "Invalid JSON body." }, 400),
    };
  }
}

function createAutocoderWorkflowContext(
  context: AppContext,
  input: {
    title: string;
    objective: string;
    kind: Parameters<
      AppContext["services"]["autocoderPipeline"]["startWorkflow"]
    >[0]["kind"];
    projectName?: string;
    repositoryName?: string;
    sessionId?: string;
  },
) {
  const sessionId = input.sessionId ?? "api:local-user";
  const task = context.services.delegation.create({
    title: input.title,
    objective: input.objective,
    group: "autocoder",
    profile: "native",
    priority: "normal",
    labels: ["autocoder", input.kind],
    metadata: {
      kind: input.kind,
      sessionId,
      projectName: input.projectName ?? "",
      repositoryName: input.repositoryName ?? "",
    },
    executionMode: "local",
  });
  context.services.delegation.markRunning(task.id);
  const workflow = context.services.autocoderPipeline.startWorkflow({
    title: input.title,
    objective: input.objective,
    kind: input.kind,
    projectName: input.projectName,
    repositoryName: input.repositoryName,
    sessionId,
    taskId: task.id,
  });
  context.services.delegation.addNote(
    task.id,
    `system: attached autocoder workflow ${workflow.id}`,
  );
  return {
    taskId: task.id,
    workflowId: workflow.id,
    sessionId,
  };
}

function completeAutocoderWorkflowContext(
  context: AppContext,
  taskId: string,
  workflowId: string,
  note: string,
): void {
  context.services.delegation.complete(
    taskId,
    `${note} workflow=${workflowId}`,
  );
}

function failAutocoderWorkflowContext(
  context: AppContext,
  taskId: string,
  workflowId: string,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);
  context.services.delegation.fail(taskId, `${message} workflow=${workflowId}`);
}

function parseDelegationFilters(url: URL): {
  limit: number;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  label?: string;
  parentTaskId?: string;
  status?: "pending" | "running" | "completed" | "failed" | "cancelled";
  executionMode?: "local" | "delegated";
} {
  const rawLimit = Number(url.searchParams.get("limit") ?? "25");
  const priority = url.searchParams.get("priority") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const executionMode =
    url.searchParams.get("executionMode") ??
    url.searchParams.get("mode") ??
    undefined;

  return {
    limit: Number.isNaN(rawLimit) || rawLimit <= 0 ? 25 : rawLimit,
    group: url.searchParams.get("group") ?? undefined,
    profile: url.searchParams.get("profile") ?? undefined,
    priority:
      priority && ["low", "normal", "high"].includes(priority)
        ? (priority as "low" | "normal" | "high")
        : undefined,
    label:
      url.searchParams.get("label") ?? url.searchParams.get("tag") ?? undefined,
    parentTaskId:
      url.searchParams.get("parentTaskId") ??
      url.searchParams.get("parent") ??
      undefined,
    status:
      status &&
      ["pending", "running", "completed", "failed", "cancelled"].includes(
        status,
      )
        ? (status as
            | "pending"
            | "running"
            | "completed"
            | "failed"
            | "cancelled")
        : undefined,
    executionMode:
      executionMode === "local" || executionMode === "delegated"
        ? executionMode
        : undefined,
  };
}

export function startApiServer(context: AppContext): void {
  Bun.serve({
    hostname: context.config.host,
    port: context.config.port,
    fetch: async (request) => {
      const url = new URL(request.url);
      const nativeServices = getNativeServices(context.runtime);

      if (request.method === "OPTIONS") {
        return json({ ok: true });
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return json({
          status: "ok",
          name: context.config.agentName,
          mode: context.config.mode,
        });
      }

      if (request.method === "GET" && url.pathname === "/features") {
        return json({
          features: featureMap,
        });
      }

      if (request.method === "GET" && url.pathname === "/runtime/status") {
        const settings = context.services.settings.get();
        const catalog = getNativePluginCatalog(context.config);
        const ownership =
          context.services.nativeOwnership.controlPlane() ??
          getNativeOwnershipControlPlane(
            context.runtime,
            context.services,
            context.config,
            context.services.gatewayConfig,
          );
        return json({
          provider: settings.model.provider,
          model: settings.model.model,
          plugins: {
            openai: Boolean(context.config.openAiApiKey),
            anthropic: Boolean(context.config.anthropicApiKey),
            pdf: true,
            telegram: Boolean(context.config.telegramBotToken),
          },
          gateway: context.services.gatewayConfig,
          native: {
            catalog,
            grouped: groupNativePluginCatalog(catalog),
            serviceRegistry: context.services.nativeRegistry,
            transportInventory: ownership.transportControl.transportInventory,
            transportControl: ownership.transportControl.totals,
            messagingBridge: ownership.transportControl.messagingBridge,
            ownership: {
              serviceResolution: ownership.serviceResolution,
              pluginManager: ownership.pluginManager,
              identity: ownership.identity,
            },
          },
        });
      }

      if (request.method === "GET" && url.pathname === "/runtime/plugins") {
        const catalog = getNativePluginCatalog(context.config);
        const ownership =
          context.services.nativeOwnership.controlPlane() ??
          getNativeOwnershipControlPlane(
            context.runtime,
            context.services,
            context.config,
            context.services.gatewayConfig,
          );
        return json({
          catalog,
          grouped: groupNativePluginCatalog(catalog),
          serviceRegistry: context.services.nativeRegistry,
          pluginManager: ownership.pluginManager,
          ownership: {
            serviceResolution: ownership.serviceResolution,
            identity: ownership.identity,
          },
        });
      }

      if (request.method === "GET" && url.pathname === "/runtime/ecosystem") {
        const refresh =
          url.searchParams.get("refresh") === "true" ||
          url.searchParams.get("refresh") === "1";
        return json(
          await getNativeEcosystemSnapshot(
            context.runtime,
            context.services,
            context.config,
            context.services.gatewayConfig,
            refresh,
          ),
        );
      }

      if (request.method === "GET" && url.pathname === "/ecosystem") {
        return json(
          await getNativeEcosystemSnapshot(
            context.runtime,
            context.services,
            context.config,
            context.services.gatewayConfig,
          ),
        );
      }

      if (request.method === "GET" && url.pathname === "/benchmarks/packs") {
        return json({
          packs: context.services.ecosystem.benchmarkPacks(),
        });
      }

      if (request.method === "GET" && url.pathname === "/skills/channels") {
        return json({
          channels: context.services.ecosystem.distributionChannels(),
        });
      }

      if (
        request.method === "GET" &&
        (url.pathname === "/skills/optional" ||
          url.pathname === "/skills/optional-packs")
      ) {
        return json({
          optionalSkillPacks: context.services.ecosystem.optionalSkillPacks(),
        });
      }

      if (request.method === "GET" && url.pathname === "/modeling/profiles") {
        return json({
          profiles: context.services.ecosystem.modelingProfiles(),
        });
      }

      if (request.method === "GET" && url.pathname === "/insights") {
        return json({
          ownership:
            context.services.nativeOwnership.controlPlane() ??
            getNativeOwnershipControlPlane(
              context.runtime,
              context.services,
              context.config,
              context.services.gatewayConfig,
            ),
          ecosystem: await getNativeEcosystemSnapshot(
            context.runtime,
            context.services,
            context.config,
            context.services.gatewayConfig,
          ),
          operator: await context.services.operator.setupSummary(),
        });
      }

      if (request.method === "GET" && url.pathname === "/runtime/autonomous") {
        return json(
          getAutonomousControlPlane(
            context.runtime,
            context.services,
            context.config,
          ),
        );
      }

      if (
        request.method === "GET" &&
        url.pathname === "/runtime/compatibility"
      ) {
        return json(await context.services.agentSdk.compatibility());
      }

      if (request.method === "GET" && url.pathname === "/runtime/registry") {
        const query = url.searchParams.get("query")?.trim();
        const refresh =
          url.searchParams.get("refresh") === "true" ||
          url.searchParams.get("refresh") === "1";
        return json(
          query
            ? await context.services.agentSdk.searchRegistry(query)
            : await context.services.agentSdk.registry(refresh),
        );
      }

      if (request.method === "GET" && url.pathname === "/v1/responses") {
        return json({
          data: context.services.apiTransport.list(
            Number(url.searchParams.get("limit") ?? "25"),
          ),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/v1/responses/")
      ) {
        const id = url.pathname.replace("/v1/responses/", "").trim();
        const record = context.services.apiTransport.get(id);
        if (!record) {
          return json({ error: "Response not found." }, 404);
        }
        return json(record);
      }

      if (request.method === "GET" && url.pathname === "/platforms") {
        if (!context.gateway) {
          return json(
            {
              error:
                "Gateway runtime is not attached to this execution context.",
            },
            503,
          );
        }
        const state = await context.gateway.state(50);
        const controlPlane = getNativeTransportControlPlane(
          context.runtime,
          context.config,
          context.services.gatewayConfig,
        );
        return json({
          totals: state.totals,
          platforms: state.platforms,
          messagingBridge: controlPlane.messagingBridge,
          transportInventory: controlPlane.transportInventory,
          transportControl: controlPlane.totals,
          messagingPlugins: groupNativePluginCatalog(
            getNativePluginCatalog(context.config),
          ).messaging,
        });
      }

      if (request.method === "GET" && url.pathname === "/runtime/services") {
        const ownership =
          context.services.nativeOwnership.controlPlane() ??
          getNativeOwnershipControlPlane(
            context.runtime,
            context.services,
            context.config,
            context.services.gatewayConfig,
          );
        const integration = await getNativeIntegrationControlPlane(
          context.runtime,
          {
            web: context.services.web,
            mcp: context.services.mcp,
          },
        );
        return json({
          resolution: ownership.serviceResolution,
          integration,
          messagingBridge: ownership.transportControl.messagingBridge,
          transportInventory: ownership.transportControl.transportInventory,
          transportControl: ownership.transportControl.totals,
          ownership: {
            pluginManager: ownership.pluginManager,
            identity: ownership.identity,
          },
          registry: context.services.nativeRegistry,
        });
      }

      if (request.method === "GET" && url.pathname === "/runtime/ownership") {
        return json(
          (await context.services.nativeOwnership.snapshot()) ??
            (await getNativeOwnershipSnapshot(
              context.runtime,
              context.services,
              context.config,
              context.services.gatewayConfig,
            )),
        );
      }

      if (request.method === "GET" && url.pathname === "/runtime/transports") {
        return json(
          getNativeTransportControlPlane(
            context.runtime,
            context.config,
            context.services.gatewayConfig,
          ),
        );
      }

      if (
        request.method === "GET" &&
        (url.pathname === "/transport/inventory" ||
          url.pathname === "/transport/status" ||
          url.pathname === "/gateway/transports")
      ) {
        return json(
          getNativeTransportControlPlane(
            context.runtime,
            context.config,
            context.services.gatewayConfig,
          ),
        );
      }

      if (
        request.method === "GET" &&
        (url.pathname === "/transport/mismatches" ||
          url.pathname === "/gateway/transport-mismatches")
      ) {
        if (!context.gateway) {
          return json(
            {
              error:
                "Gateway runtime is not attached to this execution context.",
            },
            503,
          );
        }
        return json(await context.gateway.transportOverview());
      }

      if (
        request.method === "GET" &&
        (url.pathname.startsWith("/transport/") ||
          url.pathname.startsWith("/gateway/transport/"))
      ) {
        const rawPlatform = url.pathname
          .replace(/^\/gateway\/transport\//u, "")
          .replace(/^\/transport\//u, "");
        const platform = parseTransportPlatform(rawPlatform);
        if (!platform) {
          return json({ error: "Unknown transport platform." }, 404);
        }
        return json(await buildTransportDrilldown(context, platform));
      }

      if (request.method === "GET" && url.pathname === "/doctor") {
        const transportOverview = context.gateway
          ? await context.gateway.transportOverview()
          : undefined;
        return json({
          checks: await context.services.diagnostics.run({
            skillsCount: context.services.skills.list().length,
            contextFilesCount: context.services.contextFiles.list().length,
            recentCronRuns: context.services.cron.recentRuns(5).length,
            recentTerminalCommands: context.services.terminal.recent(5).length,
            repositoryAvailable: context.services.repository.isRepository(),
            gatewayTransportOverview: transportOverview,
          }),
        });
      }

      if (request.method === "GET" && url.pathname === "/setup/checklist") {
        return json({
          checklist: await context.services.diagnostics.setupChecklist(),
        });
      }

      if (request.method === "GET" && url.pathname === "/setup/summary") {
        return json({
          summary: await context.services.operator.setupSummary(),
        });
      }

      if (request.method === "GET" && url.pathname === "/update/preview") {
        return json({
          update: await context.services.operator.updatePreview(),
        });
      }

      if (request.method === "GET" && url.pathname === "/migrate/sources") {
        return json({
          sources: context.services.operator.migrationSources(),
        });
      }

      if (request.method === "GET" && url.pathname === "/migrate/history") {
        const limitRaw = Number(url.searchParams.get("limit") ?? "20");
        return json({
          history: context.services.operator.migrationHistory(
            Number.isNaN(limitRaw) || limitRaw <= 0 ? 20 : limitRaw,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/migrate/inspect") {
        const sourcePath = url.searchParams.get("path");
        if (!sourcePath) {
          return json({ error: "path is required" }, 400);
        }
        return json({
          inspection:
            context.services.operator.inspectMigrationSource(sourcePath),
        });
      }

      if (request.method === "POST" && url.pathname === "/migrate/apply") {
        const body = (await request.json()) as {
          path?: string;
          overwrite?: boolean;
        };
        if (!body.path) {
          return json({ error: "path is required" }, 400);
        }
        return json({
          result: context.services.operator.applyMigration(body.path, {
            overwrite: body.overwrite,
          }),
        });
      }

      if (request.method === "GET" && url.pathname === "/memory") {
        const target =
          url.searchParams.get("target") === "user" ? "user" : "memory";
        return json({
          target,
          summary: getEffectiveMemorySnapshot(
            context.runtime,
            context.services,
            target,
          ),
          snapshot: context.services.memory.renderSnapshot(target),
        });
      }

      if (request.method === "GET" && url.pathname === "/memory/summary") {
        const target =
          url.searchParams.get("target") === "user" ? "user" : "memory";
        return json({
          summary: getEffectiveMemorySnapshot(
            context.runtime,
            context.services,
            target,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/sessions") {
        const limitRaw = url.searchParams.get("limit");
        const limit = limitRaw ? Number(limitRaw) : 20;
        return json({
          sessions: context.services.sessions.listSessions(
            !Number.isNaN(limit) && limit > 0 ? limit : 20,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/sessions/title") {
        const body = (await request.json()) as {
          sessionId?: string;
          title?: string;
        };
        if (!body.sessionId || !body.title) {
          return json({ error: "sessionId and title are required" }, 400);
        }
        return json({
          summary: context.services.sessions.rename(body.sessionId, body.title),
        });
      }

      if (request.method === "GET" && url.pathname === "/sessions/continuity") {
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) {
          return json({ error: "sessionId is required" }, 400);
        }
        return json({
          sessions: context.services.sessions.continuity(sessionId),
        });
      }

      if (request.method === "GET" && url.pathname === "/sessions/summary") {
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) {
          return json({ error: "sessionId is required" }, 400);
        }
        return json({
          summary: context.services.sessions.summarize(sessionId),
        });
      }

      if (request.method === "GET" && url.pathname === "/skills") {
        return json({
          skills: getEffectiveSkills(context.runtime, context.services),
          hub: getEffectiveSkillHubSummary(context.services),
          workspace: getEffectiveSkillHubWorkspace(context.services),
        });
      }

      if (request.method === "GET" && url.pathname === "/skills/summary") {
        return json({
          summary: getEffectiveSkillsSummary(context.runtime, context.services),
          hub: getEffectiveSkillHubSummary(context.services),
          installed: getEffectiveSkillHubInstalled(context.services),
        });
      }

      if (request.method === "GET" && url.pathname === "/skills/catalog") {
        const query = url.searchParams.get("query")?.trim();
        const refresh =
          url.searchParams.get("refresh") === "true" ||
          url.searchParams.get("refresh") === "1";
        return json(
          query
            ? await searchEffectiveSkillHubCatalog(context.services, query)
            : refresh
              ? await getEffectiveSkillHubCatalog(context.services, true, 50)
              : await getEffectiveSkillHubCatalog(context.services, false, 50),
        );
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/skills/catalog/")
      ) {
        const slug = url.pathname.replace("/skills/catalog/", "").trim();
        if (!slug || slug === "search") {
          return json({ error: "Skill slug is required." }, 400);
        }
        return json(
          (await context.services.skillsHub.catalogEntry(slug)) ?? {
            error: `Skill not found: ${slug}`,
          },
        );
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/skills/manifest/")
      ) {
        const slug = url.pathname.replace("/skills/manifest/", "").trim();
        if (!slug) {
          return json({ error: "Skill slug is required." }, 400);
        }
        return json({
          manifest: context.services.skillsHub.manifest(slug) ?? {
            error: `Skill manifest not found: ${slug}`,
          },
        });
      }

      if (request.method === "GET" && url.pathname === "/skills/generated") {
        return json({
          skills: getEffectiveGeneratedSkills(
            context.runtime,
            context.services,
          ),
          hub: getEffectiveSkillHubGenerated(context.services),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/skills/generated/detail"
      ) {
        const slug = url.searchParams.get("slug");
        if (!slug) {
          return json({ error: "slug is required" }, 400);
        }
        return json({
          detail: context.services.skillSynthesis.describeGeneratedSkill(slug),
        });
      }

      if (request.method === "GET" && url.pathname === "/skills/hub") {
        return json({
          summary: getEffectiveSkillHubSummary(context.services),
          workspace: getEffectiveSkillHubWorkspace(context.services),
          generated: getEffectiveSkillHubGenerated(context.services),
          installed: getEffectiveSkillHubInstalled(context.services),
          families: getEffectiveSkillHubFamilies(context.services, 50),
          catalog: await getEffectiveSkillHubCatalog(
            context.services,
            false,
            50,
          ),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/skills/hub/distribution"
      ) {
        return json({
          distribution: getEffectiveSkillHubSummary(context.services)
            .distribution,
        });
      }

      if (request.method === "GET" && url.pathname === "/skills/families") {
        return json({
          families: getEffectiveSkillHubFamilies(context.services, 50),
        });
      }

      if (request.method === "GET" && url.pathname === "/skills/hub/families") {
        return json({
          families: getEffectiveSkillHubFamilies(context.services, 50),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/skills/families/")
      ) {
        const slug = url.pathname.replace("/skills/families/", "").trim();
        if (!slug) {
          return json({ error: "Skill family slug is required." }, 400);
        }
        return json({
          family: getEffectiveSkillHubFamily(context.services, slug) ?? {
            error: `Skill family not found: ${slug}`,
          },
        });
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/skills/hub/families/")
      ) {
        const slug = url.pathname.replace("/skills/hub/families/", "").trim();
        if (!slug) {
          return json({ error: "Skill family slug is required." }, 400);
        }
        return json({
          family: getEffectiveSkillHubFamily(context.services, slug) ?? {
            error: `Skill family not found: ${slug}`,
          },
        });
      }

      if (request.method === "GET" && url.pathname === "/skills/installed") {
        return json({
          installed: getEffectiveSkillHubInstalled(context.services),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/skills/installed/")
      ) {
        const slug = url.pathname.replace("/skills/installed/", "").trim();
        if (!slug) {
          return json({ error: "Skill slug is required." }, 400);
        }
        return json({
          manifest: getEffectiveSkillHubInstalledManifest(
            context.services,
            slug,
          ) ?? {
            error: `Installed skill manifest not found: ${slug}`,
          },
        });
      }

      if (request.method === "POST" && url.pathname === "/skills/sync") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          refresh?: boolean;
        };
        return json({
          sync: await syncEffectiveSkillHub(
            context.services,
            Boolean(body.refresh),
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/skills/export") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          slug?: string;
          destinationPath?: string;
          bundle?: boolean;
        };
        if (body.bundle) {
          return json({
            bundle: await context.services.skillsHub.exportBundle(
              body.slug ?? "skills-hub",
            ),
          });
        }
        if (!body.slug) {
          return json({ error: "slug is required" }, 400);
        }
        return json({
          manifest: exportEffectiveSkillHubManifest(
            context.services,
            body.slug,
            body.destinationPath,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/skills/import") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          sourcePath?: string;
        };
        if (!body.sourcePath) {
          return json({ error: "sourcePath is required" }, 400);
        }
        return json({
          import: importEffectiveSkillHubManifest(
            context.services,
            body.sourcePath,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/skills/install") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          slug?: string;
        };
        if (!body.slug) {
          return json({ error: "slug is required" }, 400);
        }
        return json({
          install: await installEffectiveSkillHubManifest(
            context.services,
            body.slug,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/tools") {
        return json({
          tools: context.services.tools.list(),
          nativePluginManager: getEffectivePluginManagerInventory(
            context.runtime,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/tools/search") {
        const query = url.searchParams.get("query");
        if (!query) {
          return json({ error: "query is required" }, 400);
        }
        return json({
          results: context.services.tools.search(query),
        });
      }

      if (request.method === "GET" && url.pathname === "/tools/summary") {
        return json({
          summary: context.services.tools.summary(),
          nativePluginManager: getEffectivePluginManagerInventory(
            context.runtime,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/tools/transports") {
        return json({
          transports: context.services.tools.summary().transports,
        });
      }

      if (request.method === "GET" && url.pathname === "/tools/category") {
        const category = url.searchParams.get("name");
        if (!category) {
          return json({ error: "name is required" }, 400);
        }
        return json({
          category,
          tools: context.services.tools.byCategory(category),
        });
      }

      if (request.method === "GET" && url.pathname === "/tools/detail") {
        const id = url.searchParams.get("id");
        if (!id) {
          return json({ error: "id is required" }, 400);
        }
        return json({
          tool: context.services.tools.get(id),
        });
      }

      if (request.method === "GET" && url.pathname === "/mcp/status") {
        return json({
          mcp: getEffectiveMcpStatus(context.runtime, context.services),
        });
      }

      if (request.method === "GET" && url.pathname === "/mcp/tools") {
        return json({
          discovery: await discoverEffectiveMcpTools(
            context.runtime,
            context.services,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/mcp/cached") {
        return json({
          tools: getEffectiveCachedMcpTools(context.runtime, context.services),
        });
      }

      if (request.method === "GET" && url.pathname === "/mcp/cached/search") {
        const query = url.searchParams.get("query");
        if (!query) {
          return json({ error: "query is required" }, 400);
        }
        return json({
          tools: searchEffectiveCachedMcpTools(
            context.runtime,
            context.services,
            query,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/mcp/tool") {
        const name = url.searchParams.get("name");
        if (!name) {
          return json({ error: "name is required" }, 400);
        }
        return json({
          tool:
            getEffectiveCachedMcpTools(context.runtime, context.services).find(
              (tool) =>
                tool &&
                typeof tool === "object" &&
                "name" in tool &&
                String((tool as { name?: unknown }).name) === name,
            ) ?? null,
          detail: describeEffectiveMcpTool(
            context.runtime,
            context.services,
            name,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/mcp/cached/describe") {
        const limitRaw = url.searchParams.get("limit");
        const limit = limitRaw ? Number(limitRaw) : 20;
        return json({
          detail: describeEffectiveCachedMcpTools(
            context.runtime,
            context.services,
            !Number.isNaN(limit) && limit > 0 ? limit : 20,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/acp/status") {
        return json({
          acp: context.services.acp.status(),
        });
      }

      if (request.method === "GET" && url.pathname === "/acp/registry") {
        return json({
          registry: context.services.acp.registry(),
        });
      }

      if (request.method === "GET" && url.pathname === "/acp/package") {
        return json({
          package: context.services.acp.packageMetadata(),
        });
      }

      if (request.method === "GET" && url.pathname === "/acp/editor") {
        return json({
          editor: context.services.acp.editorSummary(),
        });
      }

      if (request.method === "GET" && url.pathname === "/acp/sessions") {
        const limit = Number(url.searchParams.get("limit") ?? "5");
        return json({
          sessions: context.services.acp.sessionSummary(
            !Number.isNaN(limit) && limit > 0 ? limit : 5,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/acp/publish") {
        return json({
          published: context.services.acp.publishRegistry(),
        });
      }

      if (request.method === "POST" && url.pathname === "/acp/export") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          label?: string;
        };
        return json({
          exported: context.services.acp.exportBundle(body.label ?? "latest"),
        });
      }

      if (request.method === "POST" && url.pathname === "/acp/import") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          path?: string;
          payload?: string;
        };
        const input = body.payload ?? body.path ?? "";
        if (!input) {
          return json({ error: "path or payload is required" }, 400);
        }
        return json({
          imported: context.services.acp.importBundle(input),
        });
      }

      if (request.method === "POST" && url.pathname === "/acp/probe") {
        return json({
          probe: await context.services.acp.probe(),
        });
      }

      if (request.method === "GET" && url.pathname === "/acp/tools") {
        const query = url.searchParams.get("query");
        return json({
          tools: query
            ? context.services.acp.searchTools(query)
            : context.services.acp.tools(),
        });
      }

      if (request.method === "GET" && url.pathname === "/acp/tool") {
        const name = url.searchParams.get("name");
        if (!name) {
          return json({ error: "name is required" }, 400);
        }
        return json({
          detail: context.services.acp.describeTool(name),
        });
      }

      if (request.method === "POST" && url.pathname === "/acp/invoke") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          input?: string;
        };
        return json({
          result: await context.services.acp.invoke(body.input ?? ""),
        });
      }

      if (request.method === "POST" && url.pathname === "/acp/call") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          tool?: string;
          input?: Record<string, unknown>;
        };
        if (!body.tool) {
          return json({ error: "tool is required" }, 400);
        }
        return json({
          result: await context.services.acp.invokeTool(
            body.tool,
            body.input ?? {},
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/workspace/tree") {
        const depth = Number(url.searchParams.get("depth") ?? "2");
        return json({
          entries: context.services.workspace.tree(
            Number.isNaN(depth) ? 2 : depth,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/workspace/read") {
        const path = url.searchParams.get("path");
        if (!path) {
          return json({ error: "path is required" }, 400);
        }
        return json({
          path,
          content: context.services.workspace.read(path),
        });
      }

      if (request.method === "GET" && url.pathname === "/workspace/search") {
        const query = url.searchParams.get("query");
        if (!query) {
          return json({ error: "query is required" }, 400);
        }
        return json({
          results: context.services.workspace.search(query),
        });
      }

      if (request.method === "GET" && url.pathname === "/web/fetch") {
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) {
          return json({ error: "url is required" }, 400);
        }
        return json({
          page: await fetchEffectiveBrowserPage(
            context.runtime,
            context.services,
            targetUrl,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/browser/status") {
        return json({
          browser: await getEffectiveBrowserStatus(
            context.runtime,
            context.services,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/browser/inspect") {
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) {
          return json({ error: "url is required" }, 400);
        }
        return json({
          inspection: await inspectEffectiveBrowserPage(
            context.runtime,
            context.services,
            targetUrl,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/web/snapshot") {
        const body = (await request.json()) as { url?: string };
        if (!body.url) {
          return json({ error: "url is required" }, 400);
        }
        return json({
          path: await snapshotEffectiveBrowserPage(
            context.runtime,
            context.services,
            body.url,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/browser/screenshot") {
        const body = (await request.json()) as { url?: string };
        if (!body.url) {
          return json({ error: "url is required" }, 400);
        }
        return json({
          path: await screenshotEffectiveBrowserPage(
            context.runtime,
            context.services,
            body.url,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/browser/capture") {
        const body = (await request.json()) as { url?: string };
        if (!body.url) {
          return json({ error: "url is required" }, 400);
        }
        return json({
          capture: await captureEffectiveBrowserPage(
            context.runtime,
            context.services,
            body.url,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/browser/analyze") {
        const body = (await request.json()) as { url?: string };
        if (!body.url) {
          return json({ error: "url is required" }, 400);
        }
        const analysis = await analyzeEffectiveBrowserPage(
          context.runtime,
          context.services,
          body.url,
        );
        return json({
          analysis,
          response: await runModelAnalysisTurn(
            context,
            analysis.prompt,
            "browser",
            {
              personalityId: context.services.personalities.getActive().id,
            },
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/browser/compare") {
        const body = (await request.json()) as {
          leftUrl?: string;
          rightUrl?: string;
        };
        if (!body.leftUrl || !body.rightUrl) {
          return json({ error: "leftUrl and rightUrl are required" }, 400);
        }
        return json({
          comparison: await compareEffectiveBrowserPages(
            context.runtime,
            context.services,
            body.leftUrl,
            body.rightUrl,
          ),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/browser/compare/analyze"
      ) {
        const body = (await request.json()) as {
          leftUrl?: string;
          rightUrl?: string;
        };
        if (!body.leftUrl || !body.rightUrl) {
          return json({ error: "leftUrl and rightUrl are required" }, 400);
        }
        const analysis = await analyzeEffectiveBrowserComparison(
          context.runtime,
          context.services,
          body.leftUrl,
          body.rightUrl,
        );
        return json({
          analysis,
          response: await runModelAnalysisTurn(
            context,
            analysis.prompt,
            "browser-comparison",
            {
              personalityId: context.services.personalities.getActive().id,
            },
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/web/inspect") {
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) {
          return json({ error: "url is required" }, 400);
        }
        return json({
          inspection: await inspectEffectiveBrowserPage(
            context.runtime,
            context.services,
            targetUrl,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/media/inspect") {
        const path = url.searchParams.get("path");
        if (!path) {
          return json({ error: "path is required" }, 400);
        }
        return json({
          media: context.services.media.inspect(path),
        });
      }

      if (request.method === "GET" && url.pathname === "/media/transcript") {
        const path = url.searchParams.get("path");
        if (!path) {
          return json({ error: "path is required" }, 400);
        }
        const media = context.services.media.inspect(path);
        return json({
          path,
          transcriptPath: media.transcriptPath,
          transcriptPreview: media.transcriptPreview,
        });
      }

      if (request.method === "GET" && url.pathname === "/media/caption") {
        const path = url.searchParams.get("path");
        if (!path) {
          return json({ error: "path is required" }, 400);
        }
        const media = context.services.media.inspect(path);
        return json({
          path,
          captionPath: media.captionPath,
          captionPreview: media.captionPreview,
        });
      }

      if (request.method === "GET" && url.pathname === "/media/bundle") {
        const path = url.searchParams.get("path");
        if (!path) {
          return json({ error: "path is required" }, 400);
        }
        return json({
          bundle: context.services.media.bundle(path),
        });
      }

      if (request.method === "POST" && url.pathname === "/media/analyze") {
        const body = (await request.json()) as {
          path?: string;
          focus?: "auto" | "voice" | "vision" | "research";
        };
        if (!body.path) {
          return json({ error: "path is required" }, 400);
        }
        return json({
          analysis: await context.services.media.analyzeWithModel(
            body.path,
            body.focus ?? "auto",
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/media/transcribe") {
        const body = (await request.json()) as {
          path?: string;
          language?: string;
          prompt?: string;
          name?: string;
        };
        if (!body.path) {
          return json({ error: "path is required" }, 400);
        }
        return json({
          transcription: await context.services.media.transcribeWithModel(
            body.path,
            {
              language: body.language,
              prompt: body.prompt,
              name: body.name,
            },
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/media/speak") {
        const body = (await request.json()) as {
          text?: string;
          name?: string;
          voice?: string;
          format?: "mp3" | "svg";
          speed?: number;
        };
        if (!body.text) {
          return json({ error: "text is required" }, 400);
        }
        return json({
          speech: await context.services.media.speakWithModel(body.text, {
            name: body.name,
            voice: body.voice,
            format: body.format,
            speed: body.speed,
          }),
        });
      }

      if (request.method === "POST" && url.pathname === "/media/generate") {
        const body = (await request.json()) as {
          prompt?: string;
          name?: string;
          size?: string;
          style?: string;
          focus?: string;
        };
        if (!body.prompt) {
          return json({ error: "prompt is required" }, 400);
        }
        return json({
          generation: await context.services.media.generateImage(body.prompt, {
            name: body.name,
            size: body.size,
            style: body.style,
            focus: body.focus,
          }),
        });
      }

      if (request.method === "GET" && url.pathname === "/runtime/media") {
        return json({
          media: getNativeMediaControlPlane(context.config),
        });
      }

      if (request.method === "GET" && url.pathname === "/runtime/forms") {
        return json({
          forms: getNativeFormsControlPlane(context.runtime),
        });
      }

      if (request.method === "GET" && url.pathname === "/forms") {
        return json({
          control: getNativeFormsControlPlane(context.runtime),
          forms: await listEffectiveForms(context.runtime),
        });
      }

      if (request.method === "GET" && url.pathname === "/forms/templates") {
        return json({
          control: getNativeFormsControlPlane(context.runtime),
          templates: getEffectiveFormTemplates(context.runtime),
        });
      }

      if (request.method === "POST" && url.pathname === "/forms/create") {
        const body = (await request.json()) as {
          template?: string;
          form?: Record<string, unknown>;
          metadata?: Record<string, unknown>;
        };
        if (!body.template && !body.form) {
          return json({ error: "template or form is required" }, 400);
        }
        return json({
          form: await createEffectiveForm(
            context.runtime,
            body.template ?? body.form,
            body.metadata,
          ),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/forms/") &&
        !url.pathname.endsWith("/cancel")
      ) {
        const formId = decodeURIComponent(url.pathname.replace("/forms/", ""));
        return json({
          form: await getEffectiveForm(context.runtime, formId),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/forms/") &&
        url.pathname.endsWith("/cancel")
      ) {
        const formId = decodeURIComponent(
          url.pathname.replace("/forms/", "").replace("/cancel", ""),
        );
        return json({
          cancelled: await cancelEffectiveForm(context.runtime, formId),
        });
      }

      if (request.method === "GET" && url.pathname === "/runtime/e2b") {
        return json({
          e2b: getNativeExecutionControlPlane(context.runtime).e2b,
        });
      }

      if (request.method === "GET" && url.pathname === "/e2b/sandboxes") {
        return json({
          control: getNativeExecutionControlPlane(context.runtime).e2b,
          sandboxes: listEffectiveSandboxes(context.runtime),
        });
      }

      if (request.method === "POST" && url.pathname === "/e2b/sandboxes") {
        const body = (await request.json()) as {
          template?: string;
          metadata?: Record<string, string>;
        };
        return json({
          sandboxId: await createEffectiveSandbox(context.runtime, {
            template: body.template,
            metadata: body.metadata,
          }),
          sandboxes: listEffectiveSandboxes(context.runtime),
        });
      }

      if (request.method === "POST" && url.pathname === "/e2b/execute") {
        const body = (await request.json()) as {
          code?: string;
          language?: string;
        };
        if (!body.code) {
          return json({ error: "code is required" }, 400);
        }
        return json({
          result: await executeEffectiveSandboxCode(
            context.runtime,
            body.code,
            body.language ?? "python",
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/e2b/kill") {
        const body = (await request.json()) as {
          id?: string;
        };
        await killEffectiveSandbox(context.runtime, body.id);
        return json({
          killed: body.id ?? "active",
          sandboxes: listEffectiveSandboxes(context.runtime),
        });
      }

      if (request.method === "GET" && url.pathname === "/runtime/codegen") {
        return json({
          execution: getNativeExecutionControlPlane(context.runtime),
        });
      }

      if (request.method === "POST" && url.pathname === "/codegen/generate") {
        const body = (await request.json()) as {
          projectName?: string;
          prompt?: string;
          [key: string]: unknown;
        };
        if (!body.projectName || !body.prompt) {
          return json({ error: "projectName and prompt are required" }, 400);
        }
        const requestPayload = {
          ...body,
          objective: body.prompt,
        };
        const workflow = createAutocoderWorkflowContext(context, {
          title: `Generate ${body.projectName}`,
          objective: body.prompt,
          kind: "generate",
          projectName: body.projectName,
        });
        try {
          const generation = await generateEffectiveCode(
            context.runtime,
            requestPayload,
          );
          const run = context.services.autocoderPipeline.record({
            workflowId: workflow.workflowId,
            kind: "generate",
            projectName: body.projectName,
            sessionId: workflow.sessionId,
            taskId: workflow.taskId,
            request: requestPayload,
            result: generation,
          });
          completeAutocoderWorkflowContext(
            context,
            workflow.taskId,
            workflow.workflowId,
            "system: code generation completed",
          );
          return json({
            workflowId: workflow.workflowId,
            taskId: workflow.taskId,
            run,
            generation,
          });
        } catch (error) {
          failAutocoderWorkflowContext(
            context,
            workflow.taskId,
            workflow.workflowId,
            error,
          );
          throw error;
        }
      }

      if (request.method === "GET" && url.pathname === "/codegen/runs") {
        return json({
          summary: context.services.autocoderPipeline.summary(),
          runs: context.services.autocoderPipeline.list(50),
        });
      }

      if (request.method === "GET" && url.pathname === "/codegen/workflows") {
        return json({
          summary: context.services.autocoderPipeline.summary(),
          workflows: context.services.autocoderPipeline.listWorkflows(50),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/codegen/runs/")
      ) {
        const id = decodeURIComponent(
          url.pathname.replace("/codegen/runs/", ""),
        );
        return json({
          run: context.services.autocoderPipeline.get(id),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/codegen/workflows/")
      ) {
        const suffix = decodeURIComponent(
          url.pathname.replace("/codegen/workflows/", ""),
        );
        if (suffix.endsWith("/bundle")) {
          const workflowId = suffix.replace(/\/bundle$/u, "");
          return json(
            context.services.autocoderPipeline.bundleWorkflow(workflowId),
          );
        }
        return json(context.services.autocoderPipeline.workflow(suffix));
      }

      if (request.method === "POST" && url.pathname === "/codegen/research") {
        const body = (await request.json()) as {
          projectName?: string;
          targetType?: string;
          description?: string;
          apis?: string[];
          requirements?: string[];
        };
        if (!body.projectName || !body.description) {
          return json(
            { error: "projectName and description are required" },
            400,
          );
        }
        const requestPayload = {
          projectName: body.projectName,
          targetType: body.targetType ?? "plugin",
          description: body.description,
          apis: body.apis ?? [],
          requirements: body.requirements ?? [],
        };
        const workflow = createAutocoderWorkflowContext(context, {
          title: `Research ${body.projectName}`,
          objective: body.description,
          kind: "research",
          projectName: body.projectName,
        });
        try {
          const research = await performEffectiveCodeResearch(
            context.runtime,
            requestPayload,
          );
          const run = context.services.autocoderPipeline.record({
            workflowId: workflow.workflowId,
            kind: "research",
            projectName: body.projectName,
            sessionId: workflow.sessionId,
            taskId: workflow.taskId,
            request: requestPayload,
            result: research,
          });
          completeAutocoderWorkflowContext(
            context,
            workflow.taskId,
            workflow.workflowId,
            "system: research completed",
          );
          return json({
            workflowId: workflow.workflowId,
            taskId: workflow.taskId,
            run,
            research,
          });
        } catch (error) {
          failAutocoderWorkflowContext(
            context,
            workflow.taskId,
            workflow.workflowId,
            error,
          );
          throw error;
        }
      }

      if (request.method === "POST" && url.pathname === "/codegen/prd") {
        const body = (await request.json()) as {
          projectName?: string;
          targetType?: string;
          description?: string;
          apis?: string[];
          requirements?: string[];
        };
        if (!body.projectName || !body.description) {
          return json(
            { error: "projectName and description are required" },
            400,
          );
        }
        const requestPayload = {
          projectName: body.projectName,
          targetType: body.targetType ?? "plugin",
          description: body.description,
          apis: body.apis ?? [],
          requirements: body.requirements ?? [],
        };
        const workflow = createAutocoderWorkflowContext(context, {
          title: `PRD ${body.projectName}`,
          objective: body.description,
          kind: "prd",
          projectName: body.projectName,
        });
        try {
          const research = await performEffectiveCodeResearch(
            context.runtime,
            requestPayload,
          );
          const researchRun = context.services.autocoderPipeline.record({
            workflowId: workflow.workflowId,
            kind: "research",
            projectName: body.projectName,
            sessionId: workflow.sessionId,
            taskId: workflow.taskId,
            request: requestPayload,
            result: research,
          });
          const prd = await generateEffectivePrd(
            context.runtime,
            requestPayload,
            research as Record<string, unknown>,
          );
          const prdRun = context.services.autocoderPipeline.record({
            workflowId: workflow.workflowId,
            kind: "prd",
            projectName: body.projectName,
            sessionId: workflow.sessionId,
            taskId: workflow.taskId,
            request: requestPayload,
            result: prd,
            linkedRunIds: [researchRun.id],
            parentRunId: researchRun.id,
          });
          completeAutocoderWorkflowContext(
            context,
            workflow.taskId,
            workflow.workflowId,
            "system: PRD workflow completed",
          );
          return json({
            workflowId: workflow.workflowId,
            taskId: workflow.taskId,
            researchRun,
            prdRun,
            research,
            prd,
          });
        } catch (error) {
          failAutocoderWorkflowContext(
            context,
            workflow.taskId,
            workflow.workflowId,
            error,
          );
          throw error;
        }
      }

      if (request.method === "POST" && url.pathname === "/codegen/qa") {
        const body = (await request.json()) as {
          projectPath?: string;
        };
        if (!body.projectPath) {
          return json({ error: "projectPath is required" }, 400);
        }
        const projectName = body.projectPath.split("/").filter(Boolean).at(-1);
        const workflow = createAutocoderWorkflowContext(context, {
          title: `QA ${projectName ?? "project"}`,
          objective: `QA ${body.projectPath}`,
          kind: "qa",
          projectName,
        });
        try {
          const qa = await performEffectiveCodeQa(
            context.runtime,
            body.projectPath,
          );
          const run = context.services.autocoderPipeline.record({
            workflowId: workflow.workflowId,
            kind: "qa",
            projectName,
            sessionId: workflow.sessionId,
            taskId: workflow.taskId,
            request: { projectPath: body.projectPath },
            result: qa,
          });
          completeAutocoderWorkflowContext(
            context,
            workflow.taskId,
            workflow.workflowId,
            "system: QA completed",
          );
          return json({
            workflowId: workflow.workflowId,
            taskId: workflow.taskId,
            run,
            qa,
          });
        } catch (error) {
          failAutocoderWorkflowContext(
            context,
            workflow.taskId,
            workflow.workflowId,
            error,
          );
          throw error;
        }
      }

      if (request.method === "POST" && url.pathname === "/github/create") {
        const body = (await request.json()) as {
          name?: string;
          private?: boolean;
        };
        if (!body.name) {
          return json({ error: "name is required" }, 400);
        }
        const workflow = createAutocoderWorkflowContext(context, {
          title: `Create repo ${body.name}`,
          objective: `Create GitHub repository ${body.name}`,
          kind: "github.create",
          repositoryName: body.name,
        });
        try {
          const repository = await createEffectiveRepository(
            context.runtime,
            body.name,
            body.private ?? true,
          );
          const run = context.services.autocoderPipeline.record({
            workflowId: workflow.workflowId,
            kind: "github.create",
            repositoryName: body.name,
            sessionId: workflow.sessionId,
            taskId: workflow.taskId,
            request: { name: body.name, private: body.private ?? true },
            result: repository,
          });
          completeAutocoderWorkflowContext(
            context,
            workflow.taskId,
            workflow.workflowId,
            "system: repository created",
          );
          return json({
            workflowId: workflow.workflowId,
            taskId: workflow.taskId,
            run,
            repository,
          });
        } catch (error) {
          failAutocoderWorkflowContext(
            context,
            workflow.taskId,
            workflow.workflowId,
            error,
          );
          throw error;
        }
      }

      if (request.method === "POST" && url.pathname === "/github/delete") {
        const body = (await request.json()) as {
          name?: string;
        };
        if (!body.name) {
          return json({ error: "name is required" }, 400);
        }
        const workflow = createAutocoderWorkflowContext(context, {
          title: `Delete repo ${body.name}`,
          objective: `Delete GitHub repository ${body.name}`,
          kind: "github.delete",
          repositoryName: body.name,
        });
        try {
          const deleted = await deleteEffectiveRepository(
            context.runtime,
            body.name,
          );
          const run = context.services.autocoderPipeline.record({
            workflowId: workflow.workflowId,
            kind: "github.delete",
            repositoryName: body.name,
            sessionId: workflow.sessionId,
            taskId: workflow.taskId,
            request: { name: body.name },
            result: deleted,
          });
          completeAutocoderWorkflowContext(
            context,
            workflow.taskId,
            workflow.workflowId,
            "system: repository deleted",
          );
          return json({
            workflowId: workflow.workflowId,
            taskId: workflow.taskId,
            run,
            deleted,
          });
        } catch (error) {
          failAutocoderWorkflowContext(
            context,
            workflow.taskId,
            workflow.workflowId,
            error,
          );
          throw error;
        }
      }

      if (request.method === "GET" && url.pathname === "/secrets") {
        return json({
          keys: await listEffectiveSecretKeys(context.runtime),
        });
      }

      if (request.method === "POST" && url.pathname === "/secrets/get") {
        const body = (await request.json()) as {
          key?: string;
        };
        if (!body.key) {
          return json({ error: "key is required" }, 400);
        }
        return json({
          key: body.key,
          value: await getEffectiveSecret(context.runtime, body.key),
        });
      }

      if (request.method === "POST" && url.pathname === "/secrets/set") {
        const body = (await request.json()) as {
          key?: string;
          value?: string;
        };
        if (!body.key || body.value === undefined) {
          return json({ error: "key and value are required" }, 400);
        }
        const workflow = createAutocoderWorkflowContext(context, {
          title: `Set secret ${body.key}`,
          objective: `Set secret ${body.key}`,
          kind: "secret.set",
        });
        try {
          await setEffectiveSecret(context.runtime, body.key, body.value);
          const run = context.services.autocoderPipeline.record({
            workflowId: workflow.workflowId,
            kind: "secret.set",
            sessionId: workflow.sessionId,
            taskId: workflow.taskId,
            request: { key: body.key, redacted: true },
            result: { key: body.key, valueSet: true },
          });
          completeAutocoderWorkflowContext(
            context,
            workflow.taskId,
            workflow.workflowId,
            "system: secret stored",
          );
          return json({
            workflowId: workflow.workflowId,
            taskId: workflow.taskId,
            run,
            key: body.key,
            valueSet: true,
          });
        } catch (error) {
          failAutocoderWorkflowContext(
            context,
            workflow.taskId,
            workflow.workflowId,
            error,
          );
          throw error;
        }
      }

      if (request.method === "GET" && url.pathname === "/runtime/research") {
        return json({
          research: getNativeResearchControlPlane(context.runtime),
        });
      }

      if (request.method === "POST" && url.pathname === "/workspace/write") {
        const body = (await request.json()) as {
          path?: string;
          content?: string;
        };
        if (!body.path || body.content === undefined) {
          return json({ error: "path and content are required" }, 400);
        }
        return json({
          path: context.services.workspace.write(body.path, body.content),
        });
      }

      if (request.method === "GET" && url.pathname === "/deliveries") {
        return json({
          deliveries: context.services.delivery.recent(100),
        });
      }

      if (request.method === "GET" && url.pathname === "/terminal/history") {
        return json({
          commands: getEffectiveShellHistory(
            context.runtime,
            context.services,
            25,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/terminal/run") {
        const body = (await request.json()) as {
          command?: string;
          timeoutMs?: number;
        };
        if (!body.command) {
          return json({ error: "command is required" }, 400);
        }
        return json({
          result: await runEffectiveShellCommand(
            context.runtime,
            context.services,
            body.command,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/delegation/tasks") {
        const filters = parseDelegationFilters(url);
        const nativeTasks = getEffectiveDelegationTasks(
          context.runtime,
          context.services,
        );
        if (
          !filters.group &&
          !filters.profile &&
          !filters.priority &&
          !filters.label &&
          !filters.parentTaskId &&
          !filters.status &&
          !filters.executionMode &&
          Array.isArray(nativeTasks)
        ) {
          return json({
            tasks: nativeTasks.slice(0, filters.limit),
          });
        }
        return json({
          tasks: context.services.delegation
            .list({
              group: filters.group,
              profile: filters.profile,
              priority: filters.priority,
              label: filters.label,
              parentTaskId: filters.parentTaskId,
              status: filters.status,
              executionMode: filters.executionMode,
            })
            .slice(0, filters.limit),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/delegation/tasks/")
      ) {
        const parts = url.pathname.split("/");
        const id = parts[3];
        const action = parts[4];
        if (!id) {
          return json({ error: "task id is required" }, 400);
        }
        if (!action) {
          return json({
            task: getEffectiveDelegationTask(
              context.runtime,
              context.services,
              id,
            ),
          });
        }
        if (action === "children") {
          return json({
            children: getEffectiveDelegationChildren(
              context.runtime,
              context.services,
              id,
            ),
          });
        }
        if (action === "tree") {
          return json({
            tree: getEffectiveDelegationTree(
              context.runtime,
              context.services,
              id,
            ),
          });
        }
      }

      if (request.method === "GET" && url.pathname === "/delegation/overview") {
        return json({
          overview: {
            local: context.services.delegation.overview(),
            native: getEffectiveDelegationQueue(
              context.runtime,
              context.services,
            ),
          },
        });
      }

      if (request.method === "GET" && url.pathname === "/delegation/groups") {
        const overview = context.services.delegation.overview();
        return json({
          groups: overview.byGroup,
          labels: overview.byLabel,
        });
      }

      if (request.method === "GET" && url.pathname === "/delegation/workers") {
        const filters = parseDelegationFilters(url);
        return json({
          overview: context.services.delegation.overview(),
          workers: context.services.delegation.workers(filters.limit, {
            group: filters.group,
            profile: filters.profile,
            priority: filters.priority,
            label: filters.label,
            parentTaskId: filters.parentTaskId,
            status: filters.status,
            executionMode: filters.executionMode,
          }),
        });
      }

      if (request.method === "POST" && url.pathname === "/delegation/tasks") {
        const body = (await request.json()) as {
          title?: string;
          objective?: string;
          group?: string;
          profile?: string;
          priority?: "low" | "normal" | "high";
          tags?: string[];
          labels?: string[];
          metadata?: Record<string, string>;
          executionMode?: "local" | "delegated";
          maxAttempts?: number;
        };
        if (!body.title || !body.objective) {
          return json({ error: "title and objective are required" }, 400);
        }
        return json({
          task: createEffectiveDelegationTask(
            context.runtime,
            context.services,
            {
              title: body.title,
              objective: body.objective,
              group: body.group,
              profile: body.profile,
              priority: body.priority,
              tags: body.tags ?? body.labels,
              labels: body.labels ?? body.tags,
              metadata: body.metadata,
              executionMode: body.executionMode,
              maxAttempts: body.maxAttempts,
            },
          ),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/delegation/tasks/") &&
        url.pathname.endsWith("/spawn")
      ) {
        const parts = url.pathname.split("/");
        const id = parts[3];
        if (!id) {
          return json({ error: "task id is required" }, 400);
        }
        const body = (await request.json()) as {
          title?: string;
          objective?: string;
          group?: string;
          profile?: string;
          priority?: "low" | "normal" | "high";
          tags?: string[];
          labels?: string[];
          metadata?: Record<string, string>;
          executionMode?: "local" | "delegated";
          maxAttempts?: number;
        };
        if (!body.objective) {
          return json({ error: "objective is required" }, 400);
        }
        return json({
          task: context.services.delegation.spawnChild(id, {
            title: body.title ?? "Child task",
            objective: body.objective,
            group: body.group,
            profile: body.profile,
            priority: body.priority,
            tags: body.tags ?? body.labels,
            labels: body.labels ?? body.tags,
            metadata: body.metadata,
            executionMode: body.executionMode,
            maxAttempts: body.maxAttempts,
          }),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/delegation/supervise"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          concurrency?: number;
        };
        const report = await context.services.delegation.superviseQueued(
          async (task) =>
            (
              await runDelegationTaskInWorker(context, task.id, {
                assumeRunning: true,
              })
            ).notes.at(-1) ?? "Delegated worker completed.",
          {
            concurrency:
              typeof body.concurrency === "number" && body.concurrency > 0
                ? body.concurrency
                : 2,
            onComplete: async (task) => {
              context.services.skillSynthesis.synthesizeFromTask(task);
            },
          },
        );
        return json({ report });
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/delegation/tasks/")
      ) {
        const parts = url.pathname.split("/");
        const id = parts[3];
        const action = parts[4];
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          note?: string;
          cascadeChildren?: boolean;
        };
        if (!id || !action) {
          return json({ error: "task id and action are required" }, 400);
        }

        if (action === "note") {
          return json({
            task: context.services.delegation.addNote(id, body.note ?? ""),
          });
        }
        if (action === "run") {
          return json({ task: context.services.delegation.markRunning(id) });
        }
        if (action === "execute") {
          const response = await handleAgentTurn(
            {
              message: `/delegate execute ${id}`,
              userId: "api-delegation",
              roomId: "api-delegation",
              source: "api",
            },
            context,
          );
          return json({ result: response });
        }
        if (action === "retry") {
          return json({
            task: retryEffectiveDelegationTask(
              context.runtime,
              context.services,
              id,
              body.note ?? "Requeued via API.",
            ),
          });
        }
        if (action === "cancel") {
          return json({
            task: context.services.delegation.cancel(
              id,
              body.note ?? "Cancelled via API.",
              {
                cascadeChildren: body.cascadeChildren,
              },
            ),
          });
        }
        if (action === "complete") {
          return json({
            task: context.services.delegation.complete(id, body.note),
          });
        }
        if (action === "fail") {
          return json({
            task: context.services.delegation.fail(
              id,
              body.note ?? "Task failed.",
              {
                cascadeChildren: body.cascadeChildren,
              },
            ),
          });
        }

        return json({ error: "unknown delegation action" }, 404);
      }

      if (request.method === "GET" && url.pathname === "/repo/status") {
        return json({
          status: await context.services.repository.status(),
        });
      }

      if (request.method === "GET" && url.pathname === "/repo/diff") {
        return json({
          diff: await context.services.repository.diffStat(),
        });
      }

      if (request.method === "GET" && url.pathname === "/repo/log") {
        return json({
          log: await context.services.repository.recentCommits(),
        });
      }

      if (request.method === "GET" && url.pathname === "/sessions/gateway") {
        const sessionKey = url.searchParams.get("sessionKey");
        if (sessionKey) {
          const session = context.services.gatewaySessions.get(sessionKey);
          if (!session) {
            return json({ error: "session not found" }, 404);
          }
          return json({ session });
        }
        return json({
          sessions: context.services.gatewaySessions.list(),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/sessions/gateway/expire"
      ) {
        const body = (await request.json()) as {
          minutes?: number;
        };
        const minutes = Number(body.minutes ?? 0);
        if (Number.isNaN(minutes) || minutes <= 0) {
          return json({ error: "minutes must be a positive number" }, 400);
        }
        return json({
          expired: context.services.gatewaySessions.expireOlderThan(minutes),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/sessions/gateway/home"
      ) {
        const platform = url.searchParams.get(
          "platform",
        ) as PlatformName | null;
        if (!platform) {
          return json({ error: "platform is required" }, 400);
        }
        return json({
          sessions: context.services.gatewaySessions.homeForPlatform(platform),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/sessions/gateway/voice"
      ) {
        const sessionKey = url.searchParams.get("sessionKey");
        if (!sessionKey) {
          return json({ error: "sessionKey is required" }, 400);
        }
        const session = context.services.gatewaySessions.get(sessionKey);
        if (!session) {
          return json({ error: "session not found" }, 404);
        }
        return json({ session });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/sessions/gateway/voice"
      ) {
        const body = (await request.json()) as {
          sessionKey?: string;
          mode?: "off" | "voice_only" | "all";
          voiceChannelId?: string;
        };
        if (!body.sessionKey) {
          return json({ error: "sessionKey is required" }, 400);
        }
        let session = context.services.gatewaySessions.get(body.sessionKey);
        if (!session) {
          return json({ error: "session not found" }, 404);
        }
        if (body.mode) {
          session = context.services.gatewaySessions.setVoiceMode(
            body.sessionKey,
            body.mode,
          );
        }
        if (body.voiceChannelId !== undefined) {
          session = context.services.gatewaySessions.setVoiceChannel(
            body.sessionKey,
            body.voiceChannelId || undefined,
          );
        }
        return json({ session });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/sessions/gateway/home"
      ) {
        const body = (await request.json()) as {
          sessionKey?: string;
          isHome?: boolean;
          label?: string;
        };
        if (!body.sessionKey) {
          return json({ error: "sessionKey is required" }, 400);
        }
        return json({
          session: context.services.gatewaySessions.markHome(body.sessionKey, {
            isHome: body.isHome,
            label: body.label,
          }),
        });
      }

      if (request.method === "GET" && url.pathname === "/personality") {
        const activeId =
          nativeServices.personality?.activeId() ??
          context.services.personalities.getActive().id;
        const available = getEffectivePersonalityList(
          context.runtime,
          context.services,
        );
        return json({
          active:
            available.find(
              (entry) =>
                typeof entry === "object" &&
                entry !== null &&
                "id" in entry &&
                entry.id === activeId,
            ) ?? context.services.personalities.getActive(),
          available,
          summary: getEffectivePersonalitySummary(
            context.runtime,
            context.services,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/personality/summary") {
        return json({
          summary: getEffectivePersonalitySummary(
            context.runtime,
            context.services,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/profiles/users") {
        const userId = url.searchParams.get("userId");
        return json({
          profiles: userId
            ? [context.services.userProfiles.get(userId)]
            : context.services.userProfiles.list(),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/profiles/users/search"
      ) {
        const query = url.searchParams.get("query");
        const limit = Number(url.searchParams.get("limit") ?? "10");
        if (!query) {
          return json({ error: "query is required" }, 400);
        }
        return json({
          hits: getEffectiveUserProfileSearch(
            context.runtime,
            context.services,
            query,
            Number.isFinite(limit) && limit > 0 ? limit : 10,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/profiles/users/card") {
        const userId = url.searchParams.get("userId");
        if (!userId) {
          return json({ error: "userId is required" }, 400);
        }
        return json({
          card:
            nativeServices.rolodex?.card(userId) ??
            context.services.userProfiles.renderCards(userId),
          summary: getEffectiveRolodexSummary(
            context.runtime,
            context.services,
          ),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/profiles/users/recall"
      ) {
        const userId = url.searchParams.get("userId");
        const query = url.searchParams.get("query");
        if (!userId || !query) {
          return json({ error: "userId and query are required" }, 400);
        }
        return json({
          hits:
            nativeServices.rolodex?.recall(userId, query) ??
            context.services.userProfiles.recall(userId, query),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/profiles/users/beliefs"
      ) {
        const userId = url.searchParams.get("userId");
        if (!userId) {
          return json({ error: "userId is required" }, 400);
        }
        return json({
          beliefs: getEffectiveUserBeliefs(
            context.runtime,
            context.services,
            userId,
          ),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/profiles/users/relationship"
      ) {
        const userId = url.searchParams.get("userId");
        if (!userId) {
          return json({ error: "userId is required" }, 400);
        }
        return json({
          relationship: getEffectiveUserRelationship(
            context.runtime,
            context.services,
            userId,
          ),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/profiles/users/engagement"
      ) {
        const userId = url.searchParams.get("userId");
        if (!userId) {
          return json({ error: "userId is required" }, 400);
        }
        return json({
          engagement: getEffectiveUserEngagement(
            context.runtime,
            context.services,
            userId,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/profiles/agent") {
        return json({
          profile:
            nativeServices.rolodex?.agentProfile() ??
            context.services.userProfiles.getAgent(),
          card:
            nativeServices.rolodex?.agentProfile() ??
            context.services.userProfiles.renderAgent(),
          summary: getEffectiveRolodexSummary(
            context.runtime,
            context.services,
          ),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/profiles/users/summary"
      ) {
        return json({
          summary: getEffectiveUserProfileSummary(
            context.runtime,
            context.services,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/profiles/summary") {
        return json({
          summary: getEffectiveUserProfileSummary(
            context.runtime,
            context.services,
          ),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/profiles/users/note"
      ) {
        const body = (await request.json()) as {
          userId?: string;
          note?: string;
          source?: string;
        };
        if (!body.userId || !body.note) {
          return json({ error: "userId and note are required" }, 400);
        }
        return json({
          profile:
            nativeServices.rolodex?.remember(
              body.userId,
              "note",
              body.note,
              body.source,
            ) ??
            context.services.userProfiles.addNote(
              body.userId,
              body.note,
              body.source,
            ),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/profiles/users/remember"
      ) {
        const body = (await request.json()) as {
          userId?: string;
          kind?:
            | "preference"
            | "fact"
            | "belief"
            | "goal"
            | "context"
            | "constraint"
            | "relationship"
            | "note"
            | "memory";
          value?: string;
          source?: string;
        };
        if (!body.userId || !body.kind || !body.value) {
          return json({ error: "userId, kind, and value are required" }, 400);
        }
        return json({
          profile:
            nativeServices.rolodex?.remember(
              body.userId,
              body.kind,
              body.value,
              body.source,
            ) ??
            context.services.userProfiles.remember(
              body.userId,
              body.kind,
              body.value,
              body.source,
            ),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/profiles/users/mode"
      ) {
        const body = (await request.json()) as {
          userId?: string;
          mode?: "local" | "hybrid";
        };
        if (!body.userId || (body.mode !== "local" && body.mode !== "hybrid")) {
          return json({ error: "userId and mode are required" }, 400);
        }
        return json({
          profile: context.services.userProfiles.setMode(
            body.userId,
            body.mode,
          ),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/profiles/users/modeling"
      ) {
        const body = (await request.json()) as {
          userId?: string;
          userMemoryMode?: "local" | "hybrid";
          assistantMemoryMode?: "local" | "hybrid";
          dialecticMode?: "off" | "assist" | "conclude";
        };
        if (!body.userId) {
          return json({ error: "userId is required" }, 400);
        }
        return json({
          profile: context.services.userProfiles.configureModeling(
            body.userId,
            {
              userMemoryMode: body.userMemoryMode,
              assistantMemoryMode: body.assistantMemoryMode,
              dialecticMode: body.dialecticMode,
            },
          ),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/profiles/users/context"
      ) {
        const userId = url.searchParams.get("userId");
        const query = url.searchParams.get("query");
        if (!userId || !query) {
          return json({ error: "userId and query are required" }, 400);
        }
        return json({
          context: context.services.userProfiles.context(userId, query),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/profiles/users/conclude"
      ) {
        const body = (await request.json()) as {
          userId?: string;
          query?: string;
          conclusion?: string;
          source?: string;
        };
        if (!body.userId || !body.query || !body.conclusion) {
          return json(
            { error: "userId, query, and conclusion are required" },
            400,
          );
        }
        return json({
          context: context.services.userProfiles.context(
            body.userId,
            body.query,
          ),
          conclusion: context.services.userProfiles.conclude(
            body.userId,
            body.query,
            body.conclusion,
            body.source,
          ),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/profiles/agent/observe"
      ) {
        const body = (await request.json()) as {
          note?: string;
          source?: string;
        };
        if (!body.note) {
          return json({ error: "note is required" }, 400);
        }
        return json({
          profile:
            nativeServices.rolodex?.observeAgent(body.note, body.source) ??
            context.services.userProfiles.observeAgent(body.note, body.source),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/profiles/agent/seed"
      ) {
        const body = (await request.json()) as {
          name?: string;
          goals?: string[];
          strengths?: string[];
          workStyle?: string[];
          notes?: string[];
        };
        return json({
          profile: context.services.userProfiles.seedAgent(body),
        });
      }

      if (request.method === "GET" && url.pathname === "/experience") {
        return json({
          summary: getEffectiveExperienceSummary(
            context.runtime,
            context.services,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/experience/summary") {
        return json({
          summary: getEffectiveExperienceSummary(
            context.runtime,
            context.services,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/personality") {
        const body = (await request.json()) as { id: string };
        return json({
          active:
            nativeServices.personality?.activate(body.id) ??
            context.services.personalities.setActive(body.id),
        });
      }

      if (request.method === "GET" && url.pathname === "/context/files") {
        return json({
          files: context.services.contextFiles.list(),
        });
      }

      if (request.method === "GET" && url.pathname === "/settings") {
        return json({
          settings: context.services.settings.get(),
        });
      }

      if (request.method === "GET" && url.pathname === "/execution/status") {
        const active = context.services.settings.get().execution;
        return json({
          active,
          backends: await context.services.terminal.health(),
          native: await getEffectiveShellStatus(
            context.runtime,
            context.services,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/execution/backends") {
        return json({
          backends: await context.services.terminal.health(),
        });
      }

      if (request.method === "POST" && url.pathname === "/execution/preview") {
        const body = (await request.json()) as {
          command?: string;
          timeoutMs?: number;
        };
        if (!body.command) {
          return json({ error: "command is required" }, 400);
        }
        return json({
          preview: context.services.terminal.preview(
            body.command,
            body.timeoutMs,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/settings") {
        const body = (await request.json()) as {
          path: string;
          value: string | number | boolean;
        };
        const settings = context.services.settings.set(body.path, body.value);
        syncProviderSettings(context, settings);
        return json({
          settings,
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/documents/pdf/extract"
      ) {
        const body = (await request.json()) as {
          path?: string;
          base64?: string;
          startPage?: number;
          endPage?: number;
          preserveWhitespace?: boolean;
          cleanContent?: boolean;
        };

        if (!body.path && !body.base64) {
          return json({ error: "path or base64 is required" }, 400);
        }

        const text = body.path
          ? nativeServices.knowledge
            ? String(await nativeServices.knowledge.ingestPdf(body.path))
            : await context.services.documents.extractPdfFromPath(body.path, {
                startPage: body.startPage,
                endPage: body.endPage,
                preserveWhitespace: body.preserveWhitespace,
                cleanContent: body.cleanContent,
              })
          : await context.services.documents.extractPdfFromBase64(
              body.base64 as string,
              {
                startPage: body.startPage,
                endPage: body.endPage,
                preserveWhitespace: body.preserveWhitespace,
                cleanContent: body.cleanContent,
              },
            );

        return json({
          text,
        });
      }

      if (request.method === "GET" && url.pathname === "/cron/jobs") {
        return json({
          jobs: nativeServices.cron?.list() ?? context.services.cron.list(),
        });
      }

      if (request.method === "GET" && url.pathname === "/cron/runs") {
        return json({
          runs:
            nativeServices.cron?.runs(50) ??
            context.services.cron.recentRuns(50),
        });
      }

      if (request.method === "POST" && url.pathname === "/cron/jobs") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          name?: string;
          prompt?: string;
          schedule?: string;
          skills?: string[];
          delivery?: "origin" | "local";
          runtime?: {
            provider?: string;
            model?: string;
            baseUrl?: string;
            temperature?: number;
            maxTokens?: number;
            personalityId?: string;
          };
        };
        if (!body.schedule || !body.prompt) {
          return json({ error: "schedule and prompt are required" }, 400);
        }
        return json({
          job:
            nativeServices.cron?.create({
              name: body.name ?? `job-${Date.now()}`,
              schedule: body.schedule,
              prompt: body.prompt,
              skills: body.skills ?? [],
              delivery: body.delivery ?? "local",
              runtime: body.runtime,
            }) ??
            context.services.cron.create({
              name: body.name ?? `job-${Date.now()}`,
              schedule: body.schedule,
              prompt: body.prompt,
              skills: body.skills ?? [],
              delivery: body.delivery ?? "local",
              runtime: body.runtime,
            }),
        });
      }

      if (
        request.method === "PATCH" &&
        url.pathname.startsWith("/cron/jobs/")
      ) {
        const id = url.pathname.replace("/cron/jobs/", "").trim();
        if (!id) {
          return json({ error: "cron job id is required" }, 400);
        }
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          name?: string;
          prompt?: string;
          schedule?: string;
          skills?: string[];
          delivery?: "origin" | "local";
          clearRuntime?: boolean;
          runtime?: {
            provider?: string;
            model?: string;
            baseUrl?: string;
            temperature?: number;
            maxTokens?: number;
            personalityId?: string;
          };
        };

        return json({
          job:
            nativeServices.cron?.update(id, {
              name: body.name,
              prompt: body.prompt,
              schedule: body.schedule,
              skills: body.skills,
              delivery: body.delivery,
              clearRuntime: body.clearRuntime,
              runtime: body.runtime,
            }) ??
            context.services.cron.updateConfig(id, {
              name: body.name,
              prompt: body.prompt,
              schedule: body.schedule,
              skills: body.skills,
              delivery: body.delivery,
              clearRuntime: body.clearRuntime,
              runtime: body.runtime,
            }),
        });
      }

      if (request.method === "POST" && url.pathname === "/skills/synthesize") {
        const body = (await request.json()) as { taskId?: string };
        if (!body.taskId) {
          return json({ error: "taskId is required" }, 400);
        }
        const path =
          (await nativeServices.agentSkills?.synthesize(body.taskId)) ??
          (() => {
            const task = context.services.delegation
              .list()
              .find((entry) => entry.id === body.taskId);
            if (!task) {
              return null;
            }
            return context.services.skillSynthesis.synthesizeFromTask(task);
          })();
        return path
          ? json({ path })
          : json({ error: "Delegation task not found" }, 404);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/export"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          limit?: number;
          sessionId?: string;
          role?: "user" | "assistant" | "system";
          label?: string;
          purpose?: string;
          tags?: string[];
          mode?: "dataset" | "research" | "evaluation" | "rl";
          notes?: string;
        };
        return json({
          path:
            nativeServices.trajectoryLogger?.exportLatest() ??
            context.services.trajectories.exportDataset({
              limit: body.limit ?? 200,
              sessionId: body.sessionId,
              role: body.role,
              label: body.label,
              purpose: body.purpose,
              tags: body.tags,
              mode: body.mode,
              notes: body.notes,
            }),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/bundle"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          limit?: number;
          sessionId?: string;
          role?: "user" | "assistant" | "system";
          label?: string;
          purpose?: string;
          tags?: string[];
          mode?: "dataset" | "research" | "evaluation" | "rl";
          notes?: string;
        };
        return json(
          context.services.trajectories.exportFilteredBundle({
            limit: body.limit ?? 200,
            sessionId: body.sessionId,
            role: body.role,
            label: body.label,
            purpose: body.purpose,
            tags: body.tags,
            mode: body.mode,
            notes: body.notes,
          }),
        );
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/replay"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          manifestPath?: string;
          label?: string;
          latest?: boolean;
        };
        if (body.latest) {
          const replay = context.services.trajectories.replayLatest();
          return replay
            ? json({ replay })
            : json({ error: "No trajectory bundles recorded." }, 404);
        }
        if (!body.manifestPath && !body.label) {
          return json({ error: "manifestPath or label is required" }, 400);
        }
        const bundles = context.services.trajectories.listBundles(50);
        const manifestPath =
          body.manifestPath ??
          bundles.find(
            (entry) =>
              entry.label === body.label ||
              entry.manifestPath.endsWith(body.label ?? ""),
          )?.manifestPath;
        if (!manifestPath) {
          return json({ error: "Trajectory bundle not found." }, 404);
        }
        return json({
          replay: context.services.trajectories.replayBundle(manifestPath),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/trajectories/bundles"
      ) {
        const limitRaw = url.searchParams.get("limit");
        const limit = limitRaw ? Number(limitRaw) : 20;
        return json({
          bundles:
            nativeServices.trajectoryLogger?.bundles() ??
            context.services.trajectories.listBundles(
              !Number.isNaN(limit) && limit > 0 ? limit : 20,
            ),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/ingest/gateway"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          limit?: number;
          label?: string;
          purpose?: string;
          tags?: string[];
          notes?: string;
        };
        const history = await context.gateway.history(body.limit ?? 200);
        return json({
          bundle: context.services.trajectories.ingestGatewayHistory({
            traces: history.traces,
            inbox: history.inbox,
            outbox: history.outbox,
            label: body.label ?? "gateway-history",
            purpose: body.purpose ?? "gateway history ingest",
            tags: body.tags ?? ["gateway", "history"],
            notes: body.notes,
          }),
        });
      }

      if (request.method === "POST" && url.pathname === "/trajectories/batch") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          label?: string;
          purpose?: string;
          prompts?: string[];
          rubric?: string[];
          tags?: string[];
        };
        const prompts = (body.prompts ?? [])
          .map((entry) => entry.trim())
          .filter(Boolean);
        if (!prompts.length) {
          return json({ error: "prompts is required" }, 400);
        }
        const label = body.label ?? `trajectory-batch-${Date.now()}`;
        const group = `trajectory-batch:${label}`;
        const tasks = prompts.map((prompt, index) =>
          context.services.delegation.create({
            title: `Batch prompt ${index + 1}`,
            objective: prompt,
            group,
            profile: "research",
            priority: "normal",
            labels: ["trajectory", "batch"],
            metadata: {
              source: "trajectory-batch",
              label,
            },
            executionMode: "local",
          }),
        );
        return json({
          batch: context.services.trajectories.createBatchManifest({
            label,
            purpose: body.purpose ?? "trajectory batch",
            prompts,
            rubric: body.rubric,
            tags: body.tags,
            taskIds: tasks.map((task) => task.id),
            group,
          }),
          tasks,
        });
      }

      if (request.method === "GET" && url.pathname === "/trajectories/replay") {
        const manifestPath = url.searchParams.get("manifestPath");
        const label = url.searchParams.get("label");
        const latest = url.searchParams.get("latest") === "true";
        if (latest) {
          const replay = context.services.trajectories.replayLatest();
          return replay
            ? json({ replay })
            : json({ error: "No trajectory bundles recorded." }, 404);
        }
        if (manifestPath) {
          return json({
            replay: context.services.trajectories.replayBundle(manifestPath),
          });
        }
        if (label) {
          const bundle = context.services.trajectories
            .listBundles(50)
            .find((entry) => entry.label === label);
          if (!bundle) {
            return json({ error: "Trajectory bundle not found." }, 404);
          }
          return json({
            replay: context.services.trajectories.replayBundle(
              bundle.manifestPath,
            ),
          });
        }
        return json(
          { error: "manifestPath, label, or latest=true is required" },
          400,
        );
      }

      if (
        request.method === "GET" &&
        url.pathname === "/trajectories/compare/latest"
      ) {
        const comparison =
          nativeServices.trajectoryLogger?.compareLatest() ??
          context.services.trajectories.compareLatest();
        return comparison
          ? json({ comparison })
          : json(
              { error: "At least two trajectory bundles are required." },
              404,
            );
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/compare"
      ) {
        const body = (await request.json()) as {
          leftManifestPath?: string;
          rightManifestPath?: string;
        };
        if (!body.leftManifestPath || !body.rightManifestPath) {
          return json(
            { error: "leftManifestPath and rightManifestPath are required" },
            400,
          );
        }
        return json({
          comparison: context.services.trajectories.compareBundles(
            body.leftManifestPath,
            body.rightManifestPath,
          ),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/trajectories/compress/latest"
      ) {
        const compressed = context.services.trajectories.compressLatest();
        return compressed
          ? json({ compressed })
          : json({ error: "No trajectory bundles recorded." }, 404);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/compress"
      ) {
        const body = (await request.json()) as {
          manifestPath?: string;
          sampleCount?: number;
        };
        if (!body.manifestPath) {
          return json({ error: "manifestPath is required" }, 400);
        }
        return json({
          compressed: context.services.trajectories.compressBundle(
            body.manifestPath,
            {
              sampleCount: body.sampleCount,
            },
          ),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/trajectories/replay/latest"
      ) {
        const replay = context.services.trajectories.replayLatest();
        return replay
          ? json({ replay })
          : json({ error: "No trajectory bundles recorded." }, 404);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/analyze"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          limit?: number;
          sessionId?: string;
          role?: "user" | "assistant" | "system";
          label?: string;
          purpose?: string;
          tags?: string[];
          mode?: "dataset" | "research" | "evaluation" | "rl";
          notes?: string;
        };
        return json({
          analysis: context.services.trajectories.analyze({
            limit: body.limit ?? 200,
            sessionId: body.sessionId,
            role: body.role,
            label: body.label,
            purpose: body.purpose,
            tags: body.tags,
            mode: body.mode,
            notes: body.notes,
          }),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/evaluate"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          limit?: number;
          sessionId?: string;
          role?: "user" | "assistant" | "system";
          label?: string;
          rubric?: string[];
          tags?: string[];
          purpose?: string;
          notes?: string;
          mode?: "dataset" | "research" | "evaluation" | "rl";
        };
        return json({
          evaluation: await context.services.trajectories.evaluate({
            limit: body.limit ?? 200,
            sessionId: body.sessionId,
            role: body.role,
            label: body.label,
            rubric: body.rubric,
            tags: body.tags,
            purpose: body.purpose,
            notes: body.notes,
            mode: body.mode,
          }),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/package"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          limit?: number;
          sessionId?: string;
          role?: "user" | "assistant" | "system";
          label?: string;
          rubric?: string[];
          tags?: string[];
          purpose?: string;
          notes?: string;
          mode?: "dataset" | "research" | "evaluation" | "rl";
        };
        return json({
          package: await context.services.trajectories.package({
            limit: body.limit ?? 200,
            sessionId: body.sessionId,
            role: body.role,
            label: body.label,
            rubric: body.rubric,
            tags: body.tags,
            purpose: body.purpose,
            notes: body.notes,
            mode: body.mode,
          }),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/trajectories/evaluate"
      ) {
        const manifestPath = url.searchParams.get("manifestPath");
        const label = url.searchParams.get("label");
        const latest = url.searchParams.get("latest") === "true";
        if (latest) {
          const evaluation =
            await context.services.trajectories.evaluateLatest();
          return evaluation
            ? json({ evaluation })
            : json({ error: "No trajectory bundles recorded." }, 404);
        }
        if (manifestPath) {
          return json({
            evaluation:
              await context.services.trajectories.evaluateBundle(manifestPath),
          });
        }
        if (label) {
          const bundle = context.services.trajectories
            .listBundles(50)
            .find((entry) => entry.label === label);
          if (!bundle) {
            return json({ error: "Trajectory bundle not found." }, 404);
          }
          return json({
            evaluation: await context.services.trajectories.evaluateBundle(
              bundle.manifestPath,
            ),
          });
        }
        return json(
          { error: "manifestPath, label, or latest=true is required" },
          400,
        );
      }

      if (
        request.method === "GET" &&
        url.pathname === "/trajectories/package"
      ) {
        const manifestPath = url.searchParams.get("manifestPath");
        const label = url.searchParams.get("label");
        const latest = url.searchParams.get("latest") === "true";
        if (latest) {
          const packaged = await context.services.trajectories.packageLatest();
          return packaged
            ? json({ package: packaged })
            : json({ error: "No trajectory bundles recorded." }, 404);
        }
        if (manifestPath) {
          const bundle =
            context.services.trajectories.describeBundle(manifestPath);
          return json({
            package: await context.services.trajectories.package({
              limit: bundle.limit,
              sessionId: bundle.filters?.sessionId ?? undefined,
              role: bundle.filters?.role ?? undefined,
              label: bundle.label,
              purpose: bundle.purpose,
              mode: bundle.mode,
              tags: bundle.tags,
              notes: bundle.notes,
            }),
          });
        }
        if (label) {
          const bundle = context.services.trajectories
            .listBundles(50)
            .find((entry) => entry.label === label);
          if (!bundle) {
            return json({ error: "Trajectory bundle not found." }, 404);
          }
          return json({
            package: await context.services.trajectories.package({
              limit: bundle.limit,
              sessionId: bundle.filters?.sessionId ?? undefined,
              role: bundle.filters?.role ?? undefined,
              label: bundle.label,
              purpose: bundle.purpose,
              mode: bundle.mode,
              tags: bundle.tags,
              notes: bundle.notes,
            }),
          });
        }
        return json(
          { error: "manifestPath, label, or latest=true is required" },
          400,
        );
      }

      if (
        request.method === "GET" &&
        url.pathname === "/trajectories/benchmark/environment"
      ) {
        return json({
          environment:
            context.services.trajectories.describeBenchmarkEnvironment(),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/trajectories/benchmarks"
      ) {
        return json({
          benchmarks: context.services.trajectories.listBenchmarkManifests(
            Number(url.searchParams.get("limit") ?? "20"),
          ),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/benchmark/create"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          label?: string;
          purpose?: string;
          tags?: string[];
          rubric?: string[];
          group?: string;
          cases?: Array<{ manifestPath?: string; label?: string }>;
        };
        if (!body.cases?.length) {
          return json(
            { error: "At least one benchmark case is required" },
            400,
          );
        }
        return json({
          benchmark: context.services.trajectories.createBenchmarkManifest({
            label: body.label,
            purpose: body.purpose,
            tags: body.tags,
            rubric: body.rubric,
            group: body.group,
            cases: body.cases,
          }),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/benchmark/run"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          manifestPath?: string;
          latest?: boolean;
        };
        if (body.latest) {
          const run = await context.services.trajectories.runLatestBenchmark();
          return run
            ? json({ benchmark: run })
            : json(
                { error: "No trajectory benchmark manifests recorded." },
                404,
              );
        }
        if (!body.manifestPath) {
          return json({ error: "manifestPath is required" }, 400);
        }
        return json({
          benchmark: await context.services.trajectories.runBenchmark(
            body.manifestPath,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/mcp/probe") {
        return json({
          probe: await probeEffectiveMcp(context.runtime, context.services),
        });
      }

      if (request.method === "POST" && url.pathname === "/mcp/invoke") {
        const body = (await request.json()) as { input?: string };
        if (!body.input) {
          return json({ error: "input is required" }, 400);
        }
        return json({
          result: await invokeEffectiveMcp(
            context.runtime,
            context.services,
            body.input,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/mcp/invoke-tool") {
        const body = (await request.json()) as {
          tool?: string;
          input?: Record<string, unknown>;
        };
        if (!body.tool) {
          return json({ error: "tool is required" }, 400);
        }
        return json({
          result: await invokeEffectiveMcpTool(
            context.runtime,
            context.services,
            body.tool,
            body.input ?? {},
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/config") {
        return json({
          gateway: loadGatewayConfig(context.config),
        });
      }

      if (request.method === "POST" && url.pathname === "/gateway/config") {
        const body = (await request.json()) as GatewayConfig;
        saveGatewayConfig(context.config, body);
        context.services.gatewayConfig = body;
        context.services.nativeOwnership.attachRuntime(
          context.runtime,
          context.services,
          body,
        );
        context.services.diagnostics = new DiagnosticsService(
          context.config,
          body,
          context.services.agentSdk,
          context.services.nativeOwnership,
          context.services.ecosystem,
        );
        context.services.diagnostics.attachRuntime(context.runtime);
        context.services.operator = new OperatorService(
          context.config,
          context.services.diagnostics,
          new RepositoryService(context.config.workspaceDir),
          context.services.autocoderPipeline,
          context.services.agentSdk,
          context.services.nativeOwnership,
          context.services.ecosystem,
        );
        context.services.operator.attachRuntime(context.runtime);
        return json({ ok: true, gateway: body });
      }

      if (request.method === "GET" && url.pathname === "/gateway/health") {
        const readiness = await context.gateway.health();
        const history = await context.gateway.history(25);
        const ownership =
          context.services.nativeOwnership.controlPlane() ??
          getNativeOwnershipControlPlane(
            context.runtime,
            context.services,
            context.config,
            context.services.gatewayConfig,
          );
        return json({
          health: readiness,
          readiness,
          messagingBridge: ownership.transportControl.messagingBridge,
          transportInventory: ownership.transportControl.transportInventory,
          transportControl: ownership.transportControl.totals,
          ownership: {
            pluginManager: ownership.pluginManager,
            identity: ownership.identity,
          },
          mediation: {
            pluginMediatedAdapters: history.state.totals.pluginMediatedAdapters,
            officialPluginAdapters: history.state.totals.officialPluginAdapters,
            vendoredPluginAdapters: history.state.totals.vendoredPluginAdapters,
          },
          messagingPlugins: groupNativePluginCatalog(
            getNativePluginCatalog(context.config),
          ).messaging,
          state: history.state,
          traces: history.traces,
          inbox: history.inbox,
          outbox: history.outbox,
          attachments: history.attachments,
          deliveries: history.deliveries,
          sessions: context.services.gatewaySessions.list(),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/trace") {
        const filters = parseGatewayFiltersFromUrl(url);
        const history = await context.gateway.history(filters.limit, filters);
        return json({
          traces: history.traces,
          state: history.state,
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/deliveries") {
        const filters = parseGatewayFiltersFromUrl(url);
        const history = await context.gateway.history(filters.limit, filters);
        return json({
          deliveries: history.deliveries,
          state: history.state,
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/inbox") {
        const filters = parseGatewayFiltersFromUrl(url);
        return json({
          inbox: context.gateway.inbox(filters.limit, filters),
          state: await context.gateway.state(filters.limit, filters),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/outbox") {
        const filters = parseGatewayFiltersFromUrl(url);
        return json({
          outbox: context.gateway.outbox(filters.limit, filters),
          state: await context.gateway.state(filters.limit, filters),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/attachments") {
        const filters = parseGatewayFiltersFromUrl(url);
        return json({
          attachments: context.gateway.attachments(filters.limit, filters),
          state: await context.gateway.state(filters.limit, filters),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/history") {
        const filters = parseGatewayFiltersFromUrl(url);
        return json({
          history: await context.gateway.history(filters.limit, filters),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/state") {
        const filters = parseGatewayFiltersFromUrl(url);
        return json({
          state: await context.gateway.state(filters.limit, filters),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/runtime") {
        const runtimeStatus = context.gateway.runtimeStatus();
        return json({
          runtime: runtimeStatus,
          messagingBridge: runtimeStatus.messagingBridge,
          transportInventory: runtimeStatus.transportInventory,
          transportControl: runtimeStatus.transportControl,
          messagingPlugins: groupNativePluginCatalog(
            getNativePluginCatalog(context.config),
          ).messaging,
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/daemon") {
        return json({
          daemon: context.gateway.runtimeStatus().daemon,
          runtime: context.gateway.runtimeStatus(),
        });
      }

      if (request.method === "POST" && url.pathname === "/gateway/start") {
        await context.gateway.start();
        return json({ ok: true });
      }

      if (request.method === "POST" && url.pathname === "/gateway/stop") {
        await context.gateway.stop();
        return json({ ok: true });
      }

      if (request.method === "POST" && url.pathname === "/gateway/watchdog") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          reason?: string;
        };
        const reason = body.reason?.trim() || "api";
        return json({
          reason,
          records: await context.gateway.watchdog(reason),
          runtime: context.gateway.runtimeStatus(),
        });
      }

      if (request.method === "POST" && url.pathname === "/gateway/watch") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          platform?: string;
          reason?: string;
        };
        const platform =
          body.platform?.trim().toLowerCase() === "all"
            ? "all"
            : body.platform
              ? parseTransportPlatform(body.platform)
              : "all";
        if (!platform) {
          return json({ error: "Unknown transport platform." }, 400);
        }
        const reason = body.reason?.trim() || "api";
        return json({
          platform,
          reason,
          records: await context.gateway.watch(platform, reason),
          runtime: context.gateway.runtimeStatus(),
        });
      }

      if (request.method === "POST" && url.pathname === "/gateway/restart") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          platform?: string;
          reason?: string;
        };
        const platform =
          body.platform?.trim().toLowerCase() === "all"
            ? "all"
            : body.platform
              ? parseTransportPlatform(body.platform)
              : "all";
        if (!platform) {
          return json({ error: "Unknown transport platform." }, 400);
        }
        const reason = body.reason?.trim() || "api";
        return json({
          platform,
          reason,
          records: await context.gateway.restart(platform, reason),
          runtime: context.gateway.runtimeStatus(),
        });
      }

      if (request.method === "POST" && url.pathname === "/gateway/message") {
        const parsed = await parseJsonBody<IncomingPlatformMessage>(request);
        if (!parsed.ok) {
          return parsed.response;
        }
        const result = await context.gateway.receive(parsed.value);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/gateway/replay") {
        const parsed = await parseJsonBody<{ recordId?: string }>(request);
        if (!parsed.ok) {
          return parsed.response;
        }
        if (!parsed.value.recordId) {
          return json({ error: "recordId is required" }, 400);
        }
        return json({
          result: await context.gateway.replayInbox(parsed.value.recordId),
        });
      }

      if (request.method === "POST" && url.pathname === "/gateway/supervise") {
        return json({
          records: await context.gateway.supervise("api"),
          runtime: context.gateway.runtimeStatus(),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/supervision") {
        return json({
          records: context.gateway.supervision(
            Number(url.searchParams.get("limit") ?? "25"),
          ),
          runtime: context.gateway.runtimeStatus(),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/journal") {
        const filters = parseGatewayFiltersFromUrl(url);
        return json({
          traces: context.gateway.trace(filters.limit, filters),
          inbox: context.gateway.inbox(filters.limit, filters),
          outbox: context.gateway.outbox(filters.limit, filters),
          attachments: context.gateway.attachments(filters.limit, filters),
          supervision: context.gateway.supervision(filters.limit),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/gateway/message/edit"
      ) {
        const parsed = await parseJsonBody<{
          deliveryId?: string;
          text?: string;
          threadId?: string;
          replyToId?: string;
          metadata?: Record<string, string>;
        }>(request);
        if (!parsed.ok) {
          return parsed.response;
        }
        if (!parsed.value.deliveryId || !parsed.value.text) {
          return json({ error: "deliveryId and text are required." }, 400);
        }
        return json({
          delivery: await context.gateway.editDelivery(
            parsed.value.deliveryId,
            parsed.value.text,
            {
              threadId: parsed.value.threadId,
              replyToId: parsed.value.replyToId,
              metadata: parsed.value.metadata,
            },
          ),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/gateway/message/progressive"
      ) {
        const parsed = await parseJsonBody<{
          platform?: PlatformName;
          roomId?: string;
          userId?: string;
          threadId?: string;
          replyToId?: string;
          metadata?: Record<string, string>;
          parts?: string[];
        }>(request);
        if (!parsed.ok) {
          return parsed.response;
        }
        if (
          !parsed.value.platform ||
          !parsed.value.roomId ||
          !parsed.value.parts ||
          parsed.value.parts.length < 2
        ) {
          return json(
            {
              error:
                "platform, roomId, and at least two message parts are required.",
            },
            400,
          );
        }
        return json({
          delivery: await context.gateway.sendProgressive(
            {
              platform: parsed.value.platform,
              roomId: parsed.value.roomId,
              userId: parsed.value.userId,
              threadId: parsed.value.threadId,
              replyToId: parsed.value.replyToId,
              metadata: parsed.value.metadata,
            },
            parsed.value.parts,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/webhooks/telegram") {
        const body = (await request.json().catch(() => null)) as unknown;
        if (!body) {
          return json({ error: "Invalid JSON body." }, 400);
        }
        const inbound = normalizeInboundMessage("telegram", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/discord") {
        const body = (await request.json().catch(() => null)) as unknown;
        if (!body) {
          return json({ error: "Invalid JSON body." }, 400);
        }
        const inbound = normalizeInboundMessage("discord", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/slack") {
        const rawBody = await request.text();
        if (
          !verifySlackSignature(
            rawBody,
            request.headers.get("x-slack-request-timestamp"),
            request.headers.get("x-slack-signature"),
            context.config.slackSigningSecret,
          )
        ) {
          return json({ error: "Invalid Slack signature." }, 403);
        }

        let body: {
          challenge?: string;
          event?: unknown;
        };
        try {
          body = JSON.parse(rawBody) as typeof body;
        } catch {
          return json({ error: "Invalid JSON body." }, 400);
        }
        if (body.challenge) {
          return json({ challenge: body.challenge });
        }
        const inbound = normalizeInboundMessage("slack", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "GET" && url.pathname === "/webhooks/whatsapp") {
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (
          mode === "subscribe" &&
          token &&
          challenge &&
          token === context.config.whatsappVerifyToken
        ) {
          return new Response(challenge, { status: 200 });
        }
        return json({ error: "WhatsApp verification failed." }, 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/whatsapp") {
        const body = (await request.json().catch(() => null)) as unknown;
        if (!body) {
          return json({ error: "Invalid JSON body." }, 400);
        }
        const inbound = normalizeInboundMessage("whatsapp", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/signal") {
        const body = (await request.json().catch(() => null)) as unknown;
        const inbound = normalizeInboundMessage("signal", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/matrix") {
        const body = (await request.json().catch(() => null)) as unknown;
        const inbound = normalizeInboundMessage("matrix", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/email") {
        const body = (await request.json().catch(() => null)) as unknown;
        const inbound = normalizeInboundMessage("email", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/sms") {
        const body = (await request.json().catch(() => null)) as unknown;
        const inbound = normalizeInboundMessage("sms", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/webhooks/mattermost"
      ) {
        const body = (await request.json().catch(() => null)) as unknown;
        const inbound = normalizeInboundMessage("mattermost", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/webhooks/homeassistant"
      ) {
        const body = (await request.json().catch(() => null)) as unknown;
        const inbound = normalizeInboundMessage("homeassistant", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/dingtalk") {
        const body = (await request.json().catch(() => null)) as unknown;
        const inbound = normalizeInboundMessage("dingtalk", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "GET" && url.pathname === "/pairing/pending") {
        const platform = url.searchParams.get(
          "platform",
        ) as PlatformName | null;
        return json({
          requests: context.services.pairing.listPending(platform ?? undefined),
        });
      }

      if (request.method === "POST" && url.pathname === "/pairing/approve") {
        const body = (await request.json()) as {
          platform: PlatformName;
          code: string;
        };
        return json({
          approved: context.services.pairing.approve(body.platform, body.code),
        });
      }

      if (request.method === "POST" && url.pathname === "/pairing/deny") {
        const body = (await request.json()) as {
          platform: PlatformName;
          code: string;
        };
        return json({
          denied: context.services.pairing.deny(body.platform, body.code),
        });
      }

      if (request.method === "GET" && url.pathname === "/hooks") {
        return json({
          hooks: context.services.hooks.list(),
          recentInvocations: context.services.hooks.recentInvocations(),
        });
      }

      if (request.method === "POST" && url.pathname === "/hooks") {
        const body = (await request.json()) as {
          event: string;
          name: string;
          enabled?: boolean;
          template: string;
        };
        return json({
          hook: context.services.hooks.add({
            event: body.event,
            name: body.name,
            enabled: body.enabled ?? true,
            template: body.template,
          }),
        });
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/hooks/")) {
        const id = url.pathname.replace("/hooks/", "");
        context.services.hooks.remove(id);
        return json({ ok: true });
      }

      if (request.method === "POST" && url.pathname === "/chat") {
        const body = (await request.json()) as {
          message?: string;
          userId?: string;
          roomId?: string;
          source?: string;
        };

        if (!body.message) {
          return json({ error: "message is required" }, 400);
        }

        const response = await handleAgentTurn(
          {
            message: body.message,
            userId: body.userId ?? "api-user",
            roomId: body.roomId,
            source: body.source ?? "api",
          },
          context,
        );

        return json({
          response,
          character: context.config.agentName,
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/responses") {
        const body = (await request.json()) as {
          input?: string | Array<{ role?: string; content?: string }>;
          previous_response_id?: string;
          stream?: boolean;
          user?: string;
          metadata?: Record<string, string>;
        };

        const inputText = Array.isArray(body.input)
          ? body.input
              .map((entry) => entry.content ?? "")
              .filter(Boolean)
              .join("\n")
          : body.input;

        if (!inputText) {
          return json({ error: "input is required" }, 400);
        }

        const userId = body.user ?? "api-user";
        const roomId = context.services.apiTransport.resolveRoomId(
          body.previous_response_id,
          userId,
        );
        const result = await context.gateway.receive({
          platform: "api",
          userId,
          roomId,
          text: inputText,
          messageId: `api-msg-${Date.now()}`,
          replyToMessageId: body.previous_response_id,
          metadata: {
            ...(body.metadata ?? {}),
            apiTransport: "responses",
          },
        });
        const record = context.services.apiTransport.create({
          input: inputText,
          outputText: result.response,
          userId,
          roomId,
          previousResponseId: body.previous_response_id,
          metadata: {
            ...(body.metadata ?? {}),
            traceId: result.traceId ?? "",
            deliveryId: result.deliveryId ?? "",
          },
        });
        const responsePayload = {
          id: record.id,
          object: "response",
          created_at: record.createdAt,
          previous_response_id: record.previousResponseId,
          output_text: record.outputText,
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: record.outputText }],
            },
          ],
          room_id: record.roomId,
        };

        if (body.stream) {
          return sse([
            {
              event: "response.created",
              data: { id: record.id, room_id: record.roomId },
            },
            {
              event: "response.output_text.delta",
              data: { id: record.id, delta: record.outputText },
            },
            {
              event: "response.completed",
              data: responsePayload,
            },
          ]);
        }

        return json(responsePayload);
      }

      return json({ error: "Not found" }, 404);
    },
  });
}
