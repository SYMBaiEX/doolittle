import { describe, expect, it } from "bun:test";
import type { AppServices } from "@/services";
import type { RuntimeLike } from "./service-bridge";
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
} from "./service-bridge";

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
              { id: "sandbox-1", path: "/tmp/eliza-agent-e2b/sandbox-1" },
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
        status: async () => ({ mode: "fallback" }),
      },
      mcp: {
        status: () => ({ mode: "fallback" }),
        getCachedTools: () => [],
      },
    } as never as {
      web: { status(): Promise<unknown> };
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
            listForms: () => [{ id: "form-1", status: "active" }],
            getTemplates: () => new Map([["intake", { name: "Intake" }]]),
            createForm: async (template: unknown, metadata?: unknown) => ({
              id: "form-created",
              template,
              metadata,
            }),
            getForm: async (id: string) => ({ id, status: "active" }),
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
            listPlans: () => [{ id: "plan-1", status: "active" }],
            createPlan: async (input: unknown) => ({
              id: "plan-created",
              ...((input as Record<string, unknown>) ?? {}),
            }),
            getPlan: async (id: string) => ({ id, status: "active" }),
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
      template: "intake",
      metadata: { owner: "eliza" },
    });
    expect(await getEffectiveForm(runtime, "form-created")).toEqual({
      id: "form-created",
      status: "active",
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
      status: "active",
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

    const controlPlane = getAutonomousControlPlane(runtime, services);

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
});

describe("delegation bridge helpers", () => {
  it("prefers native orchestrator tree, children, status, and retry helpers when available", () => {
    const runtime = {
      getService(name: string) {
        if (name === "agent_orchestrator") {
          return {
            getTask: (id: string) => ({ id, source: "native-task" }),
            getChildren: (id: string) => [
              { id: `${id}-child`, source: "native-child" },
            ],
            tree: (id: string) => ({ id, source: "native-tree" }),
            retryTask: (
              id: string,
              note?: string,
              options?: { cascadeChildren?: boolean },
            ) => ({
              id,
              note,
              cascadeChildren: options?.cascadeChildren ?? false,
              source: "native-retry",
            }),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const services = {
      delegation: {
        get: (id: string) => ({ id, source: "fallback-task" }),
        listChildren: (id: string) => [
          { id: `${id}-child`, source: "fallback-child" },
        ],
        tree: (id: string) => ({ id, source: "fallback-tree" }),
        requeue: (id: string, note?: string) => ({
          id,
          note,
          source: "fallback-retry",
        }),
      },
    } as never as AppServices;

    expect(getEffectiveDelegationTask(runtime, services, "task-1")).toEqual({
      id: "task-1",
      source: "native-task",
    });
    expect(getEffectiveDelegationChildren(runtime, services, "task-1")).toEqual(
      [
        {
          id: "task-1-child",
          source: "native-child",
        },
      ],
    );
    expect(getEffectiveDelegationTree(runtime, services, "task-1")).toEqual({
      id: "task-1",
      source: "native-tree",
    });
    expect(
      retryEffectiveDelegationTask(runtime, services, "task-1", "note"),
    ).toEqual({
      id: "task-1",
      note: "note",
      cascadeChildren: false,
      source: "native-retry",
    });
    expect(
      retryEffectiveDelegationTask(runtime, services, "task-1", "note", {
        cascadeChildren: true,
      }),
    ).toEqual({
      id: "task-1",
      note: "note",
      cascadeChildren: true,
      source: "native-retry",
    });
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
              agentName: "Eliza Agent",
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
      agentName: "Eliza Agent",
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
          agentName: "Eliza Agent",
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
      agentName: "Eliza Agent",
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
