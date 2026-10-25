import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const rootRequire = createRequire(import.meta.url);
const legacyRequire = createRequire(
  resolve("node_modules/@jimp/plugin-crop/package.json"),
);
const legacyEntry = legacyRequire.resolve("zod");
const v4Entry = rootRequire.resolve("zod");

// Exercise the actual installed CommonJS and ESM entrypoints used by consumers,
// including the legacy compatibility surface bundled in current Zod releases.
for (const [label, entry] of [
  ["legacy CommonJS", legacyEntry],
  ["legacy ESM", legacyEntry.replace(/index\.cjs$/, "index.js")],
  ["legacy v4 CommonJS", legacyEntry.replace(/index\.cjs$/, "v4/index.cjs")],
  ["legacy v4 ESM", legacyEntry.replace(/index\.cjs$/, "v4/index.js")],
  ["current v3 CommonJS", v4Entry.replace(/index\.cjs$/, "v3/index.cjs")],
  ["current v3 ESM", v4Entry.replace(/index\.cjs$/, "v3/index.js")],
  ["current v4", v4Entry],
] as const) {
  describe(label, () => {
    it("rejects oversized arrays before element work or refinements", async () => {
      const { z } = await import(/* @vite-ignore */ pathToFileURL(entry).href);
      let walked = 0;
      let refined = 0;
      const element = z.string().transform((value: string) => {
        walked++;
        return value.toUpperCase();
      });
      for (const array of [
        z.array(element).max(2),
        z.array(element).length(2),
      ]) {
        const result = await array
          .refine(() => {
            refined++;
            return true;
          })
          .safeParseAsync(Array(50_000).fill("a"));
        expect(result.success).toBe(false);
        expect(result.error.issues).toHaveLength(1);
        expect(result.error.issues[0].code).toBe("too_big");
      }
      expect([walked, refined]).toEqual([0, 0]);
      expect(z.array(element).max(2).parse(["a", "b"])).toEqual(["A", "B"]);
      expect(walked).toBe(2);
    });

    it("preserves set bounds, nested error paths and ordinary validation", async () => {
      const { z } = await import(/* @vite-ignore */ pathToFileURL(entry).href);
      let walked = 0;
      const element = z.number().refine(() => {
        walked++;
        return true;
      });
      const result = z
        .object({ items: z.set(element).max(1) })
        .safeParse({ items: new Set([1, 2, 3]) });
      expect(result.success).toBe(false);
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0].path).toEqual(["items"]);
      expect(walked).toBe(0);
      expect(
        z
          .set(element)
          .max(2)
          .parse(new Set([1, 2])),
      ).toEqual(new Set([1, 2]));
      expect(z.array(z.number()).max(2).safeParse(["bad"]).success).toBe(false);
      expect(z.array(z.string()).min(2).safeParse(["a"]).success).toBe(false);
    });
    if (label.includes("v4")) {
      it("checks map bounds and respects earlier value-rewriting checks", async () => {
        const { z } = await import(
          /* @vite-ignore */ pathToFileURL(entry).href
        );
        let walked = 0;
        const value = z.number().refine(() => {
          walked++;
          return true;
        });
        const result = z
          .map(z.string(), value)
          .check(z.maxSize(1))
          .safeParse(
            new Map([
              ["a", 1],
              ["b", 2],
            ]),
          );
        expect(result.success).toBe(false);
        expect(result.error.issues).toHaveLength(1);
        expect(walked).toBe(0);
        expect(
          z
            .array(z.number())
            .overwrite((input: number[]) => input.slice(0, 1))
            .max(1)
            .parse([1, 2, 3]),
        ).toEqual([1]);
      });
    }
  });
}
