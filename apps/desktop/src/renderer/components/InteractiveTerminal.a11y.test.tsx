import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InteractiveTerminal } from "./InteractiveTerminal";

describe("InteractiveTerminal accessibility", () => {
  it("links the active terminal panel to its active tab", () => {
    const markup = renderToStaticMarkup(
      createElement(InteractiveTerminal, {
        active: true,
        onSendToChat: () => undefined,
        workspacePath: "/work/doolittle",
      }),
    );
    const tabId = markup.match(/id="(interactive-terminal-[^"]+-tab)"/u)?.[1];

    expect(tabId).toBeTruthy();
    expect(markup).toContain(`aria-labelledby="${tabId}"`);
    expect(markup).toContain('aria-label="Terminal output"');
  });
});
