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
    expect(markup).toContain("[&amp;_.xterm]:box-border");
    expect(markup).toContain("[&amp;_.xterm]:px-1.5");
    expect(markup).toContain("[&amp;_.xterm]:pb-1.25");
    expect(markup).toContain("[&amp;_.xterm-screen]:pb-1");
    expect(markup).toContain("[&amp;_.xterm-viewport]:pr-0.5");
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
    expect(markup).toContain("text-[length:var(--text-meta)]");
    expect(markup).not.toContain("gradient(");
    expect(markup).not.toContain("shadow-[0_0_");
    expect(markup).not.toContain("text-[10px]");
    expect(markup).toContain('role="status"');
  });

  it.each([
    { active: false, starting: false, label: "Open shell" },
    { active: true, starting: true, label: "Opening…" },
  ])(
    "keeps the empty shell action disabled while unavailable or opening: $label",
    ({ active, starting, label }) => {
      const markup = renderToStaticMarkup(
        <InteractiveTerminalSurface
          active={active}
          notice=""
          onStart={vi.fn()}
          running={false}
          starting={starting}
          viewportRef={{ current: null }}
        />,
      );
      const host = document.createElement("div");
      host.innerHTML = markup;
      expect(host.querySelector("button")?.disabled).toBe(true);
      expect(host.querySelector("button")?.textContent).toBe(label);
      expect(host.querySelector("button")?.className).toContain(
        "max-[760px]:min-h-11",
      );
      expect(markup).toContain("text-[length:var(--text-control)]");
      expect(markup).not.toContain("gradient(");
      expect(markup).not.toContain("shadow-[0_0_");
    },
  );
});
