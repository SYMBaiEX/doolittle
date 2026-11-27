import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalService, type IAgentRuntime } from "@elizaos/core";
import { afterEach, expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import type { AgentExecutionContext } from "../../packages/agent/src/runtime/chat";
import { resolveRemoteExecutionApprovalPrompt } from "../../packages/agent/src/runtime/commands/command-execution";
import { handleSettingsExecutionRoutes } from "../../packages/agent/src/server/routes/settings-execution";
import { ExecutionApprovalService } from "../../packages/agent/src/services/execution-approval/service";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function serviceFixture() {
  const dir = mkdtempSync(join(tmpdir(), "doolittle-approval-rules-"));
  dirs.push(dir);
  const service = new ExecutionApprovalService(dir);
  const input = {
    platform: "cli" as const,
    userId: "user-1",
    roomId: "room-1",
    sessionKey: "session-key-1",
    botId: "bot-1",
    sessionId: "session-1",
    runId: "run-1",
    command: "git status",
  };
  return { dir, service, input };
}

function routeFixture() {
  const base = serviceFixture();
  const context = {
    services: { executionApprovals: base.service },
  } as unknown as AppContext;
  const route = async (method: string, path: string, body?: unknown) => {
    const url = new URL(path, "http://127.0.0.1");
    const response = await handleSettingsExecutionRoutes(
      context,
      new Request(url, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }),
      }),
      url,
    );
    if (!response) throw new Error("Approval rule route did not match.");
    return response;
  };
  return { ...base, route };
}

it("matches exact rules after trimming without widening the command", () => {
  const f = serviceFixture();
  const rule = f.service.createRule({
    patternType: "exact",
    pattern: "  git status  ",
  });
  expect(f.service.findMatchingRule(f.input)?.id).toBe(rule.id);
  expect(
    f.service.findMatchingRule({ ...f.input, command: "git status --short" }),
  ).toBeUndefined();
  expect(
    f.service.findMatchingRule({ ...f.input, command: "GIT STATUS" }),
  ).toBeUndefined();
});

it("matches prefix rules only at a whitespace boundary", () => {
  const f = serviceFixture();
  const rule = f.service.createRule({
    patternType: "prefix",
    pattern: "git commit",
  });
  for (const command of [
    "git commit",
    "git commit --amend",
    "git commit\t--amend",
  ]) {
    expect(f.service.findMatchingRule({ ...f.input, command })?.id).toBe(
      rule.id,
    );
  }
  for (const command of ["git committed", "git committer"]) {
    expect(f.service.findMatchingRule({ ...f.input, command })).toBeUndefined();
  }
});

it("applies every optional scope as narrowing rather than broadening", () => {
  const f = serviceFixture();
  const rule = f.service.createRule({
    patternType: "exact",
    pattern: "git status",
    platform: "cli",
    userId: "user-1",
    roomId: "room-1",
    sessionKey: "session-key-1",
    botId: "bot-1",
    sessionId: "session-1",
  });
  expect(f.service.findMatchingRule(f.input)?.id).toBe(rule.id);
  for (const override of [
    { platform: "api" as const },
    { userId: "other-user" },
    { roomId: "other-room" },
    { sessionKey: "other-session-key" },
    { botId: "other-bot" },
    { sessionId: "other-session" },
    { botId: undefined },
  ]) {
    expect(
      f.service.findMatchingRule({ ...f.input, ...override }),
    ).toBeUndefined();
  }
  expect(
    f.service.findMatchingRule({ ...f.input, runId: "another-run" })?.id,
  ).toBe(rule.id);
});

it("does not match disabled or expired rules", () => {
  const f = serviceFixture();
  f.service.createRule({
    patternType: "exact",
    pattern: "git status",
    enabled: false,
  });
  f.service.createRule({
    patternType: "exact",
    pattern: "git status",
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
  });
  expect(f.service.findMatchingRule(f.input)).toBeUndefined();
});

