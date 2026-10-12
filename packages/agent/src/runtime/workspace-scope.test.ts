import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { requestWorkerHost } = vi.hoisted(() => ({
  requestWorkerHost: vi.fn(),
}));
vi.mock("@/runtime/bootstrap/worker-host-rpc", () => ({ requestWorkerHost }));

import { resolveWorkspaceDirectory } from "@/services/workspace-directory";
import {
  currentConversationWorkspace,
  resolveConversationWorkspace,
  runWithConversationWorkspace,
} from "./workspace-scope";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  vi.resetAllMocks();
});

function directory(): string {
  const path = mkdtempSync(join(tmpdir(), "doolittle-chat-scope-"));
  directories.push(path);
  return realpathSync(path);
}

describe("conversation workspace scope", () => {
  it("isolates simultaneous chats and rejects work after scope completion", async () => {
    const left = directory();
    const right = directory();
    requestWorkerHost.mockImplementation(async (_operation, payload) => ({
      sessionId: payload.sessionId,
      botId: "bot",
      workspacePath: payload.sessionId === "left" ? left : right,
    }));
    const start = async (sessionId: string) => {
      const scope = await resolveConversationWorkspace(sessionId);
      let lateEffect: Promise<unknown> = Promise.resolve();
      const seen = await runWithConversationWorkspace(scope, async () => {
        lateEffect = new Promise((resolve) => {
          setTimeout(() => {
            try {
              resolve(resolveWorkspaceDirectory("/fallback"));
            } catch (error) {
              resolve(error);
            }
          }, 0);
        });
        await Promise.resolve();
        return resolveWorkspaceDirectory("/fallback");
      });
      expect(((await lateEffect) as Error).message).toContain(
        "scope has ended",
      );
      return seen;
    };
    await expect(Promise.all([start("left"), start("right")])).resolves.toEqual(
      [left, right],
    );
    expect(currentConversationWorkspace()).toBeUndefined();
  });

  it("rejects a missing or changed host binding without using a fallback root", async () => {
    const root = directory();
    requestWorkerHost.mockResolvedValueOnce({
      sessionId: "wrong",
      botId: "bot",
      workspacePath: root,
    });
    await expect(resolveConversationWorkspace("right")).rejects.toThrow(
      "invalid",
    );
    requestWorkerHost.mockRejectedValueOnce(new Error("missing"));
    await expect(resolveConversationWorkspace("right")).rejects.toThrow(
      "missing",
    );
  });

  it("passes an ACP ownership witness to the trusted host resolver", async () => {
    const root = directory();
    requestWorkerHost.mockResolvedValue({
      sessionId: "chat-a",
      botId: "bot",
      workspacePath: root,
    });
    await resolveConversationWorkspace("chat-a", undefined, "acp:one");
    expect(requestWorkerHost).toHaveBeenCalledWith(
      "workspace.resolve",
      { sessionId: "chat-a", acpSessionId: "acp:one" },
      expect.objectContaining({ timeoutMs: 15_000 }),
    );
  });
});
