import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findHeadlessEvalSuite } from "./cases";
import {
  formatOperationalFailure,
  type HeadlessOperationalFailure,
} from "./operational-failure";
import {
  createSyntheticResponseCapture,
  runSyntheticReviewEval,
  SYNTHETIC_RESPONSE_TOTAL_BYTE_LIMIT,
  SYNTHETIC_RESPONSE_TURN_BYTE_LIMIT,
} from "./response-capture";
import { runHeadlessEvalSuite } from "./runner";

const roots: string[] = [];
const selector = "headless-workflows-v7";
const taskId = "conversation-format-v7";
const response = '{"ready":true,"count":3}';
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function root() {
  const path = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-review-capture-")),
  );
  roots.push(path);
  return path;
}
async function run(
  input: {
    taskIds?: string[];
    response?: string;
    observe?: ReturnType<typeof createSyntheticResponseCapture>["observe"];
  } = {},
) {
  const taskIds = input.taskIds ?? [taskId];
  const capture = createSyntheticResponseCapture({
    suiteId: selector,
    taskIds,
  });
  let calls = 0;
  const responses = ["Noted: Cedar-41.", "Room: Cedar-41"];
  const suite = findHeadlessEvalSuite(selector);
  if (!suite) throw new Error("Missing test suite");
  const result = await runHeadlessEvalSuite(suite, {
    reportDir: root(),
    taskIds,
    showResponses: true,
    onResponse: input.observe ?? capture.observe,
    execute: () => ({
      status: 0,
      stdout: JSON.stringify({
        ok: true,
        text:
          taskIds[0] === taskId
            ? (input.response ?? response)
            : responses[calls++],
      }),
      stderr: "",
      signal: null,
      cleanupSafe: true,
    }),
  });
  return { capture, result };
}

