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
