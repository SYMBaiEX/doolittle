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
      summary: () => ({
        workspaceTotal: 4,
        catalogProjected: true,
        catalogTotal: 11,
      }),
    },
    ecosystem: {
      summary: () => ({ status: "fallback" }),
      benchmarkPacks: () => [],
      distributionChannels: () => [],
      modelingProfiles: () => [],
      optionalSkillPacks: () => [],
    },
    agentSdk: {
      snapshot: () => ({}),
      overview: async () => ({}),
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
    trajectoryEvaluation: {
      listBundles: () => ["bundle-a"],
      exportLatest: () => ({ id: "bundle-latest" }),
    },
    skillSynthesis: {
      listGeneratedSkills: () => ["generated/fallback"],
    },
    delegationProjection: {
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

function makeRequiredIdentityRuntime(services: AppServices): RuntimeLike {
  return makeRuntime({
    personality: {
      activeId: () => services.personalities.getActive().id,
      get: (id: string) => services.personalities.get(id),
      activate: (id: string) => services.personalities.setActive(id),
      summary: () => services.personalities.summary(),
      list: () => services.personalities.list(),
    },
    rolodex: {
      card: (userId: string) => services.userProfiles.renderCards(userId),
      recall: (userId: string, query: string) =>
        services.userProfiles.recall(userId, query),
      remember: (
        userId: string,
        kind: string,
        value: string,
        source?: string,
      ) => services.userProfiles.remember(userId, kind as never, value, source),
      observeAgent: (note: string, source?: string) =>
        services.userProfiles.observeAgent(note, source),
      agentProfile: () => services.userProfiles.renderAgent(),
      summary: () => services.userProfiles.summary(),
      search: (query: string, limit?: number) =>
        services.userProfiles.search(query, limit),
      beliefs: (userId: string) => services.userProfiles.beliefs(userId),
      relationship: (userId: string) =>
        services.userProfiles.relationship(userId),
      engagement: (userId: string) => services.userProfiles.engagement(userId),
    },
    experience: {
      summary: () => ({
        sessions: services.sessions.summary(),
        memory: {
          shared: services.memory.summary("memory"),
        },
      }),
    },
    browser: {
      status: () => services.web.status(),
    },
    coding_agent: {
      read: () => "",
      write: () => undefined,
      search: () => [],
      repoStatus: async () => ({}),
      repoDiff: async () => ({}),
      repoLog: async () => [],
      run: async () => ({}),
      tasks: () => [],
    },
    AGENT_SKILLS_SERVICE: {
      getLoadedSkills: () => [],
    },
    ORCHESTRATOR_TASK_SERVICE: {},
    trajectories: {
      isEnabled: () => true,
      listTrajectories: () => ({ trajectories: [], total: 0 }),
      exportTrajectories: async () => ({
        data: "",
        filename: "trajectories.jsonl",
        mimeType: "application/x-ndjson",
      }),
    },
    mcp: {
      status: () => services.mcp.status(),
      getCachedTools: () => services.mcp.getCachedTools(),
    },
  });
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
    expect(getEffectivePersonalitySummary(runtime)).toEqual({
      total: 4,
      activeId: "operator",
      names: ["Operator", "Autonomous"],
    });
    expect(getEffectiveRolodexSummary(runtime)).toEqual({
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
    expect(getEffectivePersonalityList(runtime)).toEqual([
      { id: "native", name: "Native" },
    ]);
    expect(getEffectiveActivePersonality(runtime)).toEqual({
      id: "native",
      name: "Native",
    });
    expect(activateEffectivePersonality(runtime, "teacher")).toEqual({
      id: "teacher",
      name: "Native:teacher",
    });
    expect(getEffectiveUserProfileCard(runtime, "user-1")).toBe(
      "native-card:user-1",
    );
    expect(recallEffectiveUserProfile(runtime, "user-1", "query")).toEqual([
      "native-recall:user-1:query",
    ]);
    expect(
      rememberEffectiveUserProfile(runtime, "user-1", "fact", "value", "test"),
    ).toMatchObject({ owner: "native" });
    expect(observeEffectiveAgentProfile(runtime, "note", "test")).toMatchObject(
      { owner: "native" },
    );
    expect(getEffectiveAgentProfile(runtime)).toBe("native-agent");
    expect(getEffectiveAgentProfileCard(runtime)).toBe("native-agent");
    expect(getEffectiveUserProfileSearch(runtime, "alpha")).toEqual([
      { name: "native-result" },
    ]);
    expect(getEffectiveUserBeliefs(runtime, "user-1")).toEqual([
      "native-belief",
    ]);
    expect(getEffectiveUserRelationship(runtime, "user-1")).toEqual({
      status: "trusted",
    });
    expect(getEffectiveUserEngagement(runtime, "user-1")).toEqual({
      score: 99,
    });
    expect(getEffectiveUserProfileSummary(runtime)).toEqual(
      getEffectiveRolodexSummary(runtime),
    );
    expect(getEffectiveGeneratedSkills(runtime, services)).toEqual([
      "generated/fallback",
    ]);
    expect(getEffectiveExperienceSummary(runtime)).toEqual({
      sessions: { totalSessions: 9, recentSessionIds: ["n1", "n2", "n3"] },
      memory: {
        shared: {
          target: "memory",
          entries: 8,
          characters: 80,
          preview: ["native-memory"],
        },
      },
    });
  });

  it("fails clearly instead of bypassing missing Eliza identity services", () => {
    const runtime = makeRuntime();
    const services = makeServices();

    expect(getEffectiveMemorySnapshot(runtime, services, "memory")).toEqual({
      target: "memory",
      entries: 3,
      characters: 50,
      preview: ["memory"],
    });
    expect(() => getEffectivePersonalitySummary(runtime)).toThrow(
      "Required Eliza service personality is unavailable.",
    );
    expect(() => getEffectivePersonalityList(runtime)).toThrow(
      "Required Eliza service personality is unavailable.",
    );
    expect(() => getEffectiveActivePersonality(runtime)).toThrow(
      "Required Eliza service personality is unavailable.",
    );
    expect(() => activateEffectivePersonality(runtime, "teacher")).toThrow(
      "Required Eliza service personality is unavailable.",
    );
    expect(() => getEffectiveRolodexSummary(runtime)).toThrow(
      "Required Eliza service rolodex is unavailable.",
    );
    expect(() => getEffectiveUserProfileCard(runtime, "user-2")).toThrow(
      "Required Eliza service rolodex is unavailable.",
    );
    expect(() =>
      recallEffectiveUserProfile(runtime, "user-2", "query"),
    ).toThrow("Required Eliza service rolodex is unavailable.");
    expect(() =>
      rememberEffectiveUserProfile(runtime, "user-2", "fact", "value"),
    ).toThrow("Required Eliza service rolodex is unavailable.");
    expect(() => observeEffectiveAgentProfile(runtime, "note")).toThrow(
      "Required Eliza service rolodex is unavailable.",
    );
    expect(() => getEffectiveAgentProfile(runtime)).toThrow(
      "Required Eliza service rolodex is unavailable.",
    );
    expect(() => getEffectiveAgentProfileCard(runtime)).toThrow(
      "Required Eliza service rolodex is unavailable.",
    );
    expect(getEffectiveGeneratedSkills(runtime, services)).toEqual([
      "generated/fallback",
    ]);
    expect(() => getEffectiveUserProfileSearch(runtime, "alpha")).toThrow(
      "Required Eliza service rolodex is unavailable.",
    );
    expect(() => getEffectiveUserBeliefs(runtime, "user-2")).toThrow(
      "Required Eliza service rolodex is unavailable.",
    );
    expect(() => getEffectiveExperienceSummary(runtime)).toThrow(
      "Required Eliza service experience is unavailable.",
    );
  });

  it("builds native ownership control plane identity when services are provided", async () => {
    const services = makeServices();
    const runtime = makeRequiredIdentityRuntime(services);

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
    const services = makeServices();
    const runtime = makeRequiredIdentityRuntime(services);

    const snapshot = await getNativeOwnershipSnapshot(runtime, services, {
      openAiApiKey: "openai-key",
      falApiKey: "fal-key",
    } as never);

    expect(snapshot.ui.active.name).toBe("orange");
    expect(snapshot.integration.browser.source).toBe("native");
    expect(snapshot.autonomous.alignment.foundationPackages).toContain(
      "@elizaos/agent",
    );
    expect(snapshot.forms).toMatchObject({
      available: false,
      source: "unavailable",
    });
  });

  it("builds ecosystem snapshot with ownership fallback when native ownership is unavailable", async () => {
    const services = makeServices();
    const runtime = makeRequiredIdentityRuntime(services);

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
    expect(snapshot.ownership.integration.browser.source).toBe("native");
    expect(snapshot.ownership.media.tts.provider).toBe("fal");
    expect(snapshot.ownership).toHaveProperty("autonomous.research");
    expect(snapshot.accounts.codex).toBeDefined();
  });
});
