import type { ChatRunSteerSubmissionResult } from "@doolittle/contracts/steer";
import { expect, it } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import { handleConversationRoutes } from "../../packages/agent/src/server/routes/conversation/index";
import { handleChatRunSteerRoute } from "../../packages/agent/src/server/routes/conversation/steer";

type SubmitRunSteer =
  typeof import("../../packages/agent/src/runtime/chat-turn/steer").submitRunSteer;

const runId = "run-steer-1";
const sessionId = "session-steer-1";

function request(body: unknown): Request {
  return new Request(`http://localhost/chat/runs/${runId}/steer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function contextWithRun(run?: {
  runId: string;
  sessionId: string;
  endedAt?: string;
}): AppContext {
  return {
    runtime: {},
    services: {
      runController: {
        getByRunId: (candidate: string) =>
          candidate === run?.runId ? run : undefined,
      },
    },
  } as unknown as AppContext;
}

function submitResult(result: ChatRunSteerSubmissionResult): {
  submit: SubmitRunSteer;
  calls: Parameters<SubmitRunSteer>[0][];
} {
  const calls: Parameters<SubmitRunSteer>[0][] = [];
  const submit: SubmitRunSteer = async (input) => {
    calls.push(input);
    return result;
  };
  return { submit, calls };
}

it("rejects malformed steer bodies before resolving a run", async () => {
  const context = contextWithRun();
  for (const body of ["{", null, []]) {
    const response = await handleChatRunSteerRoute(
      context,
      request(body),
      runId,
    );
    expect(response.status).toBe(400);
  }

  for (const body of [
    {},
    { message: 1 },
    { message: "Use the smaller fix", userId: 7 },
  ]) {
    const response = await handleChatRunSteerRoute(
      context,
      request(body),
      runId,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
  }
});

it("returns not found without calling steer submission for an unknown run", async () => {
  const { submit, calls } = submitResult({
    accepted: false,
    code: "run_not_active",
    message: "unreachable",
  });
  const response = await handleChatRunSteerRoute(
    contextWithRun(),
    request({ message: "Use the smaller fix" }),
    runId,
    submit,
  );

  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toMatchObject({
    accepted: false,
    code: "run_not_active",
  });
  expect(calls).toHaveLength(0);
});

it("resolves the receipt session and forwards the authenticated steer fields", async () => {
  const { submit, calls } = submitResult({
    accepted: true,
    runId,
    sessionId,
    messageId: "steer-memory-1",
    delivery: "next-continuation-pass",
  });
  const steerRequest = request({
    message: "  Use the smaller fix  ",
    userId: "desktop-user",
  });
  const response = await handleChatRunSteerRoute(
    contextWithRun({ runId, sessionId }),
    steerRequest,
    runId,
    submit,
  );

  expect(response.status).toBe(202);
  await expect(response.json()).resolves.toMatchObject({
    accepted: true,
    runId,
    sessionId,
    messageId: "steer-memory-1",
    delivery: "next-continuation-pass",
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    runId,
    sessionId,
    message: "  Use the smaller fix  ",
    userId: "desktop-user",
    signal: steerRequest.signal,
  });
});

it.each([
  ["empty_message", 400],
  ["run_not_active", 409],
  ["run_not_steerable", 409],
  ["session_mismatch", 409],
  ["user_mismatch", 409],
  ["steer_budget_exhausted", 409],
  ["steer_persistence_failed", 500],
] as const)("surfaces %s rejection with HTTP %i", async (code, status) => {
  const message = `rejected: ${code}`;
  const { submit } = submitResult({ accepted: false, code, message });
  const response = await handleChatRunSteerRoute(
    contextWithRun({ runId, sessionId }),
    request({ message: "Use the smaller fix" }),
    runId,
    submit,
  );

  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({
    accepted: false,
    code,
    message,
    error: message,
  });
});

it("preserves the backend's honest non-steerable rejection through the route", async () => {
  const response = await handleChatRunSteerRoute(
    contextWithRun({ runId, sessionId }),
    request({ message: "Also change the file" }),
    runId,
  );

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({
    accepted: false,
    code: "run_not_steerable",
    error: "This active run does not have a continuation-pass steer boundary.",
  });
});

it("wires POST /chat/runs/:runId/steer through conversation routing", async () => {
  const url = new URL(`http://localhost/chat/runs/${runId}/steer`);
  const response = await handleConversationRoutes(
    contextWithRun(),
    request({ message: "Use the smaller fix" }),
    url,
  );

  expect(response?.status).toBe(404);
  await expect(response?.json()).resolves.toMatchObject({
    accepted: false,
    code: "run_not_active",
  });
});
