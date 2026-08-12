import { describe, expect, it } from "vitest";
import type { BackendState } from "../../shared/contracts";
import type { BackendManager } from "../backend";
import {
  apiResponseLimit,
  fetchBackendApi,
  isRecoverableRuntimeFetchError,
  parseApiPath,
  validateAgentTransportRequest,
  waitForReadyBackend,
} from "./agent-transport";
import { parseRequestError } from "./runtime-http";

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
    expect(parseApiPath("/autonomy/status", "GET")).toBe("/autonomy/status");
    expect(parseApiPath("/autonomy/enable", "POST")).toBe("/autonomy/enable");
    expect(parseApiPath("/autonomy/disable", "POST")).toBe("/autonomy/disable");
    expect(parseApiPath("/autonomy/interval", "POST")).toBe(
      "/autonomy/interval",
    );
    expect(() => parseApiPath("/autonomy/toggle", "POST")).toThrow(
      /not available/,
    );
    expect(parseApiPath("/runtime/models?refresh=true", "GET")).toBe(
      "/runtime/models?refresh=true",
    );
    expect(parseApiPath("/runtime/plugins?view=catalog", "GET")).toBe(
      "/runtime/plugins?view=catalog",
    );
    expect(() =>
      parseApiPath("/runtime/plugins?view=ownership", "GET"),
    ).toThrow(/Unsupported query/);
    expect(parseApiPath("/activity?limit=50", "GET")).toBe(
      "/activity?limit=50",
    );
    expect(parseApiPath("/chat/runs/chat:run-1", "GET")).toBe(
      "/chat/runs/chat:run-1",
    );
    expect(parseApiPath("/runtime/media", "GET")).toBe("/runtime/media");
    expect(parseApiPath("/pairing/pending?platform=telegram", "GET")).toBe(
      "/pairing/pending?platform=telegram",
    );
    expect(parseApiPath("/pairing/approved?limit=200", "GET")).toBe(
      "/pairing/approved?limit=200",
    );
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

  it("allows only the declared local SandboxManager operator surface", () => {
    expect(parseApiPath("/runtime/e2b", "GET")).toBe("/runtime/e2b");
    expect(parseApiPath("/e2b/sandboxes", "GET")).toBe("/e2b/sandboxes");
    expect(parseApiPath("/e2b/sandboxes", "POST")).toBe("/e2b/sandboxes");
    expect(parseApiPath("/e2b/execute", "POST")).toBe("/e2b/execute");
    expect(parseApiPath("/e2b/kill", "POST")).toBe("/e2b/kill");
    expect(() => parseApiPath("/e2b/sandboxes?template=python", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() => parseApiPath("/e2b/sandboxes/secret", "POST")).toThrow(
      /not available/,
    );
    expect(() => parseApiPath("/e2b/..%2Fsecrets", "GET")).toThrow(
      /unsafe traversal/,
    );
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
    expect(
      parseApiPath("/mcp/marketplace?query=research&limit=12", "GET"),
    ).toBe("/mcp/marketplace?query=research&limit=12");
    expect(
      parseApiPath("/mcp/marketplace/server?name=io.example%2Fresearch", "GET"),
    ).toBe("/mcp/marketplace/server?name=io.example%2Fresearch");
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
      parseApiPath("/mcp/marketplace?query=research&limit=21", "GET"),
    ).toThrow(/Unsupported query/);
    expect(() =>
      parseApiPath(
        "/mcp/marketplace/server?name=https%3A%2F%2Fevil.test",
        "GET",
      ),
    ).toThrow(/Unsupported query/);
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
    expect(() =>
      parseApiPath(`/runtime/registry?query=${"x".repeat(129)}`, "GET"),
    ).toThrow(/Unsupported query/);
    expect(() =>
      parseApiPath("/runtime/registry?refresh=maybe", "GET"),
    ).toThrow(/Unsupported query/);
    expect(parseApiPath("/runtime/registry/install", "POST")).toBe(
      "/runtime/registry/install",
    );
    expect(() => parseApiPath("/runtime/registry/install", "GET")).toThrow(
      /not available from desktop/,
    );
    expect(
      parseApiPath(
        "/activity/export?kind=approval&status=pending&target=review&sessionId=session-1&limit=20",
        "GET",
      ),
    ).toContain("/activity/export?");
    expect(
      parseApiPath(
        "/activity/export?kind=terminal&status=recorded&target=operations",
        "GET",
      ),
    ).toBe("/activity/export?kind=terminal&status=recorded&target=operations");
    expect(() => parseApiPath("/activity/export?kind=unknown", "GET")).toThrow(
      /Unsupported query/,
    );
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

  it("limits desktop pairing control to the official local pairing API", () => {
    expect(parseApiPath("/pairing/approve", "POST")).toBe("/pairing/approve");
    expect(parseApiPath("/pairing/deny", "POST")).toBe("/pairing/deny");
    expect(parseApiPath("/pairing/revoke", "POST")).toBe("/pairing/revoke");
    expect(() => parseApiPath("/pairing/pending?platform=api", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() => parseApiPath("/pairing/approved?limit=501", "GET")).toThrow(
      /Unsupported query/,
    );
    expect(() => parseApiPath("/pairing/export", "GET")).toThrow(
      /not available/,
    );
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
    expect(parseApiPath("/repo/branches", "GET")).toBe("/repo/branches");
    expect(parseApiPath("/repo/remotes", "GET")).toBe("/repo/remotes");
    expect(parseApiPath("/repo/stashes", "GET")).toBe("/repo/stashes");
    expect(parseApiPath("/repo/conflicts", "GET")).toBe("/repo/conflicts");
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
      "/delegation/tasks/start-coding",
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

describe("agent transport boundaries", () => {
  it("keeps generic repository mutations denied", () => {
    expect(() => parseApiPath("/repo/worktrees/create", "POST")).toThrow(
      /not available/,
    );
    expect(() => parseApiPath("/repo/mutate", "POST")).toThrow(/not available/);
  });
});
