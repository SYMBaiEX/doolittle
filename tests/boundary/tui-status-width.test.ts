import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import { describe, expect, it, vi } from "vitest";
import type { CliState } from "../../apps/cli/src/cli/execution/index";
import {
  renderFooter,
  renderStatusContent,
} from "../../apps/cli/src/cli/tui-renderers";

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

function visible(line: string): string {
  return line.replace(/\{[^}]*\}/gu, "");
}

function contextFixture(): AppContext {
  return {
    config: {
      agentName: "Doolittle",
      workspaceDir: "/tmp/workspace-with-a-rather-long-name",
      elizaCloudSmallModel: "cloud/fast-model",
    },
    runtime: {},
    services: {
      settings: {
        get: () => ({
          model: {
            provider: "elizacloud",
            model: "cloud/deep-model-with-a-long-name",
          },
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
          {
            sessionId: "cli:1234567890abcdef",
            title: "A session title that keeps going beyond the rail",
          },
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

describe("status rail width adaptation", () => {
  it("falls back to ASCII separators in a POSIX locale", () => {
    const state: CliState = {
      activeSessionId: "cli:1234567890abcdef",
      notices: [],
    };
    const original = process.env.LC_ALL;
    try {
      process.env.LC_ALL = "C";
      const ascii = renderStatusContent(contextFixture(), state, 80);
      expect(ascii).not.toContain("·");
      expect(ascii).toContain(" | ");

      process.env.LC_ALL = "en_US.UTF-8";
      expect(renderStatusContent(contextFixture(), state, 80)).toContain("·");
    } finally {
      if (original === undefined) {
        delete process.env.LC_ALL;
      } else {
        process.env.LC_ALL = original;
      }
    }
  });

  it("falls back to an ASCII busy frame in a POSIX locale", () => {
    const context = contextFixture();
    const original = process.env.LC_ALL;
    try {
      process.env.LC_ALL = "C";
      const ascii = renderFooter(context, true, 0, "Esc input", undefined, 140);
      expect(ascii).toContain("* processing");
      expect(ascii).not.toContain("•");

      process.env.LC_ALL = "en_US.UTF-8";
      expect(
        renderFooter(context, true, 0, "Esc input", undefined, 140),
      ).toContain("• processing");
    } finally {
      if (original === undefined) {
        delete process.env.LC_ALL;
      } else {
        process.env.LC_ALL = original;
      }
    }
  });

  it("keeps every row inside a narrow rail content width", () => {
    const state: CliState = {
      activeSessionId: "cli:1234567890abcdef",
      notices: [
        {
          kind: "status",
          at: "12:34:56",
          message:
            "A long status notice that would otherwise wrap across the rail",
        },
      ],
    };

    const lines = renderStatusContent(contextFixture(), state, 26).split("\n");
    for (const line of lines) {
      expect(
        visible(line).length,
        JSON.stringify(visible(line)),
      ).toBeLessThanOrEqual(26);
    }
  });
});
