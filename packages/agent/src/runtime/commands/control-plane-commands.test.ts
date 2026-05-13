import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../chat";
import { handleControlPlaneCommand } from "./control-plane-commands";

describe("control plane commands", () => {
  it("renders a compact operator pulse without invoking a model turn", async () => {
    const result = await handleControlPlaneCommand(
      {
        message: "/pulse",
        userId: "user-1",
        roomId: "cli:user-1",
        source: "cli",
      },
      "/pulse",
      {
        config: { agentName: "Doolittle", workspaceDir: "/tmp/workspace" },
        runtime: {},
        services: {
          settings: {
            get: () => ({
              model: {
                provider: "devin",
                model: "swe-1-6-fast",
              },
              agent: {
                runDepth: "quick",
                maxIterations: 15,
                toolProgressMode: "verbose",
              },
            }),
          },
          personalities: {
            getActive: () => ({
              id: "operator",
              name: "Operator",
            }),
          },
          sessions: {
            usage: () => ({
              messageCount: 4,
              estimatedTokens: 120,
              lastPreview: "latest useful answer",
            }),
            recentBySession: () => [
              {
                sessionId: "cli:user-1",
                createdAt: "2026-05-12T00:00:01.000Z",
                role: "assistant",
                text: "latest useful answer",
              },
              {
                sessionId: "cli:user-1",
                createdAt: "2026-05-12T00:00:00.000Z",
                role: "user",
                text: "what are you carrying?",
              },
            ],
          },
          startupState: {
            getSnapshot: () => ({
              hotPathReady: true,
              deferredReady: true,
            }),
          },
          runController: {
            getActive: () => undefined,
          },
          userProfiles: {
            list: () => [
              {
                userId: "user-1",
                displayName: "Symbiex",
                facts: ["Alabama"],
                preferences: ["terminal-native"],
                notes: [],
              },
            ],
          },
          trajectories: {
            recentEvents: () => [{ id: "event-1" }],
          },
        },
      } as unknown as AgentExecutionContext,
    );

    expect(result).toContain("Doolittle pulse");
    expect(result).toContain("Provider: devin / swe-1-6-fast");
    expect(result).toContain("Run: idle depth=quick cap=15 progress=verbose");
    expect(result).toContain("Profile: Symbiex facts=1 prefs=1 notes=0");
    expect(result).toContain("Trajectories: 1 recent events");
    expect(result).toContain("Next: /retry | /undo");
  });

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
