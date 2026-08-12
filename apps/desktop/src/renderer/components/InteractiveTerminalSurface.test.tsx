// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InteractiveTerminalSurface } from "./InteractiveTerminalSurface";
import { createInteractiveTerminalTab } from "./interactive-terminal-store";

describe("InteractiveTerminalSurface", () => {
  it("keeps output panel identity and footer actions present", () => {
    const tab = {
      ...createInteractiveTerminalTab("Terminal 1"),
      output: "hello",
    };
    const markup = renderToStaticMarkup(
      <InteractiveTerminalSurface
        active
        activeTab={tab}
        notice=""
        onSendToChat={vi.fn()}
        onStart={vi.fn()}
        running={false}
        setTabs={vi.fn()}
        starting={false}
        viewportRef={{ current: null }}
      />,
    );
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('aria-label="Terminal output"');
    expect(markup).toContain("Active tab output is preserved");
    expect(markup).toContain(">Clear view</button>");
    expect(markup).toContain(">Add to chat</button>");
  });
});