describe("prospective bounded synthetic response capture", () => {
  it("rejects unknown/duplicate task selections before any dispatch", () => {
    expect(() =>
      createSyntheticResponseCapture({ suiteId: "custom-private" }),
    ).toThrow();
    expect(() =>
      createSyntheticResponseCapture({
        suiteId: selector,
        taskIds: ["unknown"],
      }),
    ).toThrow();
    expect(() =>
      createSyntheticResponseCapture({
        suiteId: selector,
        taskIds: [taskId, taskId],
      }),
    ).toThrow();
  });

  it("keeps reports content-free and binds an exclusive private capture after runner closure", async () => {
    const { capture, result } = await run({
      response: "SYNTHETIC_RESPONSE_CANARY",
    });
    const reportBytes = readFileSync(result.reportPath);
    expect(result.exitCode).toBe(1); // Objective failure remains reviewable.
    expect(reportBytes.toString()).not.toContain("SYNTHETIC_RESPONSE_CANARY");
    expect(existsSync(`${result.reportPath}.responses.json`)).toBe(false);
    const receipt = capture.commit(result);
    expect(receipt.status).toBe("written");
    if (receipt.status !== "written") throw new Error("Missing capture");
    const manifest = JSON.parse(readFileSync(receipt.path, "utf8"));
    expect(manifest.coverage).toBe("final-responses-only");
    expect(manifest.reportSha256).toBe(receipt.reportSha256);
    expect(receipt.reportSha256).toBe(
      createHash("sha256").update(reportBytes).digest("hex"),
    );
    expect(manifest.tasks[0].turns).toEqual([
      {
        turn: 1,
        sha256: result.report.runs[0].responseSha256s[0],
        response: "SYNTHETIC_RESPONSE_CANARY",
      },
    ]);
    expect(statSync(receipt.path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(receipt.path)).mode & 0o777).toBe(0o700);
    expect(capture.commit(result)).toEqual({
      status: "unavailable",
      reason: "discarded",
    });
    expect(readFileSync(result.reportPath).equals(reportBytes)).toBe(true);
  });

  it("retains all follow-up turns in their original order, not just the final line", async () => {
    const { capture, result } = await run({
      taskIds: ["conversation-session-memory-v7"],
    });
    const receipt = capture.commit(result);
    expect(receipt.status).toBe("written");
    if (receipt.status !== "written") throw new Error("Missing capture");
    const manifest = JSON.parse(readFileSync(receipt.path, "utf8"));
    expect(
      manifest.tasks[0].turns.map(
        (turn: { response: string }) => turn.response,
      ),
    ).toEqual(["Noted: Cedar-41.", "Room: Cedar-41"]);
    expect(receipt.turns).toBe(2);
  });

  it("refuses cap overflow without changing grading or preserving a shortened response", async () => {
    const { capture, result } = await run({
      response: "é".repeat(SYNTHETIC_RESPONSE_TURN_BYTE_LIMIT / 2 + 1),
    });
    expect(result.report.runs[0].status).toBe("completed");
    expect(result.exitCode).toBe(1);
    expect(capture.commit(result)).toEqual({
      status: "unavailable",
      reason: "response-cap",
    });
    expect(existsSync(`${result.reportPath}.responses.json`)).toBe(false);
  });

  it("enforces total UTF-8 retention and rejects huge strings before encoding", async () => {
    const { result } = await run();
    const large = createSyntheticResponseCapture({
      suiteId: selector,
      taskIds: [taskId],
    });
    large.observe(
      taskId,
      "x".repeat(2 * SYNTHETIC_RESPONSE_TOTAL_BYTE_LIMIT),
      1,
      1,
    );
    expect(large.commit(result)).toEqual({
      status: "unavailable",
      reason: "response-cap",
    });
    const capture = createSyntheticResponseCapture({ suiteId: selector });
    const suite = findHeadlessEvalSuite(selector);
    if (!suite) throw new Error("Missing suite");
    for (const task of suite.tasks) {
      const total = 1 + (task.followUpPrompts?.length ?? 0);
      for (let turn = 1; turn <= total; turn++) {
        capture.observe(
          task.id,
          "x".repeat(SYNTHETIC_RESPONSE_TURN_BYTE_LIMIT),
          turn,
          total,
        );
      }
    }
    expect(capture.commit(result)).toEqual({
      status: "unavailable",
      reason: "response-cap",
    });
  });

  it("refuses missing, duplicated, foreign, and out-of-order observations", async () => {
    const { result } = await run();
    for (const argumentsList of [
      [taskId, response, 2, 1],
      ["foreign", response, 1, 1],
      [taskId, response, 1, 2],
    ] as const) {
      const capture = createSyntheticResponseCapture({
        suiteId: selector,
        taskIds: [taskId],
      });
      const [id, text, turn, total] = argumentsList;
      capture.observe(id, text, turn, total);
      expect(capture.commit(result)).toEqual({
        status: "unavailable",
        reason: "invalid-observation",
      });
    }
    const missing = createSyntheticResponseCapture({
      suiteId: selector,
      taskIds: [taskId],
    });
    expect(missing.commit(result)).toEqual({
      status: "unavailable",
      reason: "incomplete",
    });
    const duplicate = createSyntheticResponseCapture({
      suiteId: selector,
      taskIds: [taskId],
    });
    duplicate.observe(taskId, response, 1, 1);
    duplicate.observe(taskId, response, 1, 1);
    expect(duplicate.commit(result)).toEqual({
      status: "unavailable",
      reason: "invalid-observation",
    });
  });

  it("refuses altered returned or persisted bytes and mismatched response digests", async () => {
    const first = await run();
    first.result.report.createdAt = "2026-10-04T01:00:00.000Z";
    expect(first.capture.commit(first.result)).toEqual({
      status: "unavailable",
      reason: "binding-mismatch",
    });
    const second = await run();
    writeFileSync(
      second.result.reportPath,
      `${readFileSync(second.result.reportPath, "utf8")} `,
    );
    expect(second.capture.commit(second.result)).toEqual({
      status: "unavailable",
      reason: "binding-mismatch",
    });
    const third = await run();
    third.result.report.runs[0].responseSha256s = ["a".repeat(64)];
    writeFileSync(
      third.result.reportPath,
      `${JSON.stringify(third.result.report, null, 2)}\n`,
    );
    expect(third.capture.commit(third.result)).toEqual({
      status: "unavailable",
      reason: "binding-mismatch",
    });
  });

  it("refuses unsafe report permissions, symlinks, and capture replacement without modifying the report", async () => {
    const unsafe = await run();
    chmodSync(unsafe.result.reportPath, 0o644);
    expect(unsafe.capture.commit(unsafe.result)).toEqual({
      status: "unavailable",
      reason: "unsafe-report",
    });
    const alias = await run();
    const bytes = readFileSync(alias.result.reportPath);
    const target = join(root(), "target.json");
    writeFileSync(target, bytes, { mode: 0o600, flag: "wx" });
    unlinkSync(alias.result.reportPath);
    symlinkSync(target, alias.result.reportPath);
    expect(alias.capture.commit(alias.result)).toEqual({
      status: "unavailable",
      reason: "unsafe-report",
    });
    const occupied = await run();
    writeFileSync(
      `${occupied.result.reportPath}.responses.json`,
      "OWNER_CANARY",
      { mode: 0o600, flag: "wx" },
    );
    expect(occupied.capture.commit(occupied.result)).toEqual({
      status: "unavailable",
      reason: "unsafe-report",
    });
    expect(
      readFileSync(`${occupied.result.reportPath}.responses.json`, "utf8"),
    ).toBe("OWNER_CANARY");
  });

  it("rejects incomplete execution and discards volatile bytes on a caller failure", async () => {
    const { capture, result } = await run();
    result.report.runs[0].status = "failed";
    result.report.summary.completed = 0;
    writeFileSync(
      result.reportPath,
      `${JSON.stringify(result.report, null, 2)}\n`,
    );
    expect(capture.commit(result)).toEqual({
      status: "unavailable",
      reason: "execution-incomplete",
    });
    const discarded = await run();
    discarded.capture.discard();
    expect(discarded.capture.commit(discarded.result)).toEqual({
      status: "unavailable",
      reason: "discarded",
    });
  });

  it("uses the explicit observer override and never echoes or embeds answers in reports", async () => {
    let calls = 0;
    const stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const stderr = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const result = await runSyntheticReviewEval(selector, {
      reportDir: root(),
      taskIds: [taskId],
      execute: () => {
        calls++;
        return {
          status: 0,
          stdout: JSON.stringify({ ok: true, text: response }),
          stderr: "",
          signal: null,
          cleanupSafe: true,
        };
      },
    });
    expect(calls).toBe(1);
    expect(result.exitCode).toBe(0);
    expect(result.responseCapture.status).toBe("written");
    expect(result.report.executionOverrides).toHaveLength(1);
    expect(result.report.executionOverrides[0]).toContain("synthetic review");
    expect(readFileSync(result.reportPath, "utf8")).not.toContain(response);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it("discards a captured first turn when the original runner throws later", async () => {
    const reportDir = root();
    let calls = 0;
    const events: HeadlessOperationalFailure[] = [];
    const stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const stderr = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(
      runSyntheticReviewEval(selector, {
        reportDir,
        taskIds: ["conversation-session-memory-v7"],
        onOperationalFailure: (receipt) => events.push(receipt),
        execute: (_command, _args, options) => {
          const dataDir = options.env.DOOLITTLE_DATA_DIR;
          if (calls === 0 && dataDir) roots.push(dirname(dirname(dataDir)));
          calls++;
          if (calls > 1)
            throw new Error("Synthetic second-turn executor failure");
          return {
            status: 0,
            stdout: JSON.stringify({
              ok: true,
              text: "SYNTHETIC_FIRST_TURN_CANARY",
            }),
            stderr: "",
            signal: null,
            cleanupSafe: true,
          };
        },
      }),
    ).rejects.toThrow("Synthetic second-turn executor failure");
    expect(calls).toBe(2);
    expect(readdirSync(reportDir)).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      phase: "child-execution",
      code: "executor-threw",
      childCleanup: "unknown",
      persistence: "not-attempted",
      eligibleForEvaluationComparison: false,
    });
    expect(formatOperationalFailure(events[0])).not.toContain("CANARY");
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it("rejects unsafe storage before dispatch in the programmatic review path", async () => {
    const reportDir = root();
    chmodSync(reportDir, 0o755);
    let calls = 0;
    await expect(
      runSyntheticReviewEval(selector, {
        reportDir,
        taskIds: [taskId],
        execute: () => {
          calls++;
          throw new Error("Should not launch");
        },
      }),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
