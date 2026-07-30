import { DOOLITTLE_OPERATOR_PLANNING_SERVICE } from "@doolittle/contracts";
import { KNOWLEDGE_GRAPH_SERVICE } from "@elizaos/agent/services/knowledge-graph/index";
import { describe, expect, it } from "vitest";
import type { RuntimeLike } from "./runtime";
import {
  getEffectivePluginManagerInventory,
  getEffectiveServiceResolution,
} from "./service-resolution";

describe("service-resolution helpers", () => {
  it("builds the effective resolution table from native service presence", () => {
    const runtime = {
      getService(name: string) {
        switch (name) {
          case "pairing":
            return { listPendingRequests: async () => [] };
          case "memoryStorage":
            return { storeLongTermMemory: async () => ({}) };
          case KNOWLEDGE_GRAPH_SERVICE:
            return { getEntityStore: () => ({}) };
          case "pdf":
            return {
              convertPdfToTextWithOptions: async () => ({ success: true }),
            };
          case "shell":
            return { status: () => ({ ready: true }) };
          case "cron":
            return { list: async () => [], runs: async () => [] };
          case "AGENT_SKILLS_SERVICE":
            return { getLoadedSkills: () => [] };
          case "plugin_manager":
            return { list: () => [], categories: () => ({}) };
          case "planning":
            return { createSimplePlan: async () => ({}) };
          case DOOLITTLE_OPERATOR_PLANNING_SERVICE:
            return { listPlans: () => [] };
          default:
            return null;
        }
      },
    } as unknown as RuntimeLike;

    expect(getEffectiveServiceResolution(runtime)).toEqual([
      {
        capability: "pairing",
        nativeService: "pairing",
        source: "native",
        ownership: "plugin",
        fallback: "unavailable until the official Eliza PairingService loads",
        available: true,
      },
      {
        capability: "memoryStorage",
        nativeService: "memoryStorage",
        source: "native",
        ownership: "plugin",
        fallback: "unavailable until the Eliza memory storage adapter loads",
        available: true,
      },
      {
        capability: "knowledgeGraph",
        nativeService: KNOWLEDGE_GRAPH_SERVICE,
        source: "native",
        ownership: "plugin",
        fallback:
          "unavailable until the official Eliza foundation plugin loads",
        available: true,
      },
      {
        capability: "pdf",
        nativeService: "pdf",
        source: "native",
        ownership: "plugin",
        fallback: "unavailable until @elizaos/plugin-pdf is registered",
        available: true,
      },
      {
        capability: "personality",
        nativeService: "personality",
        source: "unavailable",
        ownership: "plugin",
        fallback: "required Eliza personality service",
        available: false,
      },
      {
        capability: "rolodex",
        nativeService: "rolodex",
        source: "unavailable",
        ownership: "plugin",
        fallback: "required Eliza rolodex service",
        available: false,
      },
      {
        capability: "experience",
        nativeService: "experience",
        source: "unavailable",
        ownership: "plugin",
        fallback: "required Eliza experience service",
        available: false,
      },
      {
        capability: "shell",
        nativeService: "shell",
        source: "native",
        ownership: "plugin",
        fallback: "required Eliza shell service",
        available: true,
      },
      {
        capability: "browser",
        nativeService: "browser",
        source: "unavailable",
        ownership: "plugin",
        fallback: "required Eliza browser service",
        available: false,
      },
      {
        capability: "mcp",
        nativeService: "mcp",
        source: "unavailable",
        ownership: "plugin",
        fallback: "required Eliza MCP service",
        available: false,
      },
      {
        capability: "automation",
        nativeService: "cron",
        source: "native",
        ownership: "plugin",
        fallback: "unavailable until the Eliza Trigger Task projection loads",
        available: true,
      },
      {
        capability: "agentSkills",
        nativeService: "AGENT_SKILLS_SERVICE",
        source: "native",
        ownership: "plugin",
        fallback: "required official Eliza Agent Skills service",
        available: true,
      },
      {
        capability: "trajectoryLogger",
        nativeService: "trajectories",
        source: "unavailable",
        ownership: "plugin",
        fallback: "required official Eliza trajectories service",
        available: false,
      },
      {
        capability: "agentOrchestrator",
        nativeService: "ORCHESTRATOR_TASK_SERVICE",
        source: "unavailable",
        ownership: "plugin",
        fallback: "required official Eliza Agent Orchestrator service",
        available: false,
      },
      {
        capability: "codingAgent",
        nativeService: "coding_agent",
        source: "unavailable",
        ownership: "plugin",
        fallback: "required Eliza coding agent service",
        available: false,
      },
      {
        capability: "pluginManager",
        nativeService: "plugin_manager",
        source: "native",
        ownership: "plugin",
        fallback: "native plugin catalog",
        available: true,
      },
      {
        capability: "actionPlanning",
        nativeService: "planning",
        source: "native",
        ownership: "plugin",
        fallback:
          "unavailable until the official Eliza planning service is registered",
        available: true,
      },
      {
        capability: "operatorPlanning",
        nativeService: DOOLITTLE_OPERATOR_PLANNING_SERVICE,
        source: "native",
        ownership: "plugin",
        fallback:
          "unavailable until the Doolittle operator-plan projection is registered",
        available: true,
      },
    ]);
  });

  it("prefers the native plugin manager summary when one is provided", () => {
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

    expect(getEffectivePluginManagerInventory(runtime)).toEqual({
      plugins: [{ id: "plugin-1" }, { id: "plugin-2" }],
      categories: { foundation: 1, automation: 1 },
      summary: {
        total: 2,
        enabled: 1,
        official: 1,
        vendored: 1,
        categories: 2,
      },
    });
  });

  it("adapts the official Eliza plugin manager runtime state", () => {
    const runtime = {
      getService(name: string) {
        if (name === "plugin_manager") {
          return {
            getAllPlugins: () => [
              {
                id: "official",
                name: "@elizaos/plugin-sql",
                status: "ready",
                plugin: {
                  description: "SQL persistence",
                  actions: [],
                  providers: [{ name: "database" }],
                  services: [{ serviceType: "database" }],
                },
              },
              {
                id: "product",
                name: "doolittle-runtime",
                status: "loaded",
                plugin: {
                  description: "Doolittle product plugin",
                  actions: [{ name: "SHELL" }],
                  providers: [],
                  services: [{ serviceType: "shell" }],
                },
              },
            ],
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    expect(getEffectivePluginManagerInventory(runtime)).toEqual({
      plugins: [
        {
          id: "official",
          name: "@elizaos/plugin-sql",
          status: "ready",
          enabled: true,
          source: "official",
          description: "SQL persistence",
          actions: 0,
          providers: 1,
          services: 1,
        },
        {
          id: "product",
          name: "doolittle-runtime",
          status: "loaded",
          enabled: true,
          source: "vendored",
          description: "Doolittle product plugin",
          actions: 1,
          providers: 0,
          services: 1,
        },
      ],
      categories: {
        official: 1,
        vendored: 1,
      },
      summary: {
        total: 2,
        enabled: 2,
        official: 1,
        vendored: 1,
        categories: 2,
      },
    });
  });

  it("derives plugin manager summary values when the native summary is missing", () => {
    const runtime = {
      getService(name: string) {
        if (name === "plugin_manager") {
          return {
            list: () => [
              { enabled: true, source: "official" },
              "placeholder",
              { enabled: false, source: "vendored" },
              { enabled: true, source: "vendored" },
            ],
            categories: () => ({ foundation: 1, adapter: 1 }),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    expect(getEffectivePluginManagerInventory(runtime)?.summary).toEqual({
      total: 4,
      enabled: 2,
      official: 1,
      vendored: 2,
      categories: 2,
    });
  });

  it("returns null inventory when the plugin manager bridge is unavailable", () => {
    const runtime = {
      getService() {
        return null;
      },
    } as unknown as RuntimeLike;

    expect(getEffectivePluginManagerInventory(runtime)).toBeNull();
  });
});
