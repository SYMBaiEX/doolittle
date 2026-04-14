import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

type ShellChromeModule = typeof import("./shell-chrome");

async function loadShellChromeModule(): Promise<ShellChromeModule> {
  return import(
    `./shell-chrome?shell-chrome-test=${Date.now()}-${Math.random()}`
  );
}

function createContext() {
  return {
    config: {
      agentName: "Doolittle",
      elizaCloudSmallModel: "gpt-5.4-mini",
    },
    runtime: {},
    services: {
      settings: {
        get: () => ({
          ui: { theme: "radar" },
          model: {
            provider: "openai",
            model: "gpt-5.4",
          },
          agent: {
            runDepth: 3,
            maxIterations: 8,
            toolProgressMode: "compact",
          },
        }),
      },
      sessions: {
        listSessions: () => [
          { sessionId: "cli:active", title: "Current cockpit session" },
        ],
      },
      runController: {
        getActive: () => ({
          status: "running",
          observedActionCount: 4,
          activeAction: "refactor cli render helpers",
        }),
      },
      startupState: {
        getSnapshot: () => ({
          hotPathReady: false,
          deferredReady: true,
          phases: {
            gateway: { status: "ready" },
            cron: { status: "ready" },
            diagnostics: { status: "warming" },
            skills: { status: "ready" },
          },
        }),
      },
      gatewayConfig: {
        platforms: {},
      },
    },
  } as never;
}

describe("shell chrome", () => {
  beforeEach(() => {
    mock.restore();
    mock.module("@/runtime/native/plugin-catalog", () => ({
      getNativePluginCatalog: () => [
        { enabled: true, maturity: "production" },
        { enabled: true, maturity: "alpha" },
        { enabled: true, maturity: "experimental" },
        { enabled: false, maturity: "alpha" },
      ],
      groupNativePluginCatalog: () => ({
        foundation: [],
        providers: [],
        messaging: [
          {
            id: "plugin-telegram",
            enabled: true,
            source: "official",
            notes: "telegram bridge ready",
          },
          {
            id: "plugin-discord",
            enabled: false,
            source: "official",
            notes: "discord bridge disabled",
          },
        ],
        knowledge: [],
        browser: [],
        media: [],
        research: [],
        execution: [],
        integration: [],
        automation: [],
        product: [],
      }),
      listNativePluginCategories: () => [
        "foundation",
        "providers",
        "messaging",
        "knowledge",
        "browser",
        "media",
        "research",
        "execution",
        "integration",
        "automation",
        "product",
      ],
    }));
    mock.module("@/runtime/native/service-bridge/control-planes", () => ({
      getNativeTransportControlPlane: () => ({
        totals: {
          liveServices: 1,
          operationalTransports: 1,
          gatewayEnabled: 2,
        },
      }),
      getNativeExecutionControlPlane: () => ({
        e2b: { available: false },
      }),
      getNativeFormsControlPlane: () => ({
        enabled: false,
      }),
      getNativePlanningControlPlane: () => ({
        planning: { enabled: false },
      }),
      getNativeResearchControlPlane: () => ({
        enabled: false,
      }),
      getNativeIntegrationControlPlane: () => ({
        browser: { ready: false },
        mcp: { ready: false },
      }),
      getNativeMediaControlPlane: () => ({
        ready: false,
      }),
      getEffectivePluginManagerInventory: () => [],
      getEffectiveServiceResolution: () => [],
      getEffectiveMessagingTransportInventory: () => [],
      getEffectiveTransportInventory: () => [],
      getNativeMessagingTransportState: () => ({
        transports: [],
        totals: {
          configured: 0,
          operationalTransports: 0,
          liveServices: 0,
          gatewayEnabled: 0,
        },
      }),
    }));
  });

  afterEach(() => {
    mock.restore();
  });

  it("renders a plain banner with operator snapshot lines", async () => {
    const mod = await loadShellChromeModule();
    const content = mod.renderPlainBanner(createContext(), {
      activeSessionId: "cli:active",
    });

    expect(content).toContain("conversation shell");
    expect(content).toContain(
      "startup   warming · deferred ready · diagnostics:warming",
    );
    expect(content).toContain("channels  live 1 · ready 1 · configured 2");
    expect(content).toContain(
      "plugins   enabled 3/4 · prod 1 · alpha 1 · exp 1",
    );
    expect(content).toContain(
      "live      running · 4 steps · refactor cli render helpers",
    );
    expect(content).toContain("session   Current cockpit session");
  });

  it("renders plain-shell hints that adapt to the current run state", async () => {
    const mod = await loadShellChromeModule();
    const content = mod.renderPlainShellHints(createContext(), {
      activeSessionId: "cli:active",
    });

    expect(content).toContain("Talk naturally for paired work");
    expect(content).toContain("/progress");
    expect(content).toContain("Live turn in progress");
    expect(content).toContain("doolittle progress");
  });
});
