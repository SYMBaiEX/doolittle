import { describe, expect, it, vi } from "vitest";
import { createTerminalOpenIntent } from "./terminal-open-intent";

function deferred() {
  let resolve: (() => void) | undefined;
  let reject: ((reason: Error) => void) | undefined;
  const promise = new Promise<void>((accept, deny) => {
    resolve = accept;
    reject = deny;
  });
  return {
    promise,
    resolve: () => resolve?.(),
    reject: (reason: Error) => reject?.(reason),
  };
}

describe("terminal open intent", () => {
  it("ignores a completed bind after close and bounds duplicate opens", async () => {
    const intent = createTerminalOpenIntent();
    const binding = deferred();
    const bind = vi.fn(() => binding.promise);
    const open = vi.fn();
    const onError = vi.fn();

    const first = intent.run("draft-A", bind, open, onError);
    await intent.run("draft-A", bind, open, onError);
    expect(bind).toHaveBeenCalledTimes(1);
    expect(intent.isPending()).toBe(true);

    intent.cancel();
    binding.resolve();
    await first;
    expect(open).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(intent.isPending()).toBe(false);
  });

  it("opens only the newer captured context after selection or workspace changes", async () => {
    const intent = createTerminalOpenIntent();
    const oldBinding = deferred();
    const newBinding = deferred();
    const oldOpen = vi.fn();
    const newOpen = vi.fn();
    const onError = vi.fn();

    const oldPending = intent.run(
      "bot-A/session-A/project-A/workspace-A",
      () => oldBinding.promise,
      oldOpen,
      onError,
    );
    intent.setContext("bot-B/session-B/project-B/workspace-B");
    const newPending = intent.run(
      "bot-B/session-B/project-B/workspace-B",
      () => newBinding.promise,
      newOpen,
      onError,
    );
    oldBinding.resolve();
    await oldPending;
    expect(oldOpen).not.toHaveBeenCalled();
    expect(newOpen).not.toHaveBeenCalled();

    newBinding.resolve();
    await newPending;
    expect(newOpen).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("suppresses stale denial but reports a current bind denial", async () => {
    const intent = createTerminalOpenIntent();
    const staleBinding = deferred();
    const currentBinding = deferred();
    const open = vi.fn();
    const onError = vi.fn();

    const stalePending = intent.run(
      "draft-A",
      () => staleBinding.promise,
      open,
      onError,
    );
    intent.cancel();
    staleBinding.reject(new Error("stale denial"));
    await stalePending;
    expect(onError).not.toHaveBeenCalled();

    const currentPending = intent.run(
      "draft-A",
      () => currentBinding.promise,
      open,
      onError,
    );
    currentBinding.reject(new Error("current denial"));
    await currentPending;
    expect(open).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });
});
