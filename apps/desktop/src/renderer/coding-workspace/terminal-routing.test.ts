import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const utilitySource = readFileSync(
  new URL("./CodingWorkspaceUtility.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../CodingWorkspacePage.tsx", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL("../app-shell/DesktopRouteContent.tsx", import.meta.url),
  "utf8",
);

describe("coding terminal routing", () => {
  it("routes Code terminal intent to the persistent Chat terminal", () => {
    expect(utilitySource).not.toContain(
      'import { InteractiveTerminal } from "../components/InteractiveTerminal"',
    );
    expect(utilitySource).toContain("onOpenTerminal");
    expect(utilitySource).toContain("Terminal lives with Chat");
    expect(pageSource).toContain(
      'if (nextPane === "terminal") onOpenChatTerminal();',
    );
    expect(routeSource).toContain(
      "onOpenChatTerminal={navigation.openChatTerminal}",
    );
  });
});
