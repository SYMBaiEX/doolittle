import { describe, expect, it } from "vitest";
import {
  formatToolPayload,
  parseAgentMessage,
  visibleAssistantText,
  webSearchResults,
} from "./message-output";

const toolCall = {
  type: "tool_call",
  toolCall: {
    id: "call_web",
    name: "WEB_SEARCH",
    arguments: { query: "ElizaOS what is it" },
    status: "pending",
  },
  messageId: "message-1",
};

const toolResult = {
  type: "tool_result",
  toolCall: {
    ...toolCall.toolCall,
    status: "completed",
  },
  toolCallId: "call_web",
  result: {
    success: true,
    text: JSON.stringify({
      results: [
        {
          url: "https://docs.elizaos.ai/projects/overview",
          title: "ElizaOS projects",
          excerpts: ["Projects are the primary deployable unit."],
        },
      ],
    }),
  },
};

describe("parseAgentMessage", () => {
  it("separates flattened tool calls and results from visible prose", () => {
    const content = [
      "I’ll check the current documentation.",
      JSON.stringify(toolCall),
      JSON.stringify(toolResult),
      "\n\nElizaOS is an agent application framework.",
    ].join("");

    const parsed = parseAgentMessage(content);

    expect(parsed.text).toBe(
      "I’ll check the current documentation.\n\nElizaOS is an agent application framework.",
    );
    expect(parsed.tools).toEqual([
      expect.objectContaining({
        id: "call_web",
        name: "WEB_SEARCH",
        status: "completed",
        input: { query: "ElizaOS what is it" },
        output: toolResult.result,
      }),
    ]);
    expect(visibleAssistantText(content)).not.toContain('"type":"tool_call"');
  });

  it("summarizes evaluator retries without exposing evaluator thoughts", () => {
    const content = `Answer${JSON.stringify({
      type: "evaluation",
      evaluation: {
        success: false,
        decision: "CONTINUE",
        thought: "private evaluator detail",
      },
      messageId: "message-1",
    })}`;

    const parsed = parseAgentMessage(content);

    expect(parsed.text).toBe("Answer");
    expect(parsed.steps).toEqual({ continued: 1, failed: 0, finished: 0 });
    expect(JSON.stringify(parsed)).not.toContain("private evaluator detail");
  });

  it("does not reinterpret documented event examples inside code fences", () => {
    const example = JSON.stringify(toolCall);
    const content = `Example:\n\n\`\`\`json\n${example}\n\`\`\``;

    expect(parseAgentMessage(content)).toEqual({
      text: content,
      tools: [],
      steps: { continued: 0, failed: 0, finished: 0 },
    });
  });

  it("contains a legacy raw file read as collapsed tool activity", () => {
    const content = [
      "Read: /workspace/src/app.ts",
      "Lines: 1-3 of 3",
      "1|export function app() {",
      '2|  return "ready";',
      "3|}",
    ].join("\n");

    expect(parseAgentMessage(content)).toEqual({
      text: "This earlier response contained raw tool output without a final explanation. The output is preserved below.",
      tools: [
        {
          id: "legacy-read-file-result",
          name: "READ_FILE",
          status: "completed",
          input: {
            path: "/workspace/src/app.ts",
            offset: 1,
            end: 3,
            total: 3,
          },
          output: content,
        },
      ],
      steps: { continued: 0, failed: 0, finished: 0 },
    });
    expect(visibleAssistantText(content)).toBe(
      "This earlier response contained raw tool output without a final explanation. The output is preserved below.",
    );
  });

  it("contains a legacy raw workspace search as tool activity", () => {
    const content = [
      'Content matches for "settings" in /workspace:',
      "src/settings.ts:12: export const settings = {};",
      "src/app.ts:4: import { settings } from './settings';",
    ].join("\n");

    expect(parseAgentMessage(content)).toEqual({
      text: "This earlier response contained raw tool output without a final explanation. The output is preserved below.",
      tools: [
        {
          id: "legacy-search-files-result",
          name: "SEARCH_FILES",
          status: "completed",
          input: {
            pattern: "settings",
            root: "/workspace",
            target: "content",
          },
          output: content,
        },
      ],
      steps: { continued: 0, failed: 0, finished: 0 },
    });
  });
});

describe("webSearchResults", () => {
  it("extracts safe sources from nested serialized result text", () => {
    expect(webSearchResults(toolResult.result)).toEqual([
      {
        title: "ElizaOS projects",
        url: "https://docs.elizaos.ai/projects/overview",
        excerpt: "Projects are the primary deployable unit.",
      },
    ]);
  });

  it("drops non-web source protocols", () => {
    expect(
      webSearchResults({
        results: [{ url: "javascript:alert(1)", title: "Unsafe" }],
      }),
    ).toEqual([]);
  });

  it("drops HTTP(S) strings that cannot be rendered as valid web sources", () => {
    expect(
      webSearchResults({
        results: [
          { url: "http://", title: "Incomplete" },
          { url: "https://?", title: "Missing host" },
          {
            url: "https://docs.elizaos.ai/projects/overview",
            title: "Valid",
          },
        ],
      }),
    ).toEqual([
      {
        title: "Valid",
        url: "https://docs.elizaos.ai/projects/overview",
      },
    ]);
  });
});

describe("formatToolPayload", () => {
  it("pretty prints serialized JSON output", () => {
    expect(formatToolPayload('{"success":true}')).toBe(
      '{\n  "success": true\n}',
    );
  });
});
