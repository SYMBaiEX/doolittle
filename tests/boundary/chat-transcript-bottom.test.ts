import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const surfaceCss = readFileSync(
  resolve("apps/desktop/src/renderer/chat/chat-surface.css"),
  "utf8",
);
const chatPage = readFileSync(
  resolve("apps/desktop/src/renderer/ChatPage.tsx"),
  "utf8",
);

it("positions the jump control above the whole bottom notice cluster", () => {
  expect(surfaceCss).toMatch(
    /\.chat-transcript-bottom\s*\{[\s\S]*?position: relative;/u,
  );
  expect(surfaceCss).toMatch(
    /\.chat-jump-to-latest\s*\{[\s\S]*?inset-block-end: calc\(100% \+ 12px\);/u,
  );

  const bottomCluster = chatPage.indexOf('className="chat-transcript-bottom"');
  const jumpControl = chatPage.indexOf('className="chat-jump-to-latest"');
  const notices = chatPage.indexOf('className="chat-panel-notices"');
  expect(bottomCluster).toBeGreaterThanOrEqual(0);
  expect(jumpControl).toBeGreaterThan(bottomCluster);
  expect(notices).toBeGreaterThan(jumpControl);
});
