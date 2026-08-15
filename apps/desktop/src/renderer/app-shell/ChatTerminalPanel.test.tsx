import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../components/InteractiveTerminal", () => ({
  InteractiveTerminal: ({
    autoStart,
    dismissShortcut,
  }: {
    autoStart?: boolean;
    dismissShortcut?: string;
  }) => (
    <div
      data-auto-start={String(Boolean(autoStart))}
      data-shortcut={dismissShortcut}
    >
      Terminal
    </div>
  ),
}));

import { ChatTerminalPanel } from "./ChatTerminalPanel";

describe("ChatTerminalPanel", () => {
  it("renders the native terminal in a resizable chat split", () => {
    const markup = renderToStaticMarkup(
      <ChatTerminalPanel
        active
        height={320}
        open
        onClose={() => undefined}
        onResize={() => undefined}
        onSendToChat={() => undefined}
        platform="darwin"
        workspacePath="/workspace"
      />,
    );

    expect(markup).toContain('aria-label="Chat terminal panel"');
    expect(markup).toContain('data-open="true"');
    expect(markup).not.toContain("inert");
    expect(markup).toContain("height:320px");
    expect(markup).toContain("max-h-[58vh]");
    expect(markup).toContain("motion-reduce:duration-[0.01ms]");
    expect(markup).toContain('aria-orientation="horizontal"');
    expect(markup).toContain('data-auto-start="true"');
    expect(markup).toContain('data-shortcut="⌘J"');
  });

  it("keeps the closing panel inert while its exit motion finishes", () => {
    const markup = renderToStaticMarkup(
      <ChatTerminalPanel
        active
        height={280}
        open={false}
        onClose={() => undefined}
        onResize={() => undefined}
        onSendToChat={() => undefined}
        platform="darwin"
        workspacePath="/workspace"
      />,
    );

    expect(markup).toContain('data-open="false"');
    expect(markup).toContain("inert");
    expect(markup).toContain("height:0px");
    expect(markup).toContain("pointer-events-none");
  });
});
