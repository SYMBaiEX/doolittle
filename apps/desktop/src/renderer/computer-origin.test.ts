import { describe, expect, it, vi } from "vitest";
import {
  ensureComputerOriginOwnerBinding,
  resolveTerminalConversationOrigin,
} from "./computer-origin";

const origin = {
  botId: "bot-default",
  originConversationId: "local-draft-1",
  workspacePath: "/workspace",
};

describe("ensureComputerOriginOwnerBinding", () => {
  it("persists the captured owner for an unsaved local draft before Computer opens", async () => {
    const bind = vi.fn(async () => undefined);

    await ensureComputerOriginOwnerBinding(origin, {
      savedSessionIds: new Set(),
      localBotBindings: { [origin.originConversationId]: origin.botId },
      projectId: "project-1",
      bind,
    });

    expect(bind).toHaveBeenCalledExactlyOnceWith(
      origin.botId,
      origin.originConversationId,
      "project-1",
    );
  });

  it("does not bind an unresolved draft or a draft captured for another bot", async () => {
    const bind = vi.fn(async () => undefined);

    await expect(
      ensureComputerOriginOwnerBinding(origin, {
        savedSessionIds: new Set(),
        localBotBindings: {},
        bind,
      }),
    ).rejects.toThrow(/captured bot owner/u);
    await expect(
      ensureComputerOriginOwnerBinding(origin, {
        savedSessionIds: new Set(),
        localBotBindings: { [origin.originConversationId]: "bot-other" },
        bind,
      }),
    ).rejects.toThrow(/captured bot owner/u);

    expect(bind).not.toHaveBeenCalled();
  });

  it("does not recreate ownership for an already saved session", async () => {
    const bind = vi.fn(async () => undefined);

    await ensureComputerOriginOwnerBinding(origin, {
      savedSessionIds: new Set([origin.originConversationId]),
      localBotBindings: {},
      bind,
    });

    expect(bind).not.toHaveBeenCalled();
  });

  it("keeps the captured draft owner and project when selection changes during binding", async () => {
    let finishBind: (() => void) | undefined;
    const bind = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishBind = resolve;
        }),
    );
    const localBotBindings = {
      [origin.originConversationId]: origin.botId,
    };

    const pending = ensureComputerOriginOwnerBinding(origin, {
      savedSessionIds: new Set(),
      localBotBindings,
      projectId: "project-1",
      bind,
    });
    localBotBindings[origin.originConversationId] = "bot-other";

    expect(bind).toHaveBeenCalledExactlyOnceWith(
      "bot-default",
      "local-draft-1",
      "project-1",
    );
    finishBind?.();
    await expect(pending).resolves.toBeUndefined();
  });

  it("rejects a denied binding so the caller can keep the terminal closed", async () => {
    const denial = new Error("binding denied");
    const bind = vi.fn(async () => {
      throw denial;
    });

    await expect(
      ensureComputerOriginOwnerBinding(origin, {
        savedSessionIds: new Set(),
        localBotBindings: { [origin.originConversationId]: origin.botId },
        bind,
      }),
    ).rejects.toBe(denial);
    expect(bind).toHaveBeenCalledExactlyOnceWith(
      origin.botId,
      origin.originConversationId,
      undefined,
    );
  });
});

describe("terminal conversation origin", () => {
  const conversation = {
    botId: origin.botId,
    sessionId: origin.originConversationId,
    workspacePath: "/private/scratch/bot-default",
    createdAt: "2026-10-12",
    updatedAt: "2026-10-12",
  };
  const options = () => ({
    savedSessionIds: new Set<string>(),
    localBotBindings: { [origin.originConversationId]: origin.botId },
    freshScratchDraftIds: new Set([origin.originConversationId]),
    bind: vi.fn(async () => conversation),
  });

  it("binds a fresh scratch draft and takes its root only from the host", async () => {
    const input = { ...origin, workspacePath: "" };
    const access = options();
    await expect(
      resolveTerminalConversationOrigin(input, { kind: "pending" }, access),
    ).resolves.toEqual({
      conversation,
      origin: { ...input, workspacePath: conversation.workspacePath },
    });
    expect(access.bind).toHaveBeenCalledExactlyOnceWith(
      origin.botId,
      origin.originConversationId,
      undefined,
    );
    expect(input.workspacePath).toBe("");
  });

  it("does not bind unknown history or pending project drafts", async () => {
    const access = options();
    for (const scope of [
      { kind: "unknown" } as const,
      { kind: "pending", projectId: "project" } as const,
    ])
      await expect(
        resolveTerminalConversationOrigin(origin, scope, access),
      ).rejects.toThrow(/confirmed chat workspace/u);
    expect(access.bind).not.toHaveBeenCalled();
  });

  it("requires an ephemeral fresh-draft witness, not persisted draft intent", async () => {
    const access = options();
    access.freshScratchDraftIds.clear();
    await expect(
      resolveTerminalConversationOrigin(origin, { kind: "pending" }, access),
    ).rejects.toThrow(/confirmed chat workspace/u);
    expect(access.bind).not.toHaveBeenCalled();
  });

  it("rejects saved pending drafts and another bot's captured ownership", async () => {
    const access = options();
    access.savedSessionIds.add(origin.originConversationId);
    await expect(
      resolveTerminalConversationOrigin(origin, { kind: "pending" }, access),
    ).rejects.toThrow(/confirmed chat workspace/u);
    access.savedSessionIds.clear();
    access.localBotBindings[origin.originConversationId] = "other-bot";
    await expect(
      resolveTerminalConversationOrigin(origin, { kind: "pending" }, access),
    ).rejects.toThrow(/captured bot owner/u);
    expect(access.bind).not.toHaveBeenCalled();
  });

  it("rejects mismatched host tuples instead of inheriting another root", async () => {
    for (const mismatch of [
      { botId: "other" },
      { sessionId: "other" },
      { projectId: "other" },
      { workspacePath: "" },
    ]) {
      const access = options();
      access.bind.mockResolvedValue({ ...conversation, ...mismatch });
      await expect(
        resolveTerminalConversationOrigin(origin, { kind: "pending" }, access),
      ).rejects.toThrow(/scope changed/u);
    }
  });

  it("keeps an already confirmed saved root without recreating its grant", async () => {
    const access = options();
    access.savedSessionIds.add(origin.originConversationId);
    const confirmedOrigin = {
      ...origin,
      workspacePath: conversation.workspacePath,
    };
    await expect(
      resolveTerminalConversationOrigin(
        confirmedOrigin,
        { kind: "confirmed", conversation },
        access,
      ),
    ).resolves.toEqual({ origin: confirmedOrigin, conversation });
    expect(access.bind).not.toHaveBeenCalled();
    await expect(
      resolveTerminalConversationOrigin(
        { ...confirmedOrigin, workspacePath: "/other" },
        { kind: "confirmed", conversation },
        access,
      ),
    ).rejects.toThrow(/scope changed/u);
  });
});
