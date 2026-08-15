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
    expect(appSource).toContain("if (!applyViewTransition(next)) return;");
    expect(appSource).toContain(
      "if (!applyViewTransition(next) && window.location.hash",
    );
    expect(appSource).not.toContain(
      'if (next !== "chat") closeChatTerminal();',
    );
    expect(appSource).toContain("{chatTerminalMounted ? (");
    expect(appSource).toContain("if (!isChatTerminalShortcut(event)) return;");
    expect(appSource).toContain("if (isMobileSidebarMode) closeUtilities();");
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
});
