import { describe, expect, it } from "bun:test";
import type { CliState } from "@/cli/execution";
import { renderFooter, renderStatusContent } from "@/cli/tui-renderers";
import type { AppContext } from "@/runtime/bootstrap";

function createContext(): AppContext {
  const config = new Proxy(
    {
      agentName: "Doolittle",
    } as Record<string, unknown>,
    {
      get(target, prop) {
        return prop in target ? target[prop as keyof typeof target] : undefined;
      },
    },
  );
  const gatewayConfig = {
    allowAllUsers: false,
    sessionTimeoutMinutes: 30,
    mirrorResponsesToHistory: true,
    platforms: new Proxy(
      {},
      {
        get: () => ({ enabled: false }),
      },
    ),
  };

  return {
    config,
    runtime: {},
    services: {
      settings: {
        get: () => ({
          ui: { theme: "radar" },
          model: {
            provider: "openai",
            model: "gpt-5.4-mini",
          },
          agent: {
            runDepth: 3,
            maxIterations: 8,
            toolProgressMode: "compact",
          },
        }),
      },
      runController: {
        getActive: () => ({
          status: "running",
          statusDetail: "thinking through router extraction",
          activeAction: "refactor cli render helpers",
          observedActionCount: 4,
          startedAt: "2026-03-29T10:00:00.000Z",
          updatedAt: "2026-03-29T10:00:02.000Z",
        }),
      },
      sessions: {
        listSessions: () => [
          {
            sessionId: "cli:active",
            title: "Current cockpit session",
          },
          {
            sessionId: "cli:older",
            title: "Earlier run",
          },
        ],
      },
      delegation: {
        overview: () => ({
          running: 1,
          pending: 2,
          completed: 3,
          activeWorkers: 1,
        }),
        list: () => [],
        queueSummary: () => ({
          pending: 2,
          activeWorkers: 1,
        }),
      },
      gatewaySessions: {
        list: () => [{ voiceMode: true }, { voiceMode: false }],
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
      gatewayConfig,
      agentSdk: {
        snapshot: () => ({
          skillCatalog: {
            total: 0,
            trending: [],
          },
        }),
      },
      skills: {
        list: () => [],
      },
      trajectories: {
        listBundles: () => [],
        exportLatest: () => undefined,
      },
    },
  } as unknown as AppContext;
}

describe("tui render helpers", () => {
  it("renders status content with core runtime sections and live notices", () => {
    const state: CliState = {
      activeSessionId: "cli:active",
      notices: [
        {
          kind: "skills",
          at: "10:22:01",
          message: "Synthesized a router extraction helper.",
        },
      ],
    };

    const content = renderStatusContent(createContext(), state);

    expect(content).toContain("Operator Snapshot");
    expect(content).toContain("Live Notices");
    expect(content).toContain("Native Surface");
    expect(content).toContain("Next Step");
    expect(content).toContain("Recent Sessions");
    expect(content).toContain("workspace {cyan-fg}doolittle{/}");
    expect(content).toContain("openai");
    expect(content).toContain(
      "startup warming · deferred ready · diagnostics:warming",
    );
    expect(content).toContain("live running");
    expect(content).toContain("plugins enabled ");
    expect(content).toContain("prod 3");
    expect(content).toContain("alpha 22");
    expect(content).toContain("exp 1");
    expect(content).toContain("runtime {gray-fg}2.0.0-alpha.85{/}");
    expect(content).toContain("gateway sessions 2 · voice 1");
    expect(content).toContain("Current cockpit session");
    expect(content).toContain("Synthesized a router extraction helper.");
    expect(content).toContain("Ctrl-S focuses the live response.");
  });

  it("renders an idle status rail when notices are empty", () => {
    const state: CliState = {
      activeSessionId: "cli:unknown",
      notices: [],
    };
    const context = createContext();
    context.services.runController.getActive = () => undefined;

    const content = renderStatusContent(context, state);

    expect(content).toContain("No active notices.");
    expect(content).toContain("live idle");
    expect(content).toContain("focus cli:unknown");
  });

  it("renders footer state for busy and idle modes", () => {
    const context = createContext();

    const busyFooter = renderFooter(context, true, 2, "Esc palette", "◐");
    const idleFooter = renderFooter(context, false, 0);

    expect(busyFooter).toContain("processing");
    expect(busyFooter).toContain("queue:2");
    expect(busyFooter).toContain("cap:8");
    expect(busyFooter).toContain("prog:compact");
    expect(busyFooter).toContain("Esc palette");

    expect(idleFooter).toContain("ready");
    expect(idleFooter).toContain("queue:0");
    expect(idleFooter).toContain("Doolittle // cockpit");
  });
});
