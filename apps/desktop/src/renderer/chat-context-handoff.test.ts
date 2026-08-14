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
