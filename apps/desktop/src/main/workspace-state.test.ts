import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadWorkspaceState,
  MAX_RECENT_WORKSPACES,
  normalizeWorkspaceDirectory,
  recordWorkspaceSelection,
  WorkspaceStateManager,
} from "./workspace-state";

function withFixture(
  run: (fixture: {
    root: string;
    statePath: string;
    workspaces: string[];
  }) => void,
): void {
  const root = mkdtempSync(join(tmpdir(), "doolittle-workspaces-"));
  try {
    const workspaces = Array.from(
      { length: MAX_RECENT_WORKSPACES + 3 },
      (_, index) => {
        const path = join(root, `workspace-${index}`);
        mkdirSync(path);
        return path;
      },
    );
    run({
      root,
      statePath: join(root, "state", "workspace-state.json"),
      workspaces,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("workspace state", () => {
  it("persists the current workspace and reloads it", () => {
    withFixture(({ statePath, workspaces }) => {
      const [fallback, selected] = workspaces;
      const normalizedFallback = normalizeWorkspaceDirectory(
        fallback as string,
      );
      const normalizedSelected = normalizeWorkspaceDirectory(
        selected as string,
      );
      const manager = new WorkspaceStateManager(statePath, fallback as string);
      const result = manager.applyPickerResult({
        canceled: false,
        filePaths: [selected as string],
      });

      expect(result).toEqual({
        canceled: false,
        state: {
          currentPath: normalizedSelected,
          recentPaths: [normalizedSelected, normalizedFallback],
        },
      });
      expect(loadWorkspaceState(statePath, fallback as string)).toEqual(
        result.state,
      );
    });
  });

  it("keeps a fresh desktop unscoped until the operator selects a workspace", () => {
    withFixture(({ statePath, workspaces }) => {
      const fallback = workspaces[0] as string;
      const manager = new WorkspaceStateManager(statePath, fallback, {
        selectFallback: false,
      });

      expect(manager.getState()).toEqual({ currentPath: "", recentPaths: [] });
      expect(
        loadWorkspaceState(statePath, fallback, { selectFallback: false }),
      ).toEqual({ currentPath: "", recentPaths: [] });

      const selected = manager.applyPickerResult({
        canceled: false,
        filePaths: [workspaces[1] as string],
      });
      expect(selected.state.currentPath).toBe(
        normalizeWorkspaceDirectory(workspaces[1] as string),
      );
      expect(selected.state.recentPaths).toEqual([selected.state.currentPath]);
    });
  });

  it("deduplicates and bounds recent workspace history", () => {
    withFixture(({ workspaces }) => {
      let state = {
        currentPath: workspaces[0] as string,
        recentPaths: [workspaces[0] as string],
      };
      for (const workspace of workspaces) {
        state = recordWorkspaceSelection(state, workspace);
      }
      state = recordWorkspaceSelection(state, workspaces[4] as string);

      expect(state.currentPath).toBe(workspaces[4]);
      expect(state.recentPaths).toHaveLength(MAX_RECENT_WORKSPACES);
      expect(state.recentPaths[0]).toBe(workspaces[4]);
      expect(new Set(state.recentPaths).size).toBe(state.recentPaths.length);
    });
  });

  it("keeps cancellation completely non-mutating", () => {
    withFixture(({ statePath, workspaces }) => {
      const manager = new WorkspaceStateManager(
        statePath,
        workspaces[0] as string,
      );
      manager.applyPickerResult({
        canceled: false,
        filePaths: [workspaces[1] as string],
      });
      const beforeState = manager.getState();
      const beforeFile = readFileSync(statePath, "utf8");
      let emissions = 0;
      manager.subscribe(() => {
        emissions += 1;
      });

      const result = manager.applyPickerResult({
        canceled: true,
        filePaths: [],
      });

      expect(result).toEqual({ canceled: true, state: beforeState });
      expect(manager.getState()).toEqual(beforeState);
      expect(readFileSync(statePath, "utf8")).toBe(beforeFile);
      expect(emissions).toBe(0);
    });
  });

  it("rejects files and ignores invalid persisted directories", () => {
    withFixture(({ root, statePath, workspaces }) => {
      const filePath = join(root, "not-a-directory.txt");
      writeFileSync(filePath, "no");
      expect(() => normalizeWorkspaceDirectory(filePath)).toThrow(
        /not a directory/,
      );

      mkdirSync(join(root, "state"));
      writeFileSync(
        statePath,
        JSON.stringify({
          currentPath: join(root, "missing"),
          recentPaths: [filePath, workspaces[1]],
        }),
      );
      const normalizedFallback = normalizeWorkspaceDirectory(
        workspaces[0] as string,
      );
      const normalizedRecent = normalizeWorkspaceDirectory(
        workspaces[1] as string,
      );
      expect(loadWorkspaceState(statePath, workspaces[0] as string)).toEqual({
        currentPath: normalizedFallback,
        recentPaths: [normalizedFallback, normalizedRecent],
      });
    });
  });
});
