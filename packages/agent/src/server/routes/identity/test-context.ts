import {
  DOOLITTLE_EXPERIENCE_SERVICE,
  DOOLITTLE_PERSONALITY_SERVICE,
  DOOLITTLE_ROLODEX_SERVICE,
} from "@doolittle/contracts";
import type { AppContext } from "@/runtime/bootstrap";

export function createIdentityTestContext(
  nativeOverrides: Record<string, unknown> = {},
): AppContext {
  const personalities = {
    get: (id: string) => ({ id, name: id === "primary" ? "Primary" : id }),
    getActive: () => ({ id: "primary", name: "Primary" }),
    list: () => [{ id: "primary", name: "Primary" }],
    summary: () => ({ total: 1, names: ["Primary"] }),
    setActive: (id: string) => ({ id, name: `Set:${id}` }),
  };
  const userProfiles = {
    get: (userId: string) => ({ id: userId }),
    list: () => [{ id: "user-1" }],
    renderCards: (userId: string) => ({ userId, kind: "card" }),
    recall: (userId: string, query: string) => [{ userId, query }],
    summary: () => ({ total: 1 }),
    search: (query: string, limit: number) => [{ query, limit }],
    beliefs: (userId: string) => [{ userId, belief: "prefers tests" }],
    relationship: (userId: string) => ({ userId, trust: "high" }),
    engagement: (userId: string) => ({ userId, score: 0.8 }),
    getAgent: () => ({ id: "agent-profile" }),
    renderAgent: () => ({ id: "agent-card" }),
    addNote: (userId: string, note: string, source?: string) => ({
      userId,
      note,
      source,
    }),
    remember: (
      userId: string,
      kind: string,
      value: string,
      source?: string,
    ) => ({ userId, kind, value, source }),
    setMode: (userId: string, mode: "local" | "hybrid") => ({
      userId,
      mode,
    }),
    configureModeling: (userId: string, config: Record<string, unknown>) => ({
      userId,
      config,
    }),
    context: (userId: string, query: string) => ({ userId, query }),
    conclude: (
      userId: string,
      query: string,
      conclusion: string,
      source?: string,
    ) => ({
      userId,
      query,
      conclusion,
      source,
    }),
    observeAgent: (note: string, source?: string) => ({ note, source }),
    seedAgent: (input: Record<string, unknown>) => input,
  };
  const sessions = {
    summary: () => ({ active: 2 }),
  };
  const memory = {
    summary: (target: "memory" | "user") => ({ target, entries: 1 }),
  };

  const nativeServices: Record<string, Record<string, unknown>> = {
    [DOOLITTLE_PERSONALITY_SERVICE]: {
      activeId: () => personalities.getActive().id,
      get: personalities.get,
      activate: personalities.setActive,
      list: personalities.list,
      summary: personalities.summary,
    },
    [DOOLITTLE_ROLODEX_SERVICE]: {
      list: userProfiles.list,
      get: userProfiles.get,
      card: userProfiles.renderCards,
      recall: userProfiles.recall,
      remember: userProfiles.remember,
      observeAgent: userProfiles.observeAgent,
      observe: (userId: string, message: string, source?: string) =>
        userProfiles.remember(userId, "note", message, source),
      context: userProfiles.context,
      conclude: userProfiles.conclude,
      setMode: userProfiles.setMode,
      configureModeling: userProfiles.configureModeling,
      seedAgent: userProfiles.seedAgent,
      agentProfile: userProfiles.renderAgent,
      summary: userProfiles.summary,
      search: userProfiles.search,
      beliefs: userProfiles.beliefs,
      relationship: userProfiles.relationship,
      engagement: userProfiles.engagement,
    },
    [DOOLITTLE_EXPERIENCE_SERVICE]: {
      summary: () => ({
        sessions: sessions.summary(),
        memory: {
          shared: memory.summary("memory"),
        },
      }),
    },
  };

  const fixtureServiceNames: Record<string, string> = {
    experience: DOOLITTLE_EXPERIENCE_SERVICE,
    personality: DOOLITTLE_PERSONALITY_SERVICE,
    rolodex: DOOLITTLE_ROLODEX_SERVICE,
  };

  for (const [name, override] of Object.entries(nativeOverrides)) {
    const serviceName = fixtureServiceNames[name] ?? name;
    nativeServices[serviceName] = {
      ...(nativeServices[serviceName] ?? {}),
      ...(override as Record<string, unknown>),
    };
  }

  return {
    runtime: {
      getService: (name: string) => nativeServices[name] ?? null,
      getAllActions: () => [],
    },
    services: {
      personalities,
      userProfiles,
      sessions,
      memory,
    },
  } as unknown as AppContext;
}
