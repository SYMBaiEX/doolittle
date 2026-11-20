import { expect, it } from "vitest";
import {
  parseAgentMessage,
  safeHttpMessageUrl,
  webSearchResults,
} from "../../apps/desktop/src/renderer/components/message-output";

it("preserves Markdown examples while still separating legacy tool output", () => {
  const tool = JSON.stringify({
    type: "tool_call",
    messageId: "legacy",
    toolCall: { id: "tool", name: "READ_FILE" },
  });
  const example = ["~~~~markdown", "```json", tool, "```", "~~~~"].join("\n");
  const parsed = parseAgentMessage(`${example}\n\n${tool}\n\nA response.`);

  expect(parsed.text).toContain(example);
  expect(parsed.text).not.toContain(`~~~~\n\n${tool}`);
  expect(parsed.tools).toEqual([
    { id: "tool", name: "READ_FILE", status: "pending" },
  ]);
});

it("admits only explicit HTTP(S) URLs for images and tool evidence", () => {
  expect(safeHttpMessageUrl(" https://example.com/image.png ")).toBe(
    "https://example.com/image.png",
  );
  const results = [
    { url: "javascript:alert(1)" },
    { url: "file:///Users/private/notes" },
    { url: "//example.com/relative" },
    { url: "https://example.com/result" },
  ];

  expect(webSearchResults({ results }).map(({ url }) => url)).toEqual([
    "https://example.com/result",
  ]);
});
