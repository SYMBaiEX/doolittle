import { describe, expect, it } from "bun:test";
import {
  extractCodexEventText,
  extractCodexTextFromEventStream,
  mergeCodexOutput,
  readCodexResponseText,
} from "./sse";

describe("codex sse helpers", () => {
  it("extracts text from the supported payload shapes", () => {
    expect(extractCodexEventText({ delta: "delta text" })).toBe("delta text");
    expect(extractCodexEventText({ text: "plain text" })).toBe("plain text");
    expect(extractCodexEventText({ output_text: "output text" })).toBe(
      "output text",
    );
    expect(
      extractCodexEventText({
        response: {
          output: [
            {
              content: [
                { type: "text", text: "nested " },
                { type: "output_text", text: "response" },
              ],
            },
          ],
        },
      }),
    ).toBe("nested response");
    expect(
      extractCodexEventText({
        item: {
          content: [{ type: "output_text", text: "item text" }],
        },
      }),
    ).toBe("item text");
  });

  it("merges overlapping Codex output without duplicating text", () => {
    expect(mergeCodexOutput("", "hello")).toBe("hello");
    expect(mergeCodexOutput("hello", "hello")).toBe("hello");
    expect(mergeCodexOutput("hello", "lo")).toBe("hello");
    expect(mergeCodexOutput("hello", "hello world")).toBe("hello world");
    expect(mergeCodexOutput("hello ", "world")).toBe("hello world");
  });

  it("reads event-stream payloads and ignores done markers", () => {
    const raw = [
      'event: response.output_text.delta',
      'data: {"delta":"hello "}',
      "",
      'event: response.output_text.delta',
      'data: {"response":{"output":[{"content":[{"type":"output_text","text":"world"}]}]}}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");

    expect(extractCodexTextFromEventStream(raw)).toBe("hello world");
  });

  it("reads JSON and streamed response bodies", async () => {
    const jsonResponse = new Response(
      JSON.stringify({
        output: [
          {
            content: [{ type: "output_text", text: "json response text" }],
          },
        ],
      }),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      },
    );
    const sseResponse = new Response(
      'data: {"delta":"streamed "}\n\ndata: {"delta":"text"}\n\ndata: [DONE]\n\n',
      {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
        },
      },
    );

    await expect(readCodexResponseText(jsonResponse)).resolves.toBe(
      "json response text",
    );
    await expect(readCodexResponseText(sseResponse)).resolves.toBe(
      "streamedtext",
    );
  });
});
