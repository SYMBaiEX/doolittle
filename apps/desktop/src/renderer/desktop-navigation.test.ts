import { describe, expect, it } from "vitest";
import {
  desktopHashForView,
  loadProjectScope,
  navigation,
  primaryViewForView,
  renderedViewForView,
  resolveDesktopHash,
  sessionLabel,
  viewFromHash,
  views,
  workspaceName,
} from "./desktop-navigation";

function storage(values: Record<string, string>): Pick<Storage, "getItem"> {
  return {
    getItem: (key) => values[key] ?? null,
  };
}

describe("desktop navigation descriptors", () => {
  it("parses canonical destination hashes and legacy route aliases", () => {
    expect(viewFromHash("#/chat")).toBe("chat");
    expect(viewFromHash("#/chat/history")).toBe("sessions");
    expect(viewFromHash("#/work/review")).toBe("review");
    expect(viewFromHash("#/settings/models")).toBe("models");
    expect(viewFromHash("#/orchestration")).toBe("orchestration");
    expect(viewFromHash("#/not-a-view")).toBe("chat");
    expect(resolveDesktopHash("#/orchestration")).toMatchObject({
      canonicalHash: "#/work",
      legacy: true,
      view: "orchestration",
    });
    expect(resolveDesktopHash("#/settings/models")).toMatchObject({
      canonicalHash: "#/settings/models",
      legacy: false,
      view: "models",
    });
    expect(primaryViewForView("browser")).toBe("code");
    expect(primaryViewForView("models")).toBe("settings");
    expect(primaryViewForView("runtime")).toBe("settings");
    expect(renderedViewForView("sessions")).toBe("chat");
    expect(renderedViewForView("browser")).toBe("code");
    expect(renderedViewForView("automations")).toBe("orchestration");
    expect(renderedViewForView("runtime")).toBe("settings");
    expect(renderedViewForView("activity")).toBe("activity");
  });

  it("canonicalizes every supported legacy view alias", () => {
    for (const view of views) {
      const resolved = resolveDesktopHash(`#/${view}`);
      expect(resolved.view).toBe(view);
      expect(resolved.canonicalHash).toBe(desktopHashForView(view));
      if (["chat", "code", "settings"].includes(view)) {
        expect(resolved.legacy).toBe(false);
      } else {
        expect(resolved.legacy).toBe(true);
      }
    }
  });

  it("maps each route to one semantic rendered owner", () => {
    const owners = [...views].map((view) => renderedViewForView(view));
    expect(owners).toHaveLength(views.size);
    expect(owners.every((owner) => views.has(owner))).toBe(true);
    expect(new Set(owners)).toEqual(
      new Set([
        "dashboard",
        "activity",
        "analytics",
        "chat",
        "code",
        "orchestration",
        "settings",
      ]),
    );
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

  it("exposes stable grouped navigation for the shell and command palette", () => {
    expect(navigation.map((section) => section.id)).toEqual([
      "home",
      "chat",
      "code",
      "work",
      "settings",
    ]);
    expect(
      navigation
        .flatMap((section) => section.items)
        .some((item) => item.id === "orchestration"),
    ).toBe(true);
    expect(navigation.find((section) => section.id === "home")?.items).toEqual([
      { id: "dashboard", label: "Home" },
      { id: "activity", label: "Activity" },
      { id: "analytics", label: "Insights" },
    ]);
    expect(navigation.find((section) => section.id === "work")).toMatchObject({
      label: "Tasks",
      items: [
        { id: "orchestration", label: "Tasks" },
        { id: "review", label: "Review" },
        { id: "automations", label: "Automations" },
        { id: "gateway", label: "Inbox" },
      ],
    });
  });
});
