import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../chat";
import { handleControlPlaneCommand } from "./control-plane-commands";

describe("control plane commands", () => {
  it("returns usage for empty command search queries", async () => {
    const result = await handleControlPlaneCommand(
      {
        message: "/commands search ",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/commands search ",
      {
        config: { workspaceDir: "/tmp/workspace" },
        runtime: {},
        services: {},
      } as unknown as AgentExecutionContext,
    );

    expect(result).toBe("Usage: /commands search <query>");
  });

  it("reports missing gateway runtime for gateway commands", async () => {
    const result = await handleControlPlaneCommand(
      {
        message: "/gateway status",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/gateway status",
      {
        config: { workspaceDir: "/tmp/workspace" },
        runtime: {},
        services: {},
      } as unknown as AgentExecutionContext,
    );

    expect(result).toBe(
      "Gateway runtime is not attached to this execution context.",
    );
  });

  it("renders api transport lookups and missing ids", async () => {
    const context = {
      config: { workspaceDir: "/tmp/workspace" },
      runtime: {},
      services: {
        apiTransport: {
          list: (limit: number) => [{ id: "resp-1", limit }],
          get: (id: string) => (id === "resp-1" ? { id, status: "ok" } : null),
        },
      },
    } as unknown as AgentExecutionContext;

    const list = await handleControlPlaneCommand(
      {
        message: "/responses list",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/responses list",
      context,
    );
    const missing = await handleControlPlaneCommand(
      {
        message: "/responses show missing",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/responses show missing",
      context,
    );

    expect(list).toContain('"resp-1"');
    expect(missing).toContain("Response missing not found.");
  });

  it("adds hooks through the extracted control-plane router", async () => {
    const context = {
      config: { workspaceDir: "/tmp/workspace" },
      runtime: {},
      services: {
        hooks: {
          add: (input: {
            event: string;
            name: string;
            enabled: boolean;
            template: string;
          }) => input,
          list: () => [],
          recentInvocations: () => [],
        },
      },
    } as unknown as AgentExecutionContext;

    const result = await handleControlPlaneCommand(
      {
        message: "/hooks add deploy release :: notify ops",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/hooks add deploy release :: notify ops",
      context,
    );

    expect(result).toContain('"event": "deploy"');
    expect(result).toContain('"name": "release"');
  });
});
