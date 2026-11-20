import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareNativeProfile } from "../../apps/cli/src/entrypoint/native-profile";
import {
  acquireExecutionLease,
  NativeWorkspaceAdmission,
  runWithNativeWorkspaceAdmission,
} from "../../packages/agent/src/runtime/execution-admission";
import { createStrictLoopbackTokenPolicy } from "../../packages/agent/src/server/auth";
import { createNativeClientPolicy } from "../../packages/agent/src/server/native-client-policy";
import { WorkspaceService } from "../../packages/agent/src/services/workspace-service";

const token = "a".repeat(64);

function request(
  url: string,
  method = "GET",
  headers: IncomingMessage["headers"] = {},
) {
  return {
    method,
    url,
    headers: {
      host: "127.0.0.1:34321",
      authorization: `Bearer ${token}`,
      ...headers,
    },
    socket: { localPort: 34321 },
  } as IncomingMessage;
}

describe("the native runtime boundary", () => {
  const policy = createNativeClientPolicy({
    bearerToken: token,
    workspaceIsCurrent: () => true,
  });

  it("requires the owner capability even on loopback", () => {
    expect(policy(request("/health"), "/health")).toBeNull();
    for (const authorization of [undefined, `Bearer ${"b".repeat(64)}`]) {
      expect(
        policy(request("/health", "GET", { authorization }), "/health"),
      ).toMatchObject({ status: 401 });
    }
    expect(() =>
      createNativeClientPolicy({
        bearerToken: "short",
        workspaceIsCurrent: () => true,
      }),
    ).toThrow(/capability/);
  });

  it("rejects browser origins and non-absolute-host request forms", () => {
    expect(
      policy(
        request("/health", "GET", { origin: "http://127.0.0.1:34321" }),
        "/health",
      ),
    ).toMatchObject({ status: 403 });
    expect(
      policy(request("/health", "GET", { host: "localhost:34321" }), "/health"),
    ).toMatchObject({ status: 403 });
    expect(
      policy(request("http://127.0.0.1:34321/health"), "/health"),
    ).toMatchObject({ status: 403 });
  });

  it("admits chat run lifecycle and blocks raw privileged writes", () => {
    const cancel = "/chat/runs/consult%3Aone/cancel";
    const stream = "/chat/runs/example/events";
    expect(policy(request(cancel, "POST"), cancel)).toBeNull();
    expect(policy(request(stream), stream)).toBeNull();
    expect(policy(request("/chat/runs", "POST"), "/chat/runs")).toBeNull();
    for (const path of [
      "/workspace/write",
      "/runtime/workspace",
      "/repo/mutate",
      "/api/terminal/run",
      "/webhooks/whatsapp",
      "/execution/approvals/example/approve",
      "/cron/jobs",
    ]) {
      expect(policy(request(path, "POST"), path)).toMatchObject({
        status: 404,
      });
    }
  });

  it("opts in only to the exact admitted editor save", () => {
    const allowed = createNativeClientPolicy({
      bearerToken: token,
      workspaceIsCurrent: () => true,
      allowWorkspaceSave: true,
    });
    expect(
      allowed(request("/workspace/write", "POST"), "/workspace/write"),
    ).toBeNull();
    expect(
      allowed(
        request("/media/attachments/import", "POST"),
        "/media/attachments/import",
      ),
    ).toBeNull();
    for (const path of [
      "/workspace/write/child",
      "/workspace/checkpoints",
      "/repo/mutate",
    ]) {
      expect(allowed(request(path, "POST"), path)).toMatchObject({
        status: 404,
      });
    }
  });

  it("admits only reviewed operator methods for a host that opted in", () => {
    const controls = createNativeClientPolicy({
      bearerToken: token,
      workspaceIsCurrent: () => true,
      controlPlane: true,
    });
    for (const [method, path] of [
      ["GET", "/activity"],
      ["GET", "/runtime/accounts"],
      ["POST", "/settings"],
      ["POST", "/execution/approvals/scope%3Arun/approve"],
      ["POST", "/cron/jobs/example/trigger"],
      ["PATCH", "/cron/jobs/example"],
      ["POST", "/runtime/account-pool/openai-api/credentials"],
      ["DELETE", "/runtime/account-pool/openai-api/operator-key"],
      ["POST", "/pairing/deny"],
    ] as const) {
      expect(controls(request(path, method), path)).toBeNull();
      expect(policy(request(path, method), path)).toMatchObject({
        status: 404,
      });
    }
    for (const [method, target, path] of [
      ["POST", "/secrets/get"],
      ["POST", "/secrets/set"],
      ["GET", "/runtime/account-pool/openai-api/credentials"],
      ["POST", "/runtime/account-pool/openai-codex/credentials"],
      ["POST", "/cron/webhooks/trigger-token"],
      ["POST", "/runtime/workspace"],
      ["POST", "/terminal/session/start"],
      ["POST", "/media/attachments/import"],
      ["POST", "/repo/mutate"],
      ["GET", "/plugin/arbitrary"],
      ["POST", "/cron/jobs/example%2Fother/trigger"],
      ["POST", "/execution/approvals/example%2Fother/approve"],
      ["POST", "/settings?path=hidden", "/settings"],
    ] as const) {
      expect(controls(request(target, method), path ?? target)).toMatchObject({
        status: 404,
      });
    }
    expect(
      controls(request("/anything/../settings", "POST"), "/settings"),
    ).toMatchObject({ status: 403 });
  });

  it("admits Git mutations only for the desktop control profile and exact path", () => {
    const options = {
      bearerToken: token,
      workspaceIsCurrent: () => true,
      allowWorkspaceSave: true,
      controlPlane: true,
    };
    const desktop = createNativeClientPolicy(options);
    const target = "/repo/mutate";
    expect(desktop(request(target, "POST"), target)).toBeNull();
    expect(
      desktop(request(`${target}?confirmed=true`, "POST"), target),
    ).toMatchObject({ status: 404 });
    expect(
      desktop(request(`${target}/nested`, "POST"), `${target}/nested`),
    ).toMatchObject({ status: 404 });
    expect(
      desktop(
        request(target, "POST", { origin: "http://127.0.0.1:34321" }),
        target,
      ),
    ).toMatchObject({ status: 403 });
    expect(
      createNativeClientPolicy({ ...options, allowWorkspaceSave: false })(
        request(target, "POST"),
        target,
      ),
    ).toMatchObject({ status: 404 });
  });

  it("admits named bot control only when the host supplied its dispatcher", () => {
    const options = {
      bearerToken: token,
      workspaceIsCurrent: () => true,
      controlPlane: true,
    };
    const noHost = createNativeClientPolicy(options);
    const withHost = createNativeClientPolicy({
      ...options,
      dispatchNamedBotControl: async () => null,
    });
    expect(noHost(request("/bots"), "/bots")).toMatchObject({ status: 404 });
    expect(withHost(request("/bots"), "/bots")).toBeNull();
    const activate = "/bots/8efb0a77-6108-4891-a37a-c31ae7347e60/activate";
    expect(withHost(request(activate, "POST"), activate)).toBeNull();
    expect(withHost(request(activate), activate)).toMatchObject({
      status: 404,
    });
    expect(
      withHost(request("/bots/default/proxy", "POST"), "/bots/default/proxy"),
    ).toMatchObject({ status: 404 });
    const named = "/bots/8efb0a77-6108-4891-a37a-c31ae7347e60";
    for (const [method, suffix] of [
      ["GET", "/sessions"],
      ["GET", "/sessions/messages"],
      ["POST", "/chat/runs"],
      ["GET", "/chat/runs/native%3Arun"],
      ["GET", "/chat/runs/native%3Arun/events"],
      ["POST", "/chat/runs/native%3Arun/cancel"],
    ] as const) {
      const target = `${named}${suffix}`;
      expect(withHost(request(target, method), target)).toBeNull();
      expect(noHost(request(target, method), target)).toMatchObject({
        status: 404,
      });
    }
    for (const target of [
      `${named}/workspace/write`,
      `${named}/chat/runs/escape%2Frun/events`,
      "/bots/default/sessions",
    ]) {
      expect(withHost(request(target), target)).toMatchObject({ status: 404 });
    }
  });

  it("enforces dedicated service bearer auth before ordinary and webhook routes", () => {
    const strict = createStrictLoopbackTokenPolicy(token);
    expect(strict(request("/health"))).toBeNull();
    expect(
      strict(request("/health", "GET", { authorization: undefined })),
    ).toBe(401);
    expect(
      strict(request("/webhooks/slack", "POST", { authorization: undefined })),
    ).toBe(401);
    expect(
      strict(
        request("/health", "GET", {
          authorization: `Bearer ${"b".repeat(64)}`,
        }),
      ),
    ).toBe(401);
    expect(
      strict(request("/health", "GET", { origin: "http://127.0.0.1:34321" })),
    ).toBe(403);
    expect(
      strict(request("/health", "GET", { host: "invalid-host.example:34321" })),
    ).toBe(403);
    expect(() => createStrictLoopbackTokenPolicy("short")).toThrow(/bearer/);
  });

  it("retains workspace ownership throughout native delegated work", async () => {
    let current = true;
    const admission = new NativeWorkspaceAdmission(() => current);
    const saveOwner = { runId: "save", sessionId: "conversation" };
    await runWithNativeWorkspaceAdmission(admission, async () => {
      const turn = await acquireExecutionLease({
        runId: "turn",
        sessionId: "conversation",
        kind: "foreground",
      });
      expect(turn?.active).toBe(true);
      await turn?.yieldFor(
        async () => {
          expect(() => admission.claim(saveOwner)).toThrow(
            /already owns this workspace/,
          );
        },
        { deadline: Date.now() + 1_000 },
      );
      await turn?.release();
      const save = admission.claim(saveOwner);
      await expect(
        acquireExecutionLease({
          runId: "automation",
          sessionId: "automation",
          kind: "automatic-acp",
        }),
      ).rejects.toThrow(/already owns this workspace/);
      await save.release();
      current = false;
      expect(() => admission.claim(saveOwner)).toThrow(/workspace changed/);
    });
  });

  it("compares the file again after the checkpoint await", async () => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "doolittle-editor-cas-")),
    );
    const path = join(root, "note.txt");
    writeFileSync(path, "original");
    let checks = 0;
    try {
      await expect(
        new WorkspaceService(root).saveExistingText({
          path: "note.txt",
          content: "editor save",
          expectedContent: "original",
          revalidate() {
            if (++checks === 2) writeFileSync(path, "external change");
          },
        }),
      ).rejects.toMatchObject({ code: "conflict" });
      expect(readFileSync(path, "utf8")).toBe("external change");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects replacing the workspace while retaining a profile", () => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "doolittle-native-profile-")),
    );
    const workspace = join(root, "workspace");
    const second = join(root, "second");
    const dataDir = join(root, "profile");
    mkdirSync(workspace);
    mkdirSync(second);
    try {
      const profile = prepareNativeProfile(workspace, dataDir);
      expect(prepareNativeProfile(workspace, dataDir).workspace).toBe(
        workspace,
      );
      expect(() => prepareNativeProfile(second, dataDir)).toThrow(
        /different workspace/,
      );
      expect(profile.workspaceIsCurrent()).toBe(true);
      renameSync(workspace, join(root, "moved"));
      mkdirSync(workspace);
      expect(profile.workspaceIsCurrent()).toBe(false);
      const retargetedPolicy = createNativeClientPolicy({
        bearerToken: token,
        workspaceIsCurrent: profile.workspaceIsCurrent,
      });
      expect(
        retargetedPolicy(request("/workspace/tree"), "/workspace/tree"),
      ).toMatchObject({ status: 409 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
