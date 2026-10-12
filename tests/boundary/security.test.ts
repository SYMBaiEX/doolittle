import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  BackendManager,
  BackendManagerOptions,
} from "../../apps/desktop/src/main/backend";
import { BotProcessRegistry } from "../../apps/desktop/src/main/bot-process-registry";
import { DesktopExecutionAdmission } from "../../apps/desktop/src/main/execution-admission";
import { isolatedRuntimeEnvironment } from "../support/isolated-runtime-environment";

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function fixture(admission?: DesktopExecutionAdmission) {
  const dir = mkdtempSync(resolve(tmpdir(), "doolittle-boundary-security-"));
  directories.push(dir);
  const backend = {
    getState: () => ({ phase: "ready", url: "http://127.0.0.1:9" }),
    getWorkspaceDirectory: () => dir,
    start: async () => ({ phase: "ready" }),
    stop: async () => undefined,
  } as unknown as BackendManager;
  let hostHandler: BackendManagerOptions["workerHostHandler"];
  const registry = new BotProcessRegistry(
    { executable: "nub", args: [], repoRoot: dir },
    dir,
    backend,
    dir,
    {
      admission,
      createBackend: (_target, _data, _workspace, _fetch, options) => {
        hostHandler = options.workerHostHandler;
        return backend;
      },
    },
  );
  const create = (name: string) =>
    registry.create({
      name,
      persona: "Keep ownership private.",
      model: { provider: "offline", model: "offline" },
    });
  const alice = create("Alice");
  const bob = create("Bob");
  return { registry, alice, bob, handler: () => hostHandler };
}

describe("host-owned execution boundaries", () => {
  it("never gives acceptance fixtures the operator's credentials or profile", () => {
    const environment = isolatedRuntimeEnvironment(
      resolve(tmpdir(), "fixture-private-data"),
      {
        PATH: "/fixture/bin",
        OPENAI_API_KEY: "fixture-only",
        DATABASE_URL: "fixture-private",
        NODE_OPTIONS: "--inspect",
        HOME: "/operator-home",
      },
    );
    expect(environment.PATH).toBe("/fixture/bin");
    expect(environment.OPENAI_API_KEY).toBe("");
    expect(environment.DATABASE_URL).toBeUndefined();
    expect(environment.NODE_OPTIONS).toBeUndefined();
    expect(environment.HOME).not.toBe("/operator-home");
    expect(environment.ELIZA_HOME).toBe(environment.HOME);
  });
  it("rejects forged bot and workspace ownership for a conversation", () => {
    const { registry, alice, bob } = fixture();
    const owned = registry.bindConversationWorkspace(alice.id, "private-chat");
    expect(
      registry.assertConversationOwner(alice.id, "private-chat"),
    ).toMatchObject({ botId: alice.id });
    expect(() =>
      registry.assertConversationOwner(bob.id, "private-chat"),
    ).toThrow(/different bot/i);
    expect(() =>
      registry.bindRun(bob.id, "private-chat", "forged-run"),
    ).toThrow(/different bot/i);
    expect(() =>
      registry.assertConversationWorkspace(
        bob.id,
        "private-chat",
        owned.workspacePath ?? "",
      ),
    ).toThrow();
    expect(() =>
      registry.assertConversationWorkspace(
        alice.id,
        "private-chat",
        registry.get(bob.id).workspacePath,
      ),
    ).toThrow(/does not belong/i);
  });

  it("rejects cross-bot ACP session ownership even with a known session ID", () => {
    const { registry, alice, bob } = fixture();
    const owned = registry.bindConversationWorkspace(alice.id, "private-chat");
    registry.bindAcpSession(
      alice.id,
      "private-chat",
      owned.workspacePath ?? "",
      "acp-private",
    );
    expect(
      registry.assertAcpSessionOwner(alice.id, "acp-private"),
    ).toMatchObject({ botId: alice.id });
    expect(() =>
      registry.assertAcpSessionOwner(bob.id, "acp-private"),
    ).toThrow();
    expect(() =>
      registry.bindAcpSession(
        bob.id,
        "private-chat",
        owned.workspacePath ?? "",
        "acp-forged",
      ),
    ).toThrow(/different bot/i);
  });

  it("requires an active same-chat parent before automatic ACP execution admission", async () => {
    const admission = new DesktopExecutionAdmission({
      maxConcurrent: 2,
      maxPerBotActive: 2,
    });
    const { registry, alice, handler } = fixture(admission);
    registry.bindConversationWorkspace(alice.id, "chat-one");
    registry.bindConversationWorkspace(alice.id, "chat-two");
    await registry.activate(alice.id);
    const host = handler();
    if (!host) throw new Error("Worker host handler was not installed.");
    const signal = new AbortController().signal;
    const parentRunId = randomUUID();
    const claim = (sessionId: string, parent?: string) =>
      host(
        {
          operation: "execution.claim",
          payload: {
            sessionId,
            runId: randomUUID(),
            kind: "automatic-acp",
            parentRunId: parent,
          },
        },
        signal,
      );
    await expect(claim("chat-one", parentRunId)).rejects.toThrow(
      /matching foreground run/i,
    );
    const foreground = (await host(
      {
        operation: "execution.claim",
        payload: {
          sessionId: "chat-one",
          runId: parentRunId,
          kind: "foreground",
        },
      },
      signal,
    )) as { accepted: boolean; leaseId: string };
    expect(foreground.accepted).toBe(true);
    await expect(claim("chat-two", parentRunId)).rejects.toThrow(
      /matching foreground run/i,
    );
    await host(
      {
        operation: "execution.release",
        payload: { runId: parentRunId, leaseId: foreground.leaseId },
      },
      signal,
    );
    await expect(claim("chat-one", parentRunId)).rejects.toThrow(
      /matching foreground run/i,
    );
  });
});
