import { describe, expect, it } from "vitest";
import { getTuiTheme } from "../../packages/agent/src/runtime/theme-catalog";
import { buildHeaderContent } from "../../apps/cli/src/cli/cockpit-chrome";
import { escapeBlessed } from "../../apps/cli/src/cli/render-utils";

describe("blessed tag escaping at widget boundaries", () => {
  it("escapes blessed-like markup inside the agent name in the cockpit header", () => {
    const theme = getTuiTheme("orange");
    // The header widget renders with tags enabled; braces in user-controlled
    // text must survive as literal characters, not as style tags.
    const content = buildHeaderContent("Evil{red-fg}Bot{/}", theme);
    expect(content).not.toContain("{red-fg}");
    expect(content).toContain(escapeBlessed("Evil{red-fg}Bot{/}"));
  });

  it("escapes braces from project labels and theme chrome in the header", () => {
    const theme = getTuiTheme("ember");
    // Ember catalog values carry literal braces (sigil "{##}", face "{ok}");
    // they must all pass through escaped so blessed renders them as text.
    const content = buildHeaderContent("Doolittle", theme);
    expect(content).not.toMatch(/\{##\}(?!\/)/u);
    expect(content).toContain(escapeBlessed(theme.sigil));
    expect(content).toContain(escapeBlessed(theme.idleFace));
  });
});
