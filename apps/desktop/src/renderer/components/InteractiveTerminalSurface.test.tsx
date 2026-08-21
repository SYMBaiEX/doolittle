// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InteractiveTerminalSurface } from "./InteractiveTerminalSurface";
import { createInteractiveTerminalTab } from "./interactive-terminal-store";

describe("InteractiveTerminalSurface", () => {
  it("keeps output panel identity without duplicating toolbar actions", () => {
    const tab = {
      ...createInteractiveTerminalTab("Terminal 1"),
      output: "hello",
    };
    const markup = renderToStaticMarkup(
      <InteractiveTerminalSurface
        active
        activeTab={tab}
        notice=""
        onStart={vi.fn()}
        running={false}
        starting={false}
        viewportRef={{ current: null }}
      />,
    );
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('aria-label="Terminal output"');
    expect(markup).toContain("[&amp;_.xterm]:p-2");
    expect(markup).not.toContain("Terminal state is preserved");
    expect(markup).not.toContain('aria-label="Clear terminal view"');
    expect(markup).not.toContain("Add to chat");
  });

  it("explains that a stale session needs a new shell", () => {
    const tab = {
      ...createInteractiveTerminalTab("Terminal 1"),
      stale: true,
    };
    const markup = renderToStaticMarkup(
      <InteractiveTerminalSurface
        active
        activeTab={tab}
        notice=""
        onStart={vi.fn()}
        running={false}
        starting={false}
        viewportRef={{ current: null }}
      />,
    );

    expect(markup).toContain(
      "Session ended on workspace change. Open a new shell to continue.",
    );
  });
});
