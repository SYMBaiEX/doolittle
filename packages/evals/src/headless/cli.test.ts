import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "./cli";
import {
  createOperationalFailureTracker,
  isHeadlessOperationalFailure,
  OPERATIONAL_FAILURE_PREFIX,
} from "./operational-failure";
import { runHeadlessEvalSuite } from "./runner";

vi.mock("./runner", () => ({ runHeadlessEvalSuite: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(runHeadlessEvalSuite).mockReset();
});

function capture() {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  return { error, log };
}
function decoded(line: unknown) {
  expect(typeof line).toBe("string");
  const parsed: unknown = JSON.parse(
    String(line).slice(OPERATIONAL_FAILURE_PREFIX.length),
  );
  expect(isHeadlessOperationalFailure(parsed)).toBe(true);
  return parsed;
}
describe("headless CLI closed operational failures", () => {
  it.each([
    { args: ["--PRIVATE_ARG_CANARY"] },
    { args: ["--suite", "PRIVATE_SUITE_CANARY"] },
  ])("does not echo parse/selection arguments", async ({ args }) => {
    const { error, log } = capture();
    expect(await main(args)).toBe(1);
    expect(error).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
    const line = error.mock.calls[0]?.[0];
    expect(line).not.toContain("PRIVATE_");
    expect(decoded(line)).toMatchObject({
      phase: "cli-preflight",
      code: "cli-preflight-failed",
      childCleanup: "not-started",
      persistence: "not-attempted",
    });
    expect(runHeadlessEvalSuite).not.toHaveBeenCalled();
  });

  it("never reads or coerces an unknown caught exception", async () => {
    const { error } = capture();
    const get = vi.fn(() => {
      throw new Error("PRIVATE_ERROR_CANARY");
    });
    vi.mocked(runHeadlessEvalSuite).mockRejectedValueOnce(
      new Proxy({}, { get }),
    );
    expect(await main([])).toBe(1);
    expect(get).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).not.toContain("PRIVATE_");
  });

  it("emits the first authored runner event once without its thrown exception text", async () => {
    const { error } = capture();
    const tracker = createOperationalFailureTracker();
    tracker.enter("child-execution");
    tracker.beginChild();
    vi.mocked(runHeadlessEvalSuite).mockImplementationOnce(
      async (_suite, options) => {
        options?.onOperationalFailure?.(tracker.receipt());
        options?.onOperationalFailure?.(
          createOperationalFailureTracker("grading").receipt(),
        );
        throw new Error("PRIVATE_RUNNER_CANARY");
      },
    );
    expect(await main([])).toBe(1);
    expect(error).toHaveBeenCalledOnce();
    expect(decoded(error.mock.calls[0]?.[0])).toMatchObject({
      phase: "child-execution",
      code: "executor-threw",
      childCleanup: "unknown",
    });
    expect(error.mock.calls[0]?.[0]).not.toContain("PRIVATE_");
  });

  it("does not retry emission when the trusted CLI print path throws", async () => {
    const { error } = capture();
    error.mockImplementation(() => {
      throw new Error("PRIVATE_PRINT_CANARY");
    });
    expect(await main(["--PRIVATE_ARG_CANARY"])).toBe(1);
    expect(error).toHaveBeenCalledOnce();
  });

  it("keeps child cleanup/timing unknown when printing fails after the runner returned", async () => {
    const { error, log } = capture();
    log.mockImplementation(() => {
      throw new Error("PRIVATE_OUTPUT_CANARY");
    });
    vi.mocked(runHeadlessEvalSuite).mockResolvedValueOnce({
      report: {
        suite: { id: "synthetic", version: 1 },
        schemaVersion: 5,
        evaluatorVersion: "synthetic",
        routeLabel: "synthetic",
        route: {
          provider: "codex",
          modelSha256: "a".repeat(64),
          reasoningEffort: "high",
        },
      },
    } as unknown as Awaited<ReturnType<typeof runHeadlessEvalSuite>>);
    expect(await main([])).toBe(1);
    expect(error).toHaveBeenCalledOnce();
    expect(decoded(error.mock.calls[0]?.[0])).toMatchObject({
      phase: "cli-output",
      code: "cli-output-failed",
      persistence: "written",
      childCleanup: "unknown",
      timing: { childElapsedMs: null },
    });
    expect(error.mock.calls[0]?.[0]).not.toContain("PRIVATE_");
  });

  it("keeps help as a nonfailure path", async () => {
    const { error, log } = capture();
    expect(await main(["--help"])).toBe(0);
    expect(error).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledOnce();
    expect(runHeadlessEvalSuite).not.toHaveBeenCalled();
  });
});
