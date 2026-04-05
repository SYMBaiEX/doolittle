import type { AppContext } from "@/runtime/bootstrap";

export function createIdentityTestContext(): AppContext {
  return {
    runtime: {},
    services: {
      personalities: {
        getActive: () => ({ id: "primary", name: "Primary" }),
        list: () => [{ id: "primary", name: "Primary" }],
        summary: () => ({ total: 1, names: ["Primary"] }),
        setActive: (id: string) => ({ id, name: `Set:${id}` }),
      },
      userProfiles: {
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
        configureModeling: (
          userId: string,
          config: Record<string, unknown>,
        ) => ({
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
      },
      sessions: {
        summary: () => ({ active: 2 }),
      },
      memory: {
        summary: (target: "memory" | "user") => ({ target, entries: 1 }),
      },
    },
  } as unknown as AppContext;
}
