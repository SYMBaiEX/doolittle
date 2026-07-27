import { describe, expect, it } from "bun:test";
import {
  buildNextActions,
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
});
