import { describe, expect, it } from "vitest";
import {
  buildNextActions,
  summarizeAccountPool,
  summarizeDashboardValue,
  summarizeRepoStatus,
  summarizeSetupEntries,
} from "./dashboard-helpers";

describe("dashboard helpers", () => {
  it("parses git status branch, sync, and dirty lines", () => {
    const summary = summarizeRepoStatus(
      "## feat/desktop...origin/feat/desktop [ahead 2, behind 1]\n M apps/desktop/src/renderer/App.tsx\n?? apps/desktop/src/renderer/DashboardPage.tsx",
    );

    expect(summary.branch).toBe("feat/desktop");
    expect(summary.upstream).toBe("origin/feat/desktop");
    expect(summary.ahead).toBe(2);
    expect(summary.behind).toBe(1);
    expect(summary.dirty).toBe(true);
    expect(summary.changedFiles).toBe(2);

    expect(
      summarizeRepoStatus("## release/0.1.0...origin/release/0.1.0"),
    ).toMatchObject({
      branch: "release/0.1.0",
      upstream: "origin/release/0.1.0",
      dirty: false,
    });
  });

  it("marks setup warnings from summary strings", () => {
    const entries = summarizeSetupEntries({
      localModels: "ready",
      providerKey: "missing",
      automation: true,
      providers: [{ ready: true }, { ready: false }],
      readiness: {
        headline: "The shell needs attention.",
        detail: "providers 2/6 ready · transports 0/11 ready",
      },
    });

    expect(entries.find((entry) => entry.key === "localModels")?.tone).toBe(
      "good",
    );
    expect(entries.find((entry) => entry.key === "providerKey")?.tone).toBe(
      "warn",
    );
    expect(entries.find((entry) => entry.key === "automation")?.tone).toBe(
      "good",
    );
    expect(entries.find((entry) => entry.key === "providers")?.tone).toBe(
      "warn",
    );
    expect(entries.find((entry) => entry.key === "readiness")?.tone).toBe(
      "warn",
    );
  });

  it("turns nested setup data into concise operator summaries", () => {
    expect(
      summarizeDashboardValue({
        headline: "The shell needs attention.",
        detail: "2/6 providers ready",
      }),
    ).toBe("The shell needs attention. — 2/6 providers ready");
    expect(
      summarizeDashboardValue({
        name: "doolittle",
        version: "0.1.0",
        node: "24.18.0",
        nub: "0.6.0",
      }),
    ).toBe("doolittle 0.1.0 · Node 24.18.0 · Nub 0.6.0");
    expect(
      summarizeDashboardValue([
        { id: "ollama", ready: true },
        { id: "claude", ready: false },
      ]),
    ).toBe("1/2 ready");
    expect(
      summarizeDashboardValue({ total: 21, enabled: 18, official: 10 }),
    ).toBe("Total 21 · Enabled 18 · Official 10");
  });

  it("builds next actions from operational pressure", () => {
    const actions = buildNextActions({
      pendingApprovals: 2,
      runningTasks: 1,
      repo: {
        branch: "main",
        ahead: 0,
        behind: 0,
        dirty: true,
        changedFiles: 3,
        lines: [],
      },
      setupEntries: [
        { key: "provider", label: "Provider", value: "missing", tone: "warn" },
      ],
      sessions: [],
    });

    expect(actions.map((action) => action.id)).toEqual([
      "approvals",
      "tasks",
      "setup",
      "workspace",
    ]);
    expect(actions.map((action) => action.target)).toEqual([
      "review",
      "tasks",
      "setup",
      "review",
    ]);
  });

  it("summarizes pooled spawned-agent accounts without treating them as chat readiness", () => {
    expect(
      summarizeAccountPool({
        providers: {
          "openai-codex": {
            strategy: "round-robin",
            accounts: [{ enabled: true }, { enabled: false }],
          },
          "anthropic-subscription": { strategy: "priority", accounts: [] },
        },
      }),
    ).toEqual({
      total: 2,
      enabled: 1,
      providersReady: 1,
      strategies: ["round-robin", "priority"],
    });

    const actions = buildNextActions({
      pendingApprovals: 0,
      runningTasks: 0,
      repo: {
        branch: "main",
        ahead: 0,
        behind: 0,
        dirty: false,
        changedFiles: 0,
        lines: [],
      },
      setupEntries: [],
      sessions: [],
      accountPool: { total: 0, enabled: 0, providersReady: 0, strategies: [] },
    });
    expect(actions[0]).toMatchObject({
      id: "agent-accounts",
      target: "providers",
    });
  });
});
