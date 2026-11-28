import type { ActionResult } from "@elizaos/core";
import { expect, it } from "vitest";
import { continuationPassEvidence } from "../../packages/agent/src/runtime/chat-turn/continuation-progress";

const workdir = "/workspace/project";

function commandResult(input: {
  command: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  text?: string;
}): ActionResult {
  return {
    success: true,
    text: input.text ?? input.stderr ?? input.stdout ?? "command finished",
    data: {
      actionName: "SHELL",
      command: input.command,
      executedIn: workdir,
      exitCode: input.exitCode,
      stdout: input.stdout ?? "",
      stderr: input.stderr ?? "",
      success: input.exitCode === 0,
    },
  };
}

function mutation(path = `${workdir}/src/index.ts`): ActionResult {
  return {
    success: true,
    text: "workspace file changed",
    data: {
      actionName: "WRITE_FILE",
      mutationKind: "local-file",
      mutationAction: "WRITE_FILE",
      mutation: { action: "WRITE_FILE", success: true, resolvedPath: path },
    },
  };
}

it("fingerprints an exactly repeated failed command outcome as non-progress", () => {
  const first = continuationPassEvidence([
    commandResult({
      command: "bun run test",
      exitCode: 1,
      stderr: "assertion failed: expected 2 received 1",
    }),
  ]);
  const second = continuationPassEvidence([
    commandResult({
      command: "bun run test",
      exitCode: 1,
      stderr: "assertion failed: expected 2 received 1",
    }),
  ]);

  expect(first.noProgressFingerprint).toEqual(expect.any(String));
  expect(second.noProgressFingerprint).toBe(first.noProgressFingerprint);
  expect(first.mutationEvidenceCount).toBe(0);
  expect(first.workspaceOperationEvidenceCount).toBe(0);
});

it("ignores terminal envelope identity noise when structured output is present", () => {
  const first = continuationPassEvidence([
    commandResult({
      command: "bun run test",
      exitCode: 1,
      stderr: "assertion failed",
      text: "Full output attachment: attachment-one\nassertion failed",
    }),
  ]);
  const second = continuationPassEvidence([
    commandResult({
      command: "bun run test",
      exitCode: 1,
      stderr: "assertion failed",
      text: "Full output attachment: attachment-two\nassertion failed",
    }),
  ]);

  expect(second.noProgressFingerprint).toBe(first.noProgressFingerprint);
});

it("uses display text as failure evidence when captured output is absent", () => {
  const withoutCapturedOutput = (text: string): ActionResult => ({
    success: false,
    text,
    data: {
      actionName: "SHELL",
      command: "bun run test",
      executedIn: workdir,
      exitCode: 1,
    },
  });
  const first = continuationPassEvidence([
    withoutCapturedOutput("assertion failed in first spec"),
  ]);
  const second = continuationPassEvidence([
    withoutCapturedOutput("assertion failed in second spec"),
  ]);

  expect(first.noProgressFingerprint).toEqual(expect.any(String));
  expect(second.noProgressFingerprint).toEqual(expect.any(String));
  expect(second.noProgressFingerprint).not.toBe(first.noProgressFingerprint);
});

it("does not equate same-command retries when their outcomes differ", () => {
  const first = continuationPassEvidence([
    commandResult({
      command: "bun install",
      exitCode: 1,
      stderr: "network timeout while fetching registry metadata",
    }),
  ]);
  const second = continuationPassEvidence([
    commandResult({
      command: "bun install",
      exitCode: 1,
      stderr: "checksum mismatch for package archive",
    }),
  ]);

  expect(first.noProgressFingerprint).toEqual(expect.any(String));
  expect(second.noProgressFingerprint).toEqual(expect.any(String));
  expect(second.noProgressFingerprint).not.toBe(first.noProgressFingerprint);
});

it("does not equate retries whose command flags differ", () => {
  const first = continuationPassEvidence([
    commandResult({
      command: "bun install",
      exitCode: 1,
      stderr: "network timeout",
    }),
  ]);
  const second = continuationPassEvidence([
    commandResult({
      command: "bun install --force",
      exitCode: 1,
      stderr: "network timeout",
    }),
  ]);

  expect(second.noProgressFingerprint).not.toBe(first.noProgressFingerprint);
});

it("treats mutation and successful verification receipts as progress uncertainty", () => {
  const mutationPass = continuationPassEvidence([mutation()]);
  const verificationPass = continuationPassEvidence([
    commandResult({ command: "bun run test", exitCode: 0, stdout: "1 pass" }),
  ]);

  expect(mutationPass.noProgressFingerprint).toBeUndefined();
  expect(mutationPass.mutationEvidenceCount).toBe(1);
  expect(verificationPass.noProgressFingerprint).toBeUndefined();
  expect(verificationPass.workspaceOperationEvidenceCount).toBe(1);
});

it("resets repetition evidence when a failed action is interleaved with an uncertain success", () => {
  const mixedPass = continuationPassEvidence([
    commandResult({
      command: "bun run test",
      exitCode: 1,
      stderr: "assertion failed",
    }),
    {
      success: true,
      text: "read src/index.ts",
      data: { actionName: "READ_FILE" },
    },
  ]);

  expect(mixedPass.noProgressFingerprint).toBeUndefined();
});
