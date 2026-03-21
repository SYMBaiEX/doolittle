import { describe, expect, it } from "bun:test";
import type { AppServices } from "@/services";
import type { RuntimeLike } from "./service-bridge";
import {
  getAutonomousControlPlane,
  getEffectiveDelegationChildren,
  getEffectiveDelegationTask,
  getEffectiveDelegationTree,
  getEffectiveExperienceSummary,
  getEffectiveMemorySnapshot,
  getEffectiveMessagingTransportInventory,
  getEffectivePersonalitySummary,
  getEffectivePluginManagerInventory,
  getEffectiveRolodexSummary,
  getEffectiveTransportInventory,
  getNativeMessagingTransportState,
  getNativeTransportControlPlane,
  retryEffectiveDelegationTask,
} from "./service-bridge";

describe("getEffectiveMessagingTransportInventory", () => {
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
    expect(controlPlane.totals.nativeServices).toBe(4);
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
