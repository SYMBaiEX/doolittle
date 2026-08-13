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
      /\.chat-message-actions\s*{[^}]*position:\s*static;[^}]*display:\s*flex;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*flex-wrap:\s*wrap;[^}]*justify-content:\s*flex-end;/s,
    );
    expect(css).not.toMatch(
      /\.chat-message-actions\s*{[^}]*(?:top|right|bottom|left):/s,
    );
    expect(css).toMatch(
      /\.chat-message-footer\s*{[^}]*display:\s*flex;[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*min-height:\s*20px;[^}]*margin:\s*2px 0 0 34px;/s,
    );
    expect(css).toMatch(
      /\.chat-message\.user \.chat-message-footer\s*{[^}]*width:\s*min\(100%,\s*680px\);[^}]*justify-content:\s*flex-end;[^}]*margin-left:\s*0;/s,
    );
    expect(css).toMatch(
      /\.chat-message-actions button\s*{[^}]*pointer-events:\s*none;[^}]*padding:/s,
    );
    expect(css).toMatch(
      /\.chat-message-actions\s*{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;[^}]*transform:\s*translateY\(2px\);/s,
    );
    expect(css).toMatch(
      /\.chat-message\.user:hover \.chat-message-actions,\s*\.chat-message\.assistant:hover \.chat-message-actions,\s*\.chat-message:has\(\.chat-message-actions button:focus-visible\)\s*\.chat-message-actions\s*{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s,
    );
    expect(css).toMatch(
      /\.chat-message\.user \.chat-message-actions,\s*\.chat-message\.assistant \.chat-message-actions\s*{[^}]*opacity:\s*0;/s,
    );
    expect(css).not.toContain(
      ".chat-message:focus-within .chat-message-actions",
    );
    expect(css).toMatch(
      /@media \(hover: none\) and \(pointer: coarse\)\s*{[^}]*\.chat-message-actions\s*{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;[^}]*transform:\s*translateY\(0\);/s,
    );
    expect(css).toMatch(
      /\.chat-message-actions\s*{[^}]*transition:\s*\n?\s*opacity 140ms ease,\s*\n?\s*transform 140ms ease;/s,
    );
  });

  it("exposes the controls as one labelled toolbar", () => {
    expect(messageActions).toContain('aria-label="Message actions"');
    expect(messageActions).toContain('role="toolbar"');
  });
});
