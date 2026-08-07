import {
  DOOLITTLE_BROWSER_SERVICE,
  DOOLITTLE_EXPERIENCE_SERVICE,
  DOOLITTLE_MCP_SERVICE,
  DOOLITTLE_OPERATOR_PLANNING_SERVICE,
  DOOLITTLE_PERSONALITY_SERVICE,
  DOOLITTLE_ROLODEX_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
} from "@doolittle/contracts";
import { KNOWLEDGE_GRAPH_SERVICE } from "@elizaos/agent/services/knowledge-graph/index";
import { SECRETS_SERVICE_TYPE } from "@elizaos/core";
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
          case "hooks":
            return { getSnapshot: () => ({ hooks: [] }) };
          case "memoryStorage":
            return { storeLongTermMemory: async () => ({}) };
          case KNOWLEDGE_GRAPH_SERVICE:
            return { getEntityStore: () => ({}) };
          case "pdf":
            return {
              convertPdfToTextWithOptions: async () => ({ success: true }),
            };
          case DOOLITTLE_SHELL_SERVICE:
            return { status: () => ({ ready: true }) };
          case "cron":
            return { list: async () => [], runs: async () => [] };
          case "AGENT_SKILLS_SERVICE":
            return { getLoadedSkills: () => [] };
          case "plugin_manager":
            return { list: () => [], categories: () => ({}) };
          case "tool_policy":
            return { getAllowedTools: () => [] };
          case SECRETS_SERVICE_TYPE:
            return { getGlobal: async () => null };
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
        requirement: "required official Eliza PairingService",
        available: true,
      },
      {
        capability: "hooks",
        nativeService: "hooks",
        source: "native",
        ownership: "plugin",
        requirement: "required official Eliza HookService",
        available: true,
      },
      {
        capability: "memoryStorage",
        nativeService: "memoryStorage",
        source: "native",
        ownership: "plugin",
        requirement: "required Eliza memory storage service",
        available: true,
      },
      {
        capability: "knowledgeGraph",
        nativeService: KNOWLEDGE_GRAPH_SERVICE,
        source: "native",
        ownership: "plugin",
        requirement: "required official Eliza knowledge graph service",
        available: true,
      },
      {
        capability: "pdf",
        nativeService: "pdf",
        source: "native",
        ownership: "plugin",
        requirement: "required official Eliza PDF service",
        available: true,
      },
      {
        capability: "personality",
        nativeService: DOOLITTLE_PERSONALITY_SERVICE,
        source: "unavailable",
        ownership: "plugin",
        requirement: "required Doolittle personality projection",
        available: false,
      },
      {
        capability: "rolodex",
        nativeService: DOOLITTLE_ROLODEX_SERVICE,
        source: "unavailable",
        ownership: "plugin",
        requirement: "required Doolittle rolodex projection",
        available: false,
      },
      {
        capability: "experience",
        nativeService: DOOLITTLE_EXPERIENCE_SERVICE,
        source: "unavailable",
        ownership: "plugin",
        requirement: "required Doolittle experience projection",
        available: false,
      },
      {
        capability: "shell",
        nativeService: DOOLITTLE_SHELL_SERVICE,
        source: "native",
        ownership: "plugin",
        requirement: "required Eliza shell service",
        available: true,
      },
      {
        capability: "browser",
        nativeService: DOOLITTLE_BROWSER_SERVICE,
        source: "unavailable",
        ownership: "plugin",
        requirement: "required Eliza browser service",
        available: false,
      },
      {
        capability: "mcp",
        nativeService: DOOLITTLE_MCP_SERVICE,
        source: "unavailable",
        ownership: "plugin",
        requirement: "required Eliza MCP service",
        available: false,
      },
      {
        capability: "automation",
        nativeService: "cron",
        source: "native",
        ownership: "plugin",
        requirement: "required Eliza Trigger Task projection",
        available: true,
      },
      {
        capability: "agentSkills",
        nativeService: "AGENT_SKILLS_SERVICE",
        source: "native",
        ownership: "plugin",
        requirement: "required official Eliza Agent Skills service",
        available: true,
      },
      {
        capability: "trajectoryLogger",
        nativeService: "trajectories",
        source: "unavailable",
        ownership: "plugin",
        requirement: "required official Eliza trajectories service",
        available: false,
      },
      {
        capability: "agentOrchestrator",
        nativeService: "ORCHESTRATOR_TASK_SERVICE",
        source: "unavailable",
        ownership: "plugin",
        requirement: "required official Eliza Agent Orchestrator service",
        available: false,
      },
      {
        capability: "codingAgent",
        nativeService: "doolittle_coding_agent",
        source: "unavailable",
        ownership: "plugin",
        requirement: "required Doolittle coding workspace service",
        available: false,
      },
      {
        capability: "pluginManager",
        nativeService: "plugin_manager",
        source: "native",
        ownership: "plugin",
        requirement: "required official Eliza plugin manager service",
        available: true,
      },
      {
        capability: "toolPolicy",
        nativeService: "tool_policy",
        source: "native",
        ownership: "plugin",
        requirement: "required official Eliza ToolPolicyService",
        available: true,
      },
      {
        capability: "secrets",
        nativeService: SECRETS_SERVICE_TYPE,
        source: "native",
        ownership: "plugin",
        requirement: "required official Eliza SecretsService",
        available: true,
      },
      {
        capability: "actionPlanning",
        nativeService: "planning",
        source: "native",
        ownership: "plugin",
        requirement: "required official Eliza planning service",
        available: true,
      },
      {
        capability: "operatorPlanning",
        nativeService: DOOLITTLE_OPERATOR_PLANNING_SERVICE,
        source: "native",
        ownership: "plugin",
        requirement: "required Eliza operator-plan projection",
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
