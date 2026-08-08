import type { IpcMain } from "electron";
import { describe, expect, it } from "vitest";
import type { BackendState } from "../shared/contracts";
import type { BackendManager } from "./backend";
import {
  apiResponseLimit,
  fetchBackendApi,
  isRecoverableRuntimeFetchError,
  parseApiPath,
  parseRequestError,
  registerIpc,
  validateAgentTransportRequest,
  validateChatAttachmentIds,
  validateDesktopCommandRequest,
  validateInteractiveTerminalInputRequest,
  validateInteractiveTerminalResizeRequest,
  validateInteractiveTerminalStartRequest,
  validateRepositoryMutationRequest,
  validateTerminalStreamRequest,
  validateWorkspaceFileSaveRequest,
  validateWorktreeCreateRequest,
  waitForReadyBackend,
} from "./ipc";

describe("validateChatAttachmentIds", () => {
  const first = "62df6968-19be-4ea6-b7a1-479a57fa3b7c";
  const second = "88c9a480-6578-440b-9289-922d1cb9a4f4";

  it("normalizes bounded unique UUIDs", () => {
    expect(validateChatAttachmentIds(undefined)).toEqual([]);
    expect(validateChatAttachmentIds([first.toUpperCase(), second])).toEqual([
      first,
      second,
    ]);
  });

  it("rejects malformed, duplicate, and oversized selections", () => {
    expect(() => validateChatAttachmentIds(["../secret"])).toThrow(
      /attachment id/i,
    );
    expect(() => validateChatAttachmentIds([first, first])).toThrow(
      /duplicate/i,
    );
    expect(() =>
      validateChatAttachmentIds(Array.from({ length: 9 }, () => first)),
    ).toThrow(/at most 8/i);
  });
});

describe("apiResponseLimit", () => {
  it("keeps ordinary responses tight and allows bounded artifact payloads", () => {
    expect(apiResponseLimit("/health")).toBe(2_000_000);
    expect(apiResponseLimit("/sessions/export?sessionId=session-1")).toBe(
      2_100_000,
    );
    expect(apiResponseLimit("/codegen/runs/run-123/artifacts/0")).toBe(
      8_000_000,
    );
    expect(apiResponseLimit("/codegen/runs/run-123/artifacts/01")).toBe(
      2_000_000,
    );
  });
});

describe("validateAgentTransportRequest", () => {
  it("keeps the official Eliza request metadata needed by the local agent", () => {
    expect(
      validateAgentTransportRequest({
        path: "/settings",
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-elizaos-client-id": "ui-client-1",
          authorization: "Bearer renderer-secret",
        },
        body: JSON.stringify({ theme: "system" }),
      }),
    ).toEqual({
      path: "/settings",
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-elizaos-client-id": "ui-client-1",
      },
      body: JSON.stringify({ theme: "system" }),
    });
  });

  it("rejects malformed methods, GET bodies, and oversized payloads", () => {
    expect(() =>
      validateAgentTransportRequest({
        path: "/settings",
        method: "PUT",
        headers: {},
      }),
    ).toThrow(/method/i);
    expect(() =>
      validateAgentTransportRequest({
        path: "/health",
        method: "GET",
        headers: {},
        body: "{}",
      }),
    ).toThrow(/cannot include a body/i);
    expect(() =>
      validateAgentTransportRequest({
        path: "/settings",
        method: "POST",
        headers: {},
        body: "x".repeat(1_000_001),
      }),
    ).toThrow(/too large/i);
  });
});

