import { expect, it, vi } from "vitest";
import { ProviderAuthController } from "../../apps/desktop/src/main/provider-auth";

function flowHarness(options: { needsCodeSubmission?: boolean } = {}) {
  const listeners = new Set<(state: unknown) => void>();
  const handle = {
    sessionId: "session-one",
    authUrl: "https://example.com/authorize",
    needsCodeSubmission: options.needsCodeSubmission ?? true,
    completion: new Promise(() => undefined),
    cancel: vi.fn(),
  };
  const submitted: string[] = [];
  const flows = {
    startCodex: vi.fn(async () => handle),
    startAnthropic: vi.fn(async () => handle),
    subscribe: vi.fn(
      (_sessionId: string, listener: (state: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    ),
    cancel: vi.fn(() => true),
    submitCode: vi.fn((_sessionId: string, code: string) => {
      submitted.push(code);
      return true;
    }),
  };
  return { flows, handle, submitted };
}

function controller(
  flows: ReturnType<typeof flowHarness>["flows"],
  clipboard = "",
) {
  return new ProviderAuthController({
    openExternal: vi.fn(async () => undefined),
    readClipboardText: () => clipboard,
    flows: flows as never,
  });
}

it("accepts a Codex loopback callback URL paste", async () => {
  // Regression coverage: the Anthropic-only `code#state` shape check used to
  // reject every Codex paste with a Claude-specific error, so the manual
  // fallback path could never complete for Codex.
  const harness = flowHarness();
  const paste =
    "http://localhost:1455/auth/callback?code=codex-code&state=codex-state";
  const instance = controller(harness.flows, paste);
  await instance.start("codex");
  const state = await instance.submitCodeFromClipboard("codex");
  expect(harness.submitted).toEqual([paste]);
  expect(state.codeSubmitted).toBe(true);
});

it("accepts a bare Codex authorization code paste", async () => {
  const harness = flowHarness();
  const instance = controller(harness.flows, "bare-codex-code");
  await instance.start("codex");
  await instance.submitCodeFromClipboard("codex");
  expect(harness.submitted).toEqual(["bare-codex-code"]);
});

it("rejects malformed Claude pastes with the Claude-specific guidance", async () => {
  const harness = flowHarness();
  const instance = controller(harness.flows, "no-state-separator");
  await instance.start("claude-code");
  await expect(instance.submitCodeFromClipboard("claude-code")).rejects.toThrow(
    "code#state",
  );
  expect(harness.submitted).toEqual([]);
});

it("accepts a well-formed Claude code#state paste", async () => {
  const harness = flowHarness();
  const instance = controller(harness.flows, "code-value#state-value");
  await instance.start("claude-code");
  await instance.submitCodeFromClipboard("claude-code");
  expect(harness.submitted).toEqual(["code-value#state-value"]);
});

it("surfaces the underlying cause when the flow cannot start", async () => {
  const harness = flowHarness();
  harness.flows.startCodex = vi.fn(async () => {
    throw new Error("listen EADDRINUSE: address already in use");
  }) as never;
  const instance = controller(harness.flows);
  const state = await instance.start("codex");
  expect(state.phase).toBe("failed");
  expect(state.message).toContain("EADDRINUSE");
});
