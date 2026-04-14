import { describe, expect, it } from "bun:test";
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
          case "knowledge":
            return { summary: () => ({ entries: 1 }) };
          case "shell":
            return { status: () => ({ ready: true }) };
          case "agent_skills":
            return { list: () => [] };
          case "plugin_manager":
            return { list: () => [], categories: () => ({}) };
          default:
            return null;
        }
      },
    } as unknown as RuntimeLike;

    expect(getEffectiveServiceResolution(runtime)).toEqual([
      {
        capability: "knowledge",
        nativeService: "knowledge",
        source: "native",
        ownership: "plugin",
        fallback: "documents + memory + sessions",
        available: true,
      },
      {
        capability: "personality",
        nativeService: "personality",
        source: "product",
        ownership: "product",
        fallback: "personalities",
        available: false,
      },
      {
        capability: "rolodex",
        nativeService: "rolodex",
        source: "product",
        ownership: "product",
        fallback: "userProfiles",
        available: false,
      },
      {
        capability: "experience",
        nativeService: "experience",
        source: "product",
        ownership: "product",
        fallback: "sessions + memory",
        available: false,
      },
      {
        capability: "shell",
        nativeService: "shell",
        source: "native",
        ownership: "plugin",
        fallback: "terminal",
        available: true,
      },
      {
        capability: "browser",
        nativeService: "browser",
        source: "product",
        ownership: "product",
        fallback: "web",
        available: false,
      },
      {
        capability: "mcp",
        nativeService: "mcp",
        source: "product",
        ownership: "product",
        fallback: "mcp",
        available: false,
      },
      {
        capability: "cron",
        nativeService: "cron",
        source: "product",
        ownership: "product",
        fallback: "cron",
        available: false,
      },
      {
        capability: "agentSkills",
        nativeService: "agent_skills",
        source: "native",
        ownership: "plugin",
        fallback: "skills + skillSynthesis",
        available: true,
      },
      {
        capability: "trajectoryLogger",
        nativeService: "trajectory_logger",
        source: "product",
        ownership: "product",
        fallback: "trajectories",
        available: false,
      },
      {
        capability: "agentOrchestrator",
        nativeService: "agent_orchestrator",
        source: "product",
        ownership: "product",
        fallback: "delegation",
        available: false,
      },
      {
        capability: "codingAgent",
        nativeService: "coding_agent",
        source: "product",
        ownership: "product",
        fallback: "workspace + repository + terminal + delegation",
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