describe("parseApiPath", () => {
  it("accepts exact safe GET endpoints", () => {
    expect(parseApiPath("/health", "GET")).toBe("/health");
    expect(parseApiPath("/commands/catalog", "GET")).toBe("/commands/catalog");
    expect(parseApiPath("/runtime/status", "GET")).toBe("/runtime/status");
    expect(parseApiPath("/runtime/models?refresh=true", "GET")).toBe(
      "/runtime/models?refresh=true",
    );
    expect(parseApiPath("/activity?limit=50", "GET")).toBe(
      "/activity?limit=50",
    );
    expect(parseApiPath("/chat/runs/chat:run-1", "GET")).toBe(
      "/chat/runs/chat:run-1",
    );
    expect(parseApiPath("/runtime/media", "GET")).toBe("/runtime/media");
    expect(parseApiPath("/execution/approvals?status=pending", "GET")).toBe(
      "/execution/approvals?status=pending",
    );
  });

  it("allows only the declared account-pool operator surface", () => {
    expect(parseApiPath("/runtime/account-pool", "GET")).toBe(
      "/runtime/account-pool",
    );
    expect(
      parseApiPath("/runtime/account-pool/openai-codex/strategy", "POST"),
    ).toBe("/runtime/account-pool/openai-codex/strategy");
    expect(
      parseApiPath(
        "/runtime/account-pool/anthropic-subscription/select",
        "POST",
      ),
    ).toBe("/runtime/account-pool/anthropic-subscription/select");
    expect(
      parseApiPath("/runtime/account-pool/openai-codex/import", "POST"),
    ).toBe("/runtime/account-pool/openai-codex/import");
    expect(
      parseApiPath("/runtime/account-pool/openai-codex/account-1/test", "POST"),
    ).toBe("/runtime/account-pool/openai-codex/account-1/test");
    expect(
      parseApiPath(
        "/runtime/account-pool/anthropic-subscription/account-1/refresh-usage",
        "POST",
      ),
    ).toBe(
      "/runtime/account-pool/anthropic-subscription/account-1/refresh-usage",
    );
    expect(
      parseApiPath("/runtime/account-pool/openai-codex/account-1", "PATCH"),
    ).toBe("/runtime/account-pool/openai-codex/account-1");
    expect(
      parseApiPath(
        "/runtime/account-pool/anthropic-subscription/account-1",
        "DELETE",
      ),
    ).toBe("/runtime/account-pool/anthropic-subscription/account-1");
    expect(() =>
      parseApiPath("/runtime/account-pool/unknown/strategy", "POST"),
    ).toThrow(/not available/);
    expect(() =>
      parseApiPath(
        "/runtime/account-pool/openai-codex/account-1/extra",
        "PATCH",
      ),
    ).toThrow(/not available/);
    expect(() =>
      parseApiPath("/runtime/account-pool/openai-codex/..%2Fsecret", "DELETE"),
    ).toThrow(/unsafe traversal/);
    expect(() =>
      parseApiPath(
        "/runtime/account-pool/openai-codex/..%2Fsecret/test",
        "POST",
      ),
    ).toThrow(/unsafe traversal/);
    expect(() =>
      parseApiPath(
        "/runtime/account-pool/openai-codex/account-1/delete",
        "POST",
      ),
    ).toThrow(/not available/);
  });

  it("validates session query parameters", () => {
    expect(parseApiPath("/sessions?limit=40", "GET")).toBe(
      "/sessions?limit=40",
    );
    expect(parseApiPath("/sessions/search?query=deploy&limit=25", "GET")).toBe(
      "/sessions/search?query=deploy&limit=25",
    );
    expect(
      parseApiPath("/sessions/messages?limit=200&sessionId=abc", "GET"),
    ).toBe("/sessions/messages?limit=200&sessionId=abc");
    expect(parseApiPath("/sessions/summary?sessionId=abc", "GET")).toBe(
      "/sessions/summary?sessionId=abc",
    );
    expect(parseApiPath("/sessions/usage?sessionId=abc", "GET")).toBe(
      "/sessions/usage?sessionId=abc",
    );
    expect(parseApiPath("/sessions?projectId=project-1&limit=40", "GET")).toBe(
      "/sessions?projectId=project-1&limit=40",
    );
    expect(
      parseApiPath(
        "/sessions/search?query=deploy&projectId=project-1&limit=25",
        "GET",
      ),
    ).toBe("/sessions/search?query=deploy&projectId=project-1&limit=25");
  });

  it("allows only the declared project management surface", () => {
    expect(parseApiPath("/projects?includeArchived=true", "GET")).toBe(
      "/projects?includeArchived=true",
    );
    expect(parseApiPath("/projects/project-1", "GET")).toBe(
      "/projects/project-1",
    );
    expect(parseApiPath("/projects/project-1/resources", "GET")).toBe(
      "/projects/project-1/resources",
    );
    expect(parseApiPath("/projects", "POST")).toBe("/projects");
    expect(parseApiPath("/projects/project-1", "PATCH")).toBe(
      "/projects/project-1",
    );
    expect(parseApiPath("/projects/project-1/archive", "POST")).toBe(
      "/projects/project-1/archive",
    );
    expect(parseApiPath("/projects/project-1/resources", "POST")).toBe(
      "/projects/project-1/resources",
    );
    expect(
      parseApiPath("/projects/project-1/resources/resource-1", "DELETE"),
    ).toBe("/projects/project-1/resources/resource-1");
    expect(parseApiPath("/sessions/project", "POST")).toBe("/sessions/project");
    expect(() =>
      parseApiPath("/projects?includeArchived=everything", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() =>
      parseApiPath("/projects/project-1/resources/resource-1", "GET"),
    ).toThrow(/not available/);
  });

  it("allows bounded session fork and managed transcription mutations", () => {
    expect(parseApiPath("/sessions/fork", "POST")).toBe("/sessions/fork");
    expect(parseApiPath("/sessions/export?sessionId=session-1", "GET")).toBe(
      "/sessions/export?sessionId=session-1",
    );
    expect(parseApiPath("/sessions/import/preview", "POST")).toBe(
      "/sessions/import/preview",
    );
    expect(parseApiPath("/sessions/import", "POST")).toBe("/sessions/import");
    expect(parseApiPath("/media/transcribe-attachment", "POST")).toBe(
      "/media/transcribe-attachment",
    );
    expect(() => parseApiPath("/sessions/export", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() =>
      parseApiPath("/sessions/export?sessionId=session-1&path=secret", "GET"),
    ).toThrow(/Unsupported query/);
  });

  it("allows only the declared query parameters", () => {
    expect(parseApiPath("/acp/status", "GET")).toBe("/acp/status");
    expect(parseApiPath("/acp/editor", "GET")).toBe("/acp/editor");
    expect(parseApiPath("/acp/sessions?limit=8", "GET")).toBe(
      "/acp/sessions?limit=8",
    );
    expect(parseApiPath("/acp/tools?query=browser", "GET")).toBe(
      "/acp/tools?query=browser",
    );
    expect(parseApiPath("/tools?profile=full", "GET")).toBe(
      "/tools?profile=full",
    );
    expect(parseApiPath("/tools/summary?profile=coding", "GET")).toBe(
      "/tools/summary?profile=coding",
    );
    expect(
      parseApiPath(
        "/acp/session/updates?sessionId=acp%3Asession-1&cursor=12",
        "GET",
      ),
    ).toBe("/acp/session/updates?sessionId=acp%3Asession-1&cursor=12");
    expect(parseApiPath("/logs?limit=50&level=warn&query=boot", "GET")).toBe(
      "/logs?limit=50&level=warn&query=boot",
    );
    expect(parseApiPath("/skills/catalog?query=voice", "GET")).toBe(
      "/skills/catalog?query=voice",
    );
    expect(parseApiPath("/skills/proposals?limit=25", "GET")).toBe(
      "/skills/proposals?limit=25",
    );
    expect(() => parseApiPath("/tools?profile=unknown", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() =>
      parseApiPath("/tools?profile=full&profile=minimal", "GET"),
    ).toThrow(/Unsupported query/);
    expect(
      parseApiPath(
        "/skills/proposals/skill-proposal-12345678-1234-1234-1234-123456789abc",
        "GET",
      ),
    ).toContain("/skills/proposals/skill-proposal-");
    expect(parseApiPath("/runtime/registry?query=browser", "GET")).toBe(
      "/runtime/registry?query=browser",
    );
    expect(parseApiPath("/runtime/registry?refresh=true", "GET")).toBe(
      "/runtime/registry?refresh=true",
    );
    expect(
      parseApiPath("/runtime/registry?query=browser&refresh=true", "GET"),
    ).toBe("/runtime/registry?query=browser&refresh=true");
    expect(parseApiPath("/runtime/ecosystem?refresh=true", "GET")).toBe(
      "/runtime/ecosystem?refresh=true",
    );
    expect(parseApiPath("/memory?target=user", "GET")).toBe(
      "/memory?target=user",
    );
    expect(parseApiPath("/gateway/health", "GET")).toBe("/gateway/health");
    expect(parseApiPath("/gateway/runtime", "GET")).toBe("/gateway/runtime");
    expect(parseApiPath("/gateway/daemon", "GET")).toBe("/gateway/daemon");
    expect(
      parseApiPath(
        "/profiles/users/recall?userId=desktop-user&query=workspace",
        "GET",
      ),
    ).toBe("/profiles/users/recall?userId=desktop-user&query=workspace");
    expect(parseApiPath("/media/inspect?path=clip.wav", "GET")).toBe(
      "/media/inspect?path=clip.wav",
    );
    expect(() =>
      parseApiPath("/sessions/messages?sessionId=abc&hack=1", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() =>
      parseApiPath("/sessions/search?limit=20", "GET"),
    ).not.toThrow();
    expect(() => parseApiPath("/health?debug=true", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() => parseApiPath("/logs?reveal=true", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() =>
      parseApiPath("/profiles/users/recall?userId=desktop-user", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() =>
      parseApiPath(
        "/profiles/users/recall?userId=desktop-user&query=workspace&limit=20",
        "GET",
      ),
    ).toThrow(/Unsupported query/);
    expect(() => parseApiPath("/skills/proposals?limit=101", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() => parseApiPath("/acp/sessions?limit=0", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() =>
      parseApiPath("/acp/tools?query=browser&invoke=true", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() => parseApiPath("/acp/session/updates?cursor=12", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() =>
      parseApiPath(
        "/acp/session/updates?sessionId=acp%3Asession-1&cursor=-1",
        "GET",
      ),
    ).toThrow(/Unsupported query/);
    expect(() => parseApiPath("/acp/invoke", "GET")).toThrow(/not available/);
  });

  it("allows only the read and replay gateway surface", () => {
    expect(parseApiPath("/gateway/state", "GET")).toBe("/gateway/state");
    expect(
      parseApiPath(
        "/gateway/inbox?limit=25&platform=discord&sessionId=thread-1",
        "GET",
      ),
    ).toBe("/gateway/inbox?limit=25&platform=discord&sessionId=thread-1");
    expect(parseApiPath("/gateway/outbox?kind=deliver", "GET")).toBe(
      "/gateway/outbox?kind=deliver",
    );
    expect(parseApiPath("/sessions/gateway", "GET")).toBe("/sessions/gateway");
    expect(parseApiPath("/gateway/replay", "POST")).toBe("/gateway/replay");
    expect(() => parseApiPath("/gateway/inbox?limit=101", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() =>
      parseApiPath("/gateway/inbox?platform=unknown", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() => parseApiPath("/gateway/outbox?kind=message", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() => parseApiPath("/gateway/message/edit", "POST")).toThrow(
      /not available/,
    );
    expect(() =>
      parseApiPath("/sessions/gateway?sessionKey=private", "GET"),
    ).toThrow(/Unsupported query/);
  });

  it("allows only explicit skill proposal mutations", () => {
    const proposalId = "skill-proposal-12345678-1234-1234-1234-123456789abc";
    expect(parseApiPath("/skills/proposals", "POST")).toBe("/skills/proposals");
    expect(
      parseApiPath(`/skills/proposals/${proposalId}/approve`, "POST"),
    ).toBe(`/skills/proposals/${proposalId}/approve`);
    expect(parseApiPath(`/skills/proposals/${proposalId}/reject`, "POST")).toBe(
      `/skills/proposals/${proposalId}/reject`,
    );
    expect(() =>
      parseApiPath(`/skills/proposals/${proposalId}/delete`, "POST"),
    ).toThrow(/not available/);
  });

  it("allows only the declared chat receipt surface", () => {
    expect(parseApiPath("/acp/probe", "POST")).toBe("/acp/probe");
    for (const path of [
      "/acp/initialize",
      "/acp/session/new",
      "/acp/session/load",
      "/acp/session/prompt",
      "/acp/session/cancel",
      "/acp/editor/context",
      "/acp/fs/read",
      "/acp/fs/write",
      "/acp/terminal/create",
      "/acp/terminal/output",
      "/acp/terminal/wait",
      "/acp/terminal/kill",
      "/acp/terminal/release",
    ] as const) {
      expect(parseApiPath(path, "POST")).toBe(path);
    }
    expect(() => parseApiPath("/acp/invoke", "POST")).toThrow(/not available/);
    expect(() => parseApiPath("/acp/call", "POST")).toThrow(/not available/);
    expect(parseApiPath("/chat/runs?limit=20", "GET")).toBe(
      "/chat/runs?limit=20",
    );
    expect(parseApiPath("/chat/runs/chat:run-1/cancel", "POST")).toBe(
      "/chat/runs/chat:run-1/cancel",
    );
    expect(() => parseApiPath("/chat/runs/chat:run-1/delete", "POST")).toThrow(
      /not available/,
    );
  });

  it("allows only the declared durable review-record surface", () => {
    const commentId = "review-comment-123";
    expect(parseApiPath("/review-record?limit=80", "GET")).toBe(
      "/review-record?limit=80",
    );
    expect(parseApiPath("/review-record?cursor=12&limit=80", "GET")).toBe(
      "/review-record?cursor=12&limit=80",
    );
    expect(parseApiPath("/review-record/comments", "POST")).toBe(
      "/review-record/comments",
    );
    expect(parseApiPath("/review-record/comments/migrate", "POST")).toBe(
      "/review-record/comments/migrate",
    );
    expect(parseApiPath("/review-record/feedback-sent", "POST")).toBe(
      "/review-record/feedback-sent",
    );
    expect(
      parseApiPath(`/review-record/comments/${commentId}/resolve`, "POST"),
    ).toBe(`/review-record/comments/${commentId}/resolve`);
    expect(parseApiPath(`/review-record/comments/${commentId}`, "PATCH")).toBe(
      `/review-record/comments/${commentId}`,
    );
    expect(parseApiPath(`/review-record/comments/${commentId}`, "DELETE")).toBe(
      `/review-record/comments/${commentId}`,
    );
    expect(() =>
      parseApiPath(`/review-record/comments/${commentId}/approve`, "POST"),
    ).toThrow(/not available/);
    expect(() =>
      parseApiPath("/review-record?cursor=-1&limit=80", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() =>
      parseApiPath("/review-record/comments/..%2Fsecret", "PATCH"),
    ).toThrow(/unsafe traversal|not available/);
  });

  it("accepts cron job action endpoints", () => {
    expect(parseApiPath("/cron/jobs/job-123/pause", "POST")).toBe(
      "/cron/jobs/job-123/pause",
    );
    expect(parseApiPath("/cron/jobs/job-123/trigger", "POST")).toBe(
      "/cron/jobs/job-123/trigger",
    );
    expect(parseApiPath("/secrets/get", "POST")).toBe("/secrets/get");
    expect(parseApiPath("/secrets/set", "POST")).toBe("/secrets/set");
    expect(parseApiPath("/media/analyze", "POST")).toBe("/media/analyze");
    expect(parseApiPath("/media/transcribe", "POST")).toBe("/media/transcribe");
    expect(parseApiPath("/mcp/status", "GET")).toBe("/mcp/status");
    expect(parseApiPath("/mcp/cached/search?query=calendar", "GET")).toBe(
      "/mcp/cached/search?query=calendar",
    );
    expect(parseApiPath("/mcp/probe", "POST")).toBe("/mcp/probe");
    expect(() =>
      parseApiPath("/mcp/cached/search?query=ok&extra=no", "GET"),
    ).toThrow(/Unsupported query/);
    expect(parseApiPath("/media/speak", "POST")).toBe("/media/speak");
    expect(parseApiPath("/media/generate", "POST")).toBe("/media/generate");
    expect(parseApiPath("/cron/jobs/job-123", "PATCH")).toBe(
      "/cron/jobs/job-123",
    );
    expect(parseApiPath("/cron/jobs/job-123", "DELETE")).toBe(
      "/cron/jobs/job-123",
    );
    expect(() => parseApiPath("/cron/jobs/job%2Fescape/pause", "POST")).toThrow(
      /not available/,
    );
  });

  it("allows the read-only coding harness endpoints", () => {
    expect(parseApiPath("/workspace/tree?depth=4", "GET")).toBe(
      "/workspace/tree?depth=4",
    );
    expect(parseApiPath("/workspace/read?path=src%2Findex.ts", "GET")).toBe(
      "/workspace/read?path=src%2Findex.ts",
    );
    expect(parseApiPath("/workspace/search?query=registerIpc", "GET")).toBe(
      "/workspace/search?query=registerIpc",
    );
    expect(parseApiPath("/workspace/checkpoints", "GET")).toBe(
      "/workspace/checkpoints",
    );
    expect(parseApiPath("/repo/status", "GET")).toBe("/repo/status");
    expect(parseApiPath("/repo/diff", "GET")).toBe("/repo/diff");
    expect(parseApiPath("/repo/log", "GET")).toBe("/repo/log");
    expect(parseApiPath("/repo/summary", "GET")).toBe("/repo/summary");
    expect(parseApiPath("/repo/review", "GET")).toBe("/repo/review");
    expect(
      parseApiPath("/repo/changes?path=src%2Findex.ts&staged=false", "GET"),
    ).toBe("/repo/changes?path=src%2Findex.ts&staged=false");
    expect(
      parseApiPath("/repo/patch?path=src%2Findex.ts&staged=true", "GET"),
    ).toBe("/repo/patch?path=src%2Findex.ts&staged=true");
    expect(parseApiPath("/repo/worktrees", "GET")).toBe("/repo/worktrees");
    expect(parseApiPath("/workspace/checkpoints", "POST")).toBe(
      "/workspace/checkpoints",
    );
    expect(
      parseApiPath("/workspace/checkpoints/checkpoint-123/restore", "POST"),
    ).toBe("/workspace/checkpoints/checkpoint-123/restore");
    expect(() =>
      parseApiPath(
        "/workspace/checkpoints/checkpoint%252Fescape/restore",
        "POST",
      ),
    ).toThrow(/not available/);
    expect(parseApiPath("/plans", "GET")).toBe("/plans");
    expect(parseApiPath("/plans/plan-123", "GET")).toBe("/plans/plan-123");
    expect(parseApiPath("/runtime/codegen", "GET")).toBe("/runtime/codegen");
    expect(parseApiPath("/codegen/runs", "GET")).toBe("/codegen/runs");
    expect(parseApiPath("/codegen/runs/run-123", "GET")).toBe(
      "/codegen/runs/run-123",
    );
    expect(parseApiPath("/codegen/runs/run-123/artifacts/0", "GET")).toBe(
      "/codegen/runs/run-123/artifacts/0",
    );
    expect(parseApiPath("/codegen/workflows/workflow-123", "GET")).toBe(
      "/codegen/workflows/workflow-123",
    );
    expect(() =>
      parseApiPath("/codegen/workflows/workflow-123/bundle", "GET"),
    ).toThrow(/not available/);
    for (const path of [
      "/codegen/runs/run-123/artifacts",
      "/codegen/runs/run-123/artifacts/",
      "/codegen/runs/run-123/artifacts/-1",
      "/codegen/runs/run-123/artifacts/01",
      "/codegen/runs/run-123/artifacts/path",
      "/codegen/runs/run%252Fescape/artifacts/0",
      "/codegen/runs/run-123/artifacts/0/extra",
    ]) {
      expect(() => parseApiPath(path, "GET")).toThrow(/not available/);
    }
  });

  it("allows documented delegation reads and filters", () => {
    expect(
      parseApiPath(
        "/delegation/tasks?limit=25&group=ops&profile=reviewer&priority=high&label=ui&parentTaskId=root&status=running&executionMode=delegated",
        "GET",
      ),
    ).toBe(
      "/delegation/tasks?limit=25&group=ops&profile=reviewer&priority=high&label=ui&parentTaskId=root&status=running&executionMode=delegated",
    );
    expect(
      parseApiPath(
        "/delegation/workers?tag=desktop&parent=root&mode=local",
        "GET",
      ),
    ).toBe("/delegation/workers?tag=desktop&parent=root&mode=local");
    expect(parseApiPath("/delegation/overview", "GET")).toBe(
      "/delegation/overview",
    );
    expect(parseApiPath("/delegation/groups", "GET")).toBe(
      "/delegation/groups",
    );
    expect(parseApiPath("/delegation/tasks/task-123", "GET")).toBe(
      "/delegation/tasks/task-123",
    );
    expect(parseApiPath("/delegation/tasks/task-123/children", "GET")).toBe(
      "/delegation/tasks/task-123/children",
    );
    expect(parseApiPath("/delegation/tasks/task-123/tree", "GET")).toBe(
      "/delegation/tasks/task-123/tree",
    );
  });

  it("allows only the explicit coding harness mutations", () => {
    for (const path of [
      "/plans/create",
      "/plans/plan-123/approve",
      "/plans/plan-123/steer",
      "/delegation/tasks",
      "/delegation/supervise",
      "/delegation/tasks/task-123/spawn",
      "/delegation/tasks/task-123/execute",
      "/delegation/tasks/task-123/note",
      "/delegation/tasks/task-123/run",
      "/delegation/tasks/task-123/retry",
      "/delegation/tasks/task-123/cancel",
      "/delegation/tasks/task-123/complete",
      "/delegation/tasks/task-123/fail",
      "/codegen/generate",
      "/codegen/research",
      "/codegen/prd",
      "/codegen/qa",
      "/codegen/runs/run-123/cancel",
      "/codegen/workflows/workflow-123/bundle",
      "/execution/approvals/approval-123/approve",
      "/execution/approvals/approval-123/deny",
    ] as const) {
      expect(parseApiPath(path, "POST")).toBe(path);
    }

    for (const path of [
      "/terminal/run",
      "/workspace/write",
      "/workspace/switch",
      "/github/repos/create",
      "/github/repos/delete",
      "/sandbox/run",
      "/delegation/tasks/task-123/unknown",
      "/codegen/github/create",
    ] as const) {
      expect(() => parseApiPath(path, "POST")).toThrow(/not available/);
    }
  });

  it("allows browser tooling without accepting unsafe inspect URLs", () => {
    expect(parseApiPath("/browser/status", "GET")).toBe("/browser/status");
    expect(
      parseApiPath(
        "/browser/inspect?url=https%3A%2F%2Fexample.com%2Fdocs%3Fx%3D1",
        "GET",
      ),
    ).toBe("/browser/inspect?url=https%3A%2F%2Fexample.com%2Fdocs%3Fx%3D1");
    for (const path of [
      "/browser/capture",
      "/browser/screenshot",
      "/browser/snapshot",
      "/browser/analyze",
      "/browser/compare",
      "/browser/compare/analyze",
    ] as const) {
      expect(parseApiPath(path, "POST")).toBe(path);
    }
    for (const path of [
      "/browser/inspect",
      "/browser/inspect?url=ftp%3A%2F%2Fexample.com",
      "/browser/inspect?url=https%3A%2F%2Fuser%3Asecret%40example.com",
      "/browser/inspect?url=https%3A%2F%2Fexample.com&url=https%3A%2F%2Fother.example",
      "/browser/inspect?url=https%3A%2F%2Fexample.com%2F%2500",
    ] as const) {
      expect(() => parseApiPath(path, "GET")).toThrow(/Unsupported query/);
    }
  });

  it("validates coding harness query values and duplicate keys", () => {
    expect(() => parseApiPath("/workspace/tree?depth=-1", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() => parseApiPath("/workspace/tree?depth=13", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() => parseApiPath("/workspace/search?query=", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() => parseApiPath("/delegation/tasks?limit=0", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() => parseApiPath("/delegation/tasks?limit=201", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() =>
      parseApiPath("/delegation/tasks?priority=urgent", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() =>
      parseApiPath("/delegation/tasks?status=unknown", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() =>
      parseApiPath("/delegation/workers?mode=remote", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() =>
      parseApiPath("/delegation/tasks?parentTaskId=first&parent=second", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() =>
      parseApiPath(
        "/delegation/tasks?executionMode=local&mode=delegated",
        "GET",
      ),
    ).toThrow(/Unsupported query/);
    expect(() =>
      parseApiPath("/delegation/tasks?limit=10&limit=20", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() => parseApiPath("/repo/status?refresh=true", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() => parseApiPath("/repo/review?owner=attacker", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() => parseApiPath("/repo/changes?staged=yes", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() =>
      parseApiPath("/execution/approvals?status=unknown", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() =>
      parseApiPath("/execution/approvals/approval%252Fescape/approve", "POST"),
    ).toThrow(/not available/);
    expect(() => parseApiPath("/repo/patch?path=..%2Fsecret", "GET")).toThrow(
      /Unsupported query/,
    );
  });

  it("rejects encoded traversal and unsafe resource identifiers", () => {
    expect(() =>
      parseApiPath("/workspace/read?path=..%2Fsecret.txt", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() =>
      parseApiPath("/workspace/read?path=%2Fetc%2Fpasswd", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() =>
      parseApiPath("/workspace/read?path=%252e%252e%252Fsecret.txt", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() => parseApiPath("/plans/%252e%252e", "GET")).toThrow(
      /traversal|not available/,
    );
    expect(() => parseApiPath("/codegen/runs/run%252Fescape", "GET")).toThrow(
      /not available/,
    );
    expect(() =>
      parseApiPath("/delegation/tasks/task%252Fescape/complete", "POST"),
    ).toThrow(/not available/);
    expect(() =>
      parseApiPath("/codegen/workflows/workflow-1/extra/bundle", "GET"),
    ).toThrow(/not available/);
  });

  it("rejects external URLs, traversal, credentials, and fragments", () => {
    expect(() => parseApiPath("https://evil.example/health", "GET")).toThrow(
      /absolute local path/,
    );
    expect(() => parseApiPath("/health#diagnostics", "GET")).toThrow(
      /fragments are not allowed/,
    );
    expect(() => parseApiPath("/sessions/../health", "GET")).toThrow(
      /traversal/,
    );
    expect(() => parseApiPath("/sessions/%2e%2e/health", "GET")).toThrow(
      /traversal/,
    );
    expect(() => parseApiPath("//evil.example/health", "GET")).toThrow(
      /traversal/,
    );
    expect(parseApiPath("/secrets", "GET")).toBe("/secrets");
  });
});

describe("parseRequestError", () => {
  it("preserves structured API errors", async () => {
    const response = new Response(
      JSON.stringify({ error: "Provider is not configured." }),
      { status: 503 },
    );
    expect(await parseRequestError(response)).toBe(
      "Provider is not configured.",
    );
  });

  it("does not expose an HTML runtime error page to the renderer", async () => {
    const response = new Response(
      "<!doctype html><html><body>internal stack</body></html>",
      { status: 500 },
    );
    expect(await parseRequestError(response)).toBe(
      "500: The local runtime returned an unexpected service error.",
    );
  });
});

describe("runtime transition API requests", () => {
  it("recognizes reset sockets hidden under the fetch error cause", () => {
    const reset = Object.assign(new Error("read ECONNRESET"), {
      code: "ECONNRESET",
    });
    expect(
      isRecoverableRuntimeFetchError(
        new TypeError("fetch failed", { cause: reset }),
      ),
    ).toBe(true);
    expect(isRecoverableRuntimeFetchError(new TypeError("invalid URL"))).toBe(
      false,
    );
  });

  it("waits for the replacement runtime and retries a reset GET once", async () => {
    let state: BackendState = {
      phase: "ready" as const,
      url: "http://127.0.0.1:4100",
      message: "ready",
    };
    const listeners = new Set<(next: BackendState) => void>();
    const backend = {
      getState: () => ({ ...state }),
      subscribe: (listener: (next: BackendState) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as unknown as BackendManager;
    const urls: string[] = [];
    const response = await fetchBackendApi(
      backend,
      async (input) => {
        urls.push(String(input));
        if (urls.length === 1) {
          state = {
            phase: "booting",
            url: undefined,
            message: "switching",
          };
          for (const listener of listeners) listener({ ...state });
          setTimeout(() => {
            state = {
              phase: "ready",
              url: "http://127.0.0.1:4200",
              message: "ready",
            };
            for (const listener of listeners) listener({ ...state });
          }, 0);
          throw new TypeError("fetch failed", {
            cause: Object.assign(new Error("read ECONNRESET"), {
              code: "ECONNRESET",
            }),
          });
        }
        return Response.json({ ok: true });
      },
      "/sessions?limit=200",
      { method: "GET" },
      true,
    );

    expect(await response.json()).toEqual({ ok: true });
    expect(urls).toEqual([
      "http://127.0.0.1:4100/sessions?limit=200",
      "http://127.0.0.1:4200/sessions?limit=200",
    ]);
  });

  it("rejects immediately when a stopped runtime cannot become ready", async () => {
    const backend = {
      getState: () => ({
        phase: "stopped" as const,
        message: "stopped",
      }),
      subscribe: () => () => undefined,
    } as unknown as BackendManager;
    await expect(waitForReadyBackend(backend, 10)).rejects.toThrow(
      /not ready/i,
    );
  });
});

describe("sensitive desktop actions", () => {
  function createHarness(options: {
    confirmed: boolean | (() => Promise<boolean>);
    fetch?: typeof fetch;
    notify?: (notification: { title: string; body: string }) => void;
  }) {
    const confirmations: unknown[] = [];
    const handlers = new Map<
      string,
      (event: unknown, request: unknown) => unknown
    >();
    const removedChannels: string[] = [];
    const ipcMain = {
      handle: (
        channel: string,
        handler: (event: unknown, request: unknown) => unknown,
      ) => handlers.set(channel, handler),
      removeHandler: (channel: string) => {
        removedChannels.push(channel);
        handlers.delete(channel);
      },
    } as unknown as IpcMain;
    const backend = {
      getState: () => ({
        phase: "ready" as const,
        url: "http://127.0.0.1:4555",
        message: "ready",
      }),
      subscribe: () => () => undefined,
    } as unknown as BackendManager;
    const dispose = registerIpc({
      ipcMain,
      backend,
      getMainWindow: () => null,
      pickFiles: async () => ({ canceled: true, paths: [] }),
      workspace: {
        getState: () => ({ currentPath: "/workspace", recentPaths: [] }),
        pickWorkspace: async () => ({
          canceled: true,
          state: { currentPath: "/workspace", recentPaths: [] },
        }),
        switchWorkspace: async () => ({
          canceled: false,
          state: { currentPath: "/workspace", recentPaths: ["/workspace"] },
        }),
        subscribe: () => () => undefined,
      },
      sensitiveActionDependencies: {
        confirm: async (request) => {
          confirmations.push(request);
          return typeof options.confirmed === "function"
            ? options.confirmed()
            : options.confirmed;
        },
        fetch: options.fetch,
        notify: options.notify,
      },
    });
    return { handlers, removedChannels, confirmations, dispose };
  }

  it("disposes exactly the handlers it registers", () => {
    const harness = createHarness({ confirmed: true });
    const registeredChannels = [...harness.handlers.keys()].sort();

    harness.dispose();

    expect(harness.removedChannels.sort()).toEqual(registeredChannels);
    expect(harness.handlers.size).toBe(0);
  });

  it("bridges bounded responses without hiding Eliza HTTP metadata", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const harness = createHarness({
      confirmed: true,
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return new Response(
          JSON.stringify({
            error: "The agent is busy.",
            code: "rate_limit_exceeded",
          }),
          {
            status: 429,
            statusText: "Too Many Requests",
            headers: {
              "content-type": "application/json",
              "retry-after": "7",
              "set-cookie": "private=value",
            },
          },
        );
      },
    });

    const handler = harness.handlers.get("agent:request");
    await expect(
      handler?.(
        {},
        {
          path: "/settings",
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-elizaos-client-id": "ui-client-1",
            authorization: "Bearer renderer-secret",
          },
          body: JSON.stringify({ theme: "system" }),
        },
      ),
    ).resolves.toEqual({
      status: 429,
      statusText: "Too Many Requests",
      headers: {
        "content-type": "application/json",
        "retry-after": "7",
      },
      body: JSON.stringify({
        error: "The agent is busy.",
        code: "rate_limit_exceeded",
      }),
    });
    expect(requests).toEqual([
      {
        url: "http://127.0.0.1:4555/settings",
        init: expect.objectContaining({
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-elizaos-client-id": "ui-client-1",
          },
          body: JSON.stringify({ theme: "system" }),
        }),
      },
    ]);
    expect(harness.handlers.has("api:request")).toBe(false);
    harness.dispose();
  });

  it("strictly validates commands and workspace save requests", () => {
    expect(validateDesktopCommandRequest({ command: "  bun test  " })).toEqual({
      command: "bun test",
      timeoutMs: 30_000,
    });
    expect(() =>
      validateDesktopCommandRequest({ command: "pwd", timeoutMs: 999 }),
    ).toThrow(/timeout/);
    expect(() =>
      validateDesktopCommandRequest({ command: `printf '${"\0"}'` }),
    ).toThrow(/null/);
    expect(
      validateTerminalStreamRequest({
        requestId: "terminal:run-1",
        command: " bun test ",
        timeoutMs: 12_000,
      }),
    ).toEqual({
      requestId: "terminal:run-1",
      command: "bun test",
      timeoutMs: 12_000,
    });
    expect(() =>
      validateTerminalStreamRequest({
        requestId: "../escape",
        command: "pwd",
      }),
    ).toThrow(/request id/);
    expect(
      validateInteractiveTerminalStartRequest({ cols: 120, rows: 40 }),
    ).toEqual({ cols: 120, rows: 40 });
    expect(() =>
      validateInteractiveTerminalStartRequest({ cols: 10, rows: 40 }),
    ).toThrow(/columns/);
    expect(
      validateInteractiveTerminalInputRequest({
        sessionId: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
        data: "bun test\n",
      }),
    ).toEqual({
      sessionId: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
      data: "bun test\n",
    });
    expect(() =>
      validateInteractiveTerminalInputRequest({
        sessionId: "../escape",
        data: "pwd\n",
      }),
    ).toThrow(/session id/);
    expect(
      validateInteractiveTerminalResizeRequest({
        sessionId: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
        cols: 80,
        rows: 24,
      }),
    ).toEqual({
      sessionId: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
      cols: 80,
      rows: 24,
    });

    expect(
      validateWorkspaceFileSaveRequest({
        path: "src/index.ts",
        content: "after",
        expectedContent: "before",
      }),
    ).toEqual({
      path: "src/index.ts",
      content: "after",
      expectedContent: "before",
    });
    for (const path of [
      "/etc/passwd",
      "C:/Windows/system.ini",
      "../secret",
      "src/../secret",
      "src%2F..%2Fsecret",
      "src\\index.ts",
      "src/\0index.ts",
    ]) {
      expect(() =>
        validateWorkspaceFileSaveRequest({
          path,
          content: "after",
          expectedContent: "before",
        }),
      ).toThrow();
    }

    expect(
      validateWorktreeCreateRequest({
        branch: "feature/desktop-worktree",
        path: ".worktrees/desktop-worktree",
      }),
    ).toEqual({
      branch: "feature/desktop-worktree",
      path: ".worktrees/desktop-worktree",
    });
    for (const request of [
      { branch: "--detach", path: ".worktrees/escape" },
      { branch: "feature/../escape", path: ".worktrees/escape" },
      { branch: "feature/escape", path: "../escape" },
      { branch: "feature/escape", path: ".git/worktrees/escape" },
    ]) {
      expect(() => validateWorktreeCreateRequest(request)).toThrow();
    }

    expect(
      validateRepositoryMutationRequest({
        type: "commit",
        message: "  feat: native Git  ",
        amend: true,
      }),
    ).toEqual({
      type: "commit",
      message: "feat: native Git",
      amend: true,
    });
    expect(
      validateRepositoryMutationRequest({
        type: "stage",
        paths: ["src/index.ts"],
      }),
    ).toEqual({ type: "stage", paths: ["src/index.ts"] });
    expect(
      validateRepositoryMutationRequest({
        type: "merge",
        branch: "feature/native-git",
        noFf: true,
      }),
    ).toEqual({
      type: "merge",
      branch: "feature/native-git",
      noFf: true,
    });
    expect(
      validateRepositoryMutationRequest({
        type: "pr-create",
        title: "Native Git controls",
        body: "Ready for review.",
        base: "main",
        draft: true,
      }),
    ).toEqual({
      type: "pr-create",
      title: "Native Git controls",
      body: "Ready for review.",
      base: "main",
      draft: true,
    });
    expect(
      validateRepositoryMutationRequest({
        type: "pr-review",
        event: "request-changes",
        body: "Please add the missing regression.",
      }),
    ).toEqual({
      type: "pr-review",
      event: "request-changes",
      body: "Please add the missing regression.",
    });
    for (const request of [
      { type: "commit", message: " " },
      { type: "stage", paths: ["../secret"] },
      { type: "branch-switch", branch: "--detach" },
      { type: "remote-add", name: "origin", url: "\0bad" },
      { type: "pr-review", event: "request-changes" },
      { type: "pr-merge", method: "force" },
      { type: "pr-update" },
      { type: "not-a-git-operation" },
    ]) {
      expect(() => validateRepositoryMutationRequest(request)).toThrow();
    }
  });

  it("does not fetch when native confirmation is cancelled", async () => {
    let fetches = 0;
    const harness = createHarness({
      confirmed: false,
      fetch: async () => {
        fetches += 1;
        return new Response();
      },
    });

    const commandHandler = harness.handlers.get("terminal:run-confirmed");
    const sessionHandler = harness.handlers.get(
      "terminal:session-start-confirmed",
    );
    const saveHandler = harness.handlers.get("workspace:save-confirmed");
    const worktreeHandler = harness.handlers.get(
      "repository:create-worktree-confirmed",
    );
    expect(
      await commandHandler?.({}, { command: "pwd", timeoutMs: 5_000 }),
    ).toEqual({ status: "cancelled" });
    expect(await sessionHandler?.({}, { cols: 100, rows: 30 })).toEqual({
      status: "cancelled",
    });
    expect(
      await saveHandler?.(
        {},
        { path: "notes.txt", content: "after", expectedContent: "before" },
      ),
    ).toEqual({ status: "cancelled" });
    expect(
      await worktreeHandler?.(
        {},
        {
          branch: "feature/cancelled",
          path: ".worktrees/cancelled",
        },
      ),
    ).toEqual({ status: "cancelled" });
    const mutationHandler = harness.handlers.get("repository:mutate-confirmed");
    expect(
      await mutationHandler?.({}, { type: "stage", paths: ["notes.txt"] }),
    ).toEqual({ status: "cancelled" });
    expect(fetches).toBe(0);
    harness.dispose();
  });

  it("posts bounded commands only after confirmation", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const harness = createHarness({
      confirmed: true,
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return Response.json({
          result: { command: "bun test", exitCode: 0, stdout: "pass" },
        });
      },
    });

    const handler = harness.handlers.get("terminal:run-confirmed");
    await expect(
      handler?.({}, { command: " bun test ", timeoutMs: 12_000 }),
    ).resolves.toEqual({
      status: "completed",
      result: { command: "bun test", exitCode: 0, stdout: "pass" },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("http://127.0.0.1:4555/terminal/run");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      command: "bun test",
      timeoutMs: 12_000,
    });
    harness.dispose();
  });

  it("forwards only opaque attachment ids to chat and rejects command attachments", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const harness = createHarness({
      confirmed: true,
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return new Response(
          ['event: response.completed\ndata: {"response":"reviewed"}', ""].join(
            "\n\n",
          ),
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    const attachmentId = "62df6968-19be-4ea6-b7a1-479a57fa3b7c";
    const sender = {
      id: 72,
      isDestroyed: () => false,
      send: () => undefined,
      once: () => undefined,
      removeListener: () => undefined,
    };
    const handler = harness.handlers.get("chat:start");
    const result = await Promise.resolve(
      handler?.(
        { sender },
        {
          requestId: "chat:attachment-1",
          message: "Review this file",
          roomId: "desktop:room-1",
          projectId: "project-1",
          attachmentIds: [attachmentId],
        },
      ),
    ).catch((error) => error);
    expect(result).toBeUndefined();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("http://127.0.0.1:4555/chat");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      message: "Review this file",
      roomId: "desktop:room-1",
      runId: "chat:attachment-1",
      userId: "desktop-user",
      source: "desktop",
      stream: true,
      projectId: "project-1",
      attachmentIds: [attachmentId],
    });
    await expect(
      handler?.(
        { sender: { ...sender, id: 73 } },
        {
          requestId: "chat:attachment-command",
          message: "/status",
          roomId: "desktop:room-1",
          attachmentIds: [attachmentId],
        },
      ),
    ).rejects.toThrow(/command messages/i);
    await expect(
      handler?.(
        { sender: { ...sender, id: 74 } },
        {
          requestId: "chat:invalid-project",
          message: "Review this file",
          roomId: "desktop:room-1",
          projectId: "../outside",
        },
      ),
    ).rejects.toThrow(/project id/i);
    expect(requests).toHaveLength(1);
    harness.dispose();
  });

  it("emits privacy-safe chat completion notifications", async () => {
    const notifications: Array<{ title: string; body: string }> = [];
    const harness = createHarness({
      confirmed: true,
      notify: (notification) => notifications.push(notification),
      fetch: async () =>
        new Response(
          [
            'event: response.output_text.delta\ndata: {"delta":"private response text"}',
            'event: response.completed\ndata: {"response":"private response text"}',
            "",
          ].join("\n\n"),
          { headers: { "content-type": "text/event-stream" } },
        ),
    });
    const sender = {
      id: 74,
      isDestroyed: () => false,
      send: () => undefined,
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:start")?.(
        { sender },
        {
          requestId: "chat:notification",
          message: "private request text",
          roomId: "desktop:room-1",
        },
      ),
    ).resolves.toBeUndefined();

    expect(notifications).toEqual([
      {
        title: "Doolittle is ready",
        body: "Your response is ready.",
      },
    ]);
    expect(JSON.stringify(notifications)).not.toContain("private");
    harness.dispose();
  });

  it("stops chat by cancelling the server run before closing the local stream", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    let resolveChatResponse: ((response: Response) => void) | undefined;
    const harness = createHarness({
      confirmed: true,
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        if (String(input).endsWith("/chat")) {
          return new Promise<Response>((resolve) => {
            resolveChatResponse = resolve;
          });
        }
        return new Response(
          JSON.stringify({
            accepted: true,
            run: {
              runId: "chat:server-stop",
              sessionId: "desktop:room-1",
              status: "cancelled",
              terminalReason: "cancelled",
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    const emitted: Array<{ channel: string; payload: unknown }> = [];
    const sender = {
      id: 76,
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) =>
        emitted.push({ channel, payload }),
      once: () => undefined,
      removeListener: () => undefined,
    };
    const start = harness.handlers.get("chat:start")?.(
      { sender },
      {
        requestId: "chat:server-stop",
        message: "Stop the provider turn",
        roomId: "desktop:room-1",
      },
    );
    await Promise.resolve();

    await expect(
      harness.handlers.get("chat:cancel")?.({ sender }, "chat:server-stop"),
    ).resolves.toBeUndefined();
    expect(requests[1]?.url).toBe(
      "http://127.0.0.1:4555/chat/runs/chat%3Aserver-stop/cancel",
    );
    expect(requests[1]?.init?.method).toBe("POST");
    expect(emitted).toContainEqual({
      channel: "chat:event",
      payload: {
        requestId: "chat:server-stop",
        event: "agent.run",
        data: {
          type: "cancelled",
          sessionId: "desktop:room-1",
          run: expect.objectContaining({ status: "cancelled" }),
        },
      },
    });

    resolveChatResponse?.(new Response(""));
    await expect(start).resolves.toBeUndefined();
    harness.dispose();
  });

  it("does not fail a completed chat when the operating system rejects a notification", async () => {
    const harness = createHarness({
      confirmed: true,
      notify: () => {
        throw new Error("notifications unavailable");
      },
      fetch: async () =>
        new Response(
          'event: response.completed\ndata: {"response":"finished"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
    });
    const sender = {
      id: 75,
      isDestroyed: () => false,
      send: () => undefined,
      once: () => undefined,
      removeListener: () => undefined,
    };

    await expect(
      harness.handlers.get("chat:start")?.(
        { sender },
        {
          requestId: "chat:notification-unavailable",
          message: "Finish this task",
          roomId: "desktop:room-1",
        },
      ),
    ).resolves.toBeUndefined();
    harness.dispose();
  });

  it("forwards a confirmed terminal stream as renderer events", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const notifications: Array<{ title: string; body: string }> = [];
    const harness = createHarness({
      confirmed: true,
      notify: (notification) => notifications.push(notification),
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return new Response(
          [
            'event: terminal.started\ndata: {"runId":"run-1"}',
            'event: terminal.stdout\ndata: {"runId":"run-1","chunk":"ok"}',
            'event: terminal.completed\ndata: {"runId":"run-1","result":{"exitCode":0}}',
            "",
          ].join("\n\n"),
          {
            headers: { "content-type": "text/event-stream" },
          },
        );
      },
    });
    const sent: Array<{ channel: string; payload: unknown }> = [];
    const destroyedListeners = new Set<() => void>();
    const sender = {
      id: 42,
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) =>
        sent.push({ channel, payload }),
      once: (_event: string, listener: () => void) =>
        destroyedListeners.add(listener),
      removeListener: (_event: string, listener: () => void) =>
        destroyedListeners.delete(listener),
    };

    const handler = harness.handlers.get("terminal:stream-start");
    await expect(
      handler?.(
        { sender },
        {
          requestId: "terminal:run-1",
          command: " bun test ",
          timeoutMs: 12_000,
        },
      ),
    ).resolves.toBeUndefined();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("http://127.0.0.1:4555/terminal/run/stream");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      command: "bun test",
      timeoutMs: 12_000,
    });
    expect(sent.map((entry) => entry.payload)).toEqual([
      {
        requestId: "terminal:run-1",
        event: "terminal.started",
        data: { runId: "run-1" },
      },
      {
        requestId: "terminal:run-1",
        event: "terminal.stdout",
        data: { runId: "run-1", chunk: "ok" },
      },
      {
        requestId: "terminal:run-1",
        event: "terminal.completed",
        data: { runId: "run-1", result: { exitCode: 0 } },
      },
    ]);
    expect(destroyedListeners.size).toBe(0);
    expect(notifications).toEqual([
      {
        title: "Command complete",
        body: "Your terminal task finished in Doolittle.",
      },
    ]);
    harness.dispose();
  });

  it("opens and controls an interactive PTY only after confirmation", async () => {
    const sessionId = "62df6968-19be-4ea6-b7a1-479a57fa3b7c";
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const session = {
      id: sessionId,
      state: "running",
      cwd: "/workspace",
      shell: "zsh",
      cols: 100,
      rows: 30,
      startedAt: "2026-07-27T00:00:00.000Z",
      pty: true,
      supportsResize: true,
      outputBytes: 0,
    };
    const harness = createHarness({
      confirmed: true,
      fetch: async (input, init) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.includes("/terminal/session/output")) {
          return Response.json({
            session,
            chunks: [{ cursor: 1, data: "ready" }],
            nextCursor: 1,
            truncatedBeforeCursor: false,
          });
        }
        return Response.json({ session });
      },
    });

    await expect(
      harness.handlers.get("terminal:session-start-confirmed")?.(
        {},
        { cols: 100, rows: 30 },
      ),
    ).resolves.toEqual({ status: "started", session });
    await harness.handlers.get("terminal:session-input")?.(
      {},
      { sessionId, data: "bun test\n" },
    );
    await harness.handlers.get("terminal:session-resize")?.(
      {},
      { sessionId, cols: 120, rows: 40 },
    );
    await harness.handlers.get("terminal:session-interrupt")?.({}, sessionId);
    await harness.handlers.get("terminal:session-close")?.({}, sessionId);
    const outputHandler = harness.handlers.get(
      "terminal:session-output",
    ) as unknown as (
      event: unknown,
      id: string,
      cursor: number,
    ) => Promise<unknown>;
    await expect(outputHandler({}, sessionId, 0)).resolves.toEqual({
      session,
      chunks: [{ cursor: 1, data: "ready" }],
      nextCursor: 1,
      truncatedBeforeCursor: false,
    });

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/terminal/session/start",
      "/terminal/session/input",
      "/terminal/session/resize",
      "/terminal/session/interrupt",
      "/terminal/session/close",
      "/terminal/session/output",
    ]);
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      sessionId,
      data: "bun test\n",
    });
    expect(harness.confirmations).toHaveLength(1);
    expect(harness.confirmations[0]).toHaveProperty("kind", "terminal-session");
    harness.dispose();
  });

  it("cancels a terminal request while native confirmation is pending", async () => {
    let resolveConfirmation: (confirmed: boolean) => void = () => undefined;
    const confirmation = new Promise<boolean>((resolve) => {
      resolveConfirmation = resolve;
    });
    let fetches = 0;
    const harness = createHarness({
      confirmed: () => confirmation,
      fetch: async () => {
        fetches += 1;
        return new Response();
      },
    });
    const sent: Array<{ channel: string; payload: unknown }> = [];
    const destroyedListeners = new Set<() => void>();
    const sender = {
      id: 43,
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) =>
        sent.push({ channel, payload }),
      once: (_event: string, listener: () => void) =>
        destroyedListeners.add(listener),
      removeListener: (_event: string, listener: () => void) =>
        destroyedListeners.delete(listener),
    };

    const start = harness.handlers.get("terminal:stream-start");
    const cancel = harness.handlers.get("terminal:stream-cancel");
    const startPromise = start?.(
      { sender },
      {
        requestId: "terminal:pending",
        command: "bun test",
        timeoutMs: 12_000,
      },
    );
    await Promise.resolve();
    cancel?.({ sender }, "terminal:pending");
    resolveConfirmation(true);
    await startPromise;

    expect(fetches).toBe(0);
    expect(sent.map((entry) => entry.payload)).toEqual([
      {
        requestId: "terminal:pending",
        event: "terminal.cancelled",
        data: { reason: "Command stopped before it started." },
      },
    ]);
    expect(destroyedListeners.size).toBe(0);
    harness.dispose();
  });

  it("aborts an active terminal stream and forwards a cancellation receipt", async () => {
    let markFetchStarted: () => void = () => undefined;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    const harness = createHarness({
      confirmed: true,
      fetch: async (_input, init) => {
        markFetchStarted();
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      },
    });
    const sent: Array<{ channel: string; payload: unknown }> = [];
    const destroyedListeners = new Set<() => void>();
    const sender = {
      id: 44,
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) =>
        sent.push({ channel, payload }),
      once: (_event: string, listener: () => void) =>
        destroyedListeners.add(listener),
      removeListener: (_event: string, listener: () => void) =>
        destroyedListeners.delete(listener),
    };

    const start = harness.handlers.get("terminal:stream-start");
    const cancel = harness.handlers.get("terminal:stream-cancel");
    const startPromise = start?.(
      { sender },
      {
        requestId: "terminal:active",
        command: "bun test",
        timeoutMs: 12_000,
      },
    );
    await fetchStarted;
    cancel?.({ sender }, "terminal:active");
    await startPromise;

    expect(sent.map((entry) => entry.payload)).toEqual([
      {
        requestId: "terminal:active",
        event: "terminal.cancelled",
        data: { reason: "Command stopped by the operator." },
      },
    ]);
    expect(destroyedListeners.size).toBe(0);
    harness.dispose();
  });

  it("reports workspace conflicts without claiming a save", async () => {
    const harness = createHarness({
      confirmed: true,
      fetch: async () =>
        Response.json(
          {
            error:
              "File changed after it was opened. Reload it before saving your edits.",
          },
          { status: 409 },
        ),
    });

    const handler = harness.handlers.get("workspace:save-confirmed");
    await expect(
      handler?.(
        {},
        {
          path: "notes.txt",
          content: "after",
          expectedContent: "before",
        },
      ),
    ).resolves.toEqual({
      status: "conflict",
      message:
        "File changed after it was opened. Reload it before saving your edits.",
    });
    harness.dispose();
  });

  it("creates worktrees through a dedicated confirmed channel", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const harness = createHarness({
      confirmed: true,
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return Response.json({
          worktree: {
            path: "/workspace/.worktrees/desktop",
            head: "abc123",
            branch: "feature/desktop",
            detached: false,
            bare: false,
            prunable: false,
          },
        });
      },
    });

    const handler = harness.handlers.get(
      "repository:create-worktree-confirmed",
    );
    await expect(
      handler?.(
        {},
        {
          branch: "feature/desktop",
          path: ".worktrees/desktop",
        },
      ),
    ).resolves.toEqual({
      status: "created",
      worktree: {
        path: "/workspace/.worktrees/desktop",
        head: "abc123",
        branch: "feature/desktop",
        detached: false,
        bare: false,
        prunable: false,
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "http://127.0.0.1:4555/repo/worktrees/create",
    );
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      branch: "feature/desktop",
      path: ".worktrees/desktop",
    });
    expect(harness.confirmations).toEqual([
      {
        kind: "worktree-create",
        title: "Create Git worktree?",
        message: "feature/desktop",
        detail:
          "Doolittle will create a new branch and worktree at .worktrees/desktop, inside the selected workspace.",
        confirmLabel: "Create worktree",
      },
    ]);
    harness.dispose();
  });

  it("runs typed repository mutations through a dedicated confirmed channel", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const harness = createHarness({
      confirmed: true,
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return Response.json({
          result: {
            type: "stage",
            ok: true,
            summary: "Staged 1 path.",
            stdout: "",
            stderr: "",
            exitCode: 0,
          },
        });
      },
    });

    const handler = harness.handlers.get("repository:mutate-confirmed");
    await expect(
      handler?.({}, { type: "stage", paths: ["src/index.ts"] }),
    ).resolves.toEqual({
      status: "completed",
      result: {
        type: "stage",
        ok: true,
        summary: "Staged 1 path.",
        stdout: "",
        stderr: "",
        exitCode: 0,
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("http://127.0.0.1:4555/repo/mutate");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      type: "stage",
      paths: ["src/index.ts"],
    });
    expect(harness.confirmations[0]).toMatchObject({
      kind: "repository-mutation",
      title: "Confirm Git operation",
      message: "stage: src/index.ts",
    });
    harness.dispose();
  });

  it("keeps generic repository mutations denied", () => {
    expect(() => parseApiPath("/repo/worktrees/create", "POST")).toThrow(
      /not available/,
    );
    expect(() => parseApiPath("/repo/mutate", "POST")).toThrow(/not available/);
  });
});
