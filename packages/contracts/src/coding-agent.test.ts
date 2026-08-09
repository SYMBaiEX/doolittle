import { describe, expect, it } from "vitest";
import {
  createCodingAgentContext,
  validateCodingAgentContext,
  validateCodingIteration,
} from "./coding-agent";

describe("coding agent contracts", () => {
  it("normalizes persisted iteration feedback through the shared schema", () => {
    const result = validateCodingIteration({
      index: 2,
      startedAt: 1,
      fileOperations: [],
      commandResults: [],
      errors: [],
      feedback: [
        {
          id: "feedback-1",
          timestamp: 2,
          text: "Keep going",
          type: "guidance",
        },
      ],
      selfCorrected: false,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          feedback: [expect.objectContaining({ iterationRef: 2 })],
        }),
      }),
    );
  });

  it("rejects malformed nested persisted data instead of trusting array shapes", () => {
    const context = createCodingAgentContext({
      sessionId: "session-1",
      taskDescription: "Refactor safely",
      workingDirectory: "/repo",
      connectorBasePath: "/repo",
      connectorType: "local-fs",
      interactionMode: "autonomous",
      maxIterations: 4,
    });
    const result = validateCodingAgentContext({
      ...context,
      iterations: [
        {
          index: 0,
          startedAt: 1,
          fileOperations: [{ type: "write", target: 42 }],
          commandResults: [],
          errors: [],
          feedback: [],
          selfCorrected: false,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "iterations[0].fileOperations[0].target",
          }),
        ]),
      );
    }
  });

  it("validates previously unchecked context lifecycle fields", () => {
    const result = validateCodingAgentContext({
      sessionId: "session-1",
      taskDescription: "Refactor safely",
      workingDirectory: "/repo",
      connector: { type: "local-fs", basePath: "/repo", available: true },
      interactionMode: "autonomous",
      maxIterations: 4,
      active: "yes",
      iterations: [],
      allFeedback: [],
      createdAt: Number.NaN,
      updatedAt: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.path)).toEqual(
        expect.arrayContaining(["active", "createdAt"]),
      );
    }
  });
});
