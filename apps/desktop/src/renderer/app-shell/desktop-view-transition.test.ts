import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const fallbackSource = readFileSync(
  new URL("./DesktopRouteLoadingFallback.tsx", import.meta.url),
  "utf8",
);

describe("desktop view transitions", () => {
  it("uses one transition boundary for direct and hash navigation", () => {
    expect(appSource).toContain("const applyViewTransition = useCallback(");
    expect(appSource).toContain("applyViewTransition(next);");
    expect(appSource).toContain("applyViewTransition(viewFromHash());");
    expect(appSource).toContain('if (next !== "chat") closeChatTerminal();');
    expect(appSource).toContain("if (isMobileSidebarMode) closeUtilities();");
  });

  it("uses route-neutral lazy loading copy", () => {
    expect(fallbackSource).toContain('label = "view"');
    expect(fallbackSource).toContain("Opening {label.toLowerCase()}…");
    expect(fallbackSource).not.toContain("Opening workspace");
  });
});
