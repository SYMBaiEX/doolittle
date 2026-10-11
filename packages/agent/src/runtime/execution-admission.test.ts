import { afterEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./bootstrap/worker-host-rpc", () => ({
  requestWorkerHost: host.request,
}));

import {
  acquireExecutionLease,
  ExecutionAdmissionLimitError,
} from "./execution-admission";

afterEach(() => {
  vi.unstubAllEnvs();
  host.request.mockReset();
});

describe("desktop execution admission", () => {
  it("yields the parent seat to a child and reacquires once without polling", async () => {
    vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
    const parentId = "a4af1e7a-2712-4e43-8ca4-4334e5d63870";
    const childId = "85c6b4cb-b80b-4ad1-96c8-97f6e6db0aa3";
    const resumedId = "15c6b4cb-b80b-4ad1-96c8-97f6e6db0aa3";
    let active: string | null = null;
    host.request.mockImplementation(
      async (operation: string, payload: { runId: string }) => {
        if (operation === "execution.release") {
          active = null;
          return { released: true };
        }
        expect(active).toBeNull();
        active = payload.runId;
        return {
          accepted: true,
          leaseId:
            payload.runId === "child"
              ? childId
              : host.request.mock.calls.filter(
                    ([name]) => name === "execution.claim",
                  ).length === 1
                ? parentId
                : resumedId,
        };
      },
    );
    const parent = await acquireExecutionLease({
      runId: "parent",
      sessionId: "s",
      kind: "foreground",
    });
    if (!parent) throw new Error("Parent lease was not acquired.");
    const result = await parent.yieldFor(
      async () => {
        const child = await acquireExecutionLease({
          runId: "child",
          sessionId: "s",
          kind: "foreground",
        });
        expect(active).toBe("child");
        if (!child) throw new Error("Child lease was not acquired.");
        await child.release();
        return "done";
      },
      { deadline: Date.now() + 5_000 },
    );
    expect(result).toBe("done");
    expect(active).toBe("parent");
    await parent.release();
    await parent.release();
    expect(host.request.mock.calls.map(([operation]) => operation)).toEqual([
      "execution.claim",
      "execution.release",
      "execution.claim",
      "execution.release",
      "execution.claim",
      "execution.release",
    ]);
  });

  it("surfaces explicit queue overload and timeout reasons", async () => {
    vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
    host.request
      .mockResolvedValueOnce({ accepted: false, reason: "queue_full" })
      .mockResolvedValueOnce({ accepted: false, reason: "queue_timeout" });
    await expect(
      acquireExecutionLease({
        runId: "one",
        sessionId: "s",
        kind: "foreground",
      }),
    ).rejects.toMatchObject({
      reason: "queue_full",
      name: "ExecutionAdmissionLimitError",
    });
    await expect(
      acquireExecutionLease({
        runId: "two",
        sessionId: "s",
        kind: "foreground",
      }),
    ).rejects.toBeInstanceOf(ExecutionAdmissionLimitError);
    expect(host.request.mock.calls[0]?.[2]).toMatchObject({
      timeoutMs: 150_000,
    });
  });

  it("releases a granted lease when cancellation races the host response", async () => {
    vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
    const controller = new AbortController();
    host.request.mockImplementation(async (operation: string) => {
      if (operation === "execution.claim") {
        controller.abort();
        return {
          accepted: true,
          leaseId: "a4af1e7a-2712-4e43-8ca4-4334e5d63870",
        };
      }
      return { released: true };
    });
    await expect(
      acquireExecutionLease({
        runId: "race",
        sessionId: "s",
        kind: "foreground",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(host.request.mock.calls.map(([operation]) => operation)).toEqual([
      "execution.claim",
      "execution.release",
    ]);
  });

  it("allows reacquisition to wait through a 120-second host queue", async () => {
    vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
    const ids = [
      "a4af1e7a-2712-4e43-8ca4-4334e5d63870",
      "85c6b4cb-b80b-4ad1-96c8-97f6e6db0aa3",
    ];
    host.request.mockImplementation(async (operation: string) =>
      operation === "execution.claim"
        ? { accepted: true, leaseId: ids.shift() }
        : { released: true },
    );
    const lease = await acquireExecutionLease({
      runId: "parent",
      sessionId: "s",
      kind: "foreground",
    });
    if (!lease) throw new Error("Parent lease was not acquired.");
    await lease.yieldFor(async () => undefined, {
      deadline: Date.now() + 125_000,
    });
    const claims = host.request.mock.calls.filter(
      ([operation]) => operation === "execution.claim",
    );
    expect(claims).toHaveLength(2);
    expect(claims[0]?.[2]).toMatchObject({ timeoutMs: 150_000 });
    expect(claims[1]?.[2].timeoutMs).toBeGreaterThan(120_000);
    await lease.release();
  });
});
