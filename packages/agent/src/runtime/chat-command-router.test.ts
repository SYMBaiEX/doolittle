import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { ChatCommandRouteHandler } from "./chat-command-router/types";

const normalizeCalls: string[] = [];
const lifecycleAndIdentityRoutes: ChatCommandRouteHandler[] = [];
const workflowAndToolingRoutes: ChatCommandRouteHandler[] = [];
const runtimeOperationsRoutes: ChatCommandRouteHandler[] = [];
const planningAndSettingsRoutes: ChatCommandRouteHandler[] = [];

function canonicalizeMockCommand(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    return trimmed;
  }
  const tokens = trimmed.split(/\s+/u).filter(Boolean);
  if (tokens.length < 2) {
    return trimmed;
  }
  const [head, next, ...rest] = tokens;
  if (
    !/^[a-z][a-z0-9-]*$/iu.test(head.slice(1)) ||
    !/^[a-z][a-z0-9-]*$/iu.test(next)
  ) {
    return trimmed;
  }
  return [`${head}-${next}`, ...rest].join(" ");
}

function normalizeMockCommand(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    return trimmed;
  }
  const tokens = trimmed.split(/\s+/u).filter(Boolean);
  if (!tokens.length) {
    return trimmed;
  }
  const [head, ...rest] = tokens;
  const hyphenIndex = head.indexOf("-");
  if (hyphenIndex <= 1) {
    return trimmed;
  }
  const prefix = head.slice(0, hyphenIndex);
  const suffix = head.slice(hyphenIndex + 1);
  if (
    !prefix.startsWith("/") ||
    !/^[a-z][a-z0-9-]*$/iu.test(prefix.slice(1)) ||
    !/^[a-z][a-z0-9-]*$/iu.test(suffix)
  ) {
    return trimmed;
  }
  return [prefix, suffix, ...rest].join(" ");
}

function installRouterTestMocks() {
  mock.module("@/runtime/command-catalog", () => ({
    normalizeSlashCommandSyntax: (value: string) => {
      normalizeCalls.push(value);
      return normalizeMockCommand(value);
    },
    canonicalizeSlashCommandSyntax: canonicalizeMockCommand,
    suggestCommands: (_input: string, limit = 8) =>
      [
        {
          command: "/help",
          category: "core",
          description: "Show CLI help",
        },
        {
          command: "/commands-search <query>",
          category: "core",
          description: "Search the command catalog",
        },
      ].slice(0, limit),
    renderCommandCatalog: (query?: string) =>
      query ? `catalog:${query}` : "catalog",
  }));

  mock.module("./chat-command-router/registry", () => ({
    CHAT_COMMAND_ROUTE_GROUPS: [
      lifecycleAndIdentityRoutes,
      workflowAndToolingRoutes,
      runtimeOperationsRoutes,
      planningAndSettingsRoutes,
    ],
  }));
}

async function loadBuildCommandResponse() {
  const { buildCommandResponse } = await import(
    `./chat-command-router?router-test=${Date.now()}-${Math.random()}`
  );
  return buildCommandResponse;
}

function createRoute(
  name: string,
  calls: string[],
  response?: string,
): ChatCommandRouteHandler {
  return async ({ trimmed, sessionKey, hooks, dependencies }) => {
    calls.push(`${name}:${trimmed}:${sessionKey}`);
    expect(hooks).toBeDefined();
    expect(dependencies.runAnalysis).toBeFunction();
    expect(dependencies.runDelegationTaskInWorker).toBeFunction();
    return response;
  };
}

describe("chat command router", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
    normalizeCalls.length = 0;
    lifecycleAndIdentityRoutes.length = 0;
    workflowAndToolingRoutes.length = 0;
    runtimeOperationsRoutes.length = 0;
    planningAndSettingsRoutes.length = 0;
    installRouterTestMocks();
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("routes groups in order and stops after the first handled response", async () => {
    const buildCommandResponse = await loadBuildCommandResponse();
    const calls: string[] = [];

    lifecycleAndIdentityRoutes.push(
      createRoute("approval", calls),
      createRoute("identity", calls),
    );
    workflowAndToolingRoutes.push(
      createRoute("workflow", calls, "handled"),
      createRoute("tooling", calls),
    );
    runtimeOperationsRoutes.push(createRoute("runtime", calls));
    planningAndSettingsRoutes.push(createRoute("plans", calls));

    const response = await buildCommandResponse(
      {
        userId: "alice",
        roomId: "room-123",
        message: "  /skills catalog  ",
        source: "cli",
      },
      {} as never,
      {} as never,
      {
        runAnalysis: async () => "analysis",
        runDelegationTaskInWorker: async () => ({ id: "task-1" }) as never,
      },
    );

    expect(response).toBe("handled");
    expect(normalizeCalls).toEqual(["/skills catalog"]);
    expect(calls).toEqual([
      "approval:/skills catalog:room-123",
      "identity:/skills catalog:room-123",
      "workflow:/skills catalog:room-123",
    ]);
  });

  it("falls back to the derived session key when no route handles the command", async () => {
    const buildCommandResponse = await loadBuildCommandResponse();
    const calls: string[] = [];

    lifecycleAndIdentityRoutes.push(createRoute("lifecycle", calls));
    workflowAndToolingRoutes.push(createRoute("workflow", calls));
    runtimeOperationsRoutes.push(createRoute("runtime", calls));
    planningAndSettingsRoutes.push(createRoute("settings", calls));

    const response = await buildCommandResponse(
      {
        userId: "bob",
        message: "  /not-handled  ",
        source: "cli",
      },
      {} as never,
      {} as never,
      {
        runAnalysis: async () => "analysis",
        runDelegationTaskInWorker: async () => ({ id: "task-1" }) as never,
      },
    );

    expect(response).toBeUndefined();
    expect(normalizeCalls).toEqual(["/not-handled"]);
    expect(calls).toEqual([
      "lifecycle:/not handled:room:bob",
      "workflow:/not handled:room:bob",
      "runtime:/not handled:room:bob",
      "settings:/not handled:room:bob",
    ]);
  });
});
