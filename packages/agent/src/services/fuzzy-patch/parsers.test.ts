import { describe, expect, test } from "bun:test";
import {
  parsePatchOperations,
  parseSearchReplaceBlocks,
  parseUnifiedDiff,
} from "./parsers";

describe("fuzzy patch parsers", () => {
  test("parses unified diffs into patch operations", () => {
    const ops = parseUnifiedDiff(`@@ -1,3 +1,3 @@
 alpha
-bravo
+charlie
 delta`);

    expect(ops).toEqual([
      {
        search: ["alpha", "bravo", "delta"],
        replace: ["alpha", "charlie", "delta"],
      },
    ]);
  });

  test("parses search/replace blocks", () => {
    const ops = parseSearchReplaceBlocks(`<<<SEARCH
one
===
two
>>>REPLACE`);

    expect(ops).toEqual([
      {
        search: ["one"],
        replace: ["two"],
      },
    ]);
  });

  test("parses raw JSON operations", () => {
    const ops = parsePatchOperations(
      JSON.stringify([{ search: ["a"], replace: ["b"] }]),
    );

    expect(ops).toEqual([{ search: ["a"], replace: ["b"] }]);
  });
});
