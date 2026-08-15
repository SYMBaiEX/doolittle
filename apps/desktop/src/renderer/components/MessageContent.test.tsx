import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageContent, safeMessageUrl } from "./MessageContent";

const node = {
  type: "element" as const,
  tagName: "a",
  properties: {},
  children: [],
};

describe("safeMessageUrl", () => {
  it("allows web links, email links, and anchors", () => {
    expect(safeMessageUrl("https://example.com", "href", node)).toBe(
      "https://example.com",
    );
    expect(safeMessageUrl("mailto:hello@example.com", "href", node)).toBe(
      "mailto:hello@example.com",
    );
    expect(safeMessageUrl("#section", "href", node)).toBe("#section");
  });

  it("blocks executable, local file, and embedded data URLs", () => {
    expect(safeMessageUrl("javascript:alert(1)", "href", node)).toBeNull();
    expect(safeMessageUrl("file:///etc/passwd", "href", node)).toBeNull();
    expect(
      safeMessageUrl("data:image/svg+xml;base64,PHN2Zz4=", "src", node),
    ).toBeNull();
  });
});

describe("MessageContent", () => {
  it("renders sanitized HTML and rich Markdown without executable markup", () => {
    const html = renderToStaticMarkup(
      <MessageContent
        content={
          '# Heading\n\n<strong onclick="alert(1)">Safe HTML</strong>\n\n<script>alert(1)</script>\n\n| A | B |\n| - | - |\n| 1 | 2 |'
        }
      />,
    );

    expect(html).toContain("<h1");
    expect(html).toContain(">Safe HTML</span>");
    expect(html).toContain("<table");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
  });

  it("renders one tool call as one compact collapsed disclosure row", () => {
    const content = [
      JSON.stringify({
        type: "tool_call",
        toolCall: {
          id: "call-1",
          name: "DOOLITTLE_WORKSPACE",
          arguments: { path: "." },
          status: "completed",
        },
        messageId: "message-1",
      }),
      JSON.stringify({
        type: "tool_result",
        toolCallId: "call-1",
        result: { success: true, files: 12 },
      }),
    ].join("");
    const html = renderToStaticMarkup(
      <MessageContent content={content} separateAgentEvents />,
    );

    expect(html).toContain('data-tool-card="true"');
    expect(html).toContain('data-tool-status="completed"');
    expect(html).toContain("Doolittle Workspace");
    expect(html).toContain("Completed");
    expect(html).not.toContain('data-tool-group="true"');
    expect(html).not.toContain(">Activity<");
    expect(html).not.toContain("Tool activity");
    expect(html).not.toContain("<details open");
  });

  it("groups multiple tool calls into one collapsed activity row", () => {
    const content = [
      JSON.stringify({
        type: "tool_call",
        toolCall: {
          id: "call-1",
          name: "READ_FILE",
          arguments: { path: "README.md" },
          status: "completed",
        },
        messageId: "message-1",
      }),
      JSON.stringify({
        type: "tool_result",
        toolCallId: "call-1",
        result: { success: true },
      }),
      JSON.stringify({
        type: "tool_call",
        toolCall: {
          id: "call-2",
          name: "WEB_SEARCH",
          arguments: { query: "ElizaOS" },
          status: "running",
        },
        messageId: "message-1",
      }),
    ].join("");
    const html = renderToStaticMarkup(
      <MessageContent content={content} separateAgentEvents />,
    );

    expect(html.match(/data-tool-group="true"/gu)).toHaveLength(1);
    expect(html.match(/data-tool-card="true"/gu)).toHaveLength(2);
    expect(html).toContain("1 active · 2");
    expect(html).toContain("Read File · Web Search");
  });

  it("keeps a pending single-tool response in one compact row", () => {
    const content = [
      JSON.stringify({
        type: "tool_call",
        toolCall: {
          id: "call-1",
          name: "READ_FILE",
          arguments: { path: "README.md" },
          status: "completed",
        },
        messageId: "message-1",
      }),
      JSON.stringify({
        type: "tool_result",
        toolCallId: "call-1",
        result: { success: true },
      }),
    ].join("");
    const html = renderToStaticMarkup(
      <MessageContent content={content} pending separateAgentEvents />,
    );

    expect(html).toContain('data-tool-card="true"');
    expect(html).toContain('data-tool-status="completed"');
    expect(html).not.toContain('data-tool-group="true"');
    expect(html).not.toContain("<details open");
  });

  it("uses the most useful tool target as an inline compact summary", () => {
    const content = JSON.stringify({
      type: "tool_call",
      toolCall: {
        id: "call-1",
        name: "READ_FILE",
        arguments: { path: "packages/agent/src/index.ts" },
        status: "running",
      },
      messageId: "message-1",
    });
    const html = renderToStaticMarkup(
      <MessageContent content={content} separateAgentEvents />,
    );

    expect(html).toContain("Read File");
    expect(html).toContain("packages/agent/src/index.ts");
    expect(html).toContain('title="packages/agent/src/index.ts"');
    expect(html).not.toContain("<details open");
  });

  it("renders a legacy raw file response as one bounded collapsed tool card", () => {
    const content = [
      "Read: /workspace/src/app.ts",
      "Lines: 1-3 of 3",
      "1|export function app() {",
      '2|  return "ready";',
      "3|}",
    ].join("\n");
    const html = renderToStaticMarkup(
      <MessageContent content={content} separateAgentEvents />,
    );

    expect(html).toContain('data-tool-card="true"');
    expect(html).toContain('data-tool-status="completed"');
    expect(html).toContain("Read File");
    expect(html).toContain("/workspace/src/app.ts");
    expect(html).toContain(
      "This earlier response contained raw tool output without a final explanation.",
    );
    expect(html).not.toContain("<details open");
  });

  it("keeps successful evaluator bookkeeping out of the transcript", () => {
    const content = JSON.stringify({
      type: "evaluation",
      evaluation: {
        success: true,
        decision: "FINISH",
      },
    });
    const html = renderToStaticMarkup(
      <MessageContent content={content} separateAgentEvents />,
    );

    expect(html).not.toContain("Run diagnostics");
    expect(html).not.toContain("completion signal");
  });

  it("surfaces failed evaluator bookkeeping as compact diagnostics", () => {
    const content = JSON.stringify({
      type: "evaluation",
      evaluation: {
        success: false,
        decision: "FINISH",
      },
    });
    const html = renderToStaticMarkup(
      <MessageContent content={content} separateAgentEvents />,
    );

    expect(html).toContain("Run diagnostics");
    expect(html).toContain("1 issue");
    expect(html).not.toContain("<details open");
  });
});
