import { describe, expect, it } from "vitest";
import {
  defaultDraft,
  formatCount,
  projectAccentColor,
  resourceLabel,
  samePath,
} from "./models";

describe("project manager models", () => {
  it("builds a stable draft and resource label", () => {
    expect(
      defaultDraft({
        id: "repo",
        name: "Desktop",
        description: "A workspace",
        instructions: "Use Bun",
        color: "#123456",
      }),
    ).toEqual({
      name: "Desktop",
      description: "A workspace",
      instructions: "Use Bun",
      color: "#123456",
    });
    expect(
      resourceLabel({ id: "folder", kind: "folder", path: "/work/doolittle" }),
    ).toBe("doolittle");
    expect(
      resourceLabel({
        id: "named",
        kind: "file",
        path: "/work/README.md",
        label: "Docs",
      }),
    ).toBe("Docs");
  });

  it("normalizes platform-sensitive primary paths and counts", () => {
    expect(samePath("C:\\Work\\Repo\\", "c:\\work\\repo", "win32")).toBe(true);
    expect(samePath("/work/repo/", "/work/repo", "darwin")).toBe(true);
    expect(samePath("/work/repo", "/work/other", "darwin")).toBe(false);
    expect(formatCount(undefined)).toBe("No chats");
    expect(formatCount(1)).toBe("1 chat");
    expect(formatCount(3)).toBe("3 chats");
  });

  it("moves legacy default projects onto the live theme accent", () => {
    expect(projectAccentColor()).toBe("var(--accent)");
    expect(projectAccentColor("theme")).toBe("var(--accent)");
    expect(projectAccentColor("#FF6A00")).toBe("var(--accent)");
    expect(projectAccentColor("#7f91e7")).toBe("#7f91e7");
    expect(defaultDraft()).toMatchObject({ color: "theme" });
    expect(
      defaultDraft({ id: "legacy", name: "Legacy", color: "#ff6a00" }),
    ).toMatchObject({ color: "theme" });
  });
});
