import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../components/InteractiveTerminal", () => ({
  InteractiveTerminal: ({ dismissShortcut }: { dismissShortcut?: string }) => (
    <div data-shortcut={dismissShortcut}>Terminal</div>
  ),
}));

import { ChatTerminalPanel } from "./ChatTerminalPanel";

describe("ChatTerminalPanel", () => {
  it("renders the native terminal in a resizable chat split", () => {
    const markup = renderToStaticMarkup(
      <ChatTerminalPanel
        active
        height={320}
        onClose={() => undefined}
        onResize={() => undefined}
        onSendToChat={() => undefined}
        platform="darwin"
        workspacePath="/workspace"
      />,
    );

    expect(markup).toContain('aria-label="Chat terminal panel"');
    expect(markup).toContain("--chat-terminal-height:320px");
    expect(markup).toContain('aria-orientation="horizontal"');
    expect(markup).toContain('data-shortcut="⌘J"');
  });
});
