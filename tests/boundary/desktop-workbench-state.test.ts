import { describe, expect, it } from "vitest";
import {
  buildBriefPlanSummary,
  createThreadWorkbenchState,
  loadThreadWorkbenchState,
  parseThreadWorkbenchState,
  saveThreadWorkbenchState,
  type ThreadWorkbenchStorage,
  threadWorkbenchStorageKey,
  workspaceNameFromPath,
} from "../../apps/desktop/src/renderer/thread-workbench";

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
      botId: "",
      sessionId: "session-1",
      workspacePath: "/work/doolittle",
      workspaceName: "doolittle",
      environment: "local-v1",
      branch: "",
      head: "",
      lifecycle: "idle",
      selectedFile: "",
      selectedChange: "",
      selectedCommand: "",
    });
  });

  it("sanitizes corrupted persisted values and keeps current identity", () => {
    const fallback = createThreadWorkbenchState({
      sessionId: "current",
      workspacePath: "/current/workspace",
      lifecycle: "active",
    });
    const parsed = parseThreadWorkbenchState(
      {
        botId: "",
        sessionId: "current",
        workspacePath: "/current/workspace",
        workspaceName: "stale-workspace",
        environment: "cloud",
        lifecycle: "destroyed",
        selectedFile: 123,
      },
      fallback,
    );

    expect(parsed).toMatchObject({
      sessionId: "current",
      workspacePath: "/current/workspace",
      workspaceName: "workspace",
      environment: "local-v1",
      lifecycle: "active",
      selectedFile: "",
    });
  });

  it("keeps file, change and command selections across inspector remounts", () => {
    const storage = memoryStorage();
    const identity = {
      botId: "bot-a",
      sessionId: "session",
      workspacePath: "/a",
    };
    const state = {
      ...createThreadWorkbenchState(identity),
      selectedFile: "src/a.ts",
      selectedChange: "src/b.ts",
      selectedCommand: "command-1",
    };
    saveThreadWorkbenchState(state, storage);
    expect(loadThreadWorkbenchState(identity, storage)).toMatchObject({
      selectedFile: "src/a.ts",
      selectedChange: "src/b.ts",
      selectedCommand: "command-1",
    });
  });

  it("isolates bot, session and workspace and rejects mismatched or legacy hydration", () => {
    const storage = memoryStorage();
    const identity = {
      botId: "bot-a",
      sessionId: "session",
      workspacePath: "/a",
    };
    const state = {
      ...createThreadWorkbenchState(identity),
      selectedFile: "private.ts",
    };
    saveThreadWorkbenchState(state, storage);
    for (const other of [
      { ...identity, botId: "bot-b" },
      { ...identity, sessionId: "another" },
      { ...identity, workspacePath: "/b" },
    ]) {
      expect(loadThreadWorkbenchState(other, storage).selectedFile).toBe("");
      // Reject misplaced/corrupt records even if stored under the correct key.
      storage.setItem(threadWorkbenchStorageKey(other), JSON.stringify(state));
      expect(loadThreadWorkbenchState(other, storage).selectedFile).toBe("");
    }
    expect(
      parseThreadWorkbenchState(
        { ...state, botId: undefined },
        createThreadWorkbenchState(identity),
      ).selectedFile,
    ).toBe("");
    const legacy = memoryStorage();
    legacy.setItem(
      "doolittle.desktop.thread-workbench.v1:session",
      JSON.stringify(state),
    );
    expect(loadThreadWorkbenchState(identity, legacy).selectedFile).toBe("");
  });

  it("never hydrates repository or execution facts from view storage", () => {
    const fallback = createThreadWorkbenchState({
      botId: "bot-a",
      sessionId: "session",
      workspacePath: "/a",
      branch: "fresh",
    });
    const state = parseThreadWorkbenchState(
      {
        ...fallback,
        branch: "stale",
        head: "old",
        worktreePath: "/other",
        lifecycle: "completed",
      },
      fallback,
    );
    expect(state).toMatchObject({
      branch: "fresh",
      head: "",
      lifecycle: "idle",
    });
    expect(state.worktreePath).toBeUndefined();
    const storage = memoryStorage();
    saveThreadWorkbenchState(
      {
        ...state,
        branch: "secret-branch",
        head: "old",
        worktreePath: "/other",
      },
      storage,
    );
    const saved = JSON.parse(
      storage.getItem(threadWorkbenchStorageKey(state)) ?? "{}",
    );
    expect(saved.branch).toBeUndefined();
    expect(saved.head).toBeUndefined();
    expect(saved.worktreePath).toBeUndefined();
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
    storage.setItem(
      threadWorkbenchStorageKey({
        sessionId: "broken",
        workspacePath: "/work/broken",
      }),
      "{not-json",
    );
    const state = loadThreadWorkbenchState(
      { sessionId: "broken", workspacePath: "/work/broken" },
      storage,
    );

    expect(state.workspaceName).toBe("broken");
    expect(state.selectedFile).toBe("");
  });
});
