import { describe, expect, it } from "vitest";
import { handleCliJobCommand } from "./job-commands";

describe("handleCliJobCommand", () => {
  it("describes a cancellation request without claiming child confirmation", async () => {
    const context = { config: { dataDir: "/tmp/test" } } as never;
    const state = { activeSessionId: "cli:test", notices: [] as never[] };
    const result = await handleCliJobCommand(
      `/jobs cancel ${"a".repeat(36)}`,
      context,
      state,
      undefined,
      {
        cancelCliJob: () => ({
          kind: "requested",
          job: { id: "a".repeat(36), status: "running" } as never,
        }),
      },
    );
    expect(result).toEqual({
      text: `Cancellation requested for background job ${"a".repeat(36)}; awaiting child confirmation.`,
      tone: "info",
    });
  });
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
