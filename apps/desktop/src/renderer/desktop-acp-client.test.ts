import { describe, expect, it } from "vitest";
import { buildDesktopAcpEditorContext } from "./desktop-acp-client";

describe("buildDesktopAcpEditorContext", () => {
  it("maps Monaco state to bounded ACP editor metadata and resources", () => {
    const context = buildDesktopAcpEditorContext(
      {
        path: "src/index.ts",
        uri: "file:///workspace/src/index.ts",
        language: "typescript",
        content: "const answer = 42;",
        version: 7,
        focused: true,
        cursor: { line: 3, column: 8 },
        selection: {
          startLine: 3,
          startColumn: 2,
          endLine: 3,
          endColumn: 8,
          text: "answer",
        },
        visibleRanges: [
          { startLine: 1, startColumn: 1, endLine: 40, endColumn: 1 },
        ],
      },
      true,
    );

    expect(context).toMatchObject({
      activeFile: "src/index.ts",
      uri: "file:///workspace/src/index.ts",
      dirty: true,
      cursor: { lineNumber: 3, column: 8 },
      selection: {
        startLineNumber: 3,
        startColumn: 2,
        endLineNumber: 3,
        endColumn: 8,
        text: "answer",
      },
      visibleRanges: [
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 40,
          endColumn: 1,
        },
      ],
      resources: [
        {
          uri: "file:///workspace/src/index.ts",
          name: "index.ts",
          text: "const answer = 42;",
        },
      ],
    });
  });

  it("bounds unsaved content before it crosses the desktop bridge", () => {
    const context = buildDesktopAcpEditorContext(
      {
        path: "large.txt",
        uri: "file:///workspace/large.txt",
        language: "plaintext",
        content: "x".repeat(40_000),
        version: 1,
        focused: false,
        visibleRanges: [],
      },
      false,
    );

    expect(context.content).toHaveLength(32_000);
    expect(context.resources[0]?.text).toHaveLength(32_000);
  });
});
