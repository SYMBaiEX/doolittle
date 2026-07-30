import type { Memory, Provider } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import type { AppServices } from "@/services";
import { createAgentContextProviders } from "./provider";

function createMemory(
  id = "turn-1",
  roomId = "sdk-room",
  source = "api",
): Memory {
  return {
    id,
    roomId,
    entityId: "entity-1",
    content: { text: "hello", source },
    createdAt: Date.now(),
    metadata: {
      sessionId: "session-1",
      doolittle: { userId: "alice" },
    },
  } as unknown as Memory;
}

function provider(providers: Provider[], name: string): Provider {
  const result = providers.find((entry) => entry.name === name);
  if (!result) throw new Error(`Missing provider: ${name}`);
  return result;
}

function createRuntime() {
  return {
    getAllActions: () => [
      {
        name: "READ_FILE",
        description: "Read through the Eliza action registry.",
      },
    ],
    getService: (name: string) => {
      if (name === "cron") {
        return {
          list: () => [{ name: "nightly", status: "running" }],
        };
      }
      if (name === "AGENT_SKILLS_SERVICE") {
        return {
          getLoadedSkills: () => [
            {
              slug: "sdk-release",
              name: "SDK Release",
              description: "Ship through the official Eliza skill runtime.",
              path: "/managed/sdk-release",
              content: "# SDK Release",
              source: "managed",
              sourceDir: "/managed",
              precedence: 80,
            },
          ],
        };
      }
      return null;
    },
  };
}

function createServices() {
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
          ? { entries: 2, characters: 10, preview: ["memory one"] }
          : { entries: 1, characters: 5, preview: ["user note"] },
    },
    sessions: {
      metadata: () => ({ title: "Project discussion", continuityKey: "root" }),
      projectIdForSession: (sessionId: string) =>
        sessionId === "session-1" ? "project-1" : undefined,
      getProject: () => ({
        id: "project-1",
        name: "Desktop",
        description: "Desktop work",
        instructions: "Keep it focused.",
        primaryPath: "/workspace/desktop",
      }),
      projectResources: () => [
        {
          id: "resource-1",
          projectId: "project-1",
          kind: "folder",
          label: "Desktop source",
          value: "/workspace/desktop/src",
        },
      ],
    },
    workspace: {
      root: () => "/workspace/demo",
      summary: () => "workspace tree summary",
    },
    acp: {
      latestEditorContext: (workspaceRoot: string) =>
        workspaceRoot === "/workspace/demo"
          ? {
              sessionId: "acp:desktop",
              workspaceRoot,
              updatedAt: "2026-07-28T12:00:00.000Z",
              context: {
                path: "src/App.tsx",
                uri: "file:///workspace/demo/src/App.tsx",
                language: "typescript",
                content: "export function App() {}",
                version: 3,
                dirty: true,
                focused: true,
                cursor: { lineNumber: 1, column: 8 },
                visibleRanges: [
                  {
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: 20,
                    endColumn: 1,
                  },
                ],
              },
            }
          : undefined,
    },
    skills: {
      list: () => [
        {
          slug: "sdk-release",
          source: "managed",
          description: "Ship through the official Eliza skill runtime.",
        },
      ],
    },
    contextFiles: { render: () => "context file summary" },
    terminal: { recent: () => [{ exitCode: 0, command: "git status" }] },
    repository: { status: async () => "repository status summary" },
    cron: {
      list: () => {
        throw new Error("legacy cron must not be used");
      },
    },
    tools: {
      list: () => [
        {
          id: "legacy-tool",
          name: "Legacy Tool",
          category: "runtime",
          description: "Must not own runtime availability.",
          enabled: true,
        },
      ],
      summary: () => ({
        total: 1,
        enabled: 1,
        disabled: 0,
        categories: [],
        transports: [],
      }),
    },
    delegation: {
      list: () => [{ title: "Delegate work", status: "running" }],
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
        byProfile: [],
        byPriority: [],
        byOrchestration: [],
      }),
      workers: () => [],
    },
    userProfiles: {
      list: () => [],
      get: () => ({
        displayName: "Alex",
        aliases: [],
        facts: ["prefers SDK-native agents"],
        preferences: ["uses Bun"],
      }),
    },
  } as unknown as AppServices;

  return services;
}

