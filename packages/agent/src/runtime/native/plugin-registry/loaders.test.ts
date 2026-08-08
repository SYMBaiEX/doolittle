import { DOOLITTLE_OPERATOR_PLANNING_SERVICE } from "@doolittle/contracts";
import type { Plugin } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { AppServices } from "../../../services";
import type { EnvConfig } from "../../../types/runtime";
import {
  createEmptyDeferredPluginGroups,
  loadDeferredPluginGroups,
} from "./deferred-groups";
import { loadFoundationPlugins } from "./foundation";
import { loadHotExecutionPlugins } from "./hot-execution";

vi.mock("@elizaos/plugin-agent-orchestrator", () => ({
  agentOrchestratorPlugin: {
    name: "@elizaos/plugin-agent-orchestrator",
    actions: [],
  },
}));

vi.mock("@elizaos/plugin-agent-skills", () => ({
  agentSkillsPlugin: {
    name: "@elizaos/plugin-agent-skills",
    actions: [],
  },
}));

vi.mock("@elizaos/plugin-mcp", () => ({
  default: {
    name: "mcp",
    actions: [{ name: "MCP" }],
    services: [{ serviceType: "mcp" }],
  },
}));

vi.mock("@elizaos/plugin-form", () => ({
  formPlugin: {
    name: "form",
    actions: [],
    services: [{ serviceType: "FORM" }],
  },
  formAction: { name: "FORM" },
}));

vi.mock("@elizaos/plugin-github", () => ({
  githubPlugin: {
    name: "github",
    actions: [{ name: "GITHUB" }],
    services: [{ serviceType: "github" }],
  },
}));

vi.mock("@elizaos/plugin-discord", () => ({ default: { name: "discord" } }));
vi.mock("@elizaos/plugin-whatsapp", () => ({ default: { name: "whatsapp" } }));
vi.mock("@elizaos/plugin-signal", () => ({ default: { name: "signal" } }));
vi.mock("@elizaos/plugin-slack", () => ({ default: { name: "slack" } }));

function pluginNames(plugins: Plugin[]): string[] {
  return plugins.map((plugin) => plugin.name);
}

function createConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    dataDir: "/tmp/doolittle-data",
    workspaceDir: "/tmp/doolittle-workspace",
    discordBotToken: "",
    telegramBotToken: "",
    falApiKey: "",
    openAiApiKey: "",
    ...overrides,
  } as EnvConfig;
}

function createServices(): AppServices {
  return {
    terminal: {
      run: async () => ({ ok: true }),
      getHistory: () => [],
      status: () => ({ backend: "local", ready: true }),
    },
    workspace: {
      root: () => "/tmp/doolittle-workspace",
    },
    repository: {
      isRepository: () => true,
      status: () => ({ clean: true }),
      diffStat: () => ({ files: 0 }),
      recentCommits: () => [],
    },
    delegationProjection: {
      list: () => [],
      get: () => ({ id: "task-1" }),
      queueSummary: () => ({ queued: 0 }),
      overview: () => ({ total: 0 }),
      listChildren: () => [],
      tree: () => ({ id: "task-1", children: [] }),
    },
    autocoderPipeline: {
      listWorkflows: () => [],
      workflow: () => null,
    },
    documents: {
      extractPdf: async () => "pdf text",
    },
    memory: {
      list: () => [],
      remember: () => ({ ok: true }),
      read: () => [],
      summary: () => ({ count: 0 }),
    },
    sessions: {
      usage: () => ({ tokens: 0 }),
      latest: () => [],
      summary: () => ({ total: 0 }),
    },
    web: {
      status: () => ({ ready: false }),
      fetchText: async () => "",
      inspect: async () => ({ ok: true }),
      snapshot: async () => ({ ok: true }),
      screenshot: async () => ({ ok: true }),
      capture: async () => ({ ok: true }),
      analyze: async () => ({ ok: true }),
      compare: async () => ({ ok: true }),
      analyzeComparison: async () => ({ ok: true }),
    },
    media: {
      speakWithModel: async () => ({ ok: true }),
    },
    mcp: {
      status: () => ({ ready: true }),
      probe: async () => ({ ready: true }),
      discoverTools: async () => [],
      invoke: async () => ({ ok: true }),
      invokeTool: async () => ({ ok: true }),
      getCachedTools: () => [],
      searchCachedTools: () => [],
      describeCachedTools: () => [],
      describeTool: () => "tool",
    },
    cron: {
      list: () => [],
      get: () => null,
      create: () => ({ id: "cron-1" }),
      update: () => ({ id: "cron-1" }),
      runs: () => [],
    },
    skills: {
      list: () => [],
      get: () => null,
      catalog: () => [],
      searchCatalog: () => [],
    },
    skillSynthesis: {
      listGeneratedSkills: () => [],
      synthesize: async () => ({ ok: true }),
    },
    trajectoryEvaluation: {
      exportLatest: () => ({ ok: true }),
      listBundles: () => [],
      compareLatest: () => ({ ok: true }),
    },
  } as unknown as AppServices;
}