it("satisfies matching requests without a native prompt, pending record, or consumption", async () => {
  const f = serviceFixture();
  const rule = f.service.createRule({
    patternType: "exact",
    pattern: "git status",
  });
  const requestApprovalAsync = vi.fn(async () => "native-task");
  f.service.bindRuntime({
    getService: (name: string) =>
      name === ApprovalService.serviceType
        ? { requestApprovalAsync }
        : undefined,
  } as unknown as IAgentRuntime);
  const requestInput = {
    ...f.input,
    runtimeRoomId: "runtime-room",
    runtimeEntityId: "runtime-entity",
    reason: "test approval",
  };
  const first = await f.service.request(requestInput);
  const second = await f.service.request(requestInput);
  expect(first).toMatchObject({
    status: "used",
    satisfiedByRuleId: rule.id,
    nativeBacked: false,
  });
  expect(second).toMatchObject({
    status: "used",
    satisfiedByRuleId: rule.id,
  });
  expect(requestApprovalAsync).not.toHaveBeenCalled();
  expect(f.service.list()).toEqual([]);
  expect(f.service.useApproved(f.input)).toBeUndefined();
});

it("lets a matching rule bypass the remote-shell approval prompt", async () => {
  const f = serviceFixture();
  f.service.createRule({
    patternType: "exact",
    pattern: "git commit",
    platform: "telegram",
    userId: "user-1",
    roomId: "room-1",
  });
  const context = {
    runtime: { agentId: "bot-1", character: { name: "Doolittle" } },
    services: {
      executionApprovals: f.service,
      runController: { getActive: () => undefined },
    },
  } as unknown as AgentExecutionContext;
  const prompt = await resolveRemoteExecutionApprovalPrompt(
    {
      message: "!git commit",
      userId: "user-1",
      roomId: "room-1",
      source: "telegram",
    },
    context,
    "git commit",
  );
  expect(prompt).toBeUndefined();
  expect(f.service.list()).toEqual([]);
});

it("keeps existing consume-once approval precedence before later rules", async () => {
  const f = serviceFixture();
  const pending = await f.service.request({
    ...f.input,
    reason: "one shot approval",
  });
  await f.service.approve(pending.id);
  const rule = f.service.createRule({
    patternType: "exact",
    pattern: "git status",
  });
  expect(f.service.useApproved(f.input)).toMatchObject({
    id: pending.id,
    status: "used",
  });
  const satisfied = await f.service.request({
    ...f.input,
    reason: "later request",
  });
  expect(satisfied).toMatchObject({
    status: "used",
    satisfiedByRuleId: rule.id,
  });
});

it("creates, reads, updates, lists, and deletes rules through validated routes", async () => {
  const f = routeFixture();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const created = await f.route("POST", "/execution/approval-rules", {
    patternType: "prefix",
    pattern: "  git commit  ",
    platform: "cli",
    userId: " user-1 ",
    expiresAt,
  });
  expect(created.status).toBe(201);
  const createdBody = (await created.json()) as {
    rule: {
      id: string;
      pattern: string;
      userId: string;
      enabled: boolean;
      expiresAt: string;
      createdAt: string;
    };
  };
  expect(createdBody.rule).toMatchObject({
    patternType: "prefix",
    pattern: "git commit",
    platform: "cli",
    userId: "user-1",
    enabled: true,
    expiresAt,
  });

  const list = await f.route("GET", "/execution/approval-rules");
  expect(await list.json()).toMatchObject({
    rules: [{ id: createdBody.rule.id }],
  });
  const read = await f.route(
    "GET",
    `/execution/approval-rules/${createdBody.rule.id}`,
  );
  expect(read.status).toBe(200);

  const patched = await f.route(
    "PATCH",
    `/execution/approval-rules/${createdBody.rule.id}`,
    {
      patternType: "exact",
      pattern: "git commit --amend",
      enabled: false,
      userId: null,
      expiresAt: null,
    },
  );
  expect(patched.status).toBe(200);
  const patchedBody = (await patched.json()) as {
    rule: {
      id: string;
      patternType: string;
      pattern: string;
      enabled: boolean;
      createdAt: string;
      userId?: string;
      expiresAt?: string;
    };
  };
  expect(patchedBody).toMatchObject({
    rule: {
      id: createdBody.rule.id,
      patternType: "exact",
      pattern: "git commit --amend",
      enabled: false,
      createdAt: createdBody.rule.createdAt,
    },
  });
  expect(patchedBody.rule.userId).toBeUndefined();
  expect(patchedBody.rule.expiresAt).toBeUndefined();

  const deleted = await f.route(
    "DELETE",
    `/execution/approval-rules/${createdBody.rule.id}`,
  );
  expect(deleted.status).toBe(200);
  expect(await deleted.json()).toEqual({ deleted: true });
  expect(
    (await f.route("GET", `/execution/approval-rules/${createdBody.rule.id}`))
      .status,
  ).toBe(404);
});

