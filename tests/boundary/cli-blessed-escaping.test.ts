import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import blessed from "blessed";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHeaderContent } from "../../apps/cli/src/cli/cockpit-chrome";
import { renderGatewayOpsContent } from "../../apps/cli/src/cli/control-deck/gateway";
import { renderJobsContent } from "../../apps/cli/src/cli/control-deck/jobs";
import type { CliState } from "../../apps/cli/src/cli/execution/index";
import { createCliJob } from "../../apps/cli/src/cli/jobs/store";
import { escapeBlessed } from "../../apps/cli/src/cli/render-utils";
import { renderStatusContent } from "../../apps/cli/src/cli/tui-renderers";
import { getTuiTheme } from "../../packages/agent/src/runtime/theme-catalog";

vi.mock("@doolittle/agent/runtime/native/package-audit", () => ({
  getNativePackageAudit: () => ({
    runtime: { beta: "2.0.11-beta.7" },
  }),
}));

vi.mock("@doolittle/agent/runtime/native/service-bridge/autonomous", () => ({
  getAutonomousControlPlane: () => ({
    alignment: {
      connection: { kind: "local runtime", provider: "offline" },
    },
  }),
}));

vi.mock("@doolittle/agent/runtime/native/plugin-catalog", () => ({
  getNativePluginCatalog: () => [],
}));

vi.mock(
  "@doolittle/agent/runtime/native/service-bridge/control-planes",
  () => ({
    getNativeTransportControlPlane: () => ({
      totals: {
        liveServices: 0,
        operationalTransports: 0,
        gatewayEnabled: 0,
      },
    }),
  }),
);

const temporaryDirs: string[] = [];

afterEach(() => {
  while (temporaryDirs.length) {
    rmSync(temporaryDirs.pop() ?? "", { recursive: true, force: true });
  }
});

function parseBlessedContent(content: string): string {
  const output = new PassThrough() as PassThrough & {
    columns: number;
    rows: number;
  };
  output.columns = 120;
  output.rows = 40;
  const input = new PassThrough();
  const screen = blessed.screen({
    smartCSR: false,
    output: output as never,
    input: input as never,
    terminal: "xterm-256color",
  });
  try {
    return blessed.parseTags(content, screen);
  } finally {
    screen.destroy();
  }
}

function expectLiteralWithoutRedInjection(
  content: string,
  literals: string[],
): void {
  const parsed = parseBlessedContent(content);
  for (const literal of literals) {
    expect(parsed).toContain(literal);
  }
  expect(parsed).not.toContain("\x1b[31m");
}

function statusContext(sessionTitle: string): AppContext {
  return {
    config: {
      agentName: "Doolittle",
      workspaceDir: "/tmp/workspace",
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
          hotPathReady: true,
          deferredReady: true,
          phases: {
            runtime: { status: "ready" },
            gateway: { status: "ready" },
            cron: { status: "ready" },
            diagnostics: { status: "ready" },
            skills: { status: "deferred" },
          },
        }),
      },
      runController: {
        getActive: () => undefined,
      },
      sessions: {
        listSessions: () => [
          { sessionId: "cli:1234567890abcdef", title: sessionTitle },
        ],
      },
      delegationProjection: {
        overview: () => ({
          running: 0,
          pending: 0,
          completed: 0,
          activeWorkers: 0,
        }),
      },
      gatewaySessions: {
        list: () => [],
      },
      gatewayConfig: {},
    },
  } as unknown as AppContext;
}

describe("blessed tag escaping at widget boundaries", () => {
  it("escapes blessed-like markup inside the agent name in the cockpit header", () => {
    const theme = getTuiTheme("orange");
    // The header widget renders with tags enabled; braces in user-controlled
    // text must survive as literal characters, not as style tags.
    const content = buildHeaderContent("Evil{red-fg}Bot{/}", theme);
    expect(content).not.toContain("{red-fg}");
    expect(content).toContain(escapeBlessed("Evil{red-fg}Bot{/}"));
  });

  it("escapes braces from project labels and theme chrome in the header", () => {
    const theme = getTuiTheme("ember");
    // Ember catalog values carry literal braces (sigil "{##}", face "{ok}");
    // they must all pass through escaped so blessed renders them as text.
    const content = buildHeaderContent("Doolittle", theme);
    expect(content).not.toMatch(/\{##\}(?!\/)/u);
    expect(content).toContain(escapeBlessed(theme.sigil));
    expect(content).toContain(escapeBlessed(theme.idleFace));
  });

  it("round-trips escaped braces through blessed without visible backslashes", () => {
    const raw = "Evil{red-fg}Bot{/}";
    expect(parseBlessedContent(escapeBlessed(raw))).toBe(raw);
  });

  it("renders session-title braces literally in the tagged status rail", () => {
    const title = "session {red-fg}red{/} title";
    const state: CliState = {
      activeSessionId: "cli:1234567890abcdef",
      notices: [],
    };
    const content = renderStatusContent(statusContext(title), state, 100);
    expectLiteralWithoutRedInjection(content, [title]);
  });

  it("renders job prompt braces literally in the tagged control deck", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-job-escaping-"));
    temporaryDirs.push(dataDir);
    const prompt = "inspect {red-fg}red{/} output";
    createCliJob(dataDir, prompt);

    const content = renderJobsContent(
      { config: { dataDir } } as AppContext,
      100,
    );

    expectLiteralWithoutRedInjection(content, [prompt]);
  });

  it("renders gateway detail, platform and inbox braces literally", async () => {
    const detail = "supervisor {red-fg}red{/} detail";
    const platform = "telegram{red-fg}red{/}";
    const textPreview = "inbox {red-fg}red{/} preview";
    const context = {
      gateway: {
        history: async () => ({
          traces: [],
          deliveries: [],
          attachments: [],
          inbox: [{ recordId: "inbox-1", platform, textPreview }],
        }),
        supervision: () => [{ at: "2026-01-02T12:34:56.000Z", detail }],
        runtimeStatus: () => ({
          daemon: {
            watchdog: { running: true },
            state: {
              restartRuns: 0,
              restartRecoveries: 0,
              restartBackoffs: 0,
              lastWatchdogAt: "2026-01-02T12:34:56.000Z",
            },
            restartQueue: [],
          },
        }),
      },
    } as unknown as AppContext;

    const content = await renderGatewayOpsContent(context, 120);

    expectLiteralWithoutRedInjection(content, [detail, platform, textPreview]);
  });
});