describe("createEmptyDeferredPluginGroups", () => {
  it("returns empty arrays for every deferred category", () => {
    expect(createEmptyDeferredPluginGroups()).toEqual({
      messaging: [],
      research: [],
      execution: [],
    });
  });
});

describe("loadFoundationPlugins", () => {
  it("mounts the aggregate-safe official Eliza foundation services and schema", () => {
    const plugins = loadFoundationPlugins();
    const plugin = plugins[0];
    const serviceTypes = plugin?.services?.map(
      (service) => service.serviceType,
    );

    expect(pluginNames(plugins)).toEqual([
      "doolittle-eliza-foundation",
      "@elizaos/plugin-browser",
    ]);
    expect(plugin?.schema).toBeDefined();
    expect(serviceTypes).toContain("agent_event");
    expect(serviceTypes).toContain("eliza_knowledge_graph");
    expect(serviceTypes).toEqual(
      expect.arrayContaining([
        "eliza_permissions_registry",
        "eliza_pending_prompts",
        "eliza_global_pause",
        "eliza_handoff",
        "eliza_character_persistence",
        "aws_s3",
        "media_generation",
      ]),
    );
  });
});

describe("loadHotExecutionPlugins", () => {
  it("builds the expected hot execution plugin set", async () => {
    const plugins = await loadHotExecutionPlugins(
      createServices(),
      createConfig(),
    );

    expect(pluginNames(plugins)).toEqual([
      "@doolittle/plugin-coding-agent",
      "@elizaos/plugin-agent-orchestrator",
      "@elizaos/plugin-agent-skills",
      "mcp",
      "@doolittle/plugin-planning",
    ]);
    const operatorPlanning = plugins.find(
      (plugin) => plugin.name === "@doolittle/plugin-planning",
    );
    expect(operatorPlanning?.services?.[0]?.serviceType).toBe(
      DOOLITTLE_OPERATOR_PLANNING_SERVICE,
    );
    expect(operatorPlanning?.services?.[0]?.serviceType).not.toBe("planning");
  });
});

describe("loadDeferredPluginGroups", () => {
  it("builds the expected deferred plugin groups with truthful defaults", async () => {
    const groups = await loadDeferredPluginGroups(
      createServices(),
      createConfig(),
    );

    expect(pluginNames(groups.messaging)).toEqual([]);
    expect(pluginNames(groups.research)).toEqual([
      "@doolittle/plugin-autocoder",
    ]);
    expect(pluginNames(groups.execution)).toEqual([
      "@doolittle/plugin-local-sandbox",
      "form",
      "@doolittle/plugin-forms",
      "github",
    ]);
    expect(groups.execution[1]?.actions?.map((action) => action.name)).toEqual([
      "FORM",
    ]);
  });

  it("loads official native messaging plugins only for complete native settings", async () => {
    const groups = await loadDeferredPluginGroups(
      createServices(),
      createConfig({
        discordBotToken: "token",
        whatsappAccessToken: "token",
        whatsappPhoneNumberId: "phone",
        whatsappVerifyToken: "verify",
        signalAccountNumber: "+15555550100",
        slackBotToken: "bot",
        slackAppToken: "app",
      }),
    );

    expect(pluginNames(groups.messaging)).toEqual([
      "discord",
      "whatsapp",
      "signal",
      "slack",
    ]);
  });
});
