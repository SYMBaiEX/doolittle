import { expect, it, vi } from "vitest";
import { parseApiPath } from "../../apps/desktop/src/main/ipc/agent-api-policy";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import type { AgentExecutionContext } from "../../packages/agent/src/runtime/chat";
import { DelegationCommandCatalogEntries } from "../../packages/agent/src/runtime/command-catalog/definitions/delegation";
import { handleDelegationCommand } from "../../packages/agent/src/runtime/commands/delegation-commands";
import { handleDelegationCommandRoutes } from "../../packages/agent/src/server/routes/delegation-commands";

it("directs old queue commands to the live ElizaOS overview", async () => {
  const context = {} as AgentExecutionContext;
  const executeDelegationTask = vi.fn(async (taskId: string) => ({ taskId }));
  const options = { executeDelegationTask };
  for (const command of [
    "/delegate supervise",
    "/delegate supervise group:browser concurrency:3",
    "/delegate execute-queued",
    "/delegate execute-queued group:browser",
  ]) {
    expect(await handleDelegationCommand(command, context, options)).toContain(
      "Use `/delegate overview`",
    );
  }
  expect(executeDelegationTask).not.toHaveBeenCalled();

  const executeOutput = await handleDelegationCommand(
    "/delegate execute task-one",
    context,
    options,
  );
  expect(executeOutput && JSON.parse(executeOutput)).toEqual({
    taskId: "task-one",
  });
  expect(executeDelegationTask).toHaveBeenCalledExactlyOnceWith("task-one");
  const catalog = DelegationCommandCatalogEntries.map(({ command }) => command);
  expect(catalog).toContain("/delegate overview");
  expect(catalog.some((command) => command.includes("supervise"))).toBe(false);
});

it("rejects retired supervision at HTTP and desktop IPC without starting work", async () => {
  const url = new URL("http://localhost/delegation/supervise");
  const request = new Request(url, { method: "POST", body: "unused" });
  const getService = vi.fn();
  const runAgentTurn = vi.fn();
  const response = await handleDelegationCommandRoutes(
    { runtime: { getService } } as unknown as AppContext,
    request,
    url,
    { runAgentTurn },
  );
  expect(response?.status).toBe(410);
  await expect(response?.json()).resolves.toMatchObject({
    code: "DELEGATION_SUPERVISION_RETIRED",
  });
  expect(request.bodyUsed).toBe(false);
  expect(getService).not.toHaveBeenCalled();
  expect(runAgentTurn).not.toHaveBeenCalled();
  expect(() => parseApiPath(url.pathname, "POST")).toThrow(
    "Backend path is not available from desktop",
  );
  expect(parseApiPath("/delegation/tasks/task-one/execute", "POST")).toBe(
    "/delegation/tasks/task-one/execute",
  );

  getService.mockReturnValue({});
  runAgentTurn.mockResolvedValue({ status: "started" });
  const executeUrl = new URL("/delegation/tasks/task-one/execute", url);
  const active = await handleDelegationCommandRoutes(
    { runtime: { getService } } as unknown as AppContext,
    new Request(executeUrl, { method: "POST" }),
    executeUrl,
    { runAgentTurn },
  );
  expect(active?.status).toBe(200);
  await expect(active?.json()).resolves.toEqual({
    result: { status: "started" },
  });
  expect(runAgentTurn).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ message: "/delegate execute task-one" }),
    expect.anything(),
  );
});
