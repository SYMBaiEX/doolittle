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

  it("renders tool calls as compact, collapsed disclosure rows", () => {
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

    expect(html).toContain('class="message-tool-group is-completed"');
    expect(html).toContain('class="message-tool-card is-completed"');
    expect(html).toContain("Completed · 1");
    expect(html).toContain(">Activity<");
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

    expect(html.match(/message-tool-group is-running/gu)).toHaveLength(1);
    expect(html.match(/message-tool-card is-/gu)).toHaveLength(2);
    expect(html).toContain("1 active · 2");
    expect(html).toContain("Read File · Web Search");
  });

  it("keeps a pending tool-backed response in one compact working row", () => {
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

    expect(html).toContain('class="message-tool-group is-running"');
    expect(html).toContain("Working · 1");
    expect(html).not.toContain("<details open");
  });
});
