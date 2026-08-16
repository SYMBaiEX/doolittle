import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { desktopRouteFocusScope } from "./route-focus-state";

const routeContentSource = readFileSync(
  new URL("./DesktopRouteContent.tsx", import.meta.url),
  "utf8",
);
const codingSource = readFileSync(
  new URL("../CodingWorkspacePage.tsx", import.meta.url),
  "utf8",
);
const workSource = readFileSync(
  new URL("../OrchestrationPage.tsx", import.meta.url),
  "utf8",
);

describe("desktop route focus", () => {
  test("keys Code and Work snapshots by both workspace and project scope", () => {
    expect(desktopRouteFocusScope("/work/a", "project-a")).not.toBe(
      desktopRouteFocusScope("/work/a", "project-b"),
    );
    expect(desktopRouteFocusScope("/work/a", "project-a")).not.toBe(
      desktopRouteFocusScope("/work/b", "project-a"),
    );
  });

  test("hands Code focus back through an inactive Chat route", () => {
    expect(routeContentSource).toContain("key={focusScope}");
    expect(routeContentSource).toContain("focusState={focusForScope?.code}");
    expect(routeContentSource).toContain("code: state");
    expect(codingSource).toContain("focusState?.selectedPath");
    expect(codingSource).toContain("focusState?.acpTaskDraft");
    expect(codingSource).toContain("onFocusStateChange?.({");
  });

  test("hands Work selections back through an inactive Chat route", () => {
    expect(routeContentSource).toContain("focusState={focusForScope?.work}");
    expect(routeContentSource).toContain("work: state");
    expect(workSource).toContain("focusState?.selectedTaskId");
    expect(workSource).toContain("focusState?.selectedWorkerId");
    expect(workSource).toContain("focusState?.selectedPlanId");
    expect(workSource).toContain("focusState?.selectedRunId");
  });
});
