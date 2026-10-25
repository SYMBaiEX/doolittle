import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const braces = require("@dieub/braces-depth-guard");

it("preserves shell brace lists, ranges, escaping and compiled glob matching", () => {
  expect(braces.expand("src/{a,b}.{ts,tsx}")).toEqual([
    "src/a.ts",
    "src/a.tsx",
    "src/b.ts",
    "src/b.tsx",
  ]);
  expect(braces.expand("file-{01..03}.ts")).toEqual([
    "file-01.ts",
    "file-02.ts",
    "file-03.ts",
  ]);
  expect(braces.expand("\\{literal\\}")).toEqual(["{literal}"]);
  const expression = new RegExp(`^${braces("src/{a,b}.ts")[0]}$`);
  expect(expression.test("src/a.ts")).toBe(true);
  expect(expression.test("src/c.ts")).toBe(false);
});

it("keeps transitive glob consumers on the canonical guarded implementation", () => {
  const globRequire = createRequire(
    resolve("node_modules/micromatch/package.json"),
  );
  expect(globRequire("braces/package.json")).toMatchObject({
    name: "@dieub/braces-depth-guard",
    version: "3.0.3-pn.3",
  });
  expect(globRequire("micromatch").braceExpand("{one,two}")).toEqual([
    "one",
    "two",
  ]);
});

it("rejects excessive parser and recursive AST depth instead of exhausting the stack", () => {
  expect(() => braces(`${"{".repeat(300)}x${"}".repeat(300)}`)).toThrow(
    /depth/,
  );
  const root = { type: "root", nodes: [] as unknown[] };
  let parent = root;
  for (let index = 0; index < 300; index++) {
    const child = { type: "root", nodes: [] as unknown[] };
    parent.nodes.push(child);
    parent = child;
  }
  for (const operation of [braces.compile, braces.expand, braces.stringify]) {
    expect(() => operation(root)).toThrow(/depth/);
  }
});
