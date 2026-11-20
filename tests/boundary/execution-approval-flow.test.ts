import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalService, type IAgentRuntime } from "@elizaos/core";
import { afterEach, expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { handleSettingsExecutionRoutes } from "../../packages/agent/src/server/routes/settings-execution";
import { ExecutionApprovalService } from "../../packages/agent/src/services/execution-approval/service";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "doolittle-approvals-"));
  dirs.push(dir);
  const approvals = new ExecutionApprovalService(dir);
  const botId = randomUUID();
  const input = {
    platform: "cli" as const,
    userId: "acceptance-user",
    roomId: "acceptance-room",
    sessionKey: "acceptance-session",
    botId,
    sessionId: "acceptance-session",
    runId: "acceptance-run",
    runtimeRoomId: randomUUID(),
    runtimeEntityId: randomUUID(),
    command: "printf fixture",
    reason: "Fixture approval",
  };
  const active = vi.fn(() => ({
    sessionId: input.sessionId,
    runId: input.runId,
  }));
  const context = {
    runtime: { agentId: botId },
    services: {
      executionApprovals: approvals,
      runController: { getActive: active },
    },
  } as unknown as AppContext;
  const route = async (path: string, method = "POST") => {
    const url = new URL(path, "http://127.0.0.1");
    const response = await handleSettingsExecutionRoutes(
      context,
      new Request(url, { method }),
      url,
    );
    if (!response) throw new Error("Approval route did not match.");
    return response;
  };
  return { dir, approvals, input, active, route };
}

it("approves only an active run and grants one use for the exact command and owner", async () => {
  const f = fixture();
  const pending = await f.approvals.request(f.input);
  const action = `/execution/approvals/${pending.id}/approve`;
  const queue = await f.route("/execution/approvals?status=pending", "GET");
  expect(await queue.json()).toMatchObject({
    approvals: [{ id: pending.id, status: "pending", runId: f.input.runId }],
  });
  f.active.mockReturnValueOnce({
    sessionId: f.input.sessionId,
    runId: "a-different-run",
  });
  expect((await f.route(action)).status).toBe(409);
  expect(f.approvals.get(pending.id)?.status).toBe("pending");
  const approved = await f.route(action);
  expect(approved.status).toBe(200);
  expect(await approved.json()).toMatchObject({
    approval: { id: pending.id, status: "approved" },
  });
  expect((await f.route(action)).status).toBe(409);
  expect(
    f.approvals.useApproved({ ...f.input, command: "printf other" }),
  ).toBeUndefined();
  expect(
    f.approvals.useApproved({ ...f.input, botId: "different" }),
  ).toBeUndefined();
  expect(
    f.approvals.useApproved({ ...f.input, runId: "different" }),
  ).toBeUndefined();
  expect(f.approvals.useApproved(f.input)).toMatchObject({
    id: pending.id,
    status: "used",
  });
  expect(f.approvals.useApproved(f.input)).toBeUndefined();
  expect(new ExecutionApprovalService(f.dir).get(pending.id)).toMatchObject({
    status: "used",
  });
  const second = await f.approvals.request(f.input);
  const denied = await f.route(`/execution/approvals/${second.id}/deny`);
  expect(await denied.json()).toMatchObject({ approval: { status: "denied" } });
  expect(f.approvals.useApproved(f.input)).toBeUndefined();
});

it("retains concurrent native requests and leaves one pending when its SDK decision is unavailable", async () => {
  const f = fixture();
  let resolveFirst!: (id: string) => void;
  let resolveSecond!: (id: string) => void;
  const first = new Promise<string>((resolve) => {
    resolveFirst = resolve;
  });
  const second = new Promise<string>((resolve) => {
    resolveSecond = resolve;
  });
  const pending = new Map<string, (option: string) => Promise<void>>();
  const requestApprovalAsync = vi
    .fn()
    .mockImplementationOnce(async (request) => {
      const id = await first;
      pending.set(id, request.onSelect);
      return id;
    })
    .mockImplementationOnce(() => second);
  const handleSelection = vi.fn(async (id: string, option: string) => {
    const resolve = pending.get(id);
    if (resolve) await resolve(option);
  });
  const native = { requestApprovalAsync, handleSelection };
  f.approvals.bindRuntime({
    getService: (name: string) =>
      name === ApprovalService.serviceType ? native : null,
  } as unknown as IAgentRuntime);
  const pendingA = f.approvals.request(f.input);
  const pendingB = f.approvals.request({
    ...f.input,
    command: "printf separate",
  });
  resolveFirst("native-first");
  resolveSecond("native-second");
  expect(await Promise.all([pendingA, pendingB])).toMatchObject([
    { id: "native-first", status: "pending", nativeBacked: true },
    { id: "native-second", status: "pending", nativeBacked: true },
  ]);
  expect(
    f.approvals
      .list("pending")
      .map(({ id }) => id)
      .sort(),
  ).toEqual(["native-first", "native-second"]);
  await expect(
    new ExecutionApprovalService(f.dir).approve("native-first"),
  ).rejects.toThrow(/native execution approval is unavailable/iu);
  expect(
    (await f.route("/execution/approvals/native-second/approve")).status,
  ).toBe(409);
  const decision = await f.route("/execution/approvals/native-first/approve");
  expect(decision.status).toBe(200);
  expect(handleSelection).toHaveBeenLastCalledWith("native-first", "approve");
  expect(f.approvals.get("native-second")?.status).toBe("pending");
});