it.each([
  [{ patternType: "glob", pattern: "git status" }, "patternType"],
  [{ patternType: "exact", pattern: "   " }, "pattern"],
  [
    { patternType: "exact", pattern: "git status", platform: "web" },
    "platform",
  ],
  [
    { patternType: "exact", pattern: "git status", expiresAt: "tomorrow-ish" },
    "expiresAt",
  ],
  [
    { patternType: "exact", pattern: "git status", expiresAt: "2026-01-01" },
    "expiresAt",
  ],
  [{ patternType: "exact", pattern: "git status", enabled: "yes" }, "enabled"],
  [{ patternType: "exact", pattern: "git status", userId: "   " }, "userId"],
  [
    { patternType: "exact", pattern: "git status", createdAt: "now" },
    "unknown approval rule field",
  ],
])("rejects invalid rule creation without writing %#", async (body, error) => {
  const f = routeFixture();
  const response = await f.route("POST", "/execution/approval-rules", body);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: expect.stringContaining(String(error)),
  });
  expect(f.service.listRules()).toEqual([]);
});

it("rejects an invalid patch atomically without partially updating the rule", async () => {
  const f = routeFixture();
  const rule = f.service.createRule({
    patternType: "exact",
    pattern: "git status",
    userId: "user-1",
    enabled: true,
  });
  const response = await f.route(
    "PATCH",
    `/execution/approval-rules/${rule.id}`,
    {
      enabled: false,
      userId: "   ",
    },
  );
  expect(response.status).toBe(400);
  expect(f.service.getRule(rule.id)).toMatchObject({
    pattern: "git status",
    userId: "user-1",
    enabled: true,
  });
  expect(
    (await f.route("PATCH", `/execution/approval-rules/${rule.id}`, {})).status,
  ).toBe(400);
  expect(f.service.getRule(rule.id)).toMatchObject({ enabled: true });
});

it("reads legacy stores without rules and preserves existing approval records", () => {
  const dir = mkdtempSync(join(tmpdir(), "doolittle-approval-rules-legacy-"));
  dirs.push(dir);
  const legacyApproval = {
    id: "legacy-approval",
    platform: "cli",
    userId: "user-1",
    roomId: "room-1",
    sessionKey: "session-key-1",
    command: "git status",
    reason: "legacy",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    status: "pending",
  };
  writeFileSync(
    join(dir, "execution-approvals.json"),
    JSON.stringify({ approvals: [legacyApproval] }),
  );
  const service = new ExecutionApprovalService(dir);
  expect(service.listRules()).toEqual([]);
  expect(service.get("legacy-approval")).toMatchObject(legacyApproval);
  service.createRule({ patternType: "exact", pattern: "git status" });
  const persisted = JSON.parse(
    readFileSync(join(dir, "execution-approvals.json"), "utf8"),
  ) as { approvals: unknown[]; rules: unknown[] };
  expect(persisted.approvals).toEqual([legacyApproval]);
  expect(persisted.rules).toHaveLength(1);
});
