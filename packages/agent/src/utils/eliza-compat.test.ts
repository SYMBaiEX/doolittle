import type { Memory } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { escapeXml, messageText } from "./eliza-compat";

function memory(content: Memory["content"]): Memory {
  return { content } as Memory;
}

describe("Eliza compatibility utilities", () => {
  it("delegates structured memory text to the official Eliza helper", () => {
    expect(messageText(memory({ text: "structured" }))).toBe("structured");
    expect(messageText(memory({}))).toBe("");
  });

  it("preserves legacy string content until all stored memories are migrated", () => {
    expect(messageText(memory("legacy" as unknown as Memory["content"]))).toBe(
      "legacy",
    );
  });

  it("preserves the empty fallback for malformed legacy memories", () => {
    expect(messageText(memory(null as unknown as Memory["content"]))).toBe("");
  });

  it("escapes every XML-sensitive character", () => {
    expect(escapeXml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&apos;");
  });
});
