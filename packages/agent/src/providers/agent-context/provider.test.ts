import { describe, expect, it } from "bun:test";
import type { Memory } from "@elizaos/core";
import type { AppServices } from "@/services";
import { createAgentContextProvider } from "./provider";

function createMemory(text: string, id = "memory-1"): Memory {
  return {
    id,
    roomId: "room-1",
    content: { text },
    createdAt: Date.now(),
  } as Memory;
}

function createServices() {
  let repoCalls = 0;
  const services = {
    personalities: {
      getActive: () => ({
        id: "persona-1",
        name: "Doolittle",
        description: "A focused assistant.",
        systemAddendum: "Stay concise.",
      }),
    },
    settings: {
      get: () => ({
        execution: { backend: "local" },
        model: { provider: "openai", model: "gpt-5" },
      }),
    },
    memory: {
      summary: (target: "memory" | "user") =>
        target === "memory"
          ? {
              entries: 2,
              characters: 10,
              preview: ["memory one", "memory two"],
            }
          : { entries: 1, characters: 5, preview: ["user note"] },
    },
    skills: {
      list: () => [
        {
          slug: "git-status",
          source: "workspace",
          commandName: "status",
          description: "Check repository status.",
        },
        {
          slug: "terminal-run",
          source: "workspace",
          description: "Run terminal commands.",
        },
      ],
    },
    contextFiles: {
      render: () => "context file summary",
    },
    workspace: {
      summary: () => "workspace tree summary",
    },
    terminal: {
      recent: (limit: number) =>
        Array.from({ length: Math.min(limit, 2) }, (_, index) => ({
          exitCode: index,
          command: `command-${index + 1}`,
        })),
    },
    repository: {
      status: async () => {
        repoCalls += 1;
        return "repository status summary";
      },
    },
    cron: {
      list: () => [
        {
          name: "nightly",
          status: "running",
          nextRunAt: "tomorrow",
        },
      ],
    },
    tools: {
      enabled: () => [
        {
          id: "tool-1",
          description: "Tool one",
        },
      ],
    },
    delegation: {
      list: () => [
        {
          title: "Delegate work",
          status: "running",
        },
      ],
      overview: () => ({
        total: 1,
        pending: 0,
        running: 1,
        completed: 0,
        failed: 0,
        cancelled: 0,
        activeWorkers: 1,
        aliveWorkers: 1,
        stalledWorkers: 0,
        concurrency: 1,
        byProfile: [{ profile: "default", count: 1 }],
        byPriority: [{ priority: "normal", count: 1 }],
        byOrchestration: [{ mode: "single", count: 1 }],
      }),
      workers: () => [
        {
          title: "Worker one",
          status: "active",
          alive: true,
          stalled: false,
          attempts: 1,
          maxAttempts: 3,
        },
      ],
    },
    userProfiles: {
      list: () => [
        {
          displayName: "User",
          userId: "user-1",
          preferences: [],
          facts: [],
          notes: [],
        },
      ],
    },
  } as unknown as AppServices;

  return {
    services,
    getRepoCalls: () => repoCalls,
  };
}

describe("agent context provider", () => {
  it("renders scoped context and caches repeated turns", async () => {
    const { services, getRepoCalls } = createServices();
    const provider = createAgentContextProvider(services);
    const message = createMemory("inspect repo files", "turn-1");

    const first = await provider.get({} as never, message, {} as never);
    const second = await provider.get({} as never, message, {} as never);

    expect(first.text).toContain("WORKSPACE CONTEXT");
    expect(first.text).toContain("REPOSITORY STATUS");
    expect(first.text).not.toContain("CRON JOBS");
    expect(first.data?.scope).toBe("local");
    expect(second.text).toBe(first.text);
    expect(getRepoCalls()).toBe(1);
  });

  it("includes full operational sections for delegation-heavy turns", async () => {
    const { services } = createServices();
    const provider = createAgentContextProvider(services);
    const message = createMemory(
      "review delegation queue and provider settings",
      "turn-2",
    );

    const result = await provider.get({} as never, message, {} as never);

    expect(result.data?.scope).toBe("full");
    expect(result.text).toContain("CRON JOBS");
    expect(result.text).toContain("TOOLS");
    expect(result.text).toContain("DELEGATION OVERVIEW");
    expect(result.text).toContain("USER PROFILES");
  });

  it("keeps simple turns lightweight", async () => {
    const { services } = createServices();
    const provider = createAgentContextProvider(services);
    const message = createMemory("hello there", "turn-3");

    const result = await provider.get({} as never, message, {} as never);

    expect(result.data?.scope).toBe("minimal");
    expect(result.text).toContain("ACTIVE PERSONALITY");
    expect(result.text).toContain("AVAILABLE SKILLS");
    expect(result.text).not.toContain("WORKSPACE CONTEXT");
  });
});
