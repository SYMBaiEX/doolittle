import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const codingWorkspaceSource = readFileSync(
  new URL("./CodingWorkspacePage.tsx", import.meta.url),
  "utf8",
);
const executionEnvironmentSource = readFileSync(
  new URL("./components/ExecutionEnvironmentPanel.tsx", import.meta.url),
  "utf8",
);

describe("workspace switching ownership", () => {
  it("keeps picker and direct worktree transitions owned by App", () => {
    expect(appSource).toContain(
      "if (!result.canceled) applyWorkspaceSelection(result.state);",
    );
    expect(appSource).toContain("onChooseWorkspace={chooseWorkspace}");
    expect(appSource).toContain("onOpenWorkspacePath={openWorkspacePath}");
    expect(codingWorkspaceSource).toContain(
      "onOpenWorkspacePath={onOpenWorkspacePath}",
    );
  });

  it("opens the selected worktree path rather than launching a generic picker", () => {
    expect(executionEnvironmentSource).toContain(
      "onClick={() => void openWorktree(worktree.path)}",
    );
    expect(executionEnvironmentSource).toContain("Open worktree");
  });
});
