import { expect, it } from "vitest";
import { isWorkerApiRouteAllowed } from "../../packages/agent/src/server/worker-route-policy";

it("keeps named worker reads and run control within their API families", () => {
  expect(isWorkerApiRouteAllowed("GET", "/terminal/session/output")).toBe(true);
  expect(
    isWorkerApiRouteAllowed("GET", "/chat/runs/consult%3Arun/events"),
  ).toBe(true);
  expect(
    isWorkerApiRouteAllowed("POST", "/chat/runs/consult%3Arun/cancel"),
  ).toBe(true);
  expect(
    isWorkerApiRouteAllowed("POST", "/chat/runs/consult%3Arun/steer"),
  ).toBe(true);
  expect(
    isWorkerApiRouteAllowed("GET", "/chat/runs/consult%2Frun/events"),
  ).toBe(false);
  expect(
    isWorkerApiRouteAllowed("POST", "/chat/runs/consult%2Frun/steer"),
  ).toBe(false);
  expect(isWorkerApiRouteAllowed("GET", "/migrate/history", true)).toBe(false);
});

it("requires the mutation grant for named worker writes and checkpoint restoration", () => {
  const workspacePaths = [
    "/workspace/write",
    "/repo/mutate",
    "/repo/worktrees/create",
    "/workspace/checkpoints",
    "/workspace/checkpoints/known_checkpoint/restore",
  ];
  for (const path of workspacePaths) {
    expect(isWorkerApiRouteAllowed("POST", path)).toBe(false);
    expect(isWorkerApiRouteAllowed("POST", path, true)).toBe(true);
  }
  expect(
    isWorkerApiRouteAllowed(
      "POST",
      "/workspace/checkpoints/invalid%2Fcheckpoint/restore",
      true,
    ),
  ).toBe(false);
});
