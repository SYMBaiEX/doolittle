import { describe, expect, it, vi } from "vitest";
import type { finalizeCliJob } from "@/cli/jobs";
import { handleStaticPromptCommand } from "./static-prompt-command";

describe("handleStaticPromptCommand", () => {
  it("returns false when no static prompt result is available", async () => {
    const handled = await handleStaticPromptCommand(
      {
        command: "start",
      },
      {
        emitStaticPromptEvents: vi.fn(async () => {}),
        finalizeCliJob: vi.fn(() => undefined) as typeof finalizeCliJob,
        printOneShotResult: vi.fn(() => {}),
        loadConfig: vi.fn(() => ({ dataDir: "/tmp/data" })) as never,
      },
    );

    expect(handled).toBe(false);
  });

  it("streams static exec results and finalizes the active job", async () => {
    const emitStaticPromptEvents = vi.fn(async () => {});
    const finalizeCliJob = vi.fn(() => undefined);

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
        printOneShotResult: vi.fn(() => {}),
        loadConfig: vi.fn(() => ({ dataDir: "/tmp/data" })) as never,
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
    const printOneShotResult = vi.fn(() => {});

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
        emitStaticPromptEvents: vi.fn(async () => {}),
        finalizeCliJob: vi.fn(() => undefined) as typeof finalizeCliJob,
        printOneShotResult,
        loadConfig: vi.fn(() => ({ dataDir: "/tmp/data" })) as never,
      },
    );

    expect(handled).toBe(true);
    expect(printOneShotResult).toHaveBeenCalledWith({ text: "done" }, true);
  });
});
