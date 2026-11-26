import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const surfaceCss = readFileSync(
  resolve("apps/desktop/src/renderer/chat/chat-surface.css"),
  "utf8",
);
const composerCss = readFileSync(
  resolve("apps/desktop/src/renderer/chat/composer-design.css"),
  "utf8",
);
const promptLibrary = readFileSync(
  resolve("apps/desktop/src/renderer/chat/PromptLibrary.tsx"),
  "utf8",
);

it("keeps the prompt popover inside narrow sessions with valid calc spacing", () => {
  expect(surfaceCss).toContain("inset-block-end: calc(100% + 10px);");
  expect(surfaceCss).toContain("var(--composer-prompt-library-offset");
  expect(surfaceCss).toContain(
    "calc(100cqw - var(--chat-gutter) - var(--chat-gutter))",
  );
  expect(composerCss).toContain("--composer-prompt-library-offset");
  expect(promptLibrary).not.toContain("calc(100%+10px)");
});
