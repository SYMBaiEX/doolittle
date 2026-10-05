import { describe, expect, it, vi } from "vitest";
import { ensureComputerOriginOwnerBinding } from "./computer-origin";

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
});
