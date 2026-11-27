import { describe, expect, it } from "vitest";
import { fileName } from "../../apps/desktop/src/renderer/coding-workspace/models";
import { buildDesktopAcpEditorContext } from "../../apps/desktop/src/renderer/desktop-acp-model";
import { reviewItems } from "../../apps/desktop/src/renderer/review/models";
import { workspacePathBaseName } from "../../apps/desktop/src/renderer/workspace-path";

describe("workspacePathBaseName", () => {
  it.each([
    ["posix", "/home/dev/project/file.ts", "file.ts"],
    ["windows", "C:\\Users\\dev\\project\\file.ts", "file.ts"],
    ["mixed", "C:/Users/dev\\project/file.ts", "file.ts"],
    ["trailing separator", "src/nested/", "nested"],
  ] as const)("normalizes %s paths", (_label, path, expected) => {
    expect(workspacePathBaseName(path)).toBe(expected);
  });

  it("keeps root and empty paths displayable", () => {
    expect(workspacePathBaseName("/")).toBe("/");
    expect(workspacePathBaseName("")).toBe("");
  });

  it("is shared by coding, review, and ACP resource labels", () => {
    const path = "C:\\workspace\\src\\main.ts";
    expect(fileName(path)).toBe("main.ts");

    const [change] = reviewItems(null, { changes: [{ path }] }, undefined);
    expect(change?.title).toBe("main.ts");

    const context = buildDesktopAcpEditorContext(
      {
        path,
        uri: "file:///C:/workspace/src/main.ts",
        language: "typescript",
        content: "const value = 1;",
        version: 1,
        focused: true,
        visibleRanges: [],
      },
      false,
    );
    expect(context.resources[0]?.name).toBe("main.ts");
  });
});
