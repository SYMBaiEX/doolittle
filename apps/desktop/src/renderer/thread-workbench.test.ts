import { describe, expect, it } from "bun:test";
import {
  buildBriefPlanSummary,
  clampThreadWorkbenchWidth,
  createThreadWorkbenchState,
  loadThreadWorkbenchState,
  parseThreadWorkbenchState,
  saveThreadWorkbenchState,
  THREAD_WORKBENCH_DEFAULT_WIDTH,
  THREAD_WORKBENCH_MAX_WIDTH,
  THREAD_WORKBENCH_MIN_WIDTH,
  type ThreadWorkbenchStorage,
  threadWorkbenchStorageKey,
  workspaceNameFromPath,
} from "./thread-workbench";

function memoryStorage(): ThreadWorkbenchStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe("thread workbench state", () => {
  it("creates a local-v1 session context from POSIX and Windows paths", () => {
    expect(workspaceNameFromPath("/Users/dev/doolittle/")).toBe("doolittle");
    expect(workspaceNameFromPath("C:\\work\\doolittle")).toBe("doolittle");

    expect(
      createThreadWorkbenchState({
        sessionId: "session-1",
        workspacePath: "/work/doolittle",
      }),
    ).toEqual({
      sessionId: "session-1",
      workspacePath: "/work/doolittle",
      workspaceName: "doolittle",
      environment: "local-v1",
      branch: "",
      head: "",
      lifecycle: "idle",
      selectedTab: "files",
      railOpen: true,
      railWidth: THREAD_WORKBENCH_DEFAULT_WIDTH,
    });
  });

  it("persists independent rail preferences for each session", () => {
    const storage = memoryStorage();
    const first = createThreadWorkbenchState({
      sessionId: "first",
      workspacePath: "/work/alpha",
    });
    saveThreadWorkbenchState(
      {
        ...first,
        selectedTab: "terminal",
        railOpen: false,
        railWidth: 444,
      },
      storage,
    );

    expect(
      loadThreadWorkbenchState(
        { sessionId: "first", workspacePath: "/work/alpha" },
        storage,
      ),
    ).toMatchObject({
      selectedTab: "terminal",
      railOpen: false,
      railWidth: 444,
    });
    expect(
      loadThreadWorkbenchState(
        { sessionId: "second", workspacePath: "/work/beta" },
        storage,
      ),
    ).toMatchObject({
      selectedTab: "files",
      railOpen: true,
      railWidth: THREAD_WORKBENCH_DEFAULT_WIDTH,
    });
    expect(storage.values.has(threadWorkbenchStorageKey("first"))).toBe(true);
  });

  it("sanitizes corrupted persisted values and keeps current identity", () => {
    const fallback = createThreadWorkbenchState({
      sessionId: "current",
      workspacePath: "/current/workspace",
      lifecycle: "active",
    });
    const parsed = parseThreadWorkbenchState(
      {
        sessionId: "stale",
        workspacePath: "/stale/workspace",
        workspaceName: "stale-workspace",
        environment: "cloud",
        selectedTab: "unknown",
        lifecycle: "destroyed",
        railWidth: 9_999,
        railOpen: "yes",
      },
      fallback,
    );

    expect(parsed).toMatchObject({
      sessionId: "current",
      workspacePath: "/current/workspace",
      workspaceName: "workspace",
      environment: "local-v1",
      selectedTab: "files",
      lifecycle: "active",
      railOpen: true,
      railWidth: THREAD_WORKBENCH_MAX_WIDTH,
    });
  });

  it("clamps rail width to usable compact bounds", () => {
    expect(clampThreadWorkbenchWidth(100)).toBe(THREAD_WORKBENCH_MIN_WIDTH);
    expect(clampThreadWorkbenchWidth(401.6)).toBe(402);
    expect(clampThreadWorkbenchWidth(Number.NaN)).toBe(
      THREAD_WORKBENCH_DEFAULT_WIDTH,
    );
    expect(clampThreadWorkbenchWidth(900)).toBe(THREAD_WORKBENCH_MAX_WIDTH);
  });

  it("builds a brief plan summary from active and draft plans", () => {
    const result = buildBriefPlanSummary([
      {
        id: "p-archived",
        title: "Archived plan",
        objective: "Old objective",
        status: "completed",
        steps: ["already done"],
      },
      {
        id: "p-draft",
        title: "Draft plan",
        objective: "Draft objective",
        status: "draft",
        steps: ["Draft step one"],
      },
      {
        id: "p-active",
        title: "Active plan",
        objective: "Active objective",
        status: "active",
        steps: ["First action"],
      },
    ]);

    expect(result.activePlan).toEqual({
      id: "p-active",
      title: "Active plan",
      objective: "Active objective",
      status: "active",
      nextStep: "First action",
      stepCount: 1,
    });
    expect(result.draftCount).toBe(1);
  });

  it("uses the first draft when no active plan exists", () => {
    const result = buildBriefPlanSummary([
      {
        title: "Draft one",
        status: "draft",
        steps: ["Prepare context"],
      },
      {
        title: "Draft two",
        status: "draft",
        steps: [],
      },
    ]);

    expect(result.activePlan).toEqual({
      id: "plan-0",
      title: "Draft one",
      objective: "Unavailable",
      status: "draft",
      nextStep: "Prepare context",
      stepCount: 1,
    });
    expect(result.draftCount).toBe(2);
  });

  it("returns no active plan when no suitable plans exist", () => {
    const result = buildBriefPlanSummary([
      {
        status: "completed",
        title: "Done",
        objective: "Done objective",
      },
    ]);

    expect(result.activePlan).toBeNull();
    expect(result.draftCount).toBe(0);
  });

  it("fails soft when serialized storage is malformed", () => {
    const storage = memoryStorage();
    storage.setItem(threadWorkbenchStorageKey("broken"), "{not-json");
    const state = loadThreadWorkbenchState(
      { sessionId: "broken", workspacePath: "/work/broken" },
      storage,
    );

    expect(state.workspaceName).toBe("broken");
    expect(state.selectedTab).toBe("files");
  });
});
