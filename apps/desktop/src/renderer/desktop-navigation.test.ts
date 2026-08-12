import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPEN_SECTIONS,
  loadOpenSections,
  loadProjectScope,
  navigation,
  sessionLabel,
  viewFromHash,
  workspaceName,
} from "./desktop-navigation";

function storage(values: Record<string, string>): Pick<Storage, "getItem"> {
  return {
    getItem: (key) => values[key] ?? null,
  };
}

describe("desktop navigation descriptors", () => {
  it("keeps the shell route fallback and review alias deterministic", () => {
    expect(viewFromHash("#/chat")).toBe("chat");
    expect(viewFromHash("#/orchestration")).toBe("orchestration");
    expect(viewFromHash("#/not-a-view")).toBe("chat");
  });

  it("loads only known persisted sections and falls back when storage is invalid", () => {
    expect(
      loadOpenSections(
        storage({
          "doolittle.desktop.nav-sections.v1":
            '["manage","unknown","workspace"]',
        }),
      ),
    ).toEqual(new Set(["manage", "workspace"]));
    expect(
      loadOpenSections(
        storage({ "doolittle.desktop.nav-sections.v1": "not-json" }),
      ),
    ).toEqual(new Set(DEFAULT_OPEN_SECTIONS));
  });

  it("normalizes project scope and workspace/session labels", () => {
    expect(
      loadProjectScope(
        storage({ "doolittle.desktop.project-scope.v1": "  project-1  " }),
      ),
    ).toBe("project-1");
    expect(loadProjectScope(storage({}))).toBe("all");
    expect(workspaceName("/Users/dev/doolittle")).toBe("doolittle");
    expect(workspaceName("C:\\work\\doolittle\\")).toBe("doolittle");
    expect(
      sessionLabel({
        sessionId: "draft",
        messageCount: 0,
        participants: ["user"],
        preview: ["Preview label"],
      }),
    ).toBe("Preview label");
    expect(
      sessionLabel({
        sessionId: "resource",
        messageCount: 1,
        participants: ["user"],
        preview: ["Read /Users/symbiex/dev/test/package.json"],
      }),
    ).toBe("Read package.json");
  });

  it("exposes stable grouped navigation for the shell and utility drawer", () => {
    expect(navigation.map((section) => section.id)).toEqual([
      "workspace",
      "create",
      "observe",
      "agent",
      "manage",
    ]);
    expect(
      navigation
        .flatMap((section) => section.items)
        .some((item) => item.id === "orchestration"),
    ).toBe(true);
  });
});
