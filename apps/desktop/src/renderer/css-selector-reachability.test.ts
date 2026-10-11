import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const elizaTailwindCss = readFileSync(
  new URL("./eliza-tailwind.css", import.meta.url),
  "utf8",
);

describe("published Eliza component styles", () => {
  it("includes published Eliza component classes in the host Tailwind build", () => {
    expect(elizaTailwindCss).toContain(
      '@source "../../../../node_modules/@elizaos/ui/components/accounts"',
    );
    expect(elizaTailwindCss).toContain(
      '@source "../../../../node_modules/@elizaos/ui/components/composites/page-panel"',
    );
    for (const primitive of [
      "badge",
      "button",
      "checkbox",
      "dialog",
      "dropdown-menu",
      "empty-state",
      "input",
      "label",
      "scroll-area",
      "select",
      "spinner",
      "status-badge",
      "tabs",
      "textarea",
    ]) {
      expect(elizaTailwindCss).toContain(
        `@source "../../../../node_modules/@elizaos/ui/components/ui/${primitive}.js"`,
      );
    }
    expect(elizaTailwindCss).not.toContain(
      '@source "../../../../node_modules/@elizaos/ui/components/ui"',
    );
  });
});
