import { describe, expect, it } from "vitest";
import { escapeXml } from "./xml-escape";

describe("escapeXml", () => {
  it("escapes XML metacharacters without altering ordinary text", () => {
    expect(escapeXml(`  Keep <this> & "that" and 'those'.  `)).toBe(
      "  Keep &lt;this&gt; &amp; &quot;that&quot; and &apos;those&apos;.  ",
    );
  });

  it("escapes ampersands before introducing entity text", () => {
    expect(escapeXml("&lt; &amp; &quot;")).toBe(
      "&amp;lt; &amp;amp; &amp;quot;",
    );
  });
});
