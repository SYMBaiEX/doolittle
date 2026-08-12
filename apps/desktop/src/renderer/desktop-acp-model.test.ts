import { describe, expect, it } from "vitest";
import {
  buildDesktopAcpEditorContext,
  buildDesktopAcpPromptBlocks,
  describeDesktopAcpUpdate,
  desktopAcpResponseText,
  mergeDesktopAcpUpdates,
} from "./desktop-acp-model";

describe("desktop ACP model", () => {
  it("rejects empty prompts and emits text-only prompts without context", () => {
    expect(() =>
      buildDesktopAcpPromptBlocks("   ", undefined, {
        embeddedContext: false,
      }),
    ).toThrow("An ACP prompt is required.");
    expect(
      buildDesktopAcpPromptBlocks(" Inspect ", undefined, {
        embeddedContext: true,
      }),
    ).toEqual([{ type: "text", text: "Inspect" }]);
  });

  it("ignores unsafe cursors while preserving newest duplicate updates", () => {
    const merged = mergeDesktopAcpUpdates(
      [
        { cursor: 1, update: { status: "old" } },
        { cursor: -1, update: { status: "negative" } },
      ],
      [
        { cursor: 1, update: { status: "new" } },
        { cursor: Number.MAX_SAFE_INTEGER + 1, update: { status: "unsafe" } },
        { cursor: 0.5, update: { status: "fractional" } },
      ],
    );
    expect(merged).toEqual([{ cursor: 1, update: { status: "new" } }]);
  });

  it("bounds editor selection, visible ranges, and resource content", () => {
    const context = buildDesktopAcpEditorContext(
      {
        content: "x".repeat(40_000),
        focused: true,
        language: "typescript",
        path: "src/large.ts",
        selection: {
          endColumn: 1,
          endLine: 2,
          startColumn: 1,
          startLine: 1,
          text: "y".repeat(40_000),
        },
        uri: "file:///workspace/src/large.ts",
        version: 3,
        visibleRanges: Array.from({ length: 25 }, (_, index) => ({
          endColumn: 1,
          endLine: index + 2,
          startColumn: 1,
          startLine: index + 1,
        })),
      },
      true,
    );
    expect(context.content).toHaveLength(32_000);
    expect(context.selection?.text).toHaveLength(32_000);
    expect(context.visibleRanges).toHaveLength(20);
    expect(context.resources).toEqual([
      {
        name: "large.ts",
        text: "x".repeat(32_000),
        uri: "file:///workspace/src/large.ts",
      },
    ]);
  });

  it("ignores malformed response chunks and labels valid update variants", () => {
    expect(
      desktopAcpResponseText([
        { cursor: 1, update: null },
        {
          cursor: 2,
          update: {
            content: { text: "ignored", type: "image" },
            sessionUpdate: "agent_message_chunk",
          },
        },
        {
          cursor: 3,
          update: {
            content: { text: "accepted", type: "text" },
            sessionUpdate: "agent_message_chunk",
          },
        },
      ]),
    ).toBe("accepted");
    expect(describeDesktopAcpUpdate({ kind: "notice" })).toBe("notice");
    expect(describeDesktopAcpUpdate({ status: "" })).toBe("ACP update");
  });
});
