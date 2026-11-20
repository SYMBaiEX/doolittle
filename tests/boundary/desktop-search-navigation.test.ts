import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseApiPath } from "../../apps/desktop/src/main/ipc/agent-api-policy";
import {
  activeCommandIndex,
  buildCommandPaletteMatches,
  getFocusableCommandIndexes,
} from "../../apps/desktop/src/renderer/components/command-palette-model";
import { normalizeGlobalSearchResults } from "../../apps/desktop/src/renderer/global-search";
import { toLogViewerEntries } from "../../apps/desktop/src/renderer/log-viewer-mapping";
import {
  createNavigationTransitionCoordinator,
  navigateGlobalSearchTarget,
} from "../../apps/desktop/src/renderer/use-desktop-content-navigation";
import type { AppLogRecord } from "../../packages/agent/src/logging/logger";
import {
  buildActivityExport,
  buildActivityFeed,
} from "../../packages/agent/src/services/activity-feed";
import { LoggerService } from "../../packages/agent/src/services/logger-service";

describe("desktop observability navigation", () => {
  it("keeps the active command when search inserts results ahead of it", () => {
    const staticGroup = {
      id: "commands",
      label: "Commands",
      items: [{ id: "logs", label: "Logs" }],
    };
    const results = buildCommandPaletteMatches(
      [
        {
          id: "search",
          label: "Search",
          items: [{ id: "log-entry", label: "Log result" }],
        },
        staticGroup,
      ],
      "log",
    ).flattened;
    expect(
      results[
        activeCommandIndex(
          results,
          getFocusableCommandIndexes(results),
          "commands:logs",
        )
      ]?.id,
    ).toBe("logs");
  });

  it("carries the source and log identities into their destinations", async () => {
    const actions = {
      openProjectManager: vi.fn(),
      openSession: vi.fn(),
      openWorkspaceFile: vi.fn(async () => {}),
      pathsEqual: () => false,
      selectProjectScope: vi.fn(),
      setNavigationIntent: vi.fn(),
      setView: vi.fn(() => true),
      switchToRecentWorkspace: vi.fn(async () => false),
      workspacePath: "/fixture",
    };
    const coordinator = createNavigationTransitionCoordinator();
    const source = {
      id: "source-id",
      label: "Search source",
      value: "/fixture/search.md",
      kind: "file",
    };
    const results = normalizeGlobalSearchResults(
      {
        projects: {
          projects: [
            { id: "project-id", name: "Project", resources: [source] },
          ],
        },
        sessions: [],
        workspace: [],
        tasks: [],
        logs: { logs: [{ id: "record-id", message: "Search event" }] },
      },
      "Search",
    );
    for (const result of results)
      await navigateGlobalSearchTarget(result.target, coordinator, actions);
    expect(actions.openProjectManager).toHaveBeenCalledOnce();
    expect(actions.selectProjectScope).not.toHaveBeenCalled();
    expect(actions.setView).toHaveBeenCalledWith("logs");
    expect(
      actions.setNavigationIntent.mock.calls.map(([intent]) => intent),
    ).toMatchObject([
      {
        kind: "project-source",
        target: { projectId: "project-id", resourceId: "source-id" },
      },
      { kind: "runtime-log", target: { logId: "record-id", query: "Search" } },
    ]);
  });

  it("keeps legacy log identities stable across overlapping limits", () => {
    const dir = mkdtempSync(join(tmpdir(), "doolittle-log-search-test-"));
    try {
      const logger = new LoggerService(dir, {
        eventLogPath: join(dir, "records.jsonl"),
      });
      const legacy = {
        at: "2026-01-01T01:00:00.000Z",
        level: "info",
        scope: "test",
        message: "Duplicate",
      };
      writeFileSync(
        logger.getEventLogPath(),
        `${JSON.stringify(legacy)}\n${JSON.stringify(legacy)}\n`,
      );
      const ids = toLogViewerEntries(logger.list(100)).map((entry) => entry.id);
      expect(new Set(ids).size).toBe(2);
      expect(toLogViewerEntries(logger.list(1))[0]?.id).toBe(ids.at(-1));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses the same supported filter for activity and its redacted export", () => {
    const query = "?limit=200&kind=log&query=runtime+failure";
    for (const path of ["/activity", "/activity/export"]) {
      expect(parseApiPath(`${path}${query}`, "GET")).toBe(`${path}${query}`);
      expect(() =>
        parseApiPath(`${path}?query=${"x".repeat(257)}`, "GET"),
      ).toThrow("Unsupported query");
    }
    const events: AppLogRecord[] = [
      {
        at: "2026-01-01T01:00:00.000Z",
        level: "info",
        scope: "test",
        message: "Safe",
      },
      {
        at: "2026-01-01T01:01:00.000Z",
        level: "error",
        scope: "test",
        message: "Private raw message",
        fields: { token: "private-field" },
      },
    ];
    const feed = buildActivityFeed(
      {
        logger: { list: () => events },
        runController: { listReceipts: () => [] },
        executionApprovals: { list: () => [] },
        delivery: { recent: () => [] },
        terminal: { recent: () => [] },
        autocoderPipeline: { list: () => [] },
      },
      { filters: { kind: "log", query: "  Runtime Failure  " } },
    );
    const exported = buildActivityExport(feed);
    expect(feed.events.map(({ title }) => title)).toEqual([
      "Runtime failure recorded",
    ]);
    expect(exported.events).toMatchObject([
      { kind: "log", status: "failed", title: "Runtime failure recorded" },
    ]);
    expect(JSON.stringify(exported)).not.toContain("Private raw message");
    expect(JSON.stringify(exported)).not.toContain("private-field");
    expect(JSON.stringify(exported)).not.toContain("sourceId");
  });
});
