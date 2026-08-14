import { describe, expect, it } from "vitest";
import {
  type ChatContextRequest,
  composeChatContextMessage,
  resolveChatContextProjectScope,
  splitChatContext,
} from "./chat-context-handoff";

const request: ChatContextRequest = {
  text: "Review this file.",
  workspacePath: "/work/alpha",
  projectScope: "all",
};

const projects = [
  {
    id: "project-alpha",
    primaryPath: "/work/alpha",
    resources: [],
  },
  {
    id: "project-beta",
    primaryPath: "/work/beta",
    resources: [],
  },
];

const pathsEqual = (left: string | undefined, right: string) => left === right;

describe("chat context handoff scope", () => {
  it("keeps source payload out of the visible prompt while preserving its capsule", () => {
    const result = splitChatContext(
      'Review src/app.ts.\n<file_context path="src/app.ts">const answer = 42;</file_context>',
    );
    expect(result.prompt).toBe("Review src/app.ts.");
    expect(result.capsule).toEqual({
      kind: "file",
      path: "src/app.ts",
      content:
        '<file_context path="src/app.ts">const answer = 42;</file_context>',
    });
    expect(composeChatContextMessage(result.prompt, result.capsule)).toContain(
      "const answer = 42;",
    );
    expect(composeChatContextMessage(result.prompt, result.capsule)).toContain(
      "Review src/app.ts.",
    );
  });

  it("turns terminal handoffs into a removable capsule", () => {
    const result = splitChatContext(
      "What failed?\n<terminal_context>npm test failed</terminal_context>",
    );
    expect(result.prompt).toBe("What failed?");
    expect(result.capsule).toMatchObject({
      kind: "terminal",
      path: "Terminal",
    });
    expect(result.prompt).not.toContain("npm test failed");
    expect(composeChatContextMessage(result.prompt, result.capsule)).toContain(
      "npm test failed",
    );
  });

  it("parses workbench context kinds and preserves the source label", () => {
    const result = splitChatContext(
      'Explain this change.\n<doolittle-context kind="plan" source="Release plan">step one</doolittle-context>',
    );
    expect(result.prompt).toBe("Explain this change.");
    expect(result.capsule).toEqual({
      kind: "plan",
      path: "Release plan",
      source: "Release plan",
      content:
        '<doolittle-context kind="plan" source="Release plan">step one</doolittle-context>',
    });
    expect(composeChatContextMessage(result.prompt, result.capsule)).toContain(
      "step one",
    );
  });

  it("turns browser evidence into a compact removable capsule", () => {
    const result = splitChatContext(
      'Inspect the failing layout.\n<browser_evidence version="1" action="capture" title="Local preview" url="http://127.0.0.1:3000" viewport="desktop" capture_mode="pixel" pixel_evidence="available"><capture>Artifact-backed evidence.</capture></browser_evidence>',
    );
    expect(result.prompt).toBe("Inspect the failing layout.");
    expect(result.capsule).toMatchObject({
      kind: "browser",
      path: "http://127.0.0.1:3000",
      source: "capture",
    });
    expect(result.prompt).not.toContain("Artifact-backed evidence");
    expect(composeChatContextMessage(result.prompt, result.capsule)).toContain(
      "Artifact-backed evidence.",
    );
  });

  it("resolves an all-project source from its workspace instead of a selected chat", () => {
    expect(resolveChatContextProjectScope(request, projects, pathsEqual)).toBe(
      "project-alpha",
    );
  });

  it("does not fall back to an unrelated project when its workspace is unknown", () => {
    expect(
      resolveChatContextProjectScope(
        { ...request, workspacePath: "/work/unknown" },
        projects,
        pathsEqual,
      ),
    ).toBeNull();
  });

  it("keeps explicit unscoped context out of project conversations", () => {
    expect(
      resolveChatContextProjectScope(
        { ...request, projectScope: "unscoped" },
        projects,
        pathsEqual,
      ),
    ).toBe("unscoped");
  });
});
