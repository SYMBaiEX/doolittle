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
  it("renders the chat Markdown vocabulary with semantic theme surfaces", () => {
    const html = renderToStaticMarkup(
      <MessageContent
        content={[
          "# Plan",
          "",
          "A `src/index.ts` update with [safe docs](https://example.com/docs).",
          "",
          "> Keep the response focused.",
          "",
          "- inspect the project",
          "- make the change",
          "",
          "1. run tests",
          "2. report the result",
          "",
          "```ts",
          "const ready: boolean = true;",
          "```",
          "",
          "```bash",
          "nub run test",
          "```",
        ].join("\n")}
      />,
    );

    expect(html).toContain("<h1");
    expect(html).toContain("<blockquote");
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
    expect(html).toContain('data-streamdown="inline-code"');
    // Streamdown renders links as an interactive button during SSR, then
    // supplies the destination at hydration time. `safeMessageUrl` above
    // covers the URL policy independently.
    expect(html).toContain('data-streamdown="link"');
    expect(html).toContain(">safe docs</button>");
    expect(html.match(/data-streamdown="code-block"/gu)).toHaveLength(2);
    expect(html).toContain("--accent");
    expect(html).toContain("--surface-soft");
    expect(html).toContain("--canvas-bg");
    expect(html).not.toContain("bg-black");
  });

  it("keeps partial streamed Markdown readable until its fence and table complete", () => {
    const html = renderToStaticMarkup(
      <MessageContent
        pending
        content={[
          "## Working",
          "",
          "```tsx",
          "export const Draft = () => <section>partial",
          "",
          "| Status | Value |",
          "| --- | --- |",
          "| streaming |",
        ].join("\n")}
      />,
    );

    expect(html).toContain("Working");
    expect(html).toContain("partial");
    expect(html).toContain("Status");
    expect(html).toContain("streaming");
    expect(html).toContain('data-streamdown="code-block"');
    expect(html).not.toContain("<script");
  });

  it("preserves long unbroken output inside an overflow-safe response surface", () => {
    const token = "x".repeat(4_096);
    const html = renderToStaticMarkup(
      <MessageContent
        content={`Result: ${token}\n\n\`\`\`text\n${token}\n\`\`\``}
      />,
    );

    expect(html).toContain(token);
    expect(html).toContain("min-w-0");
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).toContain("!overflow-y-auto");
    expect(html).toContain("!overflow-x-auto");
    expect(html).toContain("!whitespace-pre");
    expect(html).toContain("!w-max");
  });

  it("does not render unsafe Markdown links or embedded image sources", () => {
    const html = renderToStaticMarkup(
      <MessageContent
        content={
          "[bad](javascript:alert(1)) [file](file:///private/secret) ![embedded](data:image/svg+xml;base64,PHN2Zz4=)"
        }
      />,
    );

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("file:///private/secret");
    expect(html).not.toContain("data:image/svg+xml");
  });

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
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("w-max");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
  });

  it("uses compact terminal-style markdown and code surfaces", () => {
    const html = renderToStaticMarkup(
      <MessageContent content={"## Setup\n\n```bash\nbun install\n```"} />,
    );

    expect(html).toContain('data-streamdown="code-block"');
    expect(html).toContain('data-streamdown="code-block-body"');
    expect(html).toContain("!max-h-[220px]");
    expect(html).toContain(
      "max-[480px]:[&amp;_[data-streamdown=code-block-body]]:!max-h-[180px]",
    );
    expect(html).toContain("[contain-intrinsic-size:none]!");
    expect(html).toContain("[content-visibility:visible]!");
    expect(html).toContain("[&amp;_hr]:!hidden");
    expect(html).toContain("!rounded-[var(--radius-xs)]");
    expect(html).toContain("!bg-[var(--canvas-bg)]");
    expect(html).toContain("!overflow-x-auto");
    expect(html).toContain("overflow-x-auto");
  });

  it("keeps raw tool payloads horizontally inspectable instead of force-wrapping", () => {
    const longPath = `/Users/symbiex/${"very-long-segment/".repeat(24)}artifact.log`;
    const content = [
      JSON.stringify({
        type: "tool_call",
        toolCall: {
          id: "call-raw-1",
          name: "READ_FILE",
          arguments: { path: longPath },
          status: "completed",
        },
        messageId: "message-raw-1",
      }),
      JSON.stringify({
        type: "tool_result",
        toolCallId: "call-raw-1",
        result: { path: longPath, ok: true },
      }),
    ].join("");

    const html = renderToStaticMarkup(
      <MessageContent content={content} separateAgentEvents />,
    );

    expect(html).toContain("whitespace-pre");
    expect(html).toContain("overflow-auto");
    expect(html).toContain("[scrollbar-gutter:stable_both-edges]");
    expect(html).toContain(longPath);
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
