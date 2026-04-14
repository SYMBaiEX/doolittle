import { describe, expect, it } from "bun:test";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext, AgentTurnHooks } from "../../chat";
import { handleAccountsCommand } from ".";

function createInput(message: string): ChatTurnRequest {
  return {
    message,
    userId: "user-1",
    roomId: "cli:user-1",
    source: "cli",
  };
}

describe("accounts command router", () => {
  it("delegates login to a local shell hook when available", async () => {
    const invoked: Array<{ command: string; provider?: string }> = [];
    const hooks: AgentTurnHooks = {
      runLocalShellCommand: async (params) => {
        invoked.push({
          command: params.command,
          provider: params.afterSuccessConnectProvider,
        });
        return "shell launched";
      },
    };
    const context = {
      runtime: {},
      config: {},
      services: {
        settings: {
          get: () => ({
            model: {
              provider: "codex",
            },
          }),
        },
      },
    } as unknown as AgentExecutionContext;

    const response = await handleAccountsCommand(
      createInput("/accounts login codex"),
      "/accounts login codex",
      context,
      hooks,
    );

    expect(response).toBe("shell launched");
    expect(invoked).toHaveLength(1);
    expect(invoked[0]?.provider).toBe("codex");
    expect(invoked[0]?.command.toLowerCase()).toContain("codex");
  });

  it("returns stable usage guidance for invalid setup-token targets", async () => {
    const context = {
      runtime: {},
      config: {},
      services: {
        settings: {
          get: () => ({
            model: {
              provider: "codex",
            },
          }),
        },
      },
    } as unknown as AgentExecutionContext;

    const response = await handleAccountsCommand(
      createInput("/accounts setup-token codex"),
      "/accounts setup-token codex",
      context,
    );

    expect(response).toContain("/accounts setup-token claude-code");
  });

  it("returns stable usage guidance for invalid refresh targets", async () => {
    const context = {
      runtime: {},
      config: {},
      services: {
        settings: {
          get: () => ({
            model: {
              provider: "codex",
            },
          }),
        },
      },
    } as unknown as AgentExecutionContext;

    const response = await handleAccountsCommand(
      createInput("/accounts refresh azure"),
      "/accounts refresh azure",
      context,
    );

    expect(response).toContain(
      "/accounts refresh <elizacloud|codex|claude-code>",
    );
  });
});