describe("agent context providers", () => {
  it("declares core, workspace, and operations contexts for SDK routing", () => {
    const providers = createAgentContextProviders(createServices());
    const core = provider(providers, "DOOLITTLE_CORE_CONTEXT_PROVIDER");
    const workspace = provider(
      providers,
      "DOOLITTLE_WORKSPACE_CONTEXT_PROVIDER",
    );
    const operations = provider(
      providers,
      "DOOLITTLE_OPERATIONS_CONTEXT_PROVIDER",
    );

    expect(core.alwaysInResponseState).toBe(true);
    expect(core.contexts).toEqual(["general", "memory", "character", "state"]);
    expect(core.cacheScope).toBe("room");
    expect(workspace.contextGate).toEqual({
      anyOf: ["code", "files", "terminal"],
    });
    expect(operations.contextGate).toEqual({
      anyOf: ["automation", "settings", "admin"],
    });
    expect(workspace.cacheScope).toBe("turn");
    expect(operations.cacheScope).toBe("turn");
  });

  it("renders selected project context from the message session", async () => {
    const core = provider(
      createAgentContextProviders(createServices()),
      "DOOLITTLE_CORE_CONTEXT_PROVIDER",
    );

    const result = await core.get({} as never, createMemory(), {} as never);

    expect(result.text).toContain("SESSION CONTEXT");
    expect(result.text).toContain("sessionId=session-1");
    expect(result.text).toContain("savedDisplayName=Alex");
    expect(result.text).toContain("PROJECT CONTEXT");
    expect(result.text).toContain("projectName=Desktop");
    expect(result.text).toContain("[folder] Desktop source");
    expect(result.data?.hasProjectContext).toBe(true);
  });

  it("keeps workspace and operations output out of the always-on core", async () => {
    const providers = createAgentContextProviders(createServices());
    const message = createMemory();

    const core = await provider(
      providers,
      "DOOLITTLE_CORE_CONTEXT_PROVIDER",
    ).get({} as never, message, {} as never);
    const workspace = await provider(
      providers,
      "DOOLITTLE_WORKSPACE_CONTEXT_PROVIDER",
    ).get({} as never, message, {} as never);
    const operations = await provider(
      providers,
      "DOOLITTLE_OPERATIONS_CONTEXT_PROVIDER",
    ).get(createRuntime() as never, message, {} as never);

    expect(core.text).not.toContain("WORKSPACE CONTEXT");
    expect(core.text).not.toContain("CRON JOBS");
    expect(workspace.text).toContain("WORKSPACE CONTEXT");
    expect(workspace.text).toContain("repository status summary");
    expect(operations.text).toContain("CRON JOBS");
    expect(operations.text).toContain(
      "READ_FILE: Read through the Eliza action registry.",
    );
    expect(operations.text).not.toContain("legacy-tool");
  });

  it("renders the runtime-bound Eliza skill inventory in workspace context", async () => {
    const workspace = provider(
      createAgentContextProviders(createServices()),
      "DOOLITTLE_WORKSPACE_CONTEXT_PROVIDER",
    );

    const result = await workspace.get(
      createRuntime() as never,
      createMemory(),
      {} as never,
    );

    expect(result.text).toContain(
      "sdk-release [managed]: Ship through the official Eliza skill runtime.",
    );
    expect(result.data?.skillsCount).toBe(1);
  });

  it("adds bounded latest ACP editor state only to desktop turns", async () => {
    const core = provider(
      createAgentContextProviders(createServices()),
      "DOOLITTLE_CORE_CONTEXT_PROVIDER",
    );

    const desktop = await core.get(
      {} as never,
      createMemory("desktop-turn", "desktop-room", "desktop"),
      {} as never,
    );
    const api = await core.get(
      {} as never,
      createMemory("api-turn", "api-room", "api"),
      {} as never,
    );

    expect(desktop.text).toContain("ACP EDITOR CONTEXT");
    expect(desktop.text).toContain("path=src/App.tsx");
    expect(desktop.text).toContain("export function App() {}");
    expect(desktop.data?.hasEditorContext).toBe(true);
    expect(api.text).not.toContain("ACP EDITOR CONTEXT");
    expect(api.data?.hasEditorContext).toBe(false);
  });

  it("reports operations context unavailable without the Trigger runtime", async () => {
    const operations = provider(
      createAgentContextProviders(createServices()),
      "DOOLITTLE_OPERATIONS_CONTEXT_PROVIDER",
    );

    const result = await operations.get(
      { getService: () => null } as never,
      createMemory(),
      {} as never,
    );

    expect(result.text).toBe("OPERATIONS CONTEXT\n(unavailable)");
    expect(result.data?.error).toBe("Trigger runtime service is not ready.");
  });
});
