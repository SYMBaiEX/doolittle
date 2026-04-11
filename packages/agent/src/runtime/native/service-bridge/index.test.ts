import { describe, expect, it } from "bun:test";
import type { AppServices } from "@/services";
import type { DelegationTaskRecord } from "@/types/delegation";
import type { RuntimeLike } from "./index";
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
  getAutonomousControlPlane,
  getEffectiveDelegationChildren,
  getEffectiveDelegationTask,
  getEffectiveDelegationTree,
  getEffectiveExperienceSummary,
  getEffectiveForm,
  getEffectiveFormTemplates,
  getEffectiveMemorySnapshot,
  getEffectiveMessagingTransportInventory,
  getEffectivePersonalitySummary,
  getEffectivePlan,
  getEffectivePluginManagerInventory,
  getEffectiveRolodexSummary,
  getEffectiveSecret,
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
  killEffectiveSandbox,
  listEffectiveForms,
  listEffectivePlans,
  listEffectiveSandboxes,
  listEffectiveSecretKeys,
  performEffectiveCodeQa,
  performEffectiveCodeResearch,
  retryEffectiveDelegationTask,
  setEffectiveSecret,
} from "./index";

function makeDelegationTask(
  id: string,
  overrides: Partial<DelegationTaskRecord> = {},
): DelegationTaskRecord {
  const createdAt = "2026-03-24T00:00:00.000Z";
  return {
    id,
    title: `Task ${id}`,
    objective: `Objective ${id}`,
    status: "pending",
    executionMode: "local",
    notes: [],
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe("getEffectiveMessagingTransportInventory", () => {
  it("builds native forms and execution control planes from installed services", () => {
    const runtime = {
      getService(name: string) {
        if (name === "forms") {
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
        if (name === "e2b") {
          return {
            capabilityDescription: "e2b",
            listSandboxes: () => [
              { id: "sandbox-1", path: "/tmp/doolittle-e2b/sandbox-1" },
            ],
            executeCode: async () => ({ success: true }),
          };
        }
        if (name === "code-generation") {
          return {
            capabilityDescription: "codegen",
            performResearch: () => undefined,
            generateCode: () => undefined,
            generateCodeInternal: () => undefined,
          };
        }
        if (name === "planning") {
          return {
            capabilityDescription: "planning",
            listPlans: () => [
              { id: "plan-1", taskId: "task-1", status: "active" },
              { id: "plan-2", workflowId: "workflow-1", status: "draft" },
            ],
            createPlan: async (input: unknown) => input,
          };
        }
        if (name === "github") {
          return {
            createRepository: () => undefined,
            deleteRepository: () => undefined,
          };
        }
        if (name === "secrets-manager") {
          return {
            listSecretKeys: () => ["OPENAI_API_KEY"],
            getSecret: () => "x",
            setSecret: () => undefined,
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
    expect(forms.templates).toBe(2);
    expect(forms.forms.total).toBe(2);
    expect(forms.forms.active).toBe(1);
    expect(forms.persistenceAvailable).toBe(true);
    expect(planning.available).toBe(true);
    expect(planning.plans.total).toBe(2);
    expect(execution.e2b.available).toBe(true);
    expect(execution.planning.available).toBe(true);
    expect(execution.planning.plans.total).toBe(2);
    expect(execution.e2b.sandboxes).toBe(1);
    expect(execution.agentEvents.available).toBe(true);
    expect(execution.agentEvents.lastHeartbeatStatus).toBe("thinking");
    expect(execution.codeGeneration.available).toBe(true);
    expect(execution.codeGeneration.ready).toBe(true);
    expect(execution.codeGeneration.methods).toContain("generateCode");
    expect(execution.github.available).toBe(true);
    expect(execution.secretsManager.keys).toContain("OPENAI_API_KEY");
  });

  it("marks browser, knowledge, and orchestrator bridges as plugin-owned when native services are present", async () => {
    const runtime = {
      getService(name: string) {
        if (name === "knowledge") {
          return {
            summary: () => ({
              target: "memory",
              entries: 2,
              characters: 40,
              preview: ["native"],
            }),
          };
        }
        if (name === "browser") {
          return {
            status: async () => ({ mode: "browser" }),
          };
        }
        if (name === "mcp") {
          return {
            status: () => ({ mode: "native" }),
            getCachedTools: () => [{ name: "tool-1" }],
          };
        }
        if (name === "agent_orchestrator") {
          return {
            tasks: () => [{ id: "task-1" }],
            queue: () => ({ pending: 0, activeWorkers: 0 }),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const services = {
      web: {
        status: async () => ({
          provider: "basic",
          ready: true,
          mode: "fallback",
          captureMode: "placeholder",
          captureReady: false,
          detail: "fallback",
          artifacts: {
            snapshot: false,
            screenshot: false,
            comparison: false,
          },
        }),
      },
      mcp: {
        status: () => ({ mode: "fallback" }),
        getCachedTools: () => [],
      },
    } as never as {
      web: {
        status(): Promise<{
          provider: "basic";
          ready: true;
          mode: "fallback";
          captureMode: "placeholder";
          captureReady: false;
          detail: "fallback";
          artifacts: {
            snapshot: false;
            screenshot: false;
            comparison: false;
          };
        }>;
      };
      mcp: { status(): unknown; getCachedTools(): unknown[] };
    };

    const resolution = getEffectiveServiceResolution(runtime);
    const integration = await getNativeIntegrationControlPlane(
      runtime,
      services,
    );

    expect(
      resolution.find((entry) => entry.capability === "knowledge")?.ownership,
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
      getService(name: string) {
        if (name === "forms") {
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
        if (name === "e2b") {
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
        if (name === "code-generation") {
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
        if (name === "planning") {
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
        if (name === "github") {
          return {
            createRepository: async (name: string, isPrivate = true) => ({
              name,
              private: isPrivate,
            }),
            deleteRepository: async (name: string) => ({ deleted: name }),
          };
        }
        if (name === "secrets-manager") {
          return {
            listSecretKeys: async () => ["OPENAI_API_KEY"],
            getSecret: async (key: string) => `value:${key}`,
            setSecret: async () => undefined,
            hasSecret: async () => true,
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
    ).resolves.toBeUndefined();
  });

  it("reports live telegram and discord services when runtime services exist", () => {
    const runtime = {
      getService(name: string) {
        if (name === "telegram") {
          return {
            bot: {},
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

    const inventory = getEffectiveMessagingTransportInventory(runtime, {
      telegramBotToken: "telegram-token",
      discordBotToken: "discord-token",
    } as never);

    expect(inventory.find((entry) => entry.platform === "telegram")?.live).toBe(
      true,
    );
    expect(inventory.find((entry) => entry.platform === "discord")?.live).toBe(
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
            bot: {},
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

    expect(controlPlane.totals.configured).toBe(2);
    expect(controlPlane.totals.enabledPlugins).toBe(1);
    expect(controlPlane.totals.availableServices).toBe(2);
    expect(controlPlane.totals.liveServices).toBe(1);
    expect(controlPlane.totals.officialPlugins).toBe(2);
    expect(controlPlane.totals.vendoredPlugins).toBe(0);
    expect(controlPlane.totals.operationalTransports).toBeGreaterThan(0);
  });

  it("builds a shared transport inventory for plugin and custom transports", () => {
    const runtime = {
      getService(name: string) {
        if (name === "telegram") {
          return {
            bot: {},
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
            bot: {},
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
    expect(discord?.ready).toBe(true);
    expect(discord?.summary).toContain("discord:");
    expect(discord?.summary).toContain("live=true");
    expect(discord?.summary).toContain("ready=true");
  });

  it("builds an autonomous control-plane summary from native services", () => {
    const runtime = {
      getService(name: string) {
        if (name === "agent_skills") {
          return {
            list: () => [{ slug: "native-skill" }],
          };
        }
        if (name === "agent_orchestrator") {
          return {
            tasks: () => [{ id: "task-1" }, { id: "task-2" }],
            queue: () => ({ pending: 1, activeWorkers: 1 }),
          };
        }
        if (name === "trajectory_logger") {
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
        snapshot: () => ({
          skillCatalog: {
            total: 9,
            trending: [{ slug: "browser" }, { slug: "mcp" }],
          },
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
      delegation: {
        list: () => [{ id: "fallback-task" }],
        queueSummary: () => ({ pending: 2, activeWorkers: 0 }),
      },
      trajectories: {
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
    expect(controlPlane.skills.catalogSkills).toBe(9);
    expect(controlPlane.orchestrator.tasks).toBe(2);
    expect(controlPlane.orchestrator.queuePending).toBe(1);
    expect(controlPlane.trajectories.bundles).toBe(1);
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
    expect(controlPlane.research.actionBench.actions).toBeGreaterThan(0);
    expect(controlPlane.research.autocoder.ready).toBe(false);
    expect(controlPlane.totals.nativeServices).toBe(4);
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

  it("reports action-bench depth and gated autocoder readiness", () => {
    const runtime = {
      getService(name: string) {
        if (name === "code-generation") {
          return {
            capabilityDescription: "Native code generation",
          };
        }
        if (name === "e2b") {
          return {};
        }
        if (name === "forms") {
          return {};
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const controlPlane = getNativeResearchControlPlane(runtime);

    expect(controlPlane.actionBench.actions).toBeGreaterThan(0);
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
  it("prefers native orchestrator tree, children, status, and retry helpers when available", () => {
    const runtime = {
      getService(name: string) {
        if (name === "agent_orchestrator") {
          return {
            getTask: (id: string) =>
              makeDelegationTask(id, {
                title: "Native task",
                objective: "Native orchestrator task",
              }),
            getChildren: (id: string) => [
              makeDelegationTask(`${id}-child`, {
                title: "Native child",
                objective: "Native orchestrator child",
              }),
            ],
            tree: (id: string) =>
              makeDelegationTask(id, {
                title: "Native tree",
                objective: "Native orchestrator tree",
              }),
            retryTask: (
              id: string,
              _note?: string,
              options?: { cascadeChildren?: boolean },
            ) =>
              makeDelegationTask(id, {
                title: "Native retry",
                objective: "Native orchestrator retry",
                status: "pending",
                metadata: {
                  cascadeChildren: String(options?.cascadeChildren ?? false),
                },
              }),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const services = {
      delegation: {
        get: (id: string) =>
          makeDelegationTask(id, {
            title: "Fallback task",
            objective: "Fallback delegation task",
          }),
        listChildren: (id: string) => [
          makeDelegationTask(`${id}-child`, {
            title: "Fallback child",
            objective: "Fallback delegation child",
          }),
        ],
        tree: (id: string) =>
          makeDelegationTask(id, {
            title: "Fallback tree",
            objective: "Fallback delegation tree",
          }),
        requeue: (id: string, note?: string) =>
          makeDelegationTask(id, {
            title: "Fallback retry",
            objective: "Fallback delegation retry",
            metadata: note ? { note } : undefined,
          }),
      },
    } as never as AppServices;

    expect(getEffectiveDelegationTask(runtime, services, "task-1")).toEqual(
      makeDelegationTask("task-1", {
        title: "Native task",
        objective: "Native orchestrator task",
      }),
    );
    expect(getEffectiveDelegationChildren(runtime, services, "task-1")).toEqual(
      [
        makeDelegationTask("task-1-child", {
          title: "Native child",
          objective: "Native orchestrator child",
        }),
      ],
    );
    expect(getEffectiveDelegationTree(runtime, services, "task-1")).toEqual(
      makeDelegationTask("task-1", {
        title: "Native tree",
        objective: "Native orchestrator tree",
      }),
    );
    expect(
      retryEffectiveDelegationTask(runtime, services, "task-1", "note"),
    ).toEqual(
      makeDelegationTask("task-1", {
        title: "Native retry",
        objective: "Native orchestrator retry",
        status: "pending",
        metadata: { cascadeChildren: "false" },
      }),
    );
    expect(
      retryEffectiveDelegationTask(runtime, services, "task-1", "note", {
        cascadeChildren: true,
      }),
    ).toEqual(
      makeDelegationTask("task-1", {
        title: "Native retry",
        objective: "Native orchestrator retry",
        status: "pending",
        metadata: { cascadeChildren: "true" },
      }),
    );
  });
});

describe("identity bridge helpers", () => {
  it("prefers native knowledge, personality, rolodex, and experience summaries when available", () => {
    const runtime = {
      getService(name: string) {
        if (name === "knowledge") {
          return {
            summary: (target: "memory" | "user") => ({
              target,
              entries: target === "memory" ? 9 : 4,
              characters: target === "memory" ? 144 : 72,
              preview: [`${target}:native-preview`],
            }),
          };
        }
        if (name === "personality") {
          return {
            summary: () => ({
              total: 4,
              activeId: "operator",
              names: ["Operator", "Concise", "Teacher", "Autonomous"],
            }),
          };
        }
        if (name === "rolodex") {
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
        if (name === "experience") {
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
                user: {
                  target: "user",
                  entries: 4,
                  characters: 72,
                  preview: ["native-user"],
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
      entries: 9,
      characters: 144,
      preview: ["memory:native-preview"],
    });
    expect(getEffectiveMemorySnapshot(runtime, services, "user")).toEqual({
      target: "user",
      entries: 4,
      characters: 72,
      preview: ["user:native-preview"],
    });
    expect(getEffectivePersonalitySummary(runtime, services)).toEqual({
      total: 4,
      activeId: "operator",
      names: ["Operator", "Concise", "Teacher", "Autonomous"],
    });
    expect(getEffectiveRolodexSummary(runtime, services)).toEqual({
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
    expect(getEffectiveExperienceSummary(runtime, services)).toEqual({
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
        user: {
          target: "user",
          entries: 4,
          characters: 72,
          preview: ["native-user"],
        },
      },
    });
  });

  it("falls back to product summaries when native services are unavailable", () => {
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
    expect(getEffectivePersonalitySummary(runtime, services)).toEqual({
      total: 2,
      activeId: "operator",
      names: ["Operator", "Teacher"],
    });
    expect(getEffectiveRolodexSummary(runtime, services)).toEqual({
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
    });
    expect(getEffectiveExperienceSummary(runtime, services)).toEqual({
      sessions: {
        totalSessions: 9,
        recentSessionIds: ["session-a"],
      },
      memory: {
        shared: {
          target: "memory",
          entries: 3,
          characters: 48,
          preview: ["memory:fallback"],
        },
        user: {
          target: "user",
          entries: 1,
          characters: 12,
          preview: ["user:fallback"],
        },
      },
    });
  });
});
