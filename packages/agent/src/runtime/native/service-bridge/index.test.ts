import {
  DOOLITTLE_BROWSER_SERVICE,
  DOOLITTLE_GITHUB_PLANNING_SERVICE,
  DOOLITTLE_MCP_SERVICE,
  DOOLITTLE_OPERATOR_PLANNING_SERVICE,
} from "@doolittle/contracts";
import { SECRETS_SERVICE_TYPE } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { AppServices } from "@/services";
import { createOfficialOrchestratorTestFixture } from "@/testing/official-orchestrator";
import {
  cancelEffectiveForm,
  createEffectiveForm,
  createEffectivePlan,
  createEffectiveRepository,
  createEffectiveSandbox,
  deleteEffectiveRepository,
  executeEffectiveSandboxCode,
  generateEffectiveCode,
  generateEffectivePrd,
  getEffectiveForm,
  getEffectiveFormTemplates,
  getEffectivePlan,
  getEffectiveSecret,
  killEffectiveSandbox,
  listEffectiveForms,
  listEffectivePlans,
  listEffectiveSandboxes,
  listEffectiveSecretKeys,
  performEffectiveCodeQa,
  performEffectiveCodeResearch,
  setEffectiveSecret,
} from "./autocoder";
import { getAutonomousControlPlane } from "./autonomous";
import {
  getEffectiveMessagingTransportInventory,
  getEffectivePluginManagerInventory,
  getEffectiveServiceResolution,
  getEffectiveTransportInventory,
  getNativeExecutionControlPlane,
  getNativeFormsControlPlane,
  getNativeIntegrationControlPlane,
  getNativeMediaControlPlane,
  getNativeMessagingTransportState,
  getNativePlanningControlPlane,
  getNativeResearchControlPlane,
  getNativeTransportControlPlane,
} from "./control-planes";
import {
  getEffectiveDelegationChildren,
  getEffectiveDelegationTask,
  getEffectiveDelegationTree,
  retryEffectiveDelegationTask,
} from "./delegation";
import {
  getEffectiveExperienceSummary,
  getEffectiveMemorySnapshot,
  getEffectivePersonalitySummary,
  getEffectiveRolodexSummary,
} from "./ownership";
import type { RuntimeLike } from "./runtime";

