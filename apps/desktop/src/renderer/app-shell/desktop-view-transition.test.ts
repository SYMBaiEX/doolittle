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
    expect(appSource).toContain(
      "if (!applyViewTransition(next)) return false;",
    );
    expect(appSource).toContain(
      "const hashNavigationRef = useRef({ applyViewTransition, view });",
    );
    expect(appSource).toContain("!current.applyViewTransition(next) &&");
    expect(appSource).toContain("}, []);");
    expect(appSource).not.toContain(
      'if (next !== "chat") closeChatTerminal();',
    );
    expect(appSource).toContain("{chatTerminalMounted ? (");
    expect(appSource).toContain(
      "if (!shouldHandleGlobalChatTerminalShortcut(view, event)) return;",
    );
    expect(appSource).toContain("if (utilityModalMode) closeUtilities();");
    expect(appSource).toContain("mobileModal={utilityModalMode}");
  });

  it("only dismisses the terminal after an accepted context handoff", () => {
    expect(appSource).toContain("void openChatWithContext({");
    expect(appSource).toContain(".then((accepted) => {");
    expect(appSource).toContain("if (accepted) closeChatTerminal(false);");
    expect(appSource).toContain(".catch(() => undefined);");
  });

  it("uses route-neutral lazy loading copy", () => {
    expect(fallbackSource).toContain('label = "view"');
    expect(fallbackSource).toContain("Opening {label.toLowerCase()}…");
    expect(fallbackSource).not.toContain("Opening workspace");
  });

  it("keeps the project sidebar behind its own shell boundary", () => {
    expect(appSource).toContain(
      "const LazyDesktopSidebar = lazy(loadDesktopSidebar)",
    );
    expect(appSource).toContain('import("./app-shell/DesktopSidebar")');
    expect(appSource).toContain("DesktopSidebarLoadingFallback");
  });

  it("marks the lazy sidebar ready for every mobile open path", () => {
    expect(appSource).toContain("void loadDesktopSidebar()");
    expect(appSource).toContain("if (!cancelled) setSidebarReady(true);");
    expect(appSource).toContain(
      "if (isMobileSidebarMode) openSidebarForMobile();",
    );
  });
});
