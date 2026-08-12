import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../experience.css", import.meta.url), "utf8");
const messageActions = readFileSync(
  new URL("./MessageActions.tsx", import.meta.url),
  "utf8",
);

describe("chat message action layout", () => {
  it("keeps actions in a dedicated footer instead of overlaying message metadata", () => {
    expect(css).toMatch(
      /\.chat-message-actions\s*{[^}]*position:\s*static;[^}]*display:\s*flex;/s,
    );
    expect(css).not.toMatch(
      /\.chat-message-actions\s*{[^}]*(?:top|right|bottom|left):/s,
    );
    expect(css).toMatch(
      /\.chat-message-footer\s*{[^}]*display:\s*flex;[^}]*min-height:\s*20px;[^}]*margin:\s*2px 0 0 34px;/s,
    );
    expect(css).toMatch(
      /\.chat-message\.user \.chat-message-footer\s*{[^}]*justify-content:\s*flex-end;[^}]*margin-left:\s*0;/s,
    );
    expect(css).not.toMatch(
      /\.chat-message\.user \.chat-message-actions\s*{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s,
    );
    expect(css).toMatch(
      /\.chat-message:hover \.chat-message-actions,\s*\.chat-message:focus-within \.chat-message-actions\s*{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s,
    );
    expect(css).toMatch(
      /@media \(hover: none\)\s*{[^}]*\.chat-message-actions\s*{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s,
    );
  });

  it("exposes the controls as one labelled toolbar", () => {
    expect(messageActions).toContain('aria-label="Message actions"');
    expect(messageActions).toContain('role="toolbar"');
  });
});
