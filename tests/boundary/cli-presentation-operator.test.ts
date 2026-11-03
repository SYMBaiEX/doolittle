import { stripVTControlCharacters } from "node:util";
import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import { describe, expect, it } from "vitest";
import type { ShellChromeDependencies } from "../../apps/cli/src/cli/operator-snapshot";
import {
  buildCliOperatorSnapshot,
  renderPlainBanner,
  renderPlainShellHints,
} from "../../apps/cli/src/cli/shell-chrome";
import {
  shortModelId,
  shortSessionLabel,
} from "../../apps/cli/src/cli/terminal-labels";

function fixture(
  options: {
    active?: boolean;
    hotReady?: boolean;
    backgroundReady?: boolean;
    gatewayConfigured?: number;
    gatewayReady?: number;
    gatewayStatus?: "ready" | "warming" | "error" | "deferred";
    sessionTitle?: string;
  } = {},
) {
  const context = {
    config: {
      agentName: "Doolittle",
      elizaCloudSmallModel: "cloud/fast-model",
    },
    runtime: {},
    services: {
      settings: {
        get: () => ({
          model: { provider: "elizacloud", model: "cloud/deep-model" },
          ui: { theme: "default" },
          agent: {
            runDepth: "standard",
            maxIterations: 12,
            toolProgressMode: "compact",
          },
        }),
      },
      startupState: {
        getSnapshot: () => ({
          hotPathReady: options.hotReady ?? true,
          deferredReady: options.backgroundReady ?? true,
          phases: {
            runtime: { status: "ready" },
            gateway: { status: options.gatewayStatus ?? "ready" },
            skills: { status: "deferred" },
          },
        }),
      },
      runController: {
        getActive: () =>
          options.active
            ? {
                status: "acting",
                observedActionCount: 3,
                activeAction: "workspace:search",
                statusDetail: "fallback detail",
              }
            : undefined,
      },
      sessions: {
        listSessions: () =>
          options.sessionTitle
            ? [{ sessionId: "cli:1234567890", title: options.sessionTitle }]
            : [],
      },
      gatewayConfig: {},
    },
  } as unknown as AppContext;
  const dependencies: ShellChromeDependencies = {
    getNativePluginCatalog: () =>
      [
        { enabled: true, maturity: "production" },
        { enabled: true, maturity: "alpha" },
        { enabled: true, maturity: "experimental" },
        { enabled: false, maturity: "production" },
      ] as ReturnType<ShellChromeDependencies["getNativePluginCatalog"]>,
    getNativeTransportControlPlane: () =>
      ({
        totals: {
          liveServices: 2,
          gatewayEnabled: options.gatewayConfigured ?? 0,
          operationalTransports: options.gatewayReady ?? 0,
        },
      }) as ReturnType<
        ShellChromeDependencies["getNativeTransportControlPlane"]
      >,
  };
  const state = { activeSessionId: "cli:1234567890" };
  return { context, dependencies, state };
}

describe("CLI operator presentation", () => {
  it("uses the same live-run priority in plain and cockpit guidance", () => {
    const { context, state, dependencies } = fixture({
      active: true,
      hotReady: false,
      backgroundReady: false,
      gatewayConfigured: 1,
    });
    const snapshot = buildCliOperatorSnapshot(context, state, dependencies);
    expect(snapshot.liveSummary).toBe("acting · 3 steps · workspace:search");
    expect(snapshot.nextPlainHint).toContain("Live turn in progress");
    expect(snapshot.nextCockpitHint).toContain("focuses the live response");
  });

  it("prioritizes incomplete startup over a configured offline gateway", () => {
    const { context, state, dependencies } = fixture({
      backgroundReady: false,
      gatewayConfigured: 1,
      gatewayStatus: "warming",
    });
    const snapshot = buildCliOperatorSnapshot(context, state, dependencies);
    expect(snapshot.startupSummary).toBe(
      "hot-ready · background warming · gateway:warming",
    );
    expect(snapshot.nextPlainHint).toContain(
      "Background services are hydrating",
    );
    expect(snapshot.nextCockpitHint).toContain(
      "Background services are hydrating",
    );
  });

  it("directs both views to gateway readiness once startup is ready", () => {
    const { context, state, dependencies } = fixture({ gatewayConfigured: 1 });
    const snapshot = buildCliOperatorSnapshot(context, state, dependencies);
    expect(snapshot.nextPlainHint).toContain("/gateway readiness");
    expect(snapshot.nextCockpitHint).toContain("/gateway readiness");
  });

  it("preserves model, plugin and session summaries in the plain startup output", () => {
    const { context, state, dependencies } = fixture({
      sessionTitle: "Current work",
    });
    const snapshot = buildCliOperatorSnapshot(context, state, dependencies);
    expect(snapshot).toMatchObject({
      providerSummary: "elizacloud   fast fast-model   deep deep-model",
      pluginSummary: "enabled 3/4 · prod 1 · alpha 1 · exp 1",
      transportSummary: "live 2 · ready 0 · configured 0",
      liveSummary: "idle",
      sessionLabel: "Current work",
    });
    const banner = stripVTControlCharacters(
      renderPlainBanner(context, state, dependencies),
    );
    expect(banner).toContain(snapshot.providerSummary);
    expect(banner).toContain("session   Current work");
    const hints = renderPlainShellHints(context, state, dependencies);
    expect(hints).toContain("Daily checks:");
    expect(snapshot.nextCockpitHint).toContain("opens the command palette");
  });

  it("retains compact labels when a session title or model path is absent", () => {
    const { context, state, dependencies } = fixture();
    expect(
      buildCliOperatorSnapshot(context, state, dependencies).sessionLabel,
    ).toBe("12345678");
    expect(shortModelId(" ")).toBe("unconfigured");
    expect(shortModelId(" provider/model ")).toBe("model");
    expect(shortSessionLabel("other-session-id")).toBe("other-sessio");
  });
});
