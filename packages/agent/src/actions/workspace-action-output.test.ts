import { describe, expect, it } from "vitest";
import { formatGitStatusForOutput } from "./workspace-action/output";

describe("formatGitStatusForOutput", () => {
  it("summarizes a large dirty worktree without dumping every path", () => {
    const changes = [
      "M  packages/agent/src/staged.ts",
      " M packages/agent/src/unstaged.ts",
      "?? packages/agent/src/untracked.ts",
      "UU packages/agent/src/conflicted.ts",
      ...Array.from(
        { length: 20 },
        (_, index) => ` M packages/agent/src/change-${index}.ts`,
      ),
    ];

    const output = formatGitStatusForOutput(
      ["## main...origin/main [ahead 1]", ...changes].join("\n"),
    ).join("\n");

    expect(output).toContain("- branch: main...origin/main [ahead 1]");
    expect(output).toContain(
      "- working tree: 24 changed files (1 staged, 21 unstaged, 1 untracked, 1 conflicted)",
    );
    expect(output).toContain("… 16 more changes");
    expect(output).not.toContain("change-19.ts");
    expect(output.length).toBeLessThan(1_000);
  });

  it("reports a clean branch without a change sample", () => {
    expect(formatGitStatusForOutput("## main...origin/main")).toEqual([
      "- branch: main...origin/main",
      "- working tree: clean",
    ]);
  });
});
