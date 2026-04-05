import { describe, expect, it } from "bun:test";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../chat";
import { handleRuntimeWorkspaceCommand } from "./runtime-workspace-commands";

function createInput(message: string): ChatTurnRequest {
  return {
    message,
    userId: "user-1",
    roomId: "cli:user-1",
    source: "cli",
  };
}

describe("runtime workspace command router", () => {
  it("queues prompts and handles workspace IO through product services", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const context = {
      runtime: {},
      services: {
        delegation: {
          create: (input: Record<string, unknown>) => input,
        },
        contextFiles: {
          render: () => "context-file-a\ncontext-file-b",
        },
        workspace: {
          summary: (limit: number) => `workspace summary ${limit}`,
          read: (path: string) => `read:${path}`,
          search: (query: string) => [
            { path: "src/index.ts", matches: [`match:${query}`] },
          ],
          write: (path: string, content: string) => {
            writes.push({ path, content });
            return `/workspace/${path}`;
          },
        },
        settings: {
          get: () => ({
            agent: {
              runDepth: "standard",
              maxIterations: 8,
              toolProgressMode: "new",
            },
          }),
          set: () => ({
            agent: {
              runDepth: "deep",
              maxIterations: 16,
              toolProgressMode: "verbose",
            },
          }),
        },
      },
    } as unknown as AgentExecutionContext;

    const queued = await handleRuntimeWorkspaceCommand(
      createInput("/queue draft release notes"),
      "/queue draft release notes",
      context,
    );
    const contextFiles = await handleRuntimeWorkspaceCommand(
      createInput("/context"),
      "/context",
      context,
    );
    const read = await handleRuntimeWorkspaceCommand(
      createInput("/workspace read README.md"),
      "/workspace read README.md",
      context,
    );
    const search = await handleRuntimeWorkspaceCommand(
      createInput("/workspace search release"),
      "/workspace search release",
      context,
    );
    const write = await handleRuntimeWorkspaceCommand(
      createInput("/workspace write notes/todo.md :: ship it"),
      "/workspace write notes/todo.md :: ship it",
      context,
    );

    expect(queued).toContain('"objective": "draft release notes"');
    expect(contextFiles).toBe("context-file-a\ncontext-file-b");
    expect(read).toBe("read:README.md");
    expect(search).toContain("src/index.ts");
    expect(write).toBe("Wrote /workspace/notes/todo.md.");
    expect(writes).toEqual([{ path: "notes/todo.md", content: "ship it" }]);
  });

  it("updates run depth and tool progress settings", async () => {
    const setCalls: Array<{ path: string; value: unknown }> = [];
    const state = {
      agent: {
        runDepth: "standard",
        maxIterations: 8,
        toolProgressMode: "new",
      },
    };
    const context = {
      runtime: {},
      services: {
        settings: {
          get: () => ({ agent: { ...state.agent } }),
          set: (path: string, value: unknown) => {
            setCalls.push({ path, value });
            if (path === "agent.runDepth") {
              state.agent.runDepth = value as typeof state.agent.runDepth;
            }
            if (path === "agent.maxIterations") {
              state.agent.maxIterations = value as number;
            }
            if (path === "agent.toolProgressMode") {
              state.agent.toolProgressMode =
                value as typeof state.agent.toolProgressMode;
            }
            return { agent: { ...state.agent } };
          },
        },
      },
    } as unknown as AgentExecutionContext;

    const mode = await handleRuntimeWorkspaceCommand(
      createInput("/mode set deep"),
      "/mode set deep",
      context,
    );
    const progress = await handleRuntimeWorkspaceCommand(
      createInput("/progress set verbose"),
      "/progress set verbose",
      context,
    );

    expect(mode).toContain("Run depth updated to deep.");
    expect(progress).toContain("Tool progress updated to verbose.");
    expect(setCalls).toEqual([
      { path: "agent.runDepth", value: "deep" },
      { path: "agent.maxIterations", value: 90 },
      { path: "agent.toolProgressMode", value: "verbose" },
    ]);
  });
});
