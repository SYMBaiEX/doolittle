import { describe, expect, it } from "vitest";
import {
  type ChatContextRequest,
  resolveChatContextProjectScope,
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
