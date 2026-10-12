import { describe, expect, it, vi } from "vitest";
import { commitNewChatAfterNavigation } from "./new-chat-transition";

describe("new chat ownership transition", () => {
  it.each(["declined dirty navigation", "failed workspace activation"])(
    "retains chooser and ownership after %s",
    async () => {
      const commit = vi.fn();
      expect(
        await commitNewChatAfterNavigation(async () => false, commit),
      ).toBe(false);
      expect(commit).not.toHaveBeenCalled();
    },
  );
  it("commits once only after navigation resolves", async () => {
    let finish!: (success: boolean) => void;
    const commit = vi.fn();
    const pending = commitNewChatAfterNavigation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      commit,
    );
    expect(commit).not.toHaveBeenCalled();
    finish(true);
    expect(await pending).toBe(true);
    expect(commit).toHaveBeenCalledOnce();
  });
  it("does not create an owner when navigation rejects", async () => {
    const commit = vi.fn();
    await expect(
      commitNewChatAfterNavigation(async () => {
        throw new Error("activation failed");
      }, commit),
    ).rejects.toThrow("activation failed");
    expect(commit).not.toHaveBeenCalled();
  });
});
