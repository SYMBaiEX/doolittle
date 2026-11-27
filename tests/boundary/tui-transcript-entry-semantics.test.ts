import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import { expect, it, vi } from "vitest";
import {
  type ResponseTranscriptEntry,
  renderPlainTranscript,
  renderResponseTranscript,
} from "../../apps/cli/src/cli/transcript-renderer/index";
import {
  handleQueuedError,
  handleQueuedResult,
} from "../../apps/cli/src/cli/tui-command-queue/response-wiring";

it("commits command exceptions as system error entries rather than raw input agent lines", () => {
  const pushed: Array<{
    label: string;
    body: string;
    options?: Record<string, unknown>;
  }> = [];

  handleQueuedError({
    context: {
      services: { runController: { getActive: () => undefined } },
    } as unknown as AppContext,
    state: { activeSessionId: "session" },
    line: "/broken operator input",
    error: new Error("boom"),
    appendActivity: vi.fn(),
    pushResponseEntry: (label, body, options) => {
      pushed.push({ label, body, options });
    },
    logger: { captureError: vi.fn() } as never,
  });

  expect(pushed).toEqual([
    {
      label: "Error",
      body: "boom",
      options: expect.objectContaining({
        kind: "system",
        tone: "error",
        status: "failed",
      }),
    },
  ]);
});

it("carries execution tone and status into authored result entries", async () => {
  const pushed: Array<{
    label: string;
    body: string;
    options?: Record<string, unknown>;
  }> = [];

  await handleQueuedResult({
    context: {
      config: { agentName: "Doolittle" },
      services: { runController: { getActive: () => undefined } },
    } as unknown as AppContext,
    state: { activeSessionId: "session" },
    line: "hello",
    kind: "assistant",
    result: { text: "provider failed", tone: "error", status: "failed" },
    appendActivity: vi.fn(),
    pushResponseEntry: (label, body, options) => {
      pushed.push({ label, body, options });
    },
    syncThemeFromSettings: vi.fn(async () => {}),
    destroyScreen: vi.fn(),
  });

  expect(pushed).toEqual([
    {
      label: "Doolittle",
      body: "provider failed",
      options: expect.objectContaining({
        kind: "assistant",
        tone: "error",
        status: "failed",
      }),
    },
  ]);
});

it("renders explicit entry severity in cockpit and export transcripts", () => {
  const entry = {
    label: "Error",
    body: "boom",
    at: "12:00:00",
    kind: "system",
    tone: "error",
    status: "failed",
  } as ResponseTranscriptEntry;

  expect(renderResponseTranscript([entry])).toContain("{red-fg}error{/}");
  expect(renderPlainTranscript([entry]).split("\n")[0]).toContain("error");
});
