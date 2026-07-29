import { describe, expect, it } from "vitest";
import {
  createTerminalAction,
  executeTerminalCommand,
  resolveCommandFromParams,
} from "./terminal-action";

describe("terminal action contract", () => {
  it("lets the Eliza planner select the action and uses structured parameters", async () => {
    const run = async (command: string) => ({
      command,
      exitCode: 0,
      stdout: "/workspace\n",
      stderr: "",
      cwd: "/workspace",
      durationMs: 3,
    });
    const action = createTerminalAction({
      workspace: { root: () => "/workspace" },
      terminal: { run },
    } as never);
    const message = {
      content: { text: "Please inspect the selected project." },
    } as never;

    await expect(action.validate({} as never, message)).resolves.toBe(true);
    await expect(
      action.handler({} as never, message, undefined, {
        parameters: { command: "pwd" },
      }),
    ).resolves.toMatchObject({
      success: true,
      verifiedUserFacing: true,
      data: {
        commandResult: {
          command: "pwd",
          exitCode: 0,
          executedIn: "/workspace",
        },
      },
    });
  });
});

describe("executeTerminalCommand", () => {
  it("uses the shared command formatter used by slash and bang commands", async () => {
    const services = {
      workspace: { root: () => "/workspace" },
      terminal: {
        run: async () => ({
          command: "pwd",
          exitCode: 0,
          stdout: "/workspace\n",
          stderr: "",
          cwd: "/workspace",
          durationMs: 3,
        }),
      },
    };

    const result = await executeTerminalCommand(
      {} as never,
      services as never,
      "pwd",
    );

    expect(result.response).toContain("Command: pwd");
    expect(result.response).toContain("Exit: 0");
    expect(result.response).toContain("STDOUT:\n/workspace");
  });
});

describe("resolveCommandFromParams", () => {
  it("reads the declared SDK command parameter", () => {
    expect(resolveCommandFromParams({ command: "ls -la" })).toBe("ls -la");
  });

  it("rejects undeclared compatibility aliases", () => {
    expect(resolveCommandFromParams(undefined)).toBeUndefined();
    expect(resolveCommandFromParams({})).toBeUndefined();
    expect(resolveCommandFromParams({ cmd: "pwd" })).toBeUndefined();
  });
});
