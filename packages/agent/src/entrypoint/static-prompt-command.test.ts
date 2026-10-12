import { describe, expect, it, vi } from "vitest";
import type { finalizeCliJob } from "@/cli/jobs";
import { handleStaticPromptCommand } from "./static-prompt-command";

describe("handleStaticPromptCommand", () => {
  it("requires child identity before a static background job can finalize", async () => {
    await expect(
      handleStaticPromptCommand(
        {
          command: "exec",
          immediatePrompt: "/status",
          staticPromptResult: { text: "ok" },
          oneShot: { jsonStream: true, jobId: "job-1" } as never,
        },
        {
          emitStaticPromptEvents: vi.fn(async () => {}),
          finalizeCliJob: vi.fn() as typeof finalizeCliJob,
          printOneShotResult: vi.fn(),
          loadConfig: vi.fn(() => ({ dataDir: "/tmp/data" })) as never,
        },
      ),
    ).rejects.toThrow("Missing child job control identity");
  });

  it("honors a preexisting addressed request on a static result", async () => {
    const finalize = vi.fn();
    const emit = vi.fn(async () => {});
    await handleStaticPromptCommand(
      {
        command: "exec",
        immediatePrompt: "/status",
        staticPromptResult: { text: "ok" },
        oneShot: { jsonStream: true, jobId: "job-1" } as never,
        jobControlNonce: "nonce",
      },
      {
        emitStaticPromptEvents: emit,
        finalizeCliJob: finalize as typeof finalizeCliJob,
        printOneShotResult: vi.fn(),
        loadConfig: vi.fn(() => ({ dataDir: "/tmp/data" })) as never,
        monitorJobCancel: (_dir, _id, _nonce, abort) => {
          abort();
          return () => undefined;
        },
        appendCliJobEvent: vi.fn(),
      },
    );
    expect(emit).toHaveBeenCalledWith(
      "/status",
      { text: "ok", shouldExit: true },
      expect.anything(),
    );
    expect(finalize).toHaveBeenCalledWith(
      "/tmp/data",
      "job-1",
      "cancelled",
      130,
    );
  });
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
        jobControlNonce: "test-nonce",
      },
      {
        emitStaticPromptEvents,
        finalizeCliJob: finalizeCliJob as typeof finalizeCliJob,
        printOneShotResult: vi.fn(() => {}),
        loadConfig: vi.fn(() => ({ dataDir: "/tmp/data" })) as never,
        monitorJobCancel: () => () => undefined,
        appendCliJobEvent: vi.fn(),
      },
    );

    expect(handled).toBe(true);
    expect(emitStaticPromptEvents).toHaveBeenCalledWith(
      "/quit",
      { text: "bye", shouldExit: true },
      { sessionId: "session-1", onEvent: expect.any(Function) },
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
