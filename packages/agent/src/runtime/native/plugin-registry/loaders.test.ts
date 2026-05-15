import { describe, expect, it } from "bun:test";
import type { Plugin } from "@elizaos/core";
import type { AppServices } from "../../../services";
import type { EnvConfig } from "../../../types/runtime";
import {
  createEmptyDeferredPluginGroups,
  loadDeferredPluginGroups,
} from "./deferred-groups";
import { loadHotExecutionPlugins } from "./hot-execution";

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
    delegation: {
      create: () => ({ id: "task-1" }),
      list: () => [],
      get: () => ({ id: "task-1" }),
      queueSummary: () => ({ queued: 0 }),
      overview: () => ({ total: 0 }),
      listChildren: () => [],
      tree: () => ({ id: "task-1", children: [] }),
      spawnChild: () => ({ id: "child-1" }),
      requeue: () => ({ ok: true }),
      cancel: () => ({ ok: true }),
      supervise: async () => ({ ok: true }),
      runQueued: async () => ({ ok: true }),
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
    trajectories: {
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

describe("loadHotExecutionPlugins", () => {
  it("builds the expected hot execution plugin set", async () => {
    const plugins = await loadHotExecutionPlugins(
      createServices(),
      createConfig(),
    );

    expect(pluginNames(plugins)).toEqual([
      "@doolittle/plugin-coding-agent",
      "@doolittle/plugin-agent-orchestrator",
      "@doolittle/plugin-planning",
    ]);
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
      "@doolittle/plugin-action-bench",
      "@doolittle/plugin-autocoder",
    ]);
    expect(pluginNames(groups.execution)).toEqual([
      "@doolittle/plugin-local-sandbox",
      "@doolittle/plugin-forms",
    ]);
  });
});
