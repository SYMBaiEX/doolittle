import { expect, it, vi } from "vitest";
import { CODING_EVAL_CASES } from "../../packages/evals/src/coding/cases";
import { evaluateCodingRun } from "../../packages/evals/src/coding/evaluator";

vi.mock("node:path", async (importOriginal) => {
  const path = await importOriginal<typeof import("node:path")>();
  return { ...path, ...path.win32 };
});

it.each([
  { cd: String.raw`cd D:\app`, cwd: String.raw`C:\outside`, status: "fail" },
  { cd: String.raw`cd d:\app`, cwd: String.raw`D:\outside`, status: "pass" },
  { cd: String.raw`cd /d D:\app`, cwd: String.raw`C:\outside`, status: "pass" },
  { cd: String.raw`cd /D D:\app`, cwd: String.raw`C:\outside`, status: "pass" },
  { cd: String.raw`cd D:\app`, cwd: undefined, status: "fail" },
])("uses cmd.exe drive semantics for $cd from $cwd", ({ cd, cwd, status }) => {
  const evaluation = evaluateCodingRun({
    run: { runId: "windows-smoke", status: "complete" },
    expectedWorkspace: String.raw`D:\app`,
    evalCase: CODING_EVAL_CASES["api-runtime-fix-v1"],
    events: [
      {
        event: "action.completed",
        metadata: {
          action: "SHELL",
          actionResult: { success: true },
          commandResult: {
            command: `${cd} && curl.exe --fail http://127.0.0.1:3000/api`,
            executedIn: cwd,
            stdout: '{"ok":true}',
            exitCode: 0,
          },
        },
      },
    ],
  });
  expect(
    evaluation.checks.find((check) => check.id === "runtime-smoke")?.status,
  ).toBe(status);
});
