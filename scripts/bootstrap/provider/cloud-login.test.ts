import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { BootstrapWizardContext } from "../bootstrap-context";

function createContext(): {
  context: BootstrapWizardContext;
  sectionCalls: Array<{ title: string; detail: string }>;
  warnCalls: string[];
} {
  const sectionCalls: Array<{ title: string; detail: string }> = [];
  const warnCalls: string[] = [];
  const context: BootstrapWizardContext = {
    root: "/tmp/doolittle",
    options: {
      headless: false,
      skipWizard: false,
    },
    banner: () => undefined,
    section: (title: string, detail: string) => {
      sectionCalls.push({ title, detail });
    },
    info: () => undefined,
    warn: (message: string) => {
      warnCalls.push(message);
    },
    formatKeyLabel: (label: string) => label,
    getWizardScreen: () => null,
    setWizardScreen: () => undefined,
    abortBootstrap: () => undefined,
    raceBootstrapAbort: async <T>(operation: Promise<T>) => operation,
    throwIfBootstrapAborted: () => undefined,
  };

  return {
    context,
    sectionCalls,
    warnCalls,
  };
}

function asFetchMock(
  fn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return fn as unknown as typeof fetch;
}

async function loadFlowModule() {
  return import(
    `./cloud-login?cloud-login-tests=${Date.now()}-${Math.random()}`
  );
}

function withPatchedSetTimeout(fn: () => Promise<void>) {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: () => void) => {
    callback();
    return 0;
  }) as unknown as typeof setTimeout;

  return fn().finally(() => {
    globalThis.setTimeout = originalSetTimeout;
  });
}

function withPatchedSetTimeoutAndVirtualTime(fn: () => Promise<void>) {
  const originalSetTimeout = globalThis.setTimeout;
  const originalNow = Date.now;
  let now = 0;

  Date.now = (() => now) as never;
  globalThis.setTimeout = ((callback: () => void) => {
    now += 310_000;
    callback();
    return 0;
  }) as unknown as typeof setTimeout;

  return fn().finally(() => {
    globalThis.setTimeout = originalSetTimeout;
    Date.now = originalNow;
  });
}

describe("runElizaCloudLoginFlow", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("continues on auth-gated availability and reports create-session errors", async () => {
    const { context, sectionCalls, warnCalls } = createContext();

    mock.module("@elizaos/autonomous/runtime/cloud-onboarding", () => ({
      checkCloudAvailability: async () => "HTTP 401",
    }));
    const suspendWizardScreen = mock(() => ({ title: "Awakening" }));
    const restoreWizardScreen = mock(() => {});
    mock.module("../wizard-screen/lifecycle", () => ({
      suspendWizardScreen,
      restoreWizardScreen,
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = asFetchMock(
      mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/auth/cli-session")) {
          return new Response("bad credentials", { status: 500 });
        }
        return new Response("missing", { status: 500 });
      }),
    );

    const { runElizaCloudLoginFlow } = await loadFlowModule();
    const apiKey = await runElizaCloudLoginFlow(context, "Eliza Cloud login");

    expect(apiKey).toBeUndefined();
    expect(sectionCalls[0]).toEqual({
      title: "Binding",
      detail: "Eliza Cloud login",
    });
    expect(
      warnCalls.some((message) =>
        message.includes("Failed to create auth session (HTTP 500)"),
      ),
    ).toBe(true);
    expect(restoreWizardScreen).toHaveBeenCalledTimes(1);

    globalThis.fetch = originalFetch;
  });

  it("returns undefined when availability reports a hard blocking condition", async () => {
    const { context, sectionCalls } = createContext();

    mock.module("@elizaos/autonomous/runtime/cloud-onboarding", () => ({
      checkCloudAvailability: async () =>
        "Cloud service temporarily unavailable",
    }));
    const suspendWizardScreen = mock(() => ({ title: "Awakening" }));
    const restoreWizardScreen = mock(() => {});
    mock.module("../wizard-screen/lifecycle", () => ({
      suspendWizardScreen,
      restoreWizardScreen,
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = asFetchMock(
      mock(async () => {
        throw new Error("should not call fetch when availability blocked");
      }),
    );

    const { runElizaCloudLoginFlow } = await loadFlowModule();
    const apiKey = await runElizaCloudLoginFlow(context, "Eliza Cloud login");

    expect(apiKey).toBeUndefined();
    expect(sectionCalls[0]).toEqual({
      title: "Binding",
      detail: "Eliza Cloud login",
    });
    expect(restoreWizardScreen).toHaveBeenCalledTimes(1);

    globalThis.fetch = originalFetch;
  });

  it("warns and returns undefined when polling reaches missing session", async () => {
    const { context, warnCalls } = createContext();

    mock.module("@elizaos/autonomous/runtime/cloud-onboarding", () => ({
      checkCloudAvailability: async () => undefined,
    }));
    const suspendWizardScreen = mock(() => ({ title: "Awakening" }));
    const restoreWizardScreen = mock(() => {});
    mock.module("../wizard-screen/lifecycle", () => ({
      suspendWizardScreen,
      restoreWizardScreen,
    }));

    const originalFetch = globalThis.fetch;
    let calledCreateSession = false;
    globalThis.fetch = asFetchMock(
      mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/auth/cli-session")) {
          calledCreateSession = true;
          return new Response("{}");
        }
        if (url.includes("/api/auth/cli-session/") && calledCreateSession) {
          return new Response("gone", { status: 404 });
        }
        return new Response("missing", { status: 500 });
      }),
    );

    const { runElizaCloudLoginFlow } = await loadFlowModule();
    const apiKey = await withPatchedSetTimeout(() =>
      runElizaCloudLoginFlow(context, "Eliza Cloud login"),
    );

    expect(apiKey).toBeUndefined();
    expect(warnCalls[0]).toContain("Auth session expired or not found");
    expect(restoreWizardScreen).toHaveBeenCalledTimes(1);

    globalThis.fetch = originalFetch;
  });

  it("warns when polling never reaches authentication before timeout", async () => {
    const { context, warnCalls } = createContext();

    mock.module("@elizaos/autonomous/runtime/cloud-onboarding", () => ({
      checkCloudAvailability: async () => undefined,
    }));
    const suspendWizardScreen = mock(() => ({ title: "Awakening" }));
    const restoreWizardScreen = mock(() => {});
    mock.module("../wizard-screen/lifecycle", () => ({
      suspendWizardScreen,
      restoreWizardScreen,
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = asFetchMock(
      mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/auth/cli-session")) {
          return new Response("{}", { status: 200 });
        }
        return new Response(JSON.stringify({ status: "waiting" }), {
          status: 200,
        });
      }),
    );

    const { runElizaCloudLoginFlow } = await loadFlowModule();
    const apiKey = await withPatchedSetTimeoutAndVirtualTime(() =>
      runElizaCloudLoginFlow(context, "Eliza Cloud login"),
    );

    expect(apiKey).toBeUndefined();
    expect(warnCalls[0]).toContain("Cloud login timed out");
    expect(restoreWizardScreen).toHaveBeenCalledTimes(1);

    globalThis.fetch = originalFetch;
  });
});
