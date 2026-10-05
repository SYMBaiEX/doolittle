import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type {
  UiRunReceipt,
  UiSnapshot,
  UiTarget,
} from "@doolittle/contracts/ui-host";
import type { UiPluginGrant } from "@doolittle/contracts/ui-plugin";
import { AgUiHostAdapter } from "@doolittle/ui/ag-ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedUiArtifact } from "./artifact";
import {
  UiExtensionHost,
  type UiHostBackend,
  UiSubmissionRejectedError,
} from "./host";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const target: UiTarget = { botId: "bot-1", sessionId: "session-1" };
const other: UiTarget = { botId: "bot-2", sessionId: "session-2" };
const artifact: VerifiedUiArtifact = {
  identity: {
    pluginId: "community",
    pluginVersion: "1.0.0",
    digest: "a".repeat(64),
  },
  manifest: {
    kind: "doolittle.ui-plugin",
    manifestVersion: 1,
    id: "community",
    name: "Community",
    description: "",
    pluginVersion: "1.0.0",
    trustTier: "community-static",
    compatibility: { uiHostMajor: 1, uiPackageMajor: 0 },
    entry: "index.html",
    assets: [{ path: "index.html", sha256: "b".repeat(64), bytes: 1 }],
    requestedCapabilities: [
      "conversation.read",
      "message.send",
      "run.stop",
      "attachment.pick",
      "surface.open",
    ],
    contributions: { workspaces: [], panels: [] },
  },
  assets: new Map([["index.html", Buffer.from("x")]]),
};

