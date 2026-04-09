import { describe, expect, it, mock } from "bun:test";
import type { finalizeCliJob } from "@/cli/jobs";
import { handleStaticPromptCommand } from "./static-prompt-command";

describe("handleStaticPromptCommand", () => {
  it("returns false when no static prompt result is available", async () => {
    const handled = await handleStaticPromptCommand(
      {
        command: "start",
      },
      {
        emitStaticPromptEvents: mock(async () => {}),
        finalizeCliJob: mock(() => undefined) as typeof finalizeCliJob,
        printOneShotResult: mock(() => {}),
        loadConfig: mock(() => ({ dataDir: "/tmp/data" })) as never,
      },
    );

    expect(handled).toBe(false);
  });

  it("streams static exec results and finalizes the active job", async () => {
    const emitStaticPromptEvents = mock(async () => {});
    const finalizeCliJob = mock(() => undefined);

    const handled = await handleStaticPromptCommand(
      {
        command: "exec",
        immediatePrompt: "/quit",
        staticPromptResult: {
          text: "bye",
          shouldExit: true,
        },
        oneShot: {
          jsonStream: true,
          jobId: "job-1",
          sessionId: "session-1",
        } as never,
        jobControlDir: "/tmp/jobs",
      },
      {
        emitStaticPromptEvents,
        finalizeCliJob: finalizeCliJob as typeof finalizeCliJob,
        printOneShotResult: mock(() => {}),
        loadConfig: mock(() => ({ dataDir: "/tmp/data" })) as never,
      },
    );

    expect(handled).toBe(true);
    expect(emitStaticPromptEvents).toHaveBeenCalledWith(
      "/quit",
      { text: "bye", shouldExit: true },
      { sessionId: "session-1" },
    );
    expect(finalizeCliJob).toHaveBeenCalledWith(
      "/tmp/jobs",
      "job-1",
      "cancelled",
      0,
    );
  });

  it("prints one-shot results outside json-stream mode", async () => {
    const printOneShotResult = mock(() => {});

    const handled = await handleStaticPromptCommand(
      {
        command: "exec",
        staticPromptResult: {
          text: "done",
        },
        oneShot: {
          json: true,
        } as never,
      },
      {
        emitStaticPromptEvents: mock(async () => {}),
        finalizeCliJob: mock(() => undefined) as typeof finalizeCliJob,
        printOneShotResult,
        loadConfig: mock(() => ({ dataDir: "/tmp/data" })) as never,
      },
    );

    expect(handled).toBe(true);
    expect(printOneShotResult).toHaveBeenCalledWith({ text: "done" }, true);
  });
});
