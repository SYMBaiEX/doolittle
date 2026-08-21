import { describe, expect, it } from "vitest";
import {
  LEGACY_EXPLORER_VISIBLE_KEY,
  loadCodeWorkspaceLayout,
  saveCodeWorkspaceLayout,
  WORKSPACE_LAYOUT_STATE_KEY,
  workspaceLayoutScope,
} from "./workspace-layout-state";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe("workspace layout state", () => {
  it("normalizes equivalent workspace paths", () => {
    expect(workspaceLayoutScope(" /Users/demo/project/ ")).toBe(
      "/Users/demo/project",
    );
    expect(workspaceLayoutScope("C:\\work\\demo\\")).toBe("C:/work/demo");
    expect(workspaceLayoutScope(" ")).toBe("__default__");
  });

  it("restores an independent layout for each workspace", () => {
    const storage = memoryStorage();
    saveCodeWorkspaceLayout(
      storage,
      "/workspace/a",
      {
        explorerVisible: false,
        utilityVisible: true,
        zenMode: true,
        explorerWidth: 240,
        utilityWidth: 500,
      },
      1,
    );
    saveCodeWorkspaceLayout(
      storage,
      "/workspace/b",
      {
        explorerVisible: true,
        utilityVisible: false,
        zenMode: false,
        explorerWidth: 420,
        utilityWidth: 300,
      },
      2,
    );

    expect(loadCodeWorkspaceLayout(storage, "/workspace/a")).toMatchObject({
      explorerVisible: false,
      utilityVisible: true,
      zenMode: true,
      explorerWidth: 240,
      utilityWidth: 500,
    });
    expect(loadCodeWorkspaceLayout(storage, "/workspace/b")).toMatchObject({
      explorerVisible: true,
      utilityVisible: false,
      zenMode: false,
      explorerWidth: 420,
      utilityWidth: 300,
    });
  });

  it("migrates legacy global preferences as the fallback", () => {
    const storage = memoryStorage({ [LEGACY_EXPLORER_VISIBLE_KEY]: "false" });
    expect(loadCodeWorkspaceLayout(storage, "/workspace/new")).toMatchObject({
      explorerVisible: false,
      utilityVisible: true,
      zenMode: false,
    });
  });

  it("bounds retained workspace histories", () => {
    const storage = memoryStorage();
    for (let index = 0; index < 40; index += 1) {
      saveCodeWorkspaceLayout(
        storage,
        `/workspace/${index}`,
        {
          explorerVisible: true,
          utilityVisible: true,
          zenMode: false,
          explorerWidth: 280,
          utilityWidth: 360,
        },
        index,
      );
    }
    const persisted = JSON.parse(
      storage.values.get(WORKSPACE_LAYOUT_STATE_KEY) ?? "{}",
    );
    expect(Object.keys(persisted.layouts)).toHaveLength(32);
    expect(persisted.layouts["/workspace/39"]).toBeDefined();
    expect(persisted.layouts["/workspace/0"]).toBeUndefined();
  });
});