describe("getEffectiveMessagingTransportInventory", () => {
  it("builds native forms and execution control planes from installed services", () => {
    const runtime = {
      getService(name: string) {
        if (name === "doolittle_forms") {
          return {
            capabilityDescription: "forms",
            isPersistenceAvailable: () => true,
            listForms: () => [
              { id: "1", status: "active" },
              { id: "2", status: "completed" },
            ],
            getTemplates: () =>
              new Map([
                ["default", {}],
                ["review", {}],
              ]),
            forcePersist: async () => undefined,
          };
        }
        if (name === "doolittle_local_sandbox") {
          return {
            capabilityDescription: "e2b",
            listSandboxes: () => [
              { id: "sandbox-1", path: "/tmp/doolittle-e2b/sandbox-1" },
            ],
            executeCode: async () => ({ success: true }),
          };
        }
        if (name === "doolittle_code_generation") {
          return {
            capabilityDescription: "codegen",
            performResearch: () => undefined,
            generateCode: () => undefined,
            generateCodeInternal: () => undefined,
          };
        }
        if (name === "planning") {
          return {
            capabilityDescription: "Official Eliza action planning",
            createSimplePlan: async () => ({ id: "action-plan-1" }),
          };
        }
        if (name === DOOLITTLE_OPERATOR_PLANNING_SERVICE) {
          return {
            capabilityDescription: "Doolittle operator planning",
            listPlans: () => [
              { id: "plan-1", taskId: "task-1", status: "active" },
              { id: "plan-2", workflowId: "workflow-1", status: "draft" },
            ],
            createPlan: async (input: unknown) => input,
          };
        }
        if (name === DOOLITTLE_GITHUB_PLANNING_SERVICE) {
          return {
            createRepository: () => undefined,
            deleteRepository: () => undefined,
          };
        }
        if (name === SECRETS_SERVICE_TYPE) {
          return {
            list: async () => ({ OPENAI_API_KEY: {} }),
            getGlobal: async () => "x",
            setGlobal: async () => true,
          };
        }
        if (name === "agent_event") {
          return {
            subscribe: () => () => undefined,
            subscribeHeartbeat: () => () => undefined,
            getLastHeartbeat: () => ({ status: "thinking" }),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const forms = getNativeFormsControlPlane(runtime);
    const planning = getNativePlanningControlPlane(runtime);
    const execution = getNativeExecutionControlPlane(runtime);

    expect(forms.available).toBe(true);
    expect(forms.source).toBe("product-plugin");
    expect(forms.templates).toBe(2);
    expect(forms.forms.total).toBe(2);
    expect(forms.forms.active).toBe(1);
    expect(forms.persistenceAvailable).toBe(true);
    expect(planning.available).toBe(true);
    expect(planning.source).toBe("product-plugin");
    expect(planning.actionPlanningAvailable).toBe(true);
    expect(planning.plans.total).toBe(2);
    expect(execution.e2b.available).toBe(true);
    expect(execution.e2b.source).toBe("product-plugin");
    expect(execution.planning.available).toBe(true);
    expect(execution.planning.plans.total).toBe(2);
    expect(execution.e2b.sandboxes).toBe(1);
    expect(execution.agentEvents.available).toBe(true);
    expect(execution.agentEvents.lastHeartbeatStatus).toBe("thinking");
    expect(execution.codeGeneration.available).toBe(true);
    expect(execution.codeGeneration.source).toBe("product-plugin");
    expect(execution.codeGeneration.ready).toBe(true);
    expect(execution.codeGeneration.methods).toContain("generateCode");
    expect(execution.github.available).toBe(true);
    expect(execution.secrets.keys).toEqual([]);
    expect(execution.secrets.hasListKeys).toBe(true);
  });

  it("marks browser, the official knowledge graph, and orchestrator as plugin-owned when native services are present", async () => {
    const runtime = {
      getService(name: string) {
        if (name === "eliza_knowledge_graph") {
          return {
            getEntityStore: () => ({}),
          };
        }
        if (name === DOOLITTLE_BROWSER_SERVICE) {
          return {
            status: async () => ({ mode: "browser" }),
          };
        }
        if (name === DOOLITTLE_MCP_SERVICE) {
          return {
            status: () => ({ mode: "native" }),
            getCachedTools: () => [{ name: "tool-1" }],
          };
        }
        if (name === "ORCHESTRATOR_TASK_SERVICE") {
          return {
            tasks: () => [{ id: "task-1" }],
            queue: () => ({ pending: 0, activeWorkers: 0 }),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const resolution = getEffectiveServiceResolution(runtime);
    const integration = await getNativeIntegrationControlPlane(runtime);

    expect(
      resolution.find((entry) => entry.capability === "knowledgeGraph")
        ?.ownership,
    ).toBe("plugin");
    expect(
      resolution.find((entry) => entry.capability === "browser")?.ownership,
    ).toBe("plugin");
    expect(
      resolution.find((entry) => entry.capability === "agentOrchestrator")
        ?.ownership,
    ).toBe("plugin");
    expect(integration.browser.ownership).toBe("plugin");
    expect(integration.mcp.ownership).toBe("plugin");
  });

  it("invokes native forms, sandboxes, and code generation actions", async () => {
    const runtime = {
      agentId: "00000000-0000-4000-8000-000000000001",
      getService(name: string) {
        if (name === "doolittle_forms") {
          return {
            listForms: () => [
              {
                id: "form-1",
                templateId: "intake",
                status: "active",
                metadata: {},
                createdAt: "2026-03-24T00:00:00.000Z",
                updatedAt: "2026-03-24T00:00:00.000Z",
              },
            ],
            getTemplates: () => new Map([["intake", { name: "Intake" }]]),
            createForm: async (template: unknown, metadata?: unknown) => ({
              id: "form-created",
              templateId: typeof template === "string" ? template : "intake",
              status: "active" as const,
              metadata:
                metadata &&
                typeof metadata === "object" &&
                !Array.isArray(metadata)
                  ? metadata
                  : {},
              createdAt: "2026-03-24T00:00:00.000Z",
              updatedAt: "2026-03-24T00:00:00.000Z",
            }),
            getForm: async (id: string) => ({
              id,
              templateId: "intake",
              status: "active" as const,
              metadata: {},
              createdAt: "2026-03-24T00:00:00.000Z",
              updatedAt: "2026-03-24T00:00:00.000Z",
            }),
            cancelForm: async (id: string) => id === "form-created",
          };
        }
        if (name === "doolittle_local_sandbox") {
          return {
            listSandboxes: () => [{ id: "sandbox-1" }],
            createSandbox: async () => "sandbox-2",
            killSandbox: async () => undefined,
            executeCode: async (code: string, language?: string) => ({
              success: true,
              code,
              language,
            }),
          };
        }
        if (name === "doolittle_code_generation") {
          return {
            performResearch: async (request: Record<string, unknown>) => ({
              research: true,
              request,
            }),
            generatePRD: async (
              request: Record<string, unknown>,
              research: Record<string, unknown>,
            ) => ({
              prd: true,
              request,
              research,
            }),
            performQA: async (projectPath: string) => ({
              passed: true,
              projectPath,
            }),
            generateCode: async (request: Record<string, unknown>) => ({
              ok: true,
              request,
            }),
          };
        }
        if (name === DOOLITTLE_OPERATOR_PLANNING_SERVICE) {
          return {
            listPlans: () => [
              {
                id: "plan-1",
                title: "Plan one",
                objective: "Do the thing",
                status: "active" as const,
                metadata: {},
                steps: [],
                createdAt: "2026-03-24T00:00:00.000Z",
                updatedAt: "2026-03-24T00:00:00.000Z",
              },
            ],
            createPlan: async (input: unknown) => ({
              id: "plan-created",
              title: "Plan native ownership",
              objective: "Drive execution through native services.",
              status: "active" as const,
              metadata: {},
              steps: [],
              createdAt: "2026-03-24T00:00:00.000Z",
              updatedAt: "2026-03-24T00:00:00.000Z",
              ...((input as Record<string, unknown>) ?? {}),
            }),
            getPlan: async (id: string) => ({
              id,
              title: "Plan one",
              objective: "Do the thing",
              status: "active" as const,
              metadata: {},
              steps: [],
              createdAt: "2026-03-24T00:00:00.000Z",
              updatedAt: "2026-03-24T00:00:00.000Z",
            }),
          };
        }
        if (name === DOOLITTLE_GITHUB_PLANNING_SERVICE) {
          return {
            createRepository: async (name: string, isPrivate = true) => ({
              name,
              private: isPrivate,
            }),
            deleteRepository: async (name: string) => ({ deleted: name }),
          };
        }
        if (name === SECRETS_SERVICE_TYPE) {
          return {
            list: async () => ({ OPENAI_API_KEY: {} }),
            getGlobal: async (key: string) => `value:${key}`,
            setGlobal: async () => true,
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    expect(await listEffectiveForms(runtime)).toHaveLength(1);
    expect(await listEffectivePlans(runtime)).toHaveLength(1);
    expect(getEffectiveFormTemplates(runtime)).toHaveLength(1);
    expect(
      await createEffectiveForm(runtime, "intake", { owner: "eliza" }),
    ).toEqual({
      id: "form-created",
      templateId: "intake",
      status: "active",
      metadata: { owner: "eliza" },
      createdAt: "2026-03-24T00:00:00.000Z",
      updatedAt: "2026-03-24T00:00:00.000Z",
    });
    expect(await getEffectiveForm(runtime, "form-created")).toEqual({
      id: "form-created",
      templateId: "intake",
      status: "active",
      metadata: {},
      createdAt: "2026-03-24T00:00:00.000Z",
      updatedAt: "2026-03-24T00:00:00.000Z",
    });
    expect(
      await createEffectivePlan(runtime, {
        title: "Plan native ownership",
        objective: "Drive execution through native services.",
      }),
    ).toMatchObject({
      id: "plan-created",
      title: "Plan native ownership",
    });
    expect(await getEffectivePlan(runtime, "plan-created")).toEqual({
      id: "plan-created",
      title: "Plan one",
      objective: "Do the thing",
      status: "active",
      metadata: {},
      steps: [],
      createdAt: "2026-03-24T00:00:00.000Z",
      updatedAt: "2026-03-24T00:00:00.000Z",
    });
    expect(await cancelEffectiveForm(runtime, "form-created")).toBe(true);
    expect(listEffectiveSandboxes(runtime)).toHaveLength(1);
    expect(await createEffectiveSandbox(runtime)).toBe("sandbox-2");
    expect(
      await executeEffectiveSandboxCode(runtime, "print('hi')", "python"),
    ).toEqual({
      success: true,
      code: "print('hi')",
      language: "python",
    });
    await expect(
      killEffectiveSandbox(runtime, "sandbox-2"),
    ).resolves.toBeUndefined();
    await expect(
      generateEffectiveCode(runtime, {
        projectName: "eliza-native",
        prompt: "Build an agent",
      }),
    ).resolves.toEqual({
      ok: true,
      request: {
        projectName: "eliza-native",
        prompt: "Build an agent",
      },
    });
    await expect(
      performEffectiveCodeResearch(runtime, {
        projectName: "eliza-native",
        description: "Build an agent",
        apis: ["github"],
      }),
    ).resolves.toEqual({
      research: true,
      request: {
        projectName: "eliza-native",
        description: "Build an agent",
        apis: ["github"],
      },
    });
    await expect(
      generateEffectivePrd(
        runtime,
        { projectName: "eliza-native" },
        { research: true },
      ),
    ).resolves.toEqual({
      prd: true,
      request: { projectName: "eliza-native" },
      research: { research: true },
    });
    await expect(
      performEffectiveCodeQa(runtime, "/tmp/project"),
    ).resolves.toEqual({
      passed: true,
      projectPath: "/tmp/project",
    });
    await expect(
      createEffectiveRepository(runtime, "eliza-native", false),
    ).resolves.toEqual({
      name: "eliza-native",
      private: false,
    });
    await expect(
      deleteEffectiveRepository(runtime, "eliza-native"),
    ).resolves.toEqual({
      deleted: "eliza-native",
    });
    await expect(listEffectiveSecretKeys(runtime)).resolves.toEqual([
      "OPENAI_API_KEY",
    ]);
    await expect(getEffectiveSecret(runtime, "OPENAI_API_KEY")).resolves.toBe(
      "value:OPENAI_API_KEY",
    );
    await expect(
      setEffectiveSecret(runtime, "OPENAI_API_KEY", "secret"),
    ).resolves.toBe(true);
  });

  it("reports live telegram service when runtime services exist", () => {
    const runtime = {
      getService(name: string) {
        if (name === "telegram") {
          return {
            getBot: () => ({}),
            messageManager: {},
            knownChats: new Map([["1", {}]]),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const inventory = getEffectiveMessagingTransportInventory(runtime, {
      telegramBotToken: "telegram-token",
    } as never);

    expect(inventory.find((entry) => entry.platform === "telegram")?.live).toBe(
      true,
    );
  });

  it("reports disabled bridge state when plugins are not configured", () => {
    const runtime = {
      getService(name: string) {
        if (name === "discord_transport") {
          return {
            history: () => [],
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const inventory = getEffectiveMessagingTransportInventory(runtime, {
      telegramBotToken: undefined,
      discordBotToken: undefined,
    } as never);

    expect(inventory.find((entry) => entry.platform === "telegram")?.live).toBe(
      false,
    );
    expect(inventory.find((entry) => entry.platform === "discord")?.live).toBe(
      false,
    );
  });

  it("builds a native transport control-plane summary", () => {
    const runtime = {
      getService(name: string) {
        if (name === "telegram") {
          return {
            getBot: () => ({}),
            messageManager: {},
            knownChats: new Map([["1", {}]]),
          };
        }
        if (name === "discord_transport") {
          return {
            history: () => [],
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const controlPlane = getNativeTransportControlPlane(
      runtime,
      {
        telegramBotToken: "telegram-token",
        discordBotToken: undefined,
      } as never,
      {
        platforms: {
          api: { enabled: true },
          cli: { enabled: true },
          telegram: { enabled: true },
          discord: { enabled: false },
          slack: { enabled: false },
          whatsapp: { enabled: false },
          signal: { enabled: false },
          matrix: { enabled: false },
          email: { enabled: false },
          sms: { enabled: false },
          mattermost: { enabled: false },
          homeassistant: { enabled: false },
          dingtalk: { enabled: false },
        },
      } as never,
    );

    expect(controlPlane.totals.configured).toBeGreaterThanOrEqual(1);
    expect(controlPlane.totals.enabledPlugins).toBeGreaterThanOrEqual(1);
    expect(controlPlane.totals.liveServices).toBeGreaterThanOrEqual(1);
    expect(controlPlane.totals.operationalTransports).toBeGreaterThan(0);
  });

  it("builds a shared transport inventory for plugin and custom transports", () => {
    const runtime = {
      getService(name: string) {
        if (name === "telegram") {
          return {
            getBot: () => ({}),
            messageManager: {},
            knownChats: new Map([["1", {}]]),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const inventory = getEffectiveTransportInventory(
      runtime,
      {
        telegramBotToken: "telegram-token",
        slackWebhookUrl: "https://hooks.slack.test",
        slackSigningSecret: "secret",
      } as never,
      {
        platforms: {
          api: { enabled: true },
          cli: { enabled: true },
          telegram: { enabled: true },
          discord: { enabled: false },
          slack: { enabled: true },
          whatsapp: { enabled: false },
          signal: { enabled: false },
          matrix: { enabled: false },
          email: { enabled: false },
          sms: { enabled: false },
          mattermost: { enabled: false },
          homeassistant: { enabled: false },
          dingtalk: { enabled: false },
        },
      } as never,
    );

    expect(
      inventory.find((entry) => entry.platform === "telegram")?.operational,
    ).toBe(true);
    expect(
      inventory.find((entry) => entry.platform === "slack")?.operational,
    ).toBe(true);
    expect(
      inventory.find((entry) => entry.platform === "discord")?.reason,
    ).toBe("gateway-disabled");
  });

  it("builds a native messaging transport state summary", () => {
    const runtime = {
      getService(name: string) {
        if (name === "telegram") {
          return {
            getBot: () => ({}),
            messageManager: {},
            knownChats: new Map([["1", {}]]),
          };
        }
        if (name === "discord_transport") {
          return {
            history: () => [],
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const telegram = getNativeMessagingTransportState(
      runtime,
      {
        telegramBotToken: "telegram-token",
        discordBotToken: "discord-token",
      } as never,
      {
        platforms: {
          api: { enabled: true },
          cli: { enabled: true },
          telegram: { enabled: true },
          discord: { enabled: true },
          slack: { enabled: false },
          whatsapp: { enabled: false },
          signal: { enabled: false },
          matrix: { enabled: false },
          email: { enabled: false },
          sms: { enabled: false },
          mattermost: { enabled: false },
          homeassistant: { enabled: false },
          dingtalk: { enabled: false },
        },
      } as never,
      "telegram",
    );
    const discord = getNativeMessagingTransportState(
      runtime,
      {
        telegramBotToken: "telegram-token",
        discordBotToken: "discord-token",
      } as never,
      {
        platforms: {
          api: { enabled: true },
          cli: { enabled: true },
          telegram: { enabled: true },
          discord: { enabled: true },
          slack: { enabled: false },
          whatsapp: { enabled: false },
          signal: { enabled: false },
          matrix: { enabled: false },
          email: { enabled: false },
          sms: { enabled: false },
          mattermost: { enabled: false },
          homeassistant: { enabled: false },
          dingtalk: { enabled: false },
        },
      } as never,
      "discord",
    );

    expect(telegram?.ready).toBe(true);
    expect(telegram?.summary).toContain("telegram:");
    expect(telegram?.summary).toContain("live=true");
    expect(telegram?.summary).toContain("ready=true");
    // discord state now reflects removed plugin-discord shim; gateway handles discord directly
    expect(discord?.summary).toContain("discord:");
  });

  it("builds an autonomous control-plane summary from native services", () => {
    const runtime = {
      getService(name: string) {
        if (name === "AGENT_SKILLS_SERVICE") {
          return {
            getLoadedSkills: () => [
              {
                slug: "native-skill",
                name: "Native Skill",
                description: "Loaded by the official service.",
                path: "/skills/native-skill",
                content: "# Native Skill",
                source: "managed",
                sourceDir: "/skills",
                precedence: 80,
              },
            ],
          };
        }
        if (name === "ORCHESTRATOR_TASK_SERVICE") {
          return {};
        }
        if (name === "doolittle_coding_agent") {
          return {
            read: () => "",
            write: () => undefined,
            search: () => [],
            repoStatus: async () => ({}),
            repoDiff: async () => ({}),
            repoLog: async () => [],
            run: async () => ({}),
            tasks: () => [],
          };
        }
        if (name === "trajectories") {
          return {
            bundles: () => [{ id: "bundle-1" }],
            exportLatest: () => ({ id: "latest" }),
          };
        }
        if (name === "plugin_manager") {
          return {
            list: () => [{ id: "plugin-1" }, { id: "plugin-2" }],
            categories: () => ({ foundation: 1, automation: 1 }),
            summary: () => ({
              total: 2,
              enabled: 1,
              official: 1,
              vendored: 1,
              categories: 2,
            }),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const services = {
      agentSdk: {
        snapshot: () => ({}),
      },
      skillsHub: {
        summary: () => ({
          catalogProjected: true,
          catalogTotal: 9,
        }),
      },
      skills: {
        list: () => [{ slug: "fallback-skill" }],
        summary: () => ({
          total: 1,
          roots: [{ name: "fallback", count: 1 }],
          categories: [{ name: "fallback", count: 1 }],
        }),
      },
      skillSynthesis: {
        listGeneratedSkills: () => [{ slug: "generated-skill" }],
      },
      delegationProjection: {
        list: () => [
          { id: "official-task-1", status: "pending" },
          { id: "official-task-2", status: "running" },
        ],
        queueSummary: () => ({ pending: 1, activeWorkers: 1 }),
      },
      trajectoryEvaluation: {
        listBundles: () => [{ id: "fallback-bundle" }],
        exportLatest: () => ({ id: "fallback-latest" }),
      },
    } as unknown as AppServices;

    const controlPlane = getAutonomousControlPlane(runtime, services, {
      elizaCloudEnabled: true,
      elizaCloudApiKey: "cloud-key",
      elizaCloudSmallModel: "anthropic/claude-haiku-4-5-20251001",
      elizaCloudLargeModel: "anthropic/claude-sonnet-4.6",
      elizaCloudEmbeddingModel: "openai/text-embedding-3-small",
      ollamaApiEndpoint: "http://localhost:11434/api",
      ollamaSmallModel: "granite4.1:3b",
      ollamaLargeModel: "granite4.1:3b",
      ollamaEmbeddingModel: "nomic-embed-text:latest",
      openAiApiKey: undefined,
      anthropicApiKey: undefined,
      useLinkedCodexAuth: false,
      useLinkedClaudeCodeAuth: false,
      claudeCodeCliFallback: false,
      openAiModel: "gpt-5.4",
      anthropicLargeModel: "claude-sonnet-4.6",
      telegramBotToken: undefined,
      discordBotToken: undefined,
      falApiKey: undefined,
    } as never);

    expect(controlPlane.skills.source).toBe("native");
    expect(controlPlane.skills.localSkills).toBe(1);
    expect(controlPlane.skills.catalogProjected).toBe(true);
    expect(controlPlane.skills.catalogSkills).toBe(9);
    expect(controlPlane.orchestrator.tasks).toBe(2);
    expect(controlPlane.orchestrator.queuePending).toBe(1);
    expect(controlPlane.codingAgent).toMatchObject({
      source: "native",
      available: true,
      workspace: true,
      repository: true,
      shell: true,
      delegation: true,
    });
    expect(controlPlane.trajectories.evaluationBundles).toBe(1);
    expect(controlPlane.pluginManager.plugins).toBe(2);
    expect(controlPlane.pluginManager.enabled).toBe(1);
    expect(controlPlane.pluginManager.official).toBe(1);
    expect(controlPlane.pluginManager.vendored).toBe(1);
    expect(controlPlane.alignment.connection.kind).toBe("cloud-managed");
    expect(controlPlane.alignment.connection.provider).toBe("elizacloud");
    expect(controlPlane.alignment.connection.smallModel).toBe(
      "anthropic/claude-haiku-4-5-20251001",
    );
    expect(controlPlane.media.tts.available).toBe(true);
    expect(controlPlane.research.autocoder.source).toBe("product-plugin");
    expect(controlPlane.research.autocoder.ready).toBe(false);
    expect(controlPlane.totals.nativeServices).toBe(5);
  });
});

describe("media and research control plane helpers", () => {
  it("reports native tts readiness based on fal configuration", () => {
    const enabled = getNativeMediaControlPlane({
      falApiKey: "fal-key",
    } as never);
    const disabled = getNativeMediaControlPlane({
      falApiKey: undefined,
    } as never);

    expect(enabled.tts.ready).toBe(true);
    expect(enabled.tts.provider).toBe("fal");
    expect(disabled.tts.ready).toBe(false);
    expect(disabled.tts.provider).toBe("none");
  });

  it("reports gated autocoder readiness", () => {
    const runtime = {
      getService(name: string) {
        if (name === "doolittle_code_generation") {
          return {
            capabilityDescription: "Native code generation",
          };
        }
        if (name === "doolittle_local_sandbox") {
          return {};
        }
        if (name === "doolittle_forms") {
          return {};
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const controlPlane = getNativeResearchControlPlane(runtime);

    expect(controlPlane.autocoder.ready).toBe(true);
    expect(controlPlane.autocoder.dependencies.github).toBe(false);
  });
});

describe("plugin manager bridge helper", () => {
  it("prefers native plugin manager summary when available", () => {
    const runtime = {
      getService(name: string) {
        if (name === "plugin_manager") {
          return {
            list: () => [{ id: "plugin-1" }, { id: "plugin-2" }],
            categories: () => ({ foundation: 1, automation: 1 }),
            summary: () => ({
              total: 2,
              enabled: 1,
              official: 1,
              vendored: 1,
              categories: 2,
            }),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const inventory = getEffectivePluginManagerInventory(runtime);

    expect(inventory?.summary).toEqual({
      total: 2,
      enabled: 1,
      official: 1,
      vendored: 1,
      categories: 2,
    });
    expect(inventory?.plugins).toHaveLength(2);
  });

  it("falls back to derived summary values when plugin manager summary is missing", () => {
    const runtime = {
      getService(name: string) {
        if (name === "plugin_manager") {
          return {
            list: () => [
              { enabled: true, source: "official" },
              { enabled: false, source: "vendored" },
              { enabled: true, source: "vendored" },
            ],
            categories: () => ({ foundation: 1, adapter: 1 }),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const inventory = getEffectivePluginManagerInventory(runtime);

    expect(inventory?.summary).toEqual({
      total: 3,
      enabled: 2,
      official: 1,
      vendored: 2,
      categories: 2,
    });
    expect(inventory?.plugins).toHaveLength(3);
  });

  it("maps plugin-manager capability ownership from runtime presence", () => {
    const runtime = {
      getService(name: string) {
        if (name === "plugin_manager") {
          return {};
        }
        return null;
      },
    } as unknown as RuntimeLike;
    const resolution = getEffectiveServiceResolution(runtime);

    const pluginManager = resolution.find(
      (entry) => entry.capability === "pluginManager",
    );

    expect(pluginManager).toMatchObject({
      nativeService: "plugin_manager",
      source: "native",
      ownership: "plugin",
      available: true,
    });
  });
});

describe("delegation bridge helpers", () => {
  it("adapts official task details, lineage, trees, and retries", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const runtime = official.runtime as unknown as RuntimeLike;
    const parent = await official.service.createTask({
      title: "Official task",
      goal: "Official orchestrator task",
      originalRequest: "Official orchestrator task",
    });
    const child = await official.service.createTask({
      title: "Official child",
      goal: "Official orchestrator child",
      originalRequest: "Official orchestrator child",
      parentTaskId: parent.id,
    });
    const projection = { upsertProjection: vi.fn() };

    await expect(
      getEffectiveDelegationTask(runtime, parent.id),
    ).resolves.toMatchObject({
      id: parent.id,
      title: "Official task",
      objective: "Official orchestrator task",
      status: "pending",
    });
    await expect(
      getEffectiveDelegationChildren(runtime, parent.id),
    ).resolves.toEqual([
      expect.objectContaining({
        id: child.id,
        parentTaskId: parent.id,
      }),
    ]);
    await expect(
      getEffectiveDelegationTree(runtime, parent.id),
    ).resolves.toMatchObject({
      task: { id: parent.id },
      children: [{ task: { id: child.id }, children: [] }],
    });
    await expect(
      retryEffectiveDelegationTask(
        runtime,
        projection,
        parent.id,
        "retry with official context",
      ),
    ).resolves.toMatchObject({
      id: parent.id,
      status: "running",
    });
    expect(projection.upsertProjection).toHaveBeenCalledWith(
      expect.objectContaining({ id: parent.id, status: "running" }),
    );
  });
});

describe("identity bridge helpers", () => {
  it("keeps durable text memory distinct while preferring native identity and experience summaries", () => {
    const runtime = {
      getService(name: string) {
        if (name === "doolittle_personality") {
          return {
            summary: () => ({
              total: 4,
              activeId: "operator",
              names: ["Operator", "Concise", "Teacher", "Autonomous"],
            }),
          };
        }
        if (name === "doolittle_rolodex") {
          return {
            summary: () => ({
              totalProfiles: 2,
              agentName: "Doolittle",
              recentProfiles: ["alice", "bob"],
              totalBeliefs: 4,
              totalBeliefSources: 2,
              activeRelationships: 1,
              trustedRelationships: 1,
              engagedProfiles: 1,
              relationshipStatusCounts: {
                new: 1,
                growing: 0,
                active: 0,
                trusted: 1,
              },
              topBeliefProfiles: [],
              topRelationships: [],
              topEngagements: [],
              topChannels: [],
              topSignals: [],
              recentSignals: ["native-signal"],
            }),
          };
        }
        if (name === "doolittle_experience") {
          return {
            summary: () => ({
              sessions: {
                totalSessions: 5,
                recentSessionIds: ["session-1", "session-2"],
              },
              memory: {
                shared: {
                  target: "memory",
                  entries: 9,
                  characters: 144,
                  preview: ["native"],
                },
              },
            }),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const services = {
      memory: {
        summary: (target: "memory" | "user") => ({
          target,
          entries: 1,
          characters: 1,
          preview: ["fallback"],
        }),
      },
      personalities: {
        summary: () => ({
          total: 1,
          activeId: "fallback",
          names: ["fallback"],
        }),
      },
      userProfiles: {
        summary: () => ({
          totalProfiles: 1,
          agentName: "fallback",
          recentProfiles: ["fallback"],
        }),
      },
      sessions: {
        summary: () => ({
          totalSessions: 1,
          recentSessionIds: ["fallback"],
        }),
      },
    } as never as AppServices;

    expect(getEffectiveMemorySnapshot(runtime, services, "memory")).toEqual({
      target: "memory",
      entries: 1,
      characters: 1,
      preview: ["fallback"],
    });
    expect(getEffectiveMemorySnapshot(runtime, services, "user")).toEqual({
      target: "user",
      entries: 1,
      characters: 1,
      preview: ["fallback"],
    });
    expect(getEffectivePersonalitySummary(runtime)).toEqual({
      total: 4,
      activeId: "operator",
      names: ["Operator", "Concise", "Teacher", "Autonomous"],
    });
    expect(getEffectiveRolodexSummary(runtime)).toEqual({
      totalProfiles: 2,
      agentName: "Doolittle",
      recentProfiles: ["alice", "bob"],
      totalBeliefs: 4,
      totalBeliefSources: 2,
      activeRelationships: 1,
      trustedRelationships: 1,
      engagedProfiles: 1,
      relationshipStatusCounts: {
        new: 1,
        growing: 0,
        active: 0,
        trusted: 1,
      },
      topBeliefProfiles: [],
      topRelationships: [],
      topEngagements: [],
      topChannels: [],
      topSignals: [],
      recentSignals: ["native-signal"],
    });
    expect(getEffectiveExperienceSummary(runtime)).toEqual({
      sessions: {
        totalSessions: 5,
        recentSessionIds: ["session-1", "session-2"],
      },
      memory: {
        shared: {
          target: "memory",
          entries: 9,
          characters: 144,
          preview: ["native"],
        },
      },
    });
  });

  it("keeps product memory readable but requires Eliza identity services", () => {
    const runtime = {
      getService() {
        return null;
      },
    } as unknown as RuntimeLike;

    const services = {
      memory: {
        summary: (target: "memory" | "user") => ({
          target,
          entries: target === "memory" ? 3 : 1,
          characters: target === "memory" ? 48 : 12,
          preview: [`${target}:fallback`],
        }),
      },
      personalities: {
        summary: () => ({
          total: 2,
          activeId: "operator",
          names: ["Operator", "Teacher"],
        }),
      },
      userProfiles: {
        summary: () => ({
          totalProfiles: 7,
          agentName: "Doolittle",
          recentProfiles: ["carol", "dave"],
          totalBeliefs: 1,
          totalBeliefSources: 0,
          activeRelationships: 0,
          trustedRelationships: 0,
          engagedProfiles: 0,
          relationshipStatusCounts: {
            new: 7,
            growing: 0,
            active: 0,
            trusted: 0,
          },
          topBeliefProfiles: [],
          topRelationships: [],
          topEngagements: [],
          topChannels: [],
          topSignals: [],
          recentSignals: ["fallback"],
        }),
      },
      sessions: {
        summary: () => ({
          totalSessions: 9,
          recentSessionIds: ["session-a"],
        }),
      },
    } as never as AppServices;

    expect(getEffectiveMemorySnapshot(runtime, services, "memory")).toEqual({
      target: "memory",
      entries: 3,
      characters: 48,
      preview: ["memory:fallback"],
    });
    expect(() => getEffectivePersonalitySummary(runtime)).toThrow(
      "Required Doolittle service doolittle_personality is unavailable.",
    );
    expect(() => getEffectiveRolodexSummary(runtime)).toThrow(
      "Required Doolittle service doolittle_rolodex is unavailable.",
    );
    expect(() => getEffectiveExperienceSummary(runtime)).toThrow(
      "Required Doolittle service doolittle_experience is unavailable.",
    );
  });
});
