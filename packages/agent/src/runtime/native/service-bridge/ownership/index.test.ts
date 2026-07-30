import { describe, expect, it } from "vitest";
import type { AppServices } from "@/services";
import type { RuntimeLike } from "../runtime";
import {
  activateEffectivePersonality,
  getEffectiveActivePersonality,
  getEffectiveAgentProfile,
  getEffectiveAgentProfileCard,
  getEffectiveExperienceSummary,
  getEffectiveGeneratedSkills,
  getEffectiveMemorySnapshot,
  getEffectivePersonalityList,
  getEffectivePersonalitySummary,
  getEffectiveRolodexSummary,
  getEffectiveUserBeliefs,
  getEffectiveUserEngagement,
  getEffectiveUserProfileCard,
  getEffectiveUserProfileSearch,
  getEffectiveUserProfileSummary,
  getEffectiveUserRelationship,
  getNativeEcosystemSnapshot,
  getNativeOwnershipControlPlane,
  getNativeOwnershipSnapshot,
  observeEffectiveAgentProfile,
  recallEffectiveUserProfile,
  rememberEffectiveUserProfile,
} from "./index";

function makeRuntime(services: Record<string, unknown> = {}): RuntimeLike {
  return {
    getService(name: string) {
      return services[name] ?? null;
    },
    getAllActions: () => [],
  } as RuntimeLike;
}

