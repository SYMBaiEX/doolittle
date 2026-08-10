import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const motionCss = readFileSync(
  new URL("./action-motion.css", import.meta.url),
  "utf8",
);
const main = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
const legacyCss = ["styles.css", "experience.css", "app-polish.css"]
  .map((name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8"))
  .join("\n");

describe("desktop action motion contract", () => {
  it("loads the shared action layer after the visual finish layers", () => {
    expect(main.indexOf('import "./action-motion.css"')).toBeGreaterThan(
      main.indexOf('import "./eliza-ui.css"'),
    );
  });

  it("defines restrained feedback for actions, focus, notices, and surfaces", () => {
    expect(motionCss).toContain("--motion-instant: 80ms");
    expect(motionCss).toContain(
      "--motion-enter: cubic-bezier(0.16, 1, 0.3, 1)",
    );
    expect(motionCss).toContain("touch-action: manipulation");
    expect(motionCss).toContain("translate3d(0, 1px, 0) scale(0.985)");
    expect(motionCss).toContain(":focus-visible");
    expect(motionCss).toContain("action-feedback-in");
    expect(motionCss).toContain("action-surface-in");
  });

  it("keeps press feedback single-sourced and respects reduced motion", () => {
    expect(legacyCss).not.toContain("button:not(:disabled):active {");
    expect(legacyCss).not.toContain(".primary-button:active:not(:disabled)");
    expect(motionCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none;/u,
    );
  });
});
