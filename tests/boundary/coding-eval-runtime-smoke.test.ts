import { expect, it } from "vitest";
import { CODING_EVAL_CASES } from "../../packages/evals/src/coding/cases";
import { evaluateCodingRun } from "../../packages/evals/src/coding/evaluator";

function smokeStatus(
  command: string,
  options: {
    event?: string;
    success?: boolean;
    timedOut?: boolean;
    stdout?: string;
    exitCode?: number;
  } = {},
) {
  return evaluateCodingRun({
    run: { runId: "smoke-fixture", status: "complete" },
    expectedWorkspace: "/workspace",
    evalCase: CODING_EVAL_CASES["api-runtime-fix-v1"],
    events: [
      {
        event: options.event ?? "action.completed",
        metadata: {
          action: "SHELL",
          actionResult: { success: options.success ?? true },
          commandResult: {
            command,
            executedIn: "/workspace",
            stdout: options.stdout ?? '{"ok":true}',
            exitCode: options.exitCode ?? 0,
            timedOut: options.timedOut ?? false,
          },
        },
      },
    ],
  }).checks.find((check) => check.id === "runtime-smoke")?.status;
}

it.each([
  "curl --fail http://localhost:3000/api/status",
  "curl -fsS 'http://127.0.0.1:3000/status'",
  'curl --fail --url "http://127.24.5.6:3000/status"',
  "curl --fail http://[::1]:3000/status",
  "curl --fail-with-body http://localhost:3000/status",
  "curl --silent --show-error --fail --url=http://127.255.255.255/status",
  "curl -f -H 'Accept: application/json' --request GET http://localhost/status",
  "cd /workspace && curl --fail http://localhost:3000/status",
])("accepts a successful local smoke receipt: %s", (command) => {
  expect(smokeStatus(command)).toBe("pass");
});

it.each([
  "curl --fail https://example.com/api/status",
  "curl --fail https://localhost.example.com/status",
  "curl --fail https://example.com/localhost",
  "curl --fail -H 'Host: localhost' https://example.com/status",
  "curl --fail http://128.0.0.1/api/status",
  "echo curl --fail http://localhost:3000/status",
  "curl --fail --data http://localhost:3000/status https://example.com/api/status",
  "curl --fail http://localhost:3000/status https://example.com/api/status",
  "curl http://localhost:3000/status",
  "curl --fail http://localhost:3000/status || true",
  "curl --fail --location http://localhost:3000/status",
  "curl --fail --config http://localhost:3000/status",
  "curl --fail '$TARGET'",
  "curl --fail 'http://localhost:3000/status",
  "curl --fail --url",
  "curl --fail",
  "",
])("rejects a command without verified local curl evidence: %s", (command) => {
  expect(smokeStatus(command)).toBe("fail");
});

it.each([
  { success: false },
  { timedOut: true },
  { event: "action.started" },
  { exitCode: 1 },
  { stdout: "<html>Not JSON</html>" },
  { stdout: "" },
])("rejects an unsuccessful or incomplete receipt: %j", (options) => {
  expect(
    smokeStatus("curl --fail http://localhost:3000/api/status", options),
  ).toBe("fail");
});
