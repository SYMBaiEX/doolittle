import { readFileSync } from "node:fs";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const bodyClasses = html.match(/<body\s+class="([^"]+)"/u)?.[1] ?? "";
const interactiveSelectors = [
  "[&_button]",
  "[&_a[href]]",
  "[&_summary]",
  "[&_[role=button]]",
  "[&_[role=tab]]",
  "[&_input]",
  "[&_select]",
  "[&_textarea]",
];
const feedbackProperties =
  "background-color,border-color,color,box-shadow,opacity,transform,translate,scale";

describe("shared interactive motion contract", () => {
  it("compiles visual and press feedback without animating layout dimensions", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const css = compiler.build(bodyClasses.split(/\s+/u));

    expect(bodyClasses).not.toContain("transition-all");
    for (const selector of interactiveSelectors) {
      expect(bodyClasses).toContain(
        `${selector}:transition-[${feedbackProperties}]`,
      );
      expect(bodyClasses).toContain(`${selector}:duration-150`);
      expect(bodyClasses).toContain(
        `motion-reduce:${selector}:transition-none`,
      );
    }
    const transitionProperties = [
      ...css.matchAll(/transition-property: ([^;]+);/gu),
    ].map((match) => match[1].replace(/\s+/gu, ""));
    expect(transitionProperties.filter((value) => value !== "none")).toEqual(
      Array.from({ length: 8 }, () => feedbackProperties),
    );
    expect(
      transitionProperties.filter((value) => value === "none"),
    ).toHaveLength(8);
    expect(css).toContain("transition-duration: 150ms");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    // Tailwind's individual translate/scale properties keep the existing press
    // feedback animated; transform alone would not include those properties.
    expect(bodyClasses.match(/:translate-y-px/gu)).toHaveLength(4);
    expect(bodyClasses.match(/:scale-\[0\.985\]/gu)).toHaveLength(4);
    expect(css.match(/scale: 0\.985;/gu)).toHaveLength(4);
    expect(bodyClasses.match(/:touch-manipulation/gu)).toHaveLength(5);
    expect(css).toContain("touch-action: manipulation");
  });

  it("uses the contrast-protected focus token for all global focus outlines", async () => {
    const focusCandidates = bodyClasses
      .split(/\s+/u)
      .filter((candidate) => candidate.includes(":outline-["));
    expect(focusCandidates).toHaveLength(6);
    for (const candidate of focusCandidates) {
      expect(candidate).toContain(":outline-[var(--focus-ring)]");
    }
    const compiler = await compile("@tailwind utilities;");
    const css = compiler.build(focusCandidates);
    expect(css.match(/outline-color: var\(--focus-ring\)/gu)).toHaveLength(6);
    expect(css).not.toContain("color-mix");
  });
});
