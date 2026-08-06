import type {
  FlowState,
  OAuthFlowHandle,
} from "@elizaos/agent/auth/oauth-flow";
import { describe, expect, it, vi } from "vitest";
import {
  ProviderAuthController,
  type ProviderAuthFlowDependencies,
  providerAuthExecutableCandidates,
} from "./provider-auth";

function pendingCompletion(): OAuthFlowHandle["completion"] {
  return new Promise(() => undefined);
}

function flowState(
  sessionId: string,
  providerId: "anthropic-subscription" | "openai-codex",
  status: FlowState["status"],
  needsCodeSubmission = providerId === "anthropic-subscription",
): FlowState {
  return {
    sessionId,
    providerId,
    status,
    needsCodeSubmission,
    startedAt: Date.parse("2026-08-05T12:00:00.000Z"),
  };
}

function createFlows() {
  const listeners = new Map<string, (state: FlowState) => void>();
  const handles = {
    codex: {
      sessionId: "codex-flow",
      authUrl: "https://auth.openai.com/oauth/authorize?state=secret",
      needsCodeSubmission: false,
      completion: pendingCompletion(),
      submitCode: vi.fn(),
      cancel: vi.fn(),
    },
    claude: {
      sessionId: "claude-flow",
      authUrl: "https://claude.ai/oauth/authorize?state=secret",
      needsCodeSubmission: true,
      completion: pendingCompletion(),
      submitCode: vi.fn(),
      cancel: vi.fn(),
    },
  } satisfies Record<string, OAuthFlowHandle>;
  const startCodex = vi.fn(async () => handles.codex);
  const startAnthropic = vi.fn(async () => handles.claude);
  const cancel = vi.fn((sessionId: string) => {
    const providerId =
      sessionId === handles.codex.sessionId
        ? "openai-codex"
        : "anthropic-subscription";
    listeners.get(sessionId)?.(flowState(sessionId, providerId, "cancelled"));
    return true;
  });
  const submitCode = vi.fn(() => true);
  const subscribe = vi.fn(
    (sessionId: string, listener: (state: FlowState) => void) => {
      listeners.set(sessionId, listener);
      const providerId =
        sessionId === handles.codex.sessionId
          ? "openai-codex"
          : "anthropic-subscription";
      listener(flowState(sessionId, providerId, "pending"));
      return () => listeners.delete(sessionId);
    },
  );
  const flows: ProviderAuthFlowDependencies = {
    startCodex,
    startAnthropic,
    subscribe,
    cancel,
    submitCode,
  };

  return {
    flows,
    handles,
    listeners,
    startCodex,
    startAnthropic,
    cancel,
    submitCode,
  };
}

describe("provider auth", () => {
  it("returns bounded provider CLI candidates for coding-agent launches", () => {
    expect(
      providerAuthExecutableCandidates("codex", {
        environment: { PATH: "/custom/bin" },
        platform: "darwin",
        homeDirectory: "/users/doolittle",
      }),
    ).toEqual([
      "/custom/bin/codex",
      "/users/doolittle/.local/bin/codex",
      "/users/doolittle/.npm-global/bin/codex",
      "/users/doolittle/.bun/bin/codex",
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
      "/usr/bin/codex",
    ]);
  });

  it("uses Eliza's Codex OAuth flow without exposing its URL", async () => {
    const fixture = createFlows();
    const openExternal = vi.fn(async () => undefined);
    const controller = new ProviderAuthController({
      openExternal,
      readClipboardText: () => "",
      flows: fixture.flows,
      now: () => new Date("2026-08-05T12:00:00.000Z"),
    });

    const state = await controller.start("codex", {
      accountId: "research-account",
      label: "Research Codex",
    });

    expect(fixture.startCodex).toHaveBeenCalledWith({
      accountId: "research-account",
      label: "Research Codex",
    });
    expect(openExternal).toHaveBeenCalledWith(fixture.handles.codex.authUrl);
    expect(state).toMatchObject({
      phase: "waiting",
      browserOpened: true,
      needsCodeSubmission: false,
      codeSubmitted: false,
    });
    expect(JSON.stringify(state)).not.toContain("state=secret");

    fixture.listeners.get(fixture.handles.codex.sessionId)?.(
      flowState("codex-flow", "openai-codex", "success", false),
    );
    expect(controller.getState("codex").phase).toBe("succeeded");
    expect(controller.acknowledge("codex").phase).toBe("idle");
  });

  it("submits Claude's copied code directly to the Eliza flow", async () => {
    const fixture = createFlows();
    const controller = new ProviderAuthController({
      openExternal: async () => undefined,
      readClipboardText: () => "authorization-code#authorization-state",
      flows: fixture.flows,
    });

    const waiting = await controller.start("claude-code");
    expect(fixture.startAnthropic).toHaveBeenCalledWith({
      label: "Claude desktop account",
    });
    expect(waiting).toMatchObject({
      phase: "waiting",
      needsCodeSubmission: true,
      codeSubmitted: false,
    });

    const submitted = controller.submitCodeFromClipboard("claude-code");
    expect(fixture.submitCode).toHaveBeenCalledWith(
      fixture.handles.claude.sessionId,
      "authorization-code#authorization-state",
    );
    expect(submitted).toMatchObject({
      phase: "waiting",
      codeSubmitted: true,
    });
    expect(JSON.stringify(submitted)).not.toContain("authorization-code");
  });

  it("rejects malformed Claude clipboard values", async () => {
    const fixture = createFlows();
    const controller = new ProviderAuthController({
      openExternal: async () => undefined,
      readClipboardText: () => "missing-state",
      flows: fixture.flows,
    });
    await controller.start("claude-code");

    expect(() => controller.submitCodeFromClipboard("claude-code")).toThrow(
      /code#state/,
    );
    expect(fixture.submitCode).not.toHaveBeenCalled();
  });

  it("cancels active authentication through Eliza", async () => {
    const fixture = createFlows();
    const controller = new ProviderAuthController({
      openExternal: async () => undefined,
      readClipboardText: () => "",
      flows: fixture.flows,
    });
    await controller.start("codex");

    expect(controller.cancel("codex").phase).toBe("cancelled");
    expect(fixture.cancel).toHaveBeenCalledWith(
      fixture.handles.codex.sessionId,
      "Cancelled in Doolittle",
    );
  });

  it("preserves cancellation when SDK startup later rejects", async () => {
    const fixture = createFlows();
    let rejectStart: ((reason: Error) => void) | undefined;
    fixture.flows.startCodex = () =>
      new Promise((_resolve, reject) => {
        rejectStart = reject;
      });
    const controller = new ProviderAuthController({
      openExternal: async () => undefined,
      readClipboardText: () => "",
      flows: fixture.flows,
    });

    const starting = controller.start("codex");
    expect(controller.cancel("codex").phase).toBe("cancelled");
    rejectStart?.(new Error("SDK startup failed after cancellation"));

    await expect(starting).resolves.toMatchObject({ phase: "cancelled" });
    expect(controller.getState("codex").phase).toBe("cancelled");
  });
});