function makeServices(overrides: Partial<AppServices> = {}): AppServices {
  return {
    memory: {
      summary: (target: "memory" | "user") => ({
        target,
        entries: target === "memory" ? 3 : 1,
        characters: target === "memory" ? 50 : 10,
        preview: [target],
      }),
    },
    personalities: {
      getActive: () => ({ id: "agent", name: "Agent" }),
      list: () => [
        { id: "fallback", name: "Fallback" },
        { id: "agent", name: "Agent" },
      ],
      summary: () => ({
        total: 2,
        activeId: "agent",
        names: ["Fallback", "Agent"],
      }),
      setActive: (id: string) => ({ id, name: `Fallback:${id}` }),
    },
    userProfiles: {
      renderCards: (userId: string) => `fallback-card:${userId}`,
      recall: (userId: string, query: string) => [
        `fallback-recall:${userId}:${query}`,
      ],
      remember: (
        userId: string,
        kind: string,
        value: string,
        source?: string,
      ) => ({ userId, kind, value, source, owner: "fallback" }),
      observeAgent: (note: string, source?: string) => ({
        note,
        source,
        owner: "fallback",
      }),
      getAgent: () => ({ id: "fallback-agent" }),
      renderAgent: () => "fallback-agent-card",
      summary: () => ({
        totalProfiles: 2,
        agentName: "Fallback",
        recentProfiles: ["alice"],
        totalBeliefs: 0,
        totalBeliefSources: 0,
        activeRelationships: 0,
        trustedRelationships: 0,
        engagedProfiles: 0,
        relationshipStatusCounts: {
          new: 2,
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
      search: (query: string) => [{ name: `fallback:${query}` }],
      beliefs: () => ["fallback-belief"],
      relationship: () => ({ status: "unknown" }),
      engagement: () => ({ score: 0 }),
    },
    sessions: {
      summary: () => ({ totalSessions: 4, recentSessionIds: ["s-1"] }),
    },
    skillsHub: {
      summary: () => ({ total: 4 }),
    },
    ecosystem: {
      summary: () => ({ status: "fallback" }),
      benchmarkPacks: () => [],
      distributionChannels: () => [],
      modelingProfiles: () => [],
      optionalSkillPacks: () => [],
    },
    agentSdk: {
      snapshot: () => ({ skillCatalog: { total: 11, trending: ["browser"] } }),
      overview: async () => ({
        skillCatalog: { total: 11, trending: ["browser"] },
      }),
    },
    skills: {
      list: () => [{ slug: "tool/fallback" }],
      summary: () => ({
        total: 1,
        curated: 1,
        generated: 0,
        categories: [],
        roots: [],
      }),
    },
    trajectories: {
      listBundles: () => ["bundle-a"],
      exportLatest: () => ({ id: "bundle-latest" }),
    },
    skillSynthesis: {
      listGeneratedSkills: () => ["generated/fallback"],
    },
    delegation: {
      list: () => [],
      queueSummary: () => ({ pending: 0, activeWorkers: 0 }),
      create: () => ({ ok: true }),
      cancel: () => ({ ok: true }),
      get: () => ({ id: "task-1" }),
      listChildren: () => [],
      tree: () => ({ tree: [] }),
      aggregate: () => ({ aggregate: true }),
      requeue: () => ({ ok: true }),
      spawnChild: () => ({ ok: true }),
      supervise: async () => ({ ok: true }),
      overview: () => ({ total: 0 }),
    },
    nativeOwnership: {
      snapshot: async () => null,
    },
    settings: {
      get: () => ({ ui: { theme: "orange" } }),
    },
    web: {
      status: async () => ({
        provider: "basic",
        ready: false,
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
    ...overrides,
  } as unknown as AppServices;
}

describe("ownership helpers", () => {
  it("prefers native ownership and generated-skill helpers when available", () => {
    const runtime = makeRuntime({
      personality: {
        activeId: () => "native",
        get: (id: string) => ({ id, name: "Native" }),
        activate: (id: string) => ({ id, name: `Native:${id}` }),
        summary: () => ({
          total: 4,
          activeId: "operator",
          names: ["Operator", "Autonomous"],
        }),
        list: () => [{ id: "native", name: "Native" }],
      },
      rolodex: {
        card: (userId: string) => `native-card:${userId}`,
        recall: (userId: string, query: string) => [
          `native-recall:${userId}:${query}`,
        ],
        remember: (
          userId: string,
          kind: string,
          value: string,
          source?: string,
        ) => ({ userId, kind, value, source, owner: "native" }),
        observeAgent: (note: string, source?: string) => ({
          note,
          source,
          owner: "native",
        }),
        agentProfile: () => "native-agent",
        summary: () => ({
          totalProfiles: 3,
          agentName: "Native",
          recentProfiles: ["beta"],
          totalBeliefs: 2,
          totalBeliefSources: 1,
          activeRelationships: 1,
          trustedRelationships: 1,
          engagedProfiles: 1,
          relationshipStatusCounts: {
            new: 1,
            growing: 0,
            active: 1,
            trusted: 1,
          },
          topBeliefProfiles: [],
          topRelationships: [],
          topEngagements: [],
          topChannels: [],
          topSignals: [],
          recentSignals: ["native"],
        }),
        search: () => [{ name: "native-result" }],
        beliefs: () => ["native-belief"],
        relationship: () => ({ status: "trusted" }),
        engagement: () => ({ score: 99 }),
      },
      experience: {
        summary: () => ({
          sessions: { totalSessions: 9, recentSessionIds: ["n1", "n2", "n3"] },
          memory: {
            shared: {
              target: "memory",
              entries: 8,
              characters: 80,
              preview: ["native-memory"],
            },
            user: {
              target: "user",
              entries: 2,
              characters: 20,
              preview: ["native-user"],
            },
          },
        }),
      },
    });

    const services = makeServices();

    expect(getEffectiveMemorySnapshot(runtime, services, "memory")).toEqual({
      target: "memory",
      entries: 3,
      characters: 50,
      preview: ["memory"],
    });
    expect(getEffectivePersonalitySummary(runtime, services)).toEqual({
      total: 4,
      activeId: "operator",
      names: ["Operator", "Autonomous"],
    });
    expect(getEffectiveRolodexSummary(runtime, services)).toEqual({
      totalProfiles: 3,
      agentName: "Native",
      recentProfiles: ["beta"],
      totalBeliefs: 2,
      totalBeliefSources: 1,
      activeRelationships: 1,
      trustedRelationships: 1,
      engagedProfiles: 1,
      relationshipStatusCounts: {
        new: 1,
        growing: 0,
        active: 1,
        trusted: 1,
      },
      topBeliefProfiles: [],
      topRelationships: [],
      topEngagements: [],
      topChannels: [],
      topSignals: [],
      recentSignals: ["native"],
    });
    expect(getEffectivePersonalityList(runtime, services)).toEqual([
      { id: "native", name: "Native" },
    ]);
    expect(getEffectiveActivePersonality(runtime, services)).toEqual({
      id: "native",
      name: "Native",
    });
    expect(activateEffectivePersonality(runtime, services, "teacher")).toEqual({
      id: "teacher",
      name: "Native:teacher",
    });
    expect(getEffectiveUserProfileCard(runtime, services, "user-1")).toBe(
      "native-card:user-1",
    );
    expect(
      recallEffectiveUserProfile(runtime, services, "user-1", "query"),
    ).toEqual(["native-recall:user-1:query"]);
    expect(
      rememberEffectiveUserProfile(
        runtime,
        services,
        "user-1",
        "fact",
        "value",
        "test",
      ),
    ).toMatchObject({ owner: "native" });
    expect(
      observeEffectiveAgentProfile(runtime, services, "note", "test"),
    ).toMatchObject({ owner: "native" });
    expect(getEffectiveAgentProfile(runtime, services)).toBe("native-agent");
    expect(getEffectiveAgentProfileCard(runtime, services)).toBe(
      "native-agent",
    );
    expect(getEffectiveUserProfileSearch(runtime, services, "alpha")).toEqual([
      { name: "native-result" },
    ]);
    expect(getEffectiveUserBeliefs(runtime, services, "user-1")).toEqual([
      "native-belief",
    ]);
    expect(getEffectiveUserRelationship(runtime, services, "user-1")).toEqual({
      status: "trusted",
    });
    expect(getEffectiveUserEngagement(runtime, services, "user-1")).toEqual({
      score: 99,
    });
    expect(getEffectiveUserProfileSummary(runtime, services)).toEqual(
      getEffectiveRolodexSummary(runtime, services),
    );
    expect(getEffectiveGeneratedSkills(runtime, services)).toEqual([
      "generated/fallback",
    ]);
    expect(getEffectiveExperienceSummary(runtime, services)).toEqual({
      sessions: { totalSessions: 9, recentSessionIds: ["n1", "n2", "n3"] },
      memory: {
        shared: {
          target: "memory",
          entries: 8,
          characters: 80,
          preview: ["native-memory"],
        },
        user: {
          target: "user",
          entries: 2,
          characters: 20,
          preview: ["native-user"],
        },
      },
    });
  });

  it("falls back to product service summaries when native services are absent", () => {
    const runtime = makeRuntime();
    const services = makeServices();

    expect(getEffectiveMemorySnapshot(runtime, services, "memory")).toEqual({
      target: "memory",
      entries: 3,
      characters: 50,
      preview: ["memory"],
    });
    expect(getEffectivePersonalitySummary(runtime, services)).toEqual({
      total: 2,
      activeId: "agent",
      names: ["Fallback", "Agent"],
    });
    expect(getEffectiveRolodexSummary(runtime, services)).toEqual(
      services.userProfiles.summary(),
    );
    expect(getEffectivePersonalityList(runtime, services)).toEqual([
      { id: "fallback", name: "Fallback" },
      { id: "agent", name: "Agent" },
    ]);
    expect(getEffectiveActivePersonality(runtime, services)).toEqual({
      id: "agent",
      name: "Agent",
    });
    expect(activateEffectivePersonality(runtime, services, "teacher")).toEqual({
      id: "teacher",
      name: "Fallback:teacher",
    });
    expect(getEffectiveUserProfileCard(runtime, services, "user-2")).toBe(
      "fallback-card:user-2",
    );
    expect(
      recallEffectiveUserProfile(runtime, services, "user-2", "query"),
    ).toEqual(["fallback-recall:user-2:query"]);
    expect(
      rememberEffectiveUserProfile(
        runtime,
        services,
        "user-2",
        "fact",
        "value",
      ),
    ).toMatchObject({ owner: "fallback" });
    expect(
      observeEffectiveAgentProfile(runtime, services, "note"),
    ).toMatchObject({ owner: "fallback" });
    expect(getEffectiveAgentProfile(runtime, services)).toEqual({
      id: "fallback-agent",
    });
    expect(getEffectiveAgentProfileCard(runtime, services)).toBe(
      "fallback-agent-card",
    );
    expect(getEffectiveGeneratedSkills(runtime, services)).toEqual([
      "generated/fallback",
    ]);
    expect(getEffectiveUserProfileSearch(runtime, services, "alpha")).toEqual([
      { name: "fallback:alpha" },
    ]);
    expect(getEffectiveUserBeliefs(runtime, services, "user-2")).toEqual([
      "fallback-belief",
    ]);
    expect(getEffectiveExperienceSummary(runtime, services)).toEqual({
      sessions: { totalSessions: 4, recentSessionIds: ["s-1"] },
      memory: {
        shared: {
          target: "memory",
          entries: 3,
          characters: 50,
          preview: ["memory"],
        },
        user: {
          target: "user",
          entries: 1,
          characters: 10,
          preview: ["user"],
        },
      },
    });
  });

  it("builds native ownership control plane identity when services are provided", async () => {
    const runtime = makeRuntime();
    const services = makeServices();

    const controlPlane = getNativeOwnershipControlPlane(runtime, services, {
      falApiKey: "fal-key",
    } as never);

    expect(controlPlane.identity).toMatchObject({
      personality: {
        total: 2,
        activeId: "agent",
      },
      rolodex: {
        totalProfiles: 2,
        agentName: "Fallback",
      },
      experience: {
        sessions: { totalSessions: 4 },
      },
    });
    expect(controlPlane.pluginManager).toBeNull();
    expect(
      controlPlane.serviceResolution.map((entry) => entry.capability),
    ).toContain("knowledgeGraph");
  });

  it("builds ownership snapshot from native controls", async () => {
    const runtime = makeRuntime();
    const services = makeServices();

    const snapshot = await getNativeOwnershipSnapshot(runtime, services, {
      openAiApiKey: "openai-key",
      falApiKey: "fal-key",
    } as never);

    expect(snapshot.ui.active.name).toBe("orange");
    expect(snapshot.integration.browser.source).toBe("product");
    expect(snapshot.autonomous.alignment.foundationPackages).toContain(
      "@elizaos/agent",
    );
    expect(snapshot.forms).toMatchObject({
      available: false,
      source: "product",
    });
  });

  it("builds ecosystem snapshot with ownership fallback when native ownership is unavailable", async () => {
    const runtime = makeRuntime();
    const services = makeServices();

    const snapshot = await getNativeEcosystemSnapshot(
      runtime,
      services,
      { openAiApiKey: "openai-key", falApiKey: "fal-key" } as never,
      undefined,
      false,
    );

    expect(snapshot.runtime.latest).toMatch(/\d+\.\d+\.\d+/);
    expect(snapshot.runtime.beta).toBe("2.0.3-beta.7");
    expect(snapshot.packageAudit.runtime.latest).toBe(snapshot.runtime.latest);
    expect(snapshot.pluginCatalog.length).toBeGreaterThan(0);
    expect(snapshot.workspace.summary).toEqual(services.ecosystem.summary());
    expect(snapshot.ownership.ui.themes.length).toBeGreaterThan(0);
    expect(snapshot.ownership.integration.browser.source).toBe("product");
    expect(snapshot.ownership.media.tts.provider).toBe("fal");
    expect(snapshot.ownership).toHaveProperty("autonomous.research");
    expect(snapshot.accounts.codex).toBeDefined();
  });
});
