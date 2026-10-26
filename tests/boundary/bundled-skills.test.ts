import { globSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

const agentRequire = createRequire(resolve("packages/agent/package.json"));
const { parseFrontmatter } = await import(
  /* @vite-ignore */ pathToFileURL(
    agentRequire.resolve("@elizaos/skills/index"),
  ).href
);

it("loads every bundled skill through the SDK parser used by workspace context", () => {
  const files = [
    ...globSync("packages/{skills,skill-packs-optional}/**/SKILL.md"),
  ];
  expect(files.length).toBeGreaterThan(20);
  for (const file of files) {
    const parsed = (() => {
      try {
        return parseFrontmatter(readFileSync(file, "utf8"));
      } catch (cause) {
        throw new Error(
          `Bundled skill cannot enter workspace context: ${file}`,
          { cause },
        );
      }
    })();
    expect(parsed.frontmatter.name, file).toEqual(expect.any(String));
    expect(parsed.frontmatter.description, file).toEqual(expect.any(String));
    expect(parsed.body.trim().length, file).toBeGreaterThan(0);
  }
});
