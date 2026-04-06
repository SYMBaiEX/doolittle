import { describe, expect, it } from "bun:test";
import { handleCliJobCommand } from "./job-commands";

describe("handleCliJobCommand", () => {
  it("renders usage guidance for incomplete job subcommands", async () => {
    const context = { config: { dataDir: "/tmp/test" } } as never;
    const state = { activeSessionId: "cli:test", notices: [] as never[] };

    expect(await handleCliJobCommand("/jobs cancel ", context, state)).toEqual({
      text: "Usage: /jobs cancel <job-id>",
      tone: "warning",
    });
    expect(await handleCliJobCommand("/jobs show ", context, state)).toEqual({
      text: "Usage: /jobs show <job-id>",
      tone: "warning",
    });
    expect(await handleCliJobCommand("/jobs attach ", context, state)).toEqual({
      text: "Usage: /jobs attach <job-id>",
      tone: "warning",
    });
  });
});
