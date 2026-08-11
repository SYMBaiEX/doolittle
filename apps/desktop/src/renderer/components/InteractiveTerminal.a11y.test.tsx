import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InteractiveTerminal } from "./InteractiveTerminal";
import { terminalTabLabelId } from "./interactive-terminal-state";

describe("InteractiveTerminal accessibility", () => {
  it("links the active terminal panel to its active tab", () => {
    const markup = renderToStaticMarkup(
      createElement(InteractiveTerminal, {
        active: true,
        onSendToChat: () => undefined,
        workspacePath: "/work/doolittle",
      }),
    );
    const tabId = markup.match(/id="(interactive-terminal-[^"]+-label)"/u)?.[1];

    expect(tabId).toBeTruthy();
    expect(markup).toContain(`aria-labelledby="${tabId}"`);
    expect(markup).toContain('aria-label="Terminal output"');
  });

  it("uses a stable tabpanel label id across rename mode", () => {
    const tabId = "terminal-1";

    expect(terminalTabLabelId(tabId)).toBe(
      "interactive-terminal-terminal-1-label",
    );
  });
});