function setup() {
  const root = mkdtempSync(resolve(tmpdir(), "doolittle-ui-host-"));
  roots.push(root);
  let workspace = "/workspace/a";
  let owned = true;
  const run: UiRunReceipt = {
    target,
    runId: "run-1",
    state: "running",
    sequence: 1,
  };
  const snapshot: UiSnapshot = {
    version: 1,
    revision: 1,
    sequence: 1,
    bots: [
      { id: "bot-1", name: "One", isDefault: true, state: "ready" },
      { id: "bot-2", name: "Two", isDefault: false, state: "ready" },
    ],
    conversations: [
      { ...target, title: "One", state: "ready" },
      { ...other, title: "Two", state: "ready" },
    ],
    selected: target,
  };
  const backend: UiHostBackend = {
    getSnapshot: vi.fn(async () => snapshot),
    currentWorkspace: () => workspace,
    ownsTarget: vi.fn(
      async (candidate) => owned && candidate.botId === target.botId,
    ),
    createConversation: vi.fn(async () => target),
    readTranscript: vi.fn(async () => ({
      messages: [
        {
          id: "m1",
          role: "user",
          text: "hello",
          createdAt: "now",
          sourceBotId: "bot-1",
        },
      ],
    })),
    readRun: vi.fn(async () => undefined),
    sendChat: vi.fn(async (input) => ({ ...run, runId: input.runId })),
    stopRun: vi.fn(async () => run),
    pickAttachments: vi.fn(async () => [
      { id: "attachment-1", name: "file.txt", cleanupCapability: "private" },
    ]),
    openSurface: vi.fn(async () => undefined),
    presentApproval: vi.fn(async () => undefined),
  };
  const path = resolve(root, "host-state.json");
  const host = new UiExtensionHost(backend, path);
  const generation = host.activate(artifact);
  const context = { artifact: artifact.identity, generation, visible: true };
  const grant: UiPluginGrant = {
    artifact: artifact.identity,
    generation,
    capabilities: ["conversation.read", "message.send", "attachment.pick"],
    targets: [target],
    approvedAt: new Date().toISOString(),
  };
  return {
    host,
    backend,
    context,
    grant,
    path,
    run,
    setWorkspace: (value: string) => {
      workspace = value;
    },
    setOwned: (value: boolean) => {
      owned = value;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("community UI broker", () => {
  it("acknowledges a host surface that intentionally hides its requesting view", async () => {
    const { host, backend, context, grant } = setup();
    await host.approveCommunity(artifact, {
      ...grant,
      capabilities: ["surface.open"],
    });
    host.setVisible(true);
    vi.mocked(backend.openSurface).mockImplementation(
      async (_target, _surface, check) => {
        await check();
        host.setVisible(false);
      },
    );
    await expect(
      host.dispatchCommunity(context, {
        type: "surface.open",
        target,
        surface: "computer",
      }),
    ).resolves.toEqual({ requestId: expect.any(String), accepted: true });
    await expect(
      host.dispatchCommunity(context, {
        type: "surface.open",
        target,
        surface: "computer",
      }),
    ).rejects.toThrow(/inactive/iu);
  });
  it("preserves the optional canonical AG-UI identity through the actual host", async () => {
    const { host, backend } = setup();
    const adapter = new AgUiHostAdapter(host);
    const submitted = await adapter.submit(
      {
        threadId: target.sessionId,
        runId: "agui-native-run",
        messages: [{ id: "user-message", role: "user", content: "hello" }],
      },
      target,
    );
    expect(submitted.runId).toBe("agui-native-run");
    expect(backend.sendChat).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "agui-native-run" }),
    );
    host.publish({
      type: "run.state",
      target,
      runId: submitted.runId,
      state: "complete",
    });
    const events = [];
    for await (const event of submitted.events) events.push(event.type);
    expect(events).toEqual(["RUN_STARTED", "CUSTOM", "RUN_FINISHED"]);
  });

  it("never treats a definitive POST rejection as an accepted preexisting run", async () => {
    const { host, backend, run } = setup();
    vi.mocked(backend.sendChat).mockRejectedValueOnce(
      new UiSubmissionRejectedError("Run identity conflict."),
    );
    const command = {
      type: "chat.send",
      target,
      submissionId: "collision",
      runId: "collision",
      message: "new text",
    } as const;
    const rejected = await host.dispatch(command);
    expect(rejected).toMatchObject({
      accepted: false,
      error: "Run identity conflict.",
    });
    vi.mocked(backend.readRun).mockResolvedValue({
      ...run,
      runId: "collision",
    });
    expect(await host.dispatch(command)).toMatchObject({ accepted: false });
    expect(backend.sendChat).toHaveBeenCalledTimes(1);
  });

  it("rejects a collision before recording or submitting new content", async () => {
    const { host, backend, run } = setup();
    vi.mocked(backend.readRun).mockResolvedValue({ ...run, runId: "existing" });
    await expect(
      host.dispatch({
        type: "chat.send",
        target,
        submissionId: "fresh",
        runId: "existing",
        message: "different",
      }),
    ).rejects.toThrow(/already exists/u);
    expect(backend.sendChat).not.toHaveBeenCalled();
  });

  it("atomically persists source replay cursors and the full projection across host restart", () => {
    const { host, backend, path } = setup();
    const key = "c".repeat(64);
    const observed: number[] = [];
    host.subscribe((event) => observed.push(event.sequence));
    const batch = [
      {
        type: "message.delta",
        target,
        runId: "native",
        messageId: "m1",
        text: "hello",
      },
      { type: "message.completed", target, runId: "native", messageId: "m1" },
    ] as const;
    host.publishCanonical(key, 7, [...batch]);
    host.publishCanonical(key, 7, [...batch]);
    expect(observed).toEqual([1, 2]);
    const restored = new UiExtensionHost(backend, path);
    expect(restored.canonicalCursor(key)).toEqual({
      cursor: 7,
      sequence: 2,
      textStarted: true,
    });
    restored.publishCanonical(key, 7, [...batch]);
    const replay: number[] = [];
    restored.subscribe((event) => replay.push(event.sequence), 0);
    expect(replay).toEqual([1, 2]);
  });

  it("defaults deny, filters snapshots, and enforces capability and target", async () => {
    const { host, context, grant, backend } = setup();
    host.setVisible(true);
    await expect(host.getCommunitySnapshot(context)).rejects.toThrow(/grant/u);
    await host.approveCommunity(artifact, grant);
    const snapshot = await host.getCommunitySnapshot(context);
    expect(snapshot.bots.map((bot) => bot.id)).toEqual(["bot-1"]);
    expect(snapshot.conversations.map((item) => item.sessionId)).toEqual([
      "session-1",
    ]);
    await expect(
      host.dispatchCommunity(context, {
        type: "run.stop",
        target,
        runId: "run-1",
      }),
    ).rejects.toThrow(/capability/u);
    await expect(
      host.dispatchCommunity(context, {
        type: "transcript.read",
        target: other,
      }),
    ).rejects.toThrow(/target/u);
    expect(backend.stopRun).not.toHaveBeenCalled();
  });

  it("does not expose snapshots, event streams, drafts, or native approval from a send-only grant", async () => {
    const { host, context, grant } = setup();
    host.setVisible(true);
    await host.approveCommunity(artifact, {
      ...grant,
      capabilities: ["message.send"],
    });
    await expect(host.getCommunitySnapshot(context)).rejects.toThrow(
      /capability/u,
    );
    expect(() => host.subscribeCommunity(context, () => undefined)).toThrow(
      /capability/u,
    );
    await expect(
      host.dispatchCommunity(context, {
        type: "draft.update",
        target,
        text: "secret",
      }),
    ).rejects.toThrow(/capability/u);
    await expect(
      host.dispatchCommunity(context, { type: "draft.read", target }),
    ).rejects.toThrow(/capability/u);
    await expect(
      host.dispatchCommunity(context, {
        type: "approval.present",
        target,
        runId: "run-1",
        approvalId: "approval-1",
      }),
    ).rejects.toThrow(/not available/u);
  });

  it("rejects hidden, protected, revoked, workspace-changed and ownership-lost requests", async () => {
    const { host, context, grant, setWorkspace, setOwned, backend } = setup();
    host.setVisible(true);
    await host.approveCommunity(artifact, grant);
    host.setVisible(false);
    await expect(
      host.dispatchCommunity(context, {
        type: "chat.send",
        target,
        submissionId: "s1",
        message: "hello",
      }),
    ).rejects.toThrow(/inactive/u);
    host.setVisible(true);
    host.setProtectedDialog(true);
    await expect(
      host.dispatchCommunity(context, {
        type: "chat.send",
        target,
        submissionId: "s1",
        message: "hello",
      }),
    ).rejects.toThrow(/inactive/u);
    host.setProtectedDialog(false);
    host.setVisible(true);
    setWorkspace("/workspace/b");
    await expect(
      host.dispatchCommunity(context, {
        type: "chat.send",
        target,
        submissionId: "s1",
        message: "hello",
      }),
    ).rejects.toThrow(/workspace/u);
    setWorkspace("/workspace/a");
    setOwned(false);
    await expect(
      host.dispatchCommunity(context, {
        type: "chat.send",
        target,
        submissionId: "s1",
        message: "hello",
      }),
    ).rejects.toThrow(/owned/u);
    setOwned(true);
    host.revoke(artifact.identity);
    await expect(
      host.dispatchCommunity(context, {
        type: "chat.send",
        target,
        submissionId: "s1",
        message: "hello",
      }),
    ).rejects.toThrow(/inactive/u);
    expect(backend.sendChat).not.toHaveBeenCalled();
  });

  it("requires exact as-of transcript acknowledgement", async () => {
    const { host, context, grant, backend } = setup();
    host.setVisible(true);
    await host.approveCommunity(artifact, grant);
    await expect(
      host.dispatchCommunity(context, {
        type: "transcript.read",
        target,
        throughRunId: "run-1",
      }),
    ).rejects.toThrow(/boundary/u);
    expect(backend.readTranscript).toHaveBeenCalledWith(target, "run-1");
  });

  it("rejects a canonical receipt for another target or run", async () => {
    const { host, context, grant, backend, run } = setup();
    host.setVisible(true);
    await host.approveCommunity(artifact, grant);
    vi.mocked(backend.readRun).mockResolvedValueOnce({ ...run, target: other });
    await expect(
      host.dispatchCommunity(context, {
        type: "run.read",
        target,
        runId: "run-1",
      }),
    ).rejects.toThrow(/does not match/u);
    vi.mocked(backend.sendChat).mockResolvedValueOnce(run);
    const command = {
      type: "chat.send",
      target,
      submissionId: "bad-receipt",
      message: "hello",
    } as const;
    await expect(host.dispatchCommunity(context, command)).rejects.toThrow(
      /does not match/u,
    );
    expect((await host.dispatchCommunity(context, command)).accepted).toBe(
      false,
    );
    expect(backend.sendChat).toHaveBeenCalledTimes(1);
  });

  it("persists before send and never resends after lost acknowledgement or restart", async () => {
    const { host, context, grant, backend, path } = setup();
    host.setVisible(true);
    await host.approveCommunity(artifact, grant);
    vi.mocked(backend.sendChat).mockRejectedValueOnce(new Error("socket lost"));
    const command = {
      type: "chat.send",
      target,
      submissionId: "stable-1",
      message: "hello",
    } as const;
    const first = await host.dispatchCommunity(context, command);
    expect(first.accepted).toBe(false);
    expect(first.error).toContain("not resent");
    expect((await host.dispatchCommunity(context, command)).accepted).toBe(
      false,
    );
    expect(backend.sendChat).toHaveBeenCalledTimes(1);
    const restarted = new UiExtensionHost(backend, path);
    const nextGeneration = restarted.activate(artifact);
    restarted.setVisible(true);
    await restarted.approveCommunity(artifact, {
      ...grant,
      generation: nextGeneration,
    });
    const repeated = await restarted.dispatchCommunity(
      { ...context, generation: nextGeneration },
      command,
    );
    expect(repeated.accepted).toBe(false);
    expect(backend.sendChat).toHaveBeenCalledTimes(1);
    if (!first.runId) throw new Error("Expected reserved run ID.");
    vi.mocked(backend.readRun).mockResolvedValueOnce({
      target,
      runId: first.runId,
      state: "running",
      sequence: 2,
    });
    const recovered = await restarted.dispatchCommunity(
      { ...context, generation: nextGeneration },
      command,
    );
    expect(recovered.accepted).toBe(true);
    expect(backend.sendChat).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent identical submissions and rejects ID reuse with changed content", async () => {
    const { host, context, grant, backend, run } = setup();
    host.setVisible(true);
    await host.approveCommunity(artifact, grant);
    const pending = deferred<UiRunReceipt>();
    vi.mocked(backend.sendChat).mockReturnValueOnce(pending.promise);
    const command = {
      type: "chat.send",
      target,
      submissionId: "same-id",
      message: "hello",
    } as const;
    const first = host.dispatchCommunity(context, command);
    const second = host.dispatchCommunity(context, command);
    await expect(
      host.dispatchCommunity(context, { ...command, message: "different" }),
    ).rejects.toThrow(/different content/u);
    await vi.waitFor(() => expect(backend.sendChat).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(backend.sendChat).mock.calls[0]?.[0];
    if (!sent) throw new Error("Expected sent request.");
    pending.resolve({ ...run, runId: sent.runId });
    expect((await first).accepted).toBe(true);
    expect((await second).accepted).toBe(true);
    expect(backend.sendChat).toHaveBeenCalledTimes(1);
  });

  it("rejects a grant and command when ownership or visibility changes across an await", async () => {
    const { host, context, grant, backend } = setup();
    host.setVisible(true);
    const ownerGate = deferred<boolean>();
    vi.mocked(backend.ownsTarget).mockReturnValueOnce(ownerGate.promise);
    const approval = host.approveCommunity(artifact, grant);
    host.revoke(artifact.identity);
    ownerGate.resolve(true);
    await expect(approval).rejects.toThrow(/context changed/u);

    const nextGeneration = host.activate(artifact);
    const nextContext = { ...context, generation: nextGeneration };
    await host.approveCommunity(artifact, {
      ...grant,
      generation: nextGeneration,
    });
    host.setVisible(true);
    const commandGate = deferred<boolean>();
    vi.mocked(backend.ownsTarget).mockReturnValueOnce(commandGate.promise);
    const command = host.dispatchCommunity(nextContext, {
      type: "chat.send",
      target,
      submissionId: "race-1",
      message: "hello",
    });
    host.setVisible(false);
    commandGate.resolve(true);
    await expect(command).rejects.toThrow(/inactive/u);
    expect(backend.sendChat).not.toHaveBeenCalled();
  });

  it("pins workspace and grant revision while a transcript read is pending", async () => {
    const { host, context, grant, backend, setWorkspace } = setup();
    host.setVisible(true);
    await host.approveCommunity(artifact, grant);
    const transcript =
      deferred<Awaited<ReturnType<UiHostBackend["readTranscript"]>>>();
    vi.mocked(backend.readTranscript).mockReturnValueOnce(transcript.promise);
    const request = host.dispatchCommunity(context, {
      type: "transcript.read",
      target,
    });
    await vi.waitFor(() =>
      expect(backend.readTranscript).toHaveBeenCalledTimes(1),
    );
    setWorkspace("/workspace/b");
    await host.approveCommunity(artifact, grant);
    transcript.resolve({ messages: [], transcriptThroughRunId: undefined });
    await expect(request).rejects.toThrow(/workspace changed|grant changed/u);
  });

  it("checks authorization at the backend commit boundary after preparation", async () => {
    const { host, context, grant, backend } = setup();
    host.setVisible(true);
    await host.approveCommunity(artifact, grant);
    const prepared = deferred<void>();
    let reachedPreparation!: () => void;
    const atPreparation = new Promise<void>((resolve) => {
      reachedPreparation = resolve;
    });
    vi.mocked(backend.sendChat).mockImplementationOnce(async (input) => {
      reachedPreparation();
      await prepared.promise;
      await input.assertAuthorizedAtCommit();
      throw new Error("Must not POST after revocation.");
    });
    const command = host.dispatchCommunity(context, {
      type: "chat.send",
      target,
      submissionId: "revoked-before-post",
      message: "hello",
    });
    await atPreparation;
    // A collision read occurred before preparation; no read may occur after revoke.
    vi.mocked(backend.readRun).mockClear();
    host.revoke(artifact.identity);
    prepared.resolve();
    await expect(command).rejects.toThrow(/inactive/u);
    expect(backend.readRun).not.toHaveBeenCalled();
  });

  it("rechecks all snapshot target ownership after another target's lookup stalls", async () => {
    const { host, context, grant, backend } = setup();
    host.setVisible(true);
    vi.mocked(backend.ownsTarget).mockResolvedValue(true);
    await host.approveCommunity(artifact, {
      ...grant,
      targets: [target, other],
    });
    const waitingForOther = deferred<boolean>();
    let targetOwned = true;
    vi.mocked(backend.ownsTarget).mockImplementation(async (candidate) => {
      if (candidate.sessionId === other.sessionId)
        return waitingForOther.promise;
      return targetOwned;
    });
    const snapshotPromise = host.getCommunitySnapshot(context);
    await vi.waitFor(() =>
      expect(backend.ownsTarget).toHaveBeenCalledWith(other),
    );
    targetOwned = false;
    waitingForOther.resolve(true);
    const snapshot = await snapshotPromise;
    expect(snapshot.conversations.map((item) => item.sessionId)).toEqual([
      other.sessionId,
    ]);
  });

  it("does not replay an event after target ownership changes or an old journal cursor is lost", async () => {
    const { host, context, grant, setOwned, backend, path } = setup();
    host.setVisible(true);
    await host.approveCommunity(artifact, grant);
    const events: unknown[] = [];
    const ownerGate = deferred<boolean>();
    vi.mocked(backend.ownsTarget).mockReturnValueOnce(ownerGate.promise);
    host.subscribeCommunity(context, (event) => events.push(event));
    host.publish({
      type: "run.state",
      target,
      runId: "run-1",
      state: "running",
    });
    setOwned(false);
    ownerGate.resolve(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual([]);
    const restarted = new UiExtensionHost(backend, path);
    expect(restarted.activationGeneration).toBeGreaterThan(
      host.activationGeneration,
    );
    for (let i = 0; i < 70; i++)
      restarted.publish({
        type: "run.state",
        target,
        runId: "run-1",
        state: "running",
      });
    expect(() => restarted.subscribe(() => undefined, 0)).toThrow(
      /replay gap/u,
    );
  });

  it("requires explicit trusted consent and revokes exact artifact access", () => {
    const { host } = setup();
    const trusted: VerifiedUiArtifact = {
      ...artifact,
      identity: {
        pluginId: "trusted",
        pluginVersion: "1.0.0",
        digest: "c".repeat(64),
      },
      manifest: {
        ...artifact.manifest,
        id: "trusted",
        trustTier: "trusted-react",
        entry: "bundle.js",
      },
      assets: new Map([
        [
          "bundle.js",
          Buffer.from(
            "export function createRenderer(React, Ui) { return () => null; }",
          ),
        ],
      ]),
    };
    expect(() => host.activate(trusted)).toThrow(/not been approved/u);
    host.approveTrusted(trusted);
    host.activate(trusted);
    expect(host.trustedRendererSource(trusted).digest).toBe(
      trusted.identity.digest,
    );
    host.revoke(trusted.identity);
    expect(() => host.trustedRendererSource(trusted)).toThrow(
      /not been approved/u,
    );
    expect(() => host.activate(trusted)).toThrow(/not been approved/u);
  });

  it("keeps host drafts across replacement and refuses corrupt journal state", async () => {
    const { host, path } = setup();
    await host.dispatch({ type: "draft.update", target, text: "unsent" });
    await host.dispatch({ type: "conversation.select", target });
    const replacement = new UiExtensionHost(
      { ...setup().backend, currentWorkspace: () => "/workspace/a" },
      path,
    );
    expect(replacement.getDraft(target)).toBe("unsent");
    expect(
      (await replacement.dispatch({ type: "draft.read", target })).draft,
    ).toEqual({ target, text: "unsent", exists: true, revision: 2 });
    await expect(
      replacement.dispatch({ type: "draft.read", target: other }),
    ).rejects.toThrow(/owned/u);
    expect(replacement.getSelected()).toEqual(target);
    writeFileSync(path, "not JSON");
    expect(() => new UiExtensionHost(setup().backend, path)).toThrow(
      /cannot be read safely/u,
    );
  });
});
