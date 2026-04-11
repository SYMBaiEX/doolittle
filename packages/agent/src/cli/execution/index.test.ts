import { describe, expect, it } from "bun:test";
import { executeCliInput } from "./index";
import type { CliState } from "./types";

function createState(): CliState {
  return { activeSessionId: "cli:test", notices: [] };
}

function createContext() {
  return {
    config: {
      agentName: "Doolittle",
      workspaceDir: "/workspace",
      dataDir: "/tmp/doolittle-cli-tests",
    },
    services: {
      sessions: {
        listTitled: () => [],
        resolveByTitle: (query: string) =>
          query === "focus"
            ? { sessionId: "cli:focus", title: "Focus Session" }
            : undefined,
        rename: (sessionId: string, title: string) => ({ sessionId, title }),
      },
      terminal: {
        runStreamingLocal: async () => ({
          command: "echo hi",
          stdout: "hi",
          stderr: "",
          exitCode: 0,
          durationMs: 5,
        }),
      },
    },
  } as const;
}

describe("executeCliInput", () => {
  it("returns the shutdown response for exit commands", async () => {
    expect(
      await executeCliInput("exit", createContext() as never, createState()),
    ).toEqual({
      text: "Closing Doolittle.",
      tone: "success",
      shouldExit: true,
    });
  });

  it("handles help and empty resume flows without entering runtime command paths", async () => {
    const help = await executeCliInput(
      "/help",
      createContext() as never,
      createState(),
    );
    const resume = await executeCliInput(
      "/resume",
      createContext() as never,
      createState(),
    );

    expect(help.tone).toBe("info");
    expect(help.text).toContain("Doolittle");
    expect(resume).toEqual({
      text: "No titled sessions are available yet. Use /title <name> to name the current session.",
      tone: "info",
    });
  });

  it("resumes and renames sessions through the extracted session command helper", async () => {
    const state = createState();

    expect(
      await executeCliInput("/resume focus", createContext() as never, state),
    ).toEqual({
      text: "Resumed session Focus Session.",
      tone: "success",
    });
    expect(state.activeSessionId).toBe("cli:focus");

    expect(
      await executeCliInput(
        "/title Deep Work",
        createContext() as never,
        state,
      ),
    ).toEqual({
      text: "Session titled: Deep Work",
      tone: "success",
    });
  });
});
