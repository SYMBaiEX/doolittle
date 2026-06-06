import { describe, expect, it } from "bun:test";
import type {
  CodingIteration,
  HumanFeedback,
} from "@elizaos/autonomous/services/coding-agent-context";
import { buildCodingAgentContext } from "./runtime";

describe("coding agent runtime context", () => {
  it("builds SDK-valid contexts while preserving local metadata and loop history", () => {
    const iteration: CodingIteration = {
      index: 0,
      startedAt: 1,
      completedAt: 2,
      fileOperations: [{ type: "search", target: "src" }],
      commandResults: [],
      errors: [],
      feedback: [],
      selfCorrected: false,
    };
    const feedback: HumanFeedback = {
      id: "feedback-1",
      timestamp: 3,
      text: "Prefer local execution",
      type: "guidance",
    };

    const context = buildCodingAgentContext({
      taskDescription: "Make the local harness better",
      workspaceRoot: "/workspace/doolittle",
      repositoryAvailable: true,
      contextOptions: {
        sessionId: "session-1",
        workingDirectory: "/workspace",
        metadata: { owner: "SYMBiEX" },
        iterations: [iteration],
        allFeedback: [feedback],
      },
    });

    expect(context).toMatchObject({
      sessionId: "session-1",
      taskDescription: "Make the local harness better",
      workingDirectory: "/workspace",
      connector: {
        type: "git-repo",
        basePath: "/workspace",
        available: true,
        metadata: {
          workspaceRoot: "/workspace/doolittle",
          owner: "SYMBiEX",
        },
      },
      interactionMode: "human-in-the-loop",
      maxIterations: 8,
      iterations: [iteration],
      allFeedback: [feedback],
    });
  });
});
